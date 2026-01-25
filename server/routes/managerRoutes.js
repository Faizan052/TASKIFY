const express = require('express');
const router = express.Router();
const asyncHandler = require('express-async-handler');
const Team = require('../models/Team');
const User = require('../models/User');
const Task = require('../models/Task');
const { protect } = require('../middleware/auth');
const { roleRequired } = require('../middleware/roles');
const { STATUS, STAGE, setTaskState, notifyUsers } = require('../utils/taskWorkflow');

const normalizeId = (value) => {
    if (value === undefined || value === null || value === '') {
        return null;
    }
    return value.toString();
};

const collectManagerTeamData = async (managerId) => {
    const teams = await Team.find({ manager: managerId }).select('_id name members');
    const teamIds = teams.map(team => team._id.toString());
    const memberIds = new Set();
    teams.forEach(team => {
        team.members.forEach(member => {
            memberIds.add(member.toString());
        });
    });
    return { teams, teamIds, memberIds };
};

const dedupeTasks = (tasks) => {
    const seen = new Set();
    return tasks.filter(task => {
        const key = task._id.toString();
        if (seen.has(key)) {
            return false;
        }
        seen.add(key);
        return true;
    });
};

const formatRoleLabel = (value) => value ? value.charAt(0).toUpperCase() + value.slice(1) : '';

const findRoleUserByEmail = async ({ email, role, res }) => {
    const trimmed = (email || '').trim().toLowerCase();
    if (!trimmed) {
        res.status(400);
        throw new Error(`Provide ${formatRoleLabel(role)} email`);
    }
    const user = await User.findOne({ email: trimmed, role }).select('_id name email role');
    if (!user) {
        res.status(404);
        throw new Error(`${formatRoleLabel(role)} with email ${trimmed} not found`);
    }
    return user;
};

// Manager creates a team with required designer/developer/tester
router.post('/teams', protect, roleRequired('manager'), asyncHandler(async (req, res) => {
    const { name, designerEmail, developerEmail, testerEmail } = req.body;
    const managerId = req.user._id;

    if (!name || !name.trim()) {
        res.status(400);
        throw new Error('Team name is required');
    }

    const designer = await findRoleUserByEmail({ email: designerEmail, role: 'designer', res });
    const developer = await findRoleUserByEmail({ email: developerEmail, role: 'developer', res });
    const tester = await findRoleUserByEmail({ email: testerEmail, role: 'tester', res });

    const uniqueMembers = new Map();
    [designer, developer, tester].forEach(member => {
        const key = member._id.toString();
        if (uniqueMembers.has(key)) {
            res.status(400);
            throw new Error('Assign distinct users to designer, developer, and tester roles');
        }
        uniqueMembers.set(key, member._id);
    });

    const team = await Team.create({
        name: name.trim(),
        manager: managerId,
        members: Array.from(uniqueMembers.values())
    });

    const populated = await Team.findById(team._id).populate('members', 'name email role');
    res.status(201).json(populated);
}));

// Manager lists their teams
router.get('/teams', protect, roleRequired('manager'), asyncHandler(async (req, res) => {
    const teams = await Team.find({ manager: req.user._id }).populate('members', 'name email role');
    res.json(teams);
}));

// Manager adds a member (developer/designer/tester) to a team
router.post('/teams/:teamId/members', protect, roleRequired('manager'), asyncHandler(async (req, res) => {
    const { teamId } = req.params;
    const { memberId, memberEmail } = req.body;

    const team = await Team.findById(teamId);
    if (!team) { res.status(404); throw new Error('Team not found'); }
    if (team.manager.toString() !== req.user._id.toString()) { res.status(403); throw new Error('Not your team'); }

    let member = null;
    if (memberId) {
        member = await User.findById(memberId);
    } else if (memberEmail) {
        member = await User.findOne({ email: memberEmail });
    } else {
        res.status(400); throw new Error('memberId or memberEmail required');
    }

    if (!member) { res.status(404); throw new Error('User not found'); }
    if (!['developer','designer','tester'].includes(member.role)) { res.status(400); throw new Error('Member role not allowed for teams'); }

    if (team.members.includes(member._id)) {
        res.status(400); throw new Error('Member already in team');
    }

    team.members.push(member._id);
    await team.save();
    const populated = await Team.findById(team._id).populate('members', 'name email role');
    res.json(populated);
}));

// Manager removes a member
router.delete('/teams/:teamId/members/:memberId', protect, roleRequired('manager'), asyncHandler(async (req, res) => {
    const { teamId, memberId } = req.params;
    const team = await Team.findById(teamId);
    if (!team) { res.status(404); throw new Error('Team not found'); }
    if (team.manager.toString() !== req.user._id.toString()) { res.status(403); throw new Error('Not your team'); }

    team.members = team.members.filter(m => m.toString() !== memberId);
    await team.save();
    const populated = await Team.findById(team._id).populate('members', 'name email role');
    res.json(populated);
}));

