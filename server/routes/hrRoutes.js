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
const { trySendWelcomeEmail, trySendNewPasswordEmail, trySendTaskStageEmail, trySendAccountApprovalEmail, trySendAccountRejectionEmail } = require('../utils/emailNotifications');
const { normalizeEmail, assertUniqueIdentity } = require('../utils/identity');
const { buildPerformanceReport } = require('../utils/performanceReports');

const CATEGORY_OPTIONS = ['website', 'mobile-app', 'desktop-app', 'testing', 'updation', 'design', 'api', 'database', 'other'];

const normalizeCategories = (value) => {
    if (Array.isArray(value)) {
        return value.map(item => (item || '').toString().trim()).filter(Boolean);
    }
    if (typeof value === 'string' && value.trim()) {
        return [value.trim()];
    }
    return [];
};

const getUserCategories = (user) => {
    if (Array.isArray(user?.categories) && user.categories.length > 0) {
        return user.categories;
    }
    if (user?.category) {
        return [user.category];
    }
    return [];
};

const hasTaskCategoryAccess = (user, taskCategory) => {
    if (!taskCategory) return true;
    return getUserCategories(user).includes(taskCategory);
};

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

const SELF_REGISTERED_ROLES = ['developer', 'designer', 'tester', 'client'];

const enqueueEmail = (handler) => {
    Promise.resolve().then(handler).catch(() => {});
};

// HR lists users for approval
router.get('/users', protect, roleRequired('hr'), asyncHandler(async (req, res) => {
    const status = (req.query.status || '').toString().trim().toLowerCase();
    const filter = { role: { $in: SELF_REGISTERED_ROLES } };
    if (status) {
        filter.approvalStatus = status;
    }

    const users = await User.find(filter)
        .select('name email role categories category approvalStatus isActive createdAt')
        .sort({ createdAt: -1 });

    res.json(users);
}));

// HR approves a pending user
router.patch('/users/:id/approve', protect, roleRequired('hr'), asyncHandler(async (req, res) => {
    const user = await User.findById(req.params.id);
    if (!user) {
        res.status(404);
        throw new Error('User not found');
    }

    if (!SELF_REGISTERED_ROLES.includes(user.role)) {
        res.status(400);
        throw new Error('Only self-registered users can be approved here');
    }

    user.approvalStatus = 'approved';
    user.approvalReviewedAt = new Date();
    user.isActive = true;
    await user.save();

    await notifyUsers({
        recipients: [user._id],
        message: 'Your account has been approved. You can now log in.',
        meta: { approvalStatus: 'approved' }
    });

    if (user.email) {
        await trySendAccountApprovalEmail({
            email: user.email,
            name: user.name || user.email,
            errorMessage: 'Failed to send account approval email:'
        });
    }

    res.json({
        message: 'User approved successfully',
        user: {
            _id: user._id,
            name: user.name,
            email: user.email,
            role: user.role,
            approvalStatus: user.approvalStatus,
            isActive: user.isActive
        }
    });
}));

// HR rejects a pending user
router.patch('/users/:id/reject', protect, roleRequired('hr'), asyncHandler(async (req, res) => {
    const user = await User.findById(req.params.id);
    if (!user) {
        res.status(404);
        throw new Error('User not found');
    }

    const reason = (req.body.reason || '').toString().trim();

    if (!SELF_REGISTERED_ROLES.includes(user.role)) {
        res.status(400);
        throw new Error('Only self-registered users can be rejected here');
    }

    user.approvalStatus = 'rejected';
    user.approvalReviewedAt = new Date();
    user.isActive = false;
    await user.save();

    await notifyUsers({
        recipients: [user._id],
        message: 'Your registration was rejected. You cannot log in.',
        meta: { approvalStatus: 'rejected', reason }
    });

    if (user.email) {
        await trySendAccountRejectionEmail({
            email: user.email,
            name: user.name || user.email,
            reason,
            errorMessage: 'Failed to send account rejection email:'
        });
    }

    res.json({
        message: 'User rejected successfully',
        user: {
            _id: user._id,
            name: user.name,
            email: user.email,
            role: user.role,
            approvalStatus: user.approvalStatus,
            isActive: user.isActive
        }
    });
}));

