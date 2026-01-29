const express = require('express');
const router = express.Router();
const asyncHandler = require('express-async-handler');
const User = require('../models/User');
const Team = require('../models/Team');
const Task = require('../models/Task');
const PasswordReset = require('../models/PasswordReset');
const { protect } = require('../middleware/auth');
const { roleRequired } = require('../middleware/roles');
const { STATUS, STAGE, setTaskState, notifyUsers } = require('../utils/taskWorkflow');
const { sendNewPasswordEmail, sendWelcomeEmail } = require('../utils/emailService');

const normalizeId = (value) => {
    if (value === undefined || value === null || value === '') {
        return null;
    }
    return value.toString();
};

const collectManagerIds = async () => {
    const managers = await User.find({ role: 'manager' }).select('_id');
    return managers.map(manager => manager._id);
};

// HR creates manager
router.post('/managers', protect, roleRequired('hr'), asyncHandler(async (req, res) => {
    const { name, email, password } = req.body;

    const exists = await User.findOne({ email });
    if (exists) {
        res.status(400);
        throw new Error('User already exists');
    }

    const user = await User.create({ name, email, password, role: 'manager' });
    if (user) {
        try {
            await sendWelcomeEmail(user.email, user.name, 'manager', password);
        } catch (emailError) {
            console.log('Welcome email failed but manager created:', emailError);
        }

        res.status(201).json({ _id: user._id, name: user.name, email: user.email, role: user.role });
    } else {
        res.status(400);
        throw new Error('Invalid manager data');
    }
}));

// HR lists managers
router.get('/managers', protect, roleRequired('hr'), asyncHandler(async (req, res) => {
    const managers = await User.find({ role: 'manager' }).select('-password');
    res.json(managers);
}));

// HR updates manager
router.put('/managers/:id', protect, roleRequired('hr'), asyncHandler(async (req, res) => {
    const manager = await User.findById(req.params.id);
    if (!manager || manager.role !== 'manager') {
        res.status(404);
        throw new Error('Manager not found');
    }

    manager.name = req.body.name || manager.name;
    manager.email = req.body.email || manager.email;
    const passwordProvided = !!(req.body.password);
    if (passwordProvided) manager.password = req.body.password;

    const updated = await manager.save();

    if (passwordProvided) {
        try {
            await sendNewPasswordEmail(updated.email, updated.name, req.body.password, 'manager');
        } catch (emailError) {
            console.log('Failed to send updated credentials email to manager:', emailError);
        }
    }

    res.json({ _id: updated._id, name: updated.name, email: updated.email });
}));

// HR deletes manager
router.delete('/managers/:id', protect, roleRequired('hr'), asyncHandler(async (req, res) => {
    const manager = await User.findById(req.params.id);
    if (!manager || manager.role !== 'manager') {
        res.status(404);
        throw new Error('Manager not found');
    }
    await User.deleteOne({ _id: manager._id });
    res.json({ message: 'Manager removed' });
}));

// HR overview of managers, teams, and tasks
router.get('/overview', protect, roleRequired('hr'), asyncHandler(async (req, res) => {
    const managers = await User.find({ role: 'manager' }).select('-password');
    const managerIds = managers.map(manager => manager._id);

    const teams = await Team.find({ manager: { $in: managerIds } })
        .populate('manager', 'name email')
        .populate('members', 'name email role')
        .sort({ createdAt: -1 });

    const managerTasks = await Task.find({
        $or: [
            { assignedTo: { $in: managerIds } },
            { manager: { $in: managerIds } }
        ]
    })
        .populate('assignedTo', 'name email role')
        .populate('assignedTeam', 'name')
        .populate('manager', 'name email')
        .populate('createdBy', 'username name email role')
        .sort({ createdAt: -1 });

    const pendingClientRequests = await Task.find({
        createdByRole: 'client',
        status: 'Client Requested'
    })
        .populate('createdBy', 'name email role')
        .sort({ createdAt: -1 });

    res.json({ managers, teams, managerTasks, pendingClientRequests });
}));