// Manager assigns designer, developer, and tester with deadlines
router.put('/tasks/:id/assign', protect, roleRequired('manager'), asyncHandler(async (req, res) => {
    const task = await Task.findById(req.params.id);
    if (!task) {
        res.status(404);
        throw new Error('Task not found');
    }

    if (task.manager && task.manager.toString() !== req.user._id.toString()) {
        res.status(403);
        throw new Error('Not authorized to manage this task');
    }

    if (![STATUS.AWAITING_MANAGER_ASSIGNMENT, STATUS.CHANGES_REQUESTED].includes(task.status)) {
        res.status(400);
        throw new Error('Task is not awaiting team assignment');
    }

    const {
        teamId,
        designerDeadline,
        developerDeadline,
        testerDeadline
    } = req.body;

    const normalizedTeamId = normalizeId(teamId);
    if (!normalizedTeamId) {
        res.status(400);
        throw new Error('Select a team before assigning the project');
    }

    const team = await Team.findOne({ _id: normalizedTeamId, manager: req.user._id })
        .populate('members', 'name email role');

    if (!team) {
        res.status(403);
        throw new Error('You can only assign projects to your own teams');
    }

    const findMemberByRole = (role) => {
        const member = (team.members || []).find(m => m.role === role);
        if (!member) {
            res.status(400);
            throw new Error(`Team ${team.name} does not have a ${role}`);
        }
        return member;
    };

    const parseDeadline = (value, label, required = false) => {
        if (!value) {
            if (required) {
                res.status(400);
                throw new Error(`Provide a ${label} deadline`);
            }
            return null;
        }
        const dt = new Date(value);
        if (Number.isNaN(dt.getTime())) {
            res.status(400);
            throw new Error(`Provide a valid ${label} deadline`);
        }
        return dt;
    };

    const designer = findMemberByRole('designer');
    const developer = findMemberByRole('developer');
    const tester = findMemberByRole('tester');

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
            }
        });
    };

    ensureStageStructure();

    task.manager = task.manager || req.user._id;
    task.assignedTeam = team._id;

    task.stageAssignments.designer.user = designer._id;
    task.stageAssignments.designer.deadline = parseDeadline(designerDeadline, 'designer', true);
    task.stageAssignments.designer.status = 'in_progress';
    task.stageAssignments.designer.submittedAt = null;
    task.stageAssignments.designer.submissionAttachmentId = null;

    task.stageAssignments.developer.user = developer._id;
    task.stageAssignments.developer.deadline = parseDeadline(developerDeadline, 'developer');
    task.stageAssignments.developer.status = 'pending';
    task.stageAssignments.developer.submittedAt = null;
    task.stageAssignments.developer.submissionAttachmentId = null;

    task.stageAssignments.tester.user = tester._id;
    task.stageAssignments.tester.deadline = parseDeadline(testerDeadline, 'tester');
    task.stageAssignments.tester.status = 'pending';
    task.stageAssignments.tester.submittedAt = null;
    task.stageAssignments.tester.submissionAttachmentId = null;

    task.assignedTo = designer._id;
    setTaskState(task, {
        status: STATUS.DESIGN_IN_PROGRESS,
        stage: STAGE.DESIGN,
        note: `Manager assigned team ${team.name} to the project`,
        actor: req.user._id
    });

    task.markModified('stageAssignments');

    const updated = await task.save();
    await updated.populate('assignedTo', 'name email role');
    await updated.populate('assignedTeam', 'name');
    await updated.populate('manager', 'name email');
    await updated.populate({ path: 'stageAssignments.designer.user', select: 'name email role' });
    await updated.populate({ path: 'stageAssignments.developer.user', select: 'name email role' });
    await updated.populate({ path: 'stageAssignments.tester.user', select: 'name email role' });

    await notifyUsers({
        recipients: [designer._id],
        message: `Manager assigned project ${task.title} to your team for design work`,
        task: task._id,
        stage: STAGE.DESIGN
    });
    await notifyUsers({
        recipients: [developer._id],
        message: `Project ${task.title} is queued for development after design approval`,
        task: task._id,
        stage: STAGE.DEVELOPMENT
    });
    await notifyUsers({
        recipients: [tester._id],
        message: `Project ${task.title} will move to you after development approval`,
        task: task._id,
        stage: STAGE.TESTING
    });

    res.json(updated);
}));

// Managers cannot create new tasks (reserved for clients)
router.post('/tasks', protect, roleRequired('manager'), (req, res) => {
    res.status(403).json({ message: 'Task creation is restricted to clients' });
});