// HR creates manager
router.post('/managers', protect, roleRequired('hr'), asyncHandler(async (req, res) => {
    const { name, password } = req.body;
    const email = normalizeEmail(req.body.email);
    const categories = normalizeCategories(req.body.categories ?? req.body.category);

    if (!categories.length) {
        res.status(400);
        throw new Error('At least one valid category is required for manager');
    }

    const invalidCategories = categories.filter(item => !CATEGORY_OPTIONS.includes(item));
    if (invalidCategories.length > 0) {
        res.status(400);
        throw new Error('Invalid categories for manager');
    }

    try {
        await assertUniqueIdentity({ email });
    } catch (identityError) {
        res.status(400);
        throw new Error(identityError.message);
    }

    const user = await User.create({ name, email, password, role: 'manager', categories, category: categories[0] });
    if (user) {
        await trySendWelcomeEmail({
            email: user.email,
            name: user.name,
            role: 'manager',
            password,
            errorMessage: 'Welcome email failed but manager created:'
        });

        res.status(201).json({ _id: user._id, name: user.name, email: user.email, role: user.role, categories: user.categories || [], category: user.category });
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
    const nextEmail = req.body.email !== undefined ? normalizeEmail(req.body.email) : manager.email;
    if (nextEmail !== manager.email) {
        try {
            await assertUniqueIdentity({ email: nextEmail, excludeUserId: manager._id });
        } catch (identityError) {
            res.status(400);
            throw new Error(identityError.message);
        }
    }
    manager.email = nextEmail;
    if (req.body.categories !== undefined || req.body.category !== undefined) {
        const categories = normalizeCategories(req.body.categories ?? req.body.category);
        if (!categories.length) {
            res.status(400);
            throw new Error('At least one category is required for manager');
        }
        const invalidCategories = categories.filter(item => !CATEGORY_OPTIONS.includes(item));
        if (invalidCategories.length > 0) {
            res.status(400);
            throw new Error('Invalid categories for manager');
        }
        manager.categories = categories;
        manager.category = categories[0];
    }
    const passwordProvided = !!(req.body.password);
    if (passwordProvided) manager.password = req.body.password;

    const updated = await manager.save();

    if (passwordProvided) {
        await trySendNewPasswordEmail({
            email: updated.email,
            name: updated.name,
            password: req.body.password,
            role: 'manager',
            errorMessage: 'Failed to send updated credentials email to manager:'
        });
    }

    res.json({ _id: updated._id, name: updated.name, email: updated.email, role: updated.role, categories: updated.categories || [], category: updated.category });
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
        .populate('manager', 'name email role category')
        .populate('members', 'name email role category')
        .sort({ createdAt: -1 });

    const managerTasks = await Task.find({
        $or: [
            { assignedTo: { $in: managerIds } },
            { manager: { $in: managerIds } }
        ]
    })
        .populate('assignedTo', 'name email role category')
        .populate('assignedTeam', 'name')
        .populate('manager', 'name email role category')
        .populate('createdBy', 'username name email role category')
        .sort({ createdAt: -1 });

    const pendingClientRequests = await Task.find({
        createdByRole: 'client',
        status: 'Client Requested'
    })
        .populate('createdBy', 'name email role category')
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
        .populate('assignedTo', 'name email role category')
        .populate('assignedTeam', 'name')
        .populate('manager', 'name email role category')
        .populate('createdBy', 'username name email role category')
        .sort({ createdAt: -1 });

    res.json(tasks);
}));

router.get('/performance-report', protect, roleRequired('hr'), asyncHandler(async (req, res) => {
    const days = Math.max(1, Math.min(parseInt(req.query.days, 10) || 180, 3650));
    const sinceDate = new Date(Date.now() - (days * 24 * 60 * 60 * 1000));
    const selectedTeamId = (req.query.teamId || '').toString().trim();
    const selectedUserId = (req.query.userId || '').toString().trim();

    const [teams, users, tasks] = await Promise.all([
        Team.find({})
            .populate('manager', 'name email role')
            .populate('members', 'name email role')
            .lean(),
        User.find({ role: { $in: ['hr', 'manager', 'designer', 'developer', 'tester', 'client'] }, isActive: true })
            .select('_id name email role')
            .lean(),
        Task.find({ createdAt: { $gte: sinceDate } })
            .select('status deadline updatedAt manager assignedTo assignedTeam stageAssignments history managerDecision')
            .lean()
    ]);

    let filteredUsers = users;
    if (selectedTeamId) {
        const selectedTeam = teams.find(team => team._id.toString() === selectedTeamId);
        if (!selectedTeam) {
            res.status(404);
            throw new Error('Team not found');
        }
        const teamMemberIds = new Set((selectedTeam.members || []).map(member => member._id.toString()));
        filteredUsers = filteredUsers.filter(user => teamMemberIds.has(user._id.toString()));
    }

    if (selectedUserId) {
        filteredUsers = filteredUsers.filter(user => user._id.toString() === selectedUserId);
    }

    const report = buildPerformanceReport({ users: filteredUsers, tasks });

    const metricByUserId = report.users.reduce((acc, item) => {
        acc[item.userId.toString()] = item;
        return acc;
    }, {});

    const teamsReport = teams.map(team => {
        const members = (team.members || [])
            .map(member => metricByUserId[member._id.toString()])
            .filter(Boolean);

        const summary = members.reduce((acc, item) => {
            acc.totalAssigned += item.totalAssigned;
            acc.successfulTasks += item.successfulTasks;
            acc.failedTasks += item.failedTasks;
            acc.rejectedTasks += item.rejectedTasks;
            acc.completedOnTime += item.completedOnTime;
            acc.delayedTasks += item.delayedTasks;
            return acc;
        }, { totalAssigned: 0, successfulTasks: 0, failedTasks: 0, rejectedTasks: 0, completedOnTime: 0, delayedTasks: 0 });

        const denominator = summary.successfulTasks + summary.failedTasks;
        const successRatio = denominator > 0 ? Number(((summary.successfulTasks / denominator) * 100).toFixed(2)) : 0;

        return {
            teamId: team._id,
            teamName: team.name,
            managerName: team.manager ? (team.manager.name || team.manager.email) : '—',
            memberCount: (team.members || []).length,
            successRatio,
            ...summary
        };
    }).filter(team => !selectedTeamId || team.teamId.toString() === selectedTeamId);

    res.json({
        generatedAt: new Date(),
        windowDays: days,
        selectedTeamId: selectedTeamId || null,
        selectedUserId: selectedUserId || null,
        ...report,
        teams: teamsReport,
        filters: {
            users: users.map(user => ({ _id: user._id, name: user.name, role: user.role })),
            teams: teams.map(team => ({ _id: team._id, name: team.name }))
        }
    });
}));

router.get('/performance-report/user/:userId', protect, roleRequired('hr'), asyncHandler(async (req, res) => {
    const user = await User.findById(req.params.userId).select('_id name email role isActive').lean();
    if (!user) {
        res.status(404);
        throw new Error('User not found');
    }

    const tasks = await Task.find({})
        .select('title status deadline updatedAt manager assignedTo assignedTeam stageAssignments history managerDecision createdAt')
        .lean();

    const report = buildPerformanceReport({ users: [user], tasks });
    res.json({
        generatedAt: new Date(),
        user,
        report: report.users[0] || null,
        chart: report.chart
    });
}));

router.get('/performance-report/team/:teamId', protect, roleRequired('hr'), asyncHandler(async (req, res) => {
    const team = await Team.findById(req.params.teamId)
        .populate('manager', 'name email role')
        .populate('members', 'name email role isActive')
        .lean();

    if (!team) {
        res.status(404);
        throw new Error('Team not found');
    }

    const memberIds = (team.members || []).map(member => member._id.toString());
    const users = await User.find({ _id: { $in: memberIds } }).select('_id name email role isActive').lean();
    const tasks = await Task.find({})
        .select('title status deadline updatedAt manager assignedTo assignedTeam stageAssignments history managerDecision createdAt')
        .lean();

    const report = buildPerformanceReport({ users, tasks });
    res.json({
        generatedAt: new Date(),
        team,
        report
    });
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
        if (!hasTaskCategoryAccess(manager, task.category)) {
            res.status(400);
            throw new Error(`Manager categories do not include task category (${task.category})`);
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

    if (manager && !hasTaskCategoryAccess(manager, task.category)) {
        res.status(400);
        throw new Error(`Manager categories do not include task category (${task.category})`);
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
    task.managerDecision = {
        decision: 'pending',
        comment: '',
        reviewedBy: null,
        reviewedAt: null
    };
    setTaskState(task, {
        status: STATUS.AWAITING_MANAGER_ASSIGNMENT,
        stage: STAGE.MANAGER_PLANNING,
        note: 'HR forwarded project to manager for planning',
        actor: req.user._id
    });

    const updated = await task.save();
    await updated.populate('assignedTo', 'name email role category');
    await updated.populate('assignedTeam', 'name');
    await updated.populate('manager', 'name email role category');
    await updated.populate('createdBy', 'username name email role category');

    await notifyUsers({
        recipients: [manager._id],
        message: 'A new task has been assigned to you.',
        task: task._id,
        stage: STAGE.MANAGER_PLANNING
    });

    if (manager.email) {
        enqueueEmail(() => trySendTaskStageEmail({
            email: manager.email,
            name: manager.name || manager.email,
            roleLabel: 'Manager',
            taskTitle: task.title,
            message: 'A new task has been assigned to you.'
        }));
    }

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
    task.clientReviewOrigin = 'hr_delivery';
    setTaskState(task, {
        status: STATUS.AWAITING_CLIENT_REVIEW,
        stage: STAGE.CLIENT_REVIEW,
        note: 'HR sent deliverables to client',
        actor: req.user._id
    });

    const updated = await task.save();
    await updated.populate('assignedTo', 'name email role category');
    await updated.populate('assignedTeam', 'name');
    await updated.populate('manager', 'name email role category');
    await updated.populate('createdBy', 'username name email role category');

    if (assignToClient) {
        await notifyUsers({
            recipients: [assignToClient],
            message: `Project ${task.title} is ready for your review`,
            task: task._id,
            stage: STAGE.CLIENT_REVIEW
        });
        const clientUser = await User.findById(assignToClient).select('name email role');
        if (clientUser?.email) {
            enqueueEmail(() => trySendTaskStageEmail({
                email: clientUser.email,
                name: clientUser.name || clientUser.email,
                roleLabel: 'Client',
                taskTitle: task.title,
                message: `Project ${task.title} is ready for your review`
            }));
        }
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
    await updated.populate('assignedTo', 'name email role category');
    await updated.populate('assignedTeam', 'name');
    await updated.populate('manager', 'name email role category');
    await updated.populate('createdBy', 'username name email role category');

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
    await trySendNewPasswordEmail({
        email: managerUser.email,
        name: managerUser.name,
        password: newPassword,
        role: 'manager',
        errorMessage: 'Failed to send new password email to manager:'
    });

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

// HR fetches all registered users (for dynamic manager creation/selection)
router.get('/users', protect, roleRequired('hr'), asyncHandler(async (req, res) => {
    const { role, category } = req.query;
    
    let query = {};
    if (role) {
        query.role = role;
    }
    if (category) {
        query.$or = [
            { categories: category },
            { category: category }
        ];
    }
    
    const users = await User.find(query)
        .select('_id name email role category categories')
        .sort({ name: 1 });
    
    res.json(users);
}));

module.exports = router;