// HR fetches relevant tasks (created by them or assigned to managers)
router.get('/tasks', protect, roleRequired('hr'), asyncHandler(async (req, res) => {
    const managerIds = await collectManagerIds();

    const tasks = await Task.find({
        $or: [
            { createdBy: req.user._id },
            { assignedTo: { $in: managerIds } },
            { manager: { $in: managerIds } },
            { status: { $in: ['Awaiting HR Review', 'Awaiting Client Review', 'Completed', 'Changes Requested'] } }
        ]
    })
        .populate('assignedTo', 'name email role')
        .populate('assignedTeam', 'name')
        .populate('manager', 'name email')
        .populate('createdBy', 'username name email role')
        .sort({ createdAt: -1 });

    res.json(tasks);
}));

// HR cannot create new tasks (reserved for clients)
router.post('/tasks', protect, roleRequired('hr'), (req, res) => {
    res.status(403).json({ message: 'Task creation is restricted to clients' });
});

// HR assigns an existing task (often client-created) to a manager/team
router.put('/tasks/:id/assign', protect, roleRequired('hr'), asyncHandler(async (req, res) => {
    const task = await Task.findById(req.params.id);
    if (!task) {
        res.status(404);
        throw new Error('Task not found');
    }

    let managerId = normalizeId(req.body.managerId || req.body.assignedTo);
    let teamId = normalizeId(req.body.teamId || req.body.assignedTeam);

    if (!managerId && !teamId) {
        res.status(400);
        throw new Error('Provide a managerId and optionally a teamId');
    }

    let manager = null;
    if (managerId) {
        manager = await User.findOne({ _id: managerId, role: 'manager' });
        if (!manager) {
            res.status(404);
            throw new Error('Manager not found');
        }
    }

    let teamDoc = null;
    if (teamId) {
        teamDoc = await Team.findById(teamId);
        if (!teamDoc) {
            res.status(404);
            throw new Error('Team not found');
        }
        if (manager && teamDoc.manager.toString() !== manager._id.toString()) {
            res.status(403);
            throw new Error('Selected team is not managed by the specified manager');
        }
        if (!manager) {
            manager = await User.findOne({ _id: teamDoc.manager, role: 'manager' });
        }
    }

    if (!manager) {
        res.status(400);
        throw new Error('Manager is required when assigning a task');
    }

    if (req.body.deadline) {
        task.deadline = req.body.deadline;
    }

    const ensureStageStructure = () => {
        const defaultStage = () => ({
            user: null,
            deadline: null,
            status: 'pending',
            submittedAt: null,
            submissionAttachmentId: null
        });
        if (!task.stageAssignments || typeof task.stageAssignments !== 'object') {
            task.stageAssignments = {
                designer: defaultStage(),
                developer: defaultStage(),
                tester: defaultStage()
            };
        }
        ['designer', 'developer', 'tester'].forEach(key => {
            if (!task.stageAssignments[key]) {
                task.stageAssignments[key] = defaultStage();
            } else {
                task.stageAssignments[key].status = 'pending';
                task.stageAssignments[key].submittedAt = null;
                task.stageAssignments[key].submissionAttachmentId = null;
            }
        });
        task.markModified('stageAssignments');
    };

    ensureStageStructure();

    task.manager = manager._id;
    task.assignedTo = manager._id;
    task.assignedTeam = teamDoc ? teamDoc._id : null;
    setTaskState(task, {
        status: STATUS.AWAITING_MANAGER_ASSIGNMENT,
        stage: STAGE.MANAGER_PLANNING,
        note: 'HR forwarded project to manager for planning',
        actor: req.user._id
    });

    const updated = await task.save();
    await updated.populate('assignedTo', 'name email role');
    await updated.populate('assignedTeam', 'name');
    await updated.populate('manager', 'name email');
    await updated.populate('createdBy', 'username name email role');

    await notifyUsers({
        recipients: [manager._id],
        message: `HR assigned project ${task.title} to you`,
        task: task._id,
        stage: STAGE.MANAGER_PLANNING
    });

    res.json(updated);
}));