// Manager views tasks they created or that target their teams/members
router.get('/tasks', protect, roleRequired('manager'), asyncHandler(async (req, res) => {
    const { teamIds, memberIds } = await collectManagerTeamData(req.user._id);

    const orConditions = [{ createdBy: req.user._id }, { manager: req.user._id }, { assignedTo: req.user._id }];
    if (teamIds.length > 0) {
        orConditions.push({ assignedTeam: { $in: teamIds } });
    }
    if (memberIds.size > 0) {
        orConditions.push({ assignedTo: { $in: Array.from(memberIds) } });
    }

    const tasks = await Task.find({ $or: orConditions })
        .populate('assignedTo', 'name email role')
        .populate('assignedTeam', 'name')
        .populate('manager', 'name email')
        .populate('createdBy', 'username name email role')
        .populate({ path: 'stageAssignments.designer.user', select: 'name email role' })
        .populate({ path: 'stageAssignments.developer.user', select: 'name email role' })
        .populate({ path: 'stageAssignments.tester.user', select: 'name email role' })
        .sort({ createdAt: -1 });

    res.json(dedupeTasks(tasks));
}));

// Manager updates an existing task for their teams/members
router.put('/tasks/:id', protect, roleRequired('manager'), asyncHandler(async (req, res) => {
    const task = await Task.findById(req.params.id);
    if (!task) {
        res.status(404);
        throw new Error('Task not found');
    }

    const { teams, teamIds, memberIds } = await collectManagerTeamData(req.user._id);

    const managesCreated = task.createdByRole === 'manager' && task.createdBy && task.createdBy.toString() === req.user._id.toString();
    const managesTeam = task.assignedTeam && teamIds.includes(task.assignedTeam.toString());
    const managesMember = task.assignedTo && memberIds.has(task.assignedTo.toString());

    if (!managesCreated && !managesTeam && !managesMember) {
        res.status(403);
        throw new Error('Not authorized to update this task');
    }

    if (!task.manager) {
        task.manager = req.user._id;
    }

    const { title, description, deadline } = req.body;
    if (title) task.title = title;
    if (description) task.description = description;
    if (deadline) task.deadline = deadline;

    const hasAssignedTeam = Object.prototype.hasOwnProperty.call(req.body, 'assignedTeam');
    const hasAssignedTo = Object.prototype.hasOwnProperty.call(req.body, 'assignedTo');

    let nextAssignedTeam = task.assignedTeam ? task.assignedTeam.toString() : null;
    let nextAssignedTo = task.assignedTo ? task.assignedTo.toString() : null;

    if (hasAssignedTeam) {
        const normalizedTeam = normalizeId(req.body.assignedTeam);
        if (normalizedTeam) {
            if (!teamIds.includes(normalizedTeam)) {
                res.status(403);
                throw new Error('Cannot assign task to a team you do not manage');
            }
            nextAssignedTeam = normalizedTeam;
        } else {
            nextAssignedTeam = null;
        }
    }

    if (hasAssignedTo) {
        const normalizedMember = normalizeId(req.body.assignedTo);
        if (normalizedMember) {
            if (!memberIds.has(normalizedMember)) {
                res.status(403);
                throw new Error('Cannot assign task to a user outside your teams');
            }
            nextAssignedTo = normalizedMember;
        } else {
            nextAssignedTo = null;
        }
    }

    if (hasAssignedTeam || hasAssignedTo) {
        if (nextAssignedTo) {
            if (nextAssignedTeam) {
                const team = teams.find(t => t._id.toString() === nextAssignedTeam);
                if (!team || !team.members.some(member => member.toString() === nextAssignedTo)) {
                    res.status(400);
                    throw new Error('Assigned member is not part of the selected team');
                }
            } else {
                const containingTeams = teams.filter(t => t.members.some(member => member.toString() === nextAssignedTo));
                if (containingTeams.length === 1) {
                    nextAssignedTeam = containingTeams[0]._id.toString();
                } else if (containingTeams.length === 0) {
                    res.status(400);
                    throw new Error('Assigned member does not belong to any of your teams');
                } else {
                    res.status(400);
                    throw new Error('Member belongs to multiple teams; specify assignedTeam');
                }
            }
        } else if (!nextAssignedTeam) {
            res.status(400);
            throw new Error('Task must remain assigned to at least one team or member');
        }
    }

    task.assignedTeam = nextAssignedTeam ? nextAssignedTeam : null;
    task.assignedTo = nextAssignedTo ? nextAssignedTo : null;

    const updated = await task.save();
    await updated.populate('assignedTo', 'name email role');
    await updated.populate('assignedTeam', 'name');
    await updated.populate('manager', 'name email');
    await updated.populate('createdBy', 'username name email role');

    res.json(updated);
}));

module.exports = router;