// HR forwards a reviewed task to the client
router.put('/tasks/:id/send-client', protect, roleRequired('hr'), asyncHandler(async (req, res) => {
    const task = await Task.findById(req.params.id);
    if (!task) {
        res.status(404);
        throw new Error('Task not found');
    }

    if (task.status !== STATUS.AWAITING_HR_REVIEW) {
        res.status(400);
        throw new Error('Task is not ready for client review');
    }

    const assignToClient = task.createdByRole === 'client' ? task.createdBy : null;
    task.assignedTo = assignToClient;
    setTaskState(task, {
        status: STATUS.AWAITING_CLIENT_REVIEW,
        stage: STAGE.CLIENT_REVIEW,
        note: 'HR sent deliverables to client',
        actor: req.user._id
    });

    const updated = await task.save();
    await updated.populate('assignedTo', 'name email role');
    await updated.populate('assignedTeam', 'name');
    await updated.populate('manager', 'name email');
    await updated.populate('createdBy', 'username name email role');

    if (assignToClient) {
        await notifyUsers({
            recipients: [assignToClient],
            message: `Project ${task.title} is ready for your review`,
            task: task._id,
            stage: STAGE.CLIENT_REVIEW
        });
    }

    res.json(updated);
}));

// HR forwards client feedback back to manager
router.put('/tasks/:id/forward-manager', protect, roleRequired('hr'), asyncHandler(async (req, res) => {
    const task = await Task.findById(req.params.id);
    if (!task) {
        res.status(404);
        throw new Error('Task not found');
    }

    if (task.status !== STATUS.CHANGES_REQUESTED) {
        res.status(400);
        throw new Error('Task does not have outstanding client changes');
    }

    if (!task.manager) {
        res.status(400);
        throw new Error('Task has no manager assigned');
    }

    task.assignedTo = task.manager;
    setTaskState(task, {
        status: STATUS.CHANGES_REQUESTED,
        stage: STAGE.MANAGER_PLANNING,
        note: req.body.note || 'HR forwarded client feedback to manager',
        actor: req.user._id
    });

    const updated = await task.save();
    await updated.populate('assignedTo', 'name email role');
    await updated.populate('assignedTeam', 'name');
    await updated.populate('manager', 'name email');
    await updated.populate('createdBy', 'username name email role');

    await notifyUsers({
        recipients: [task.manager],
        message: `HR forwarded client feedback for project ${task.title}`,
        task: task._id,
        stage: STAGE.MANAGER_PLANNING,
        meta: { note: req.body.note || '' }
    });

    res.json(updated);
}));

// Get pending Manager password reset requests
router.get('/password-requests', protect, roleRequired('hr'), asyncHandler(async (req, res) => {
    const requests = await PasswordReset.find({
        userType: 'manager-request',
        status: 'pending'
    })
    .populate('requestedBy', 'name email role')
    .sort({ createdAt: -1 });

    res.json(requests);
}));

// HR resets Manager password
router.post('/reset-manager-password', protect, roleRequired('hr'), asyncHandler(async (req, res) => {
    const { requestId, newPassword } = req.body;

    if (!requestId || !newPassword) {
        res.status(400);
        throw new Error('Request ID and new password are required');
    }

    if (newPassword.length < 8) {
        res.status(400);
        throw new Error('Password must be at least 8 characters');
    }

    // Find the password reset request
    const resetRequest = await PasswordReset.findById(requestId).populate('requestedBy', 'name email role');

    if (!resetRequest) {
        res.status(404);
        throw new Error('Password reset request not found');
    }

    if (resetRequest.status !== 'pending') {
        res.status(400);
        throw new Error('This request has already been processed');
    }

    // Find the Manager user
    const managerUser = await User.findOne({ email: resetRequest.email });
    if (!managerUser) {
        res.status(404);
        throw new Error('Manager user not found');
    }

    // Update Manager password
    managerUser.password = newPassword;
    await managerUser.save();

    // Send email to Manager with new password
    await sendNewPasswordEmail(managerUser.email, managerUser.name, newPassword, 'manager');

    // Update reset request status
    resetRequest.status = 'completed';
    resetRequest.processedBy = req.user._id;
    await resetRequest.save();

    // Delete the request after processing
    await PasswordReset.deleteOne({ _id: resetRequest._id });

    res.json({
        message: `Password reset successfully for ${managerUser.name}. An email has been sent with the new password.`
    });
}));

module.exports = router;
