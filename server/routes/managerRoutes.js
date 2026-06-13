const express = require('express');
const router = express.Router();
const asyncHandler = require('express-async-handler');
const Team = require('../models/Team');
const User = require('../models/User');
const Task = require('../models/Task');
const { protect } = require('../middleware/auth');
const { roleRequired } = require('../middleware/roles');
const { STATUS, STAGE, setTaskState, notifyUsers, getActiveStageKey, hasHistoryNote, markTaskDelayed, pushHistory } = require('../utils/taskWorkflow');
const { trySendTaskStageEmail } = require('../utils/emailNotifications');
const { buildPerformanceReport } = require('../utils/performanceReports');
const { isValidObjectId } = require('../utils/validation');

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
            const memberId = member?.toString();
            if (isValidObjectId(memberId)) {
                memberIds.add(memberId);
            }
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

const STAGE_ROLE_LABELS = {
    designer: 'Designer',
    developer: 'Developer',
    tester: 'Tester'
};

const enqueueEmail = (handler) => {
    Promise.resolve().then(handler).catch(() => {});
};

const DEADLINE_NOTICE_DAYS = 5;
const DEADLINE_NOTICE_MS = DEADLINE_NOTICE_DAYS * 24 * 60 * 60 * 1000;

const isDeadlineNear = (value) => {
    if (!value) return false;
    const due = new Date(value);
    if (Number.isNaN(due.getTime())) return false;
    const remainingMs = due.getTime() - Date.now();
    return remainingMs > 0 && remainingMs <= DEADLINE_NOTICE_MS;
};

const OBJECT_ID_PATTERN = /[a-f0-9]{24}/i;

const isObjectIdValue = (value) => {
    if (!value || typeof value !== 'object') return false;
    if (value._bsontype === 'ObjectID' || value._bsontype === 'ObjectId') return true;
    return isValidObjectId(value);
};

const extractObjectId = (value) => {
    if (!value) return null;
    if (typeof value === 'string') {
        const trimmed = value.trim();
        if (isValidObjectId(trimmed)) return trimmed;
        const match = trimmed.match(OBJECT_ID_PATTERN);
        if (match && isValidObjectId(match[0])) return match[0];
        return null;
    }
    if (isObjectIdValue(value)) return value.toString();
    if (value._id) return extractObjectId(value._id);
    if (value.id) return extractObjectId(value.id);
    if (typeof value.toString === 'function') return extractObjectId(value.toString());
    return null;
};

const collectRecipientIds = ({ task, stageKey }) => {
    const recipients = new Set();
    const assignedId = extractObjectId(task.assignedTo);
    const managerId = extractObjectId(task.manager);
    if (assignedId) recipients.add(assignedId);
    if (managerId) recipients.add(managerId);
    if (stageKey) {
        const stageUser = extractObjectId(task.stageAssignments?.[stageKey]?.user);
        if (stageUser) recipients.add(stageUser);
    }
    return Array.from(recipients);
};

const notifyDeadlineApproaching = async ({ task, stageKey, deadline, actor, label }) => {
    if (!deadline || !isDeadlineNear(deadline)) return false;
    const noteKey = `deadline_notice:${label}:${stageKey || 'project'}:${DEADLINE_NOTICE_DAYS}`;
    if (hasHistoryNote(task, noteKey)) return false;

    const recipientIds = collectRecipientIds({ task, stageKey });
    const hrUsers = await User.find({ role: 'hr' }).select('_id name email role');
    hrUsers.forEach(user => recipientIds.push(user._id.toString()));
    const uniqueRecipients = Array.from(new Set(recipientIds))
        .map(extractObjectId)
        .filter(Boolean);
    const message = `${label} deadline is approaching in ${DEADLINE_NOTICE_DAYS} days for task ${task.title}.`;

    await notifyUsers({
        recipients: uniqueRecipients,
        message,
        task: task._id,
        stage: task.currentStage,
        meta: { deadline }
    });

    const users = await User.find({ _id: { $in: uniqueRecipients } }).select('name email role');
    for (const user of users) {
        if (!user?.email) continue;
        enqueueEmail(() => trySendTaskStageEmail({
            email: user.email,
            name: user.name || user.email,
            roleLabel: STAGE_ROLE_LABELS[user.role] || user.role || 'User',
            taskTitle: task.title,
            message
        }));
    }

    pushHistory(task, { stage: task.currentStage, status: task.status, note: noteKey, actor });
    task.markModified('history');
    return true;
};

const applyDeadlineNotices = async ({ task, actor }) => {
    let changed = false;
    const stageKey = getActiveStageKey(task);
    if (stageKey) {
        const stageDeadline = task.stageAssignments?.[stageKey]?.deadline;
        const stageChanged = await notifyDeadlineApproaching({
            task,
            stageKey,
            deadline: stageDeadline,
            actor,
            label: 'Stage'
        });
        if (stageChanged) changed = true;
    }
    const projectChanged = await notifyDeadlineApproaching({
        task,
        stageKey: null,
        deadline: task.deadline,
        actor,
        label: 'Project'
    });
    if (projectChanged) changed = true;
    return changed;
};

const applyDelayCheck = async ({ task, actor }) => {
    const stageKey = getActiveStageKey(task);
    if (!stageKey) return false;
    const assignment = task.stageAssignments?.[stageKey];
    if (!assignment || assignment.status !== 'in_progress' || !assignment.deadline) return false;
    const due = new Date(assignment.deadline);
    if (Number.isNaN(due.getTime()) || due.getTime() >= Date.now()) return false;
    if (assignment.status === 'delayed') return false;
    const noteKey = `${stageKey} deadline exceeded`;
    if (hasHistoryNote(task, noteKey)) return false;

    const updated = markTaskDelayed({ task, stageKey, actor });
    if (updated) {
        const recipientIds = collectRecipientIds({ task, stageKey });
        const hrUsers = await User.find({ role: 'hr' }).select('_id name email role');
        hrUsers.forEach(user => recipientIds.push(user._id.toString()));
        const uniqueRecipients = Array.from(new Set(recipientIds))
            .map(extractObjectId)
            .filter(Boolean);
        const message = `Issue detected: ${STAGE_ROLE_LABELS[stageKey]} stage is delayed for task ${task.title}.`;

        await notifyUsers({
            recipients: uniqueRecipients,
            message,
            task: task._id,
            stage: task.currentStage
        });

        const users = await User.find({ _id: { $in: uniqueRecipients } }).select('name email role');
        for (const user of users) {
            if (!user?.email) continue;
            enqueueEmail(() => trySendTaskStageEmail({
                email: user.email,
                name: user.name || user.email,
                roleLabel: STAGE_ROLE_LABELS[user.role] || user.role || 'User',
                taskTitle: task.title,
                message
            }));
        }
    }
    return updated;
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

const hasCategoryOverlap = (left = [], right = []) => {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length === 0 || right.length === 0) {
        return false;
    }
    const rightSet = new Set(right);
    return left.some(item => rightSet.has(item));
};

const findRoleUserByEmail = async ({ email, role, res }) => {
    const trimmed = (email || '').trim().toLowerCase();
    if (!trimmed) {
        res.status(400);
        throw new Error(`Provide ${formatRoleLabel(role)} email`);
    }
    const user = await User.findOne({ email: trimmed, role }).select('_id name email role category categories');
    if (!user) {
        res.status(404);
        throw new Error(`${formatRoleLabel(role)} with email ${trimmed} not found`);
    }
    return user;
};

// Manager creates a team with required designer/developer/tester
router.post('/teams', protect, roleRequired('manager'), asyncHandler(async (req, res) => {
    const { name, designerEmail, developerEmail, testerEmail, designerId, developerId, testerId } = req.body;
    const managerId = req.user._id;

    if (!name || !name.trim()) {
        res.status(400);
        throw new Error('Team name is required');
    }

    // Support both email and ID-based selection
    let designer, developer, tester;
    
    if (designerId) {
        designer = await User.findOne({ _id: designerId, role: 'designer' }).select('_id name email role category categories');
        if (!designer) {
            res.status(404);
            throw new Error('Designer not found');
        }
    } else if (designerEmail) {
        designer = await findRoleUserByEmail({ email: designerEmail, role: 'designer', res });
    } else {
        res.status(400);
        throw new Error('Provide designer');
    }

    if (developerId) {
        developer = await User.findOne({ _id: developerId, role: 'developer' }).select('_id name email role category categories');
        if (!developer) {
            res.status(404);
            throw new Error('Developer not found');
        }
    } else if (developerEmail) {
        developer = await findRoleUserByEmail({ email: developerEmail, role: 'developer', res });
    } else {
        res.status(400);
        throw new Error('Provide developer');
    }

    if (testerId) {
        tester = await User.findOne({ _id: testerId, role: 'tester' }).select('_id name email role category categories');
        if (!tester) {
            res.status(404);
            throw new Error('Tester not found');
        }
    } else if (testerEmail) {
        tester = await findRoleUserByEmail({ email: testerEmail, role: 'tester', res });
    } else {
        res.status(400);
        throw new Error('Provide tester');
    }

    const managerCategories = getUserCategories(req.user);
    if (!managerCategories.length) {
        res.status(400);
        throw new Error('Manager categories are missing. Ask HR to update your categories.');
    }
    const mismatchedMembers = [designer, developer, tester].filter(member => !hasCategoryOverlap(getUserCategories(member), managerCategories));
    if (mismatchedMembers.length > 0) {
        res.status(400);
        throw new Error('All team members must share at least one category with the manager');
    }

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

    const populated = await Team.findById(team._id).populate('members', 'name email role category');
    res.status(201).json(populated);
}));

// Manager lists their teams
router.get('/teams', protect, roleRequired('manager'), asyncHandler(async (req, res) => {
    const teams = await Team.find({ manager: req.user._id }).select('_id name members').lean();
    const memberIds = new Set();

    teams.forEach(team => {
        const validIds = (team.members || [])
            .map(member => member?.toString())
            .filter(id => isValidObjectId(id));
        team.members = validIds;
        validIds.forEach(id => memberIds.add(id));
    });

    const users = memberIds.size
        ? await User.find({ _id: { $in: Array.from(memberIds) } })
            .select('_id name email role category categories')
            .lean()
        : [];

    const userMap = new Map(users.map(user => [user._id.toString(), user]));
    const hydratedTeams = teams.map(team => ({
        ...team,
        members: team.members.map(id => userMap.get(id)).filter(Boolean)
    }));

    res.json(hydratedTeams);
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
    const managerCategories = getUserCategories(req.user);
    if (!managerCategories.length) { res.status(400); throw new Error('Manager categories are missing. Ask HR to update your categories.'); }
    if (!hasCategoryOverlap(getUserCategories(member), managerCategories)) { res.status(400); throw new Error('Member must share at least one category with manager categories'); }

    if (team.members.includes(member._id)) {
        res.status(400); throw new Error('Member already in team');
    }

    team.members.push(member._id);
    await team.save();
    const populated = await Team.findById(team._id).populate('members', 'name email role category');
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
    const populated = await Team.findById(team._id).populate('members', 'name email role category');
    res.json(populated);
}));

router.put('/tasks/:id/decision', protect, roleRequired('manager'), asyncHandler(async (req, res) => {
    const task = await Task.findById(req.params.id);
    if (!task) {
        res.status(404);
        throw new Error('Task not found');
    }

    if (!task.manager || task.manager.toString() !== req.user._id.toString()) {
        res.status(403);
        throw new Error('Only assigned manager can review this task');
    }

    if (task.status !== STATUS.AWAITING_MANAGER_ASSIGNMENT || task.currentStage !== STAGE.MANAGER_PLANNING) {
        res.status(400);
        throw new Error('Task is not awaiting manager decision');
    }

    const decisionRaw = (req.body.decision || '').toString().trim().toLowerCase();
    const decisionComment = (req.body.comment || '').toString().trim();

    if (!['accept', 'accepted', 'reject', 'rejected'].includes(decisionRaw)) {
        res.status(400);
        throw new Error('Decision must be accept or reject');
    }

    const isAccept = ['accept', 'accepted'].includes(decisionRaw);
    if (!isAccept && !decisionComment) {
        res.status(400);
        throw new Error('Provide feedback comment when rejecting a task');
    }

    task.managerDecision = {
        decision: isAccept ? 'accepted' : 'rejected',
        comment: decisionComment,
        reviewedBy: req.user._id,
        reviewedAt: new Date()
    };

    if (isAccept) {
        setTaskState(task, {
            status: STATUS.AWAITING_MANAGER_ASSIGNMENT,
            stage: STAGE.MANAGER_PLANNING,
            note: decisionComment || 'Manager accepted the task for assignment planning',
            actor: req.user._id
        });
    } else {
        task.assignedTo = null;
        task.assignedTeam = null;
        task.clientReviewOrigin = 'manager_reject';
        setTaskState(task, {
            status: STATUS.MANAGER_REJECTED,
            stage: STAGE.CLIENT_REVIEW,
            note: `Manager rejected task: ${decisionComment}`,
            actor: req.user._id
        });

        const clientRecipient = task.createdByModel === 'User'
            ? await User.findById(task.createdBy).select('name email role')
            : null;

        if (clientRecipient) {
            const clientMessage = `Manager rejected task ${task.title}. Please update and resubmit or forfeit. Reason: ${decisionComment || 'No reason provided.'}`;
            await notifyUsers({
                recipients: [clientRecipient._id],
                message: clientMessage,
                task: task._id,
                stage: task.currentStage,
                meta: { rejectedBy: 'manager' }
            });

            if (clientRecipient.email) {
                enqueueEmail(() => trySendTaskStageEmail({
                    email: clientRecipient.email,
                    name: clientRecipient.name || clientRecipient.email,
                    roleLabel: 'Client',
                    taskTitle: task.title,
                    message: clientMessage
                }));
            }
        }
    }

    await task.save();
    await task.populate('assignedTo', 'name email role category');
    await task.populate('assignedTeam', 'name');
    await task.populate('manager', 'name email role category');
    await task.populate('createdBy', 'username name email role category');
    await task.populate({ path: 'stageAssignments.designer.user', select: 'name email role category' });
    await task.populate({ path: 'stageAssignments.developer.user', select: 'name email role category' });
    await task.populate({ path: 'stageAssignments.tester.user', select: 'name email role category' });

    res.json(task);
}));

// Manager assigns a task to a full team or directly to a specific user
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
        userId,
        designerDeadline,
        developerDeadline,
        testerDeadline
    } = req.body;

    if (task.status === STATUS.AWAITING_MANAGER_ASSIGNMENT && task.currentStage === STAGE.MANAGER_PLANNING) {
        const managerDecision = task.managerDecision?.decision;
        if (!managerDecision || managerDecision === 'pending' || managerDecision === 'rejected') {
            res.status(400);
            throw new Error('Accept this task first before assignment');
        }
    }

    const normalizedTeamId = normalizeId(teamId);
    const normalizedUserId = normalizeId(userId);
    if (!normalizedTeamId && !normalizedUserId) {
        res.status(400);
        throw new Error('Select a team or a specific user before assigning the project');
    }

    if (normalizedTeamId && normalizedUserId) {
        res.status(400);
        throw new Error('Assign either a team or a single user, not both');
    }

    const { teams } = await collectManagerTeamData(req.user._id);

    let team = null;
    if (normalizedTeamId) {
        team = await Team.findOne({ _id: normalizedTeamId, manager: req.user._id })
            .populate('members', 'name email role category categories');

        if (!team) {
            res.status(403);
            throw new Error('You can only assign projects to your own teams');
        }
    }

    const findMemberByRole = (role) => {
        const member = (team?.members || []).find(m => m.role === role);
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

    const projectDeadline = new Date(task.deadline);
    if (Number.isNaN(projectDeadline.getTime())) {
        res.status(400);
        throw new Error('Task deadline is invalid');
    }

    const ensureWithinProjectDeadline = (dateValue) => {
        if (!dateValue) return;
        if (dateValue.getTime() > projectDeadline.getTime()) {
            res.status(400);
            throw new Error('Deadline cannot exceed project final deadline.');
        }
    };

    const managerCategories = getUserCategories(req.user);
    if (!managerCategories.length) {
        res.status(400);
        throw new Error('Manager categories are missing. Ask HR to update your categories.');
    }
    if (task.category && !managerCategories.includes(task.category)) {
        res.status(400);
        throw new Error(`Task category (${task.category}) is not included in your manager categories`);
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
            }
        });
    };

    ensureStageStructure();

    task.manager = task.manager || req.user._id;

    const resetStage = (stage) => {
        stage.user = stage.user || null;
        stage.deadline = null;
        stage.status = 'pending';
        stage.submittedAt = null;
        stage.submissionAttachmentId = null;
    };
    resetStage(task.stageAssignments.designer);
    resetStage(task.stageAssignments.developer);
    resetStage(task.stageAssignments.tester);

    if (normalizedTeamId) {
        const designer = findMemberByRole('designer');
        const developer = findMemberByRole('developer');
        const tester = findMemberByRole('tester');

        const stageMembers = [designer, developer, tester];
        const mismatchedByCategory = stageMembers.filter(member => !getUserCategories(member).includes(task.category));
        if (task.category && mismatchedByCategory.length > 0) {
            res.status(400);
            throw new Error(`All assigned team members must include task category (${task.category})`);
        }

        task.assignedTeam = team._id;

        const designerDue = parseDeadline(designerDeadline, 'designer', true);
        const developerDue = parseDeadline(developerDeadline, 'developer', true);
        const testerDue = parseDeadline(testerDeadline, 'tester', true);

        ensureWithinProjectDeadline(designerDue);
        ensureWithinProjectDeadline(developerDue);
        ensureWithinProjectDeadline(testerDue);

        if (developerDue.getTime() < designerDue.getTime()) {
            res.status(400);
            throw new Error('Developer deadline cannot be before designer deadline');
        }
        if (testerDue.getTime() < developerDue.getTime()) {
            res.status(400);
            throw new Error('Tester deadline cannot be before developer deadline');
        }

        task.stageAssignments.designer.user = designer._id;
        task.stageAssignments.designer.deadline = designerDue;
        task.stageAssignments.designer.status = 'in_progress';

        task.stageAssignments.developer.user = developer._id;
        task.stageAssignments.developer.deadline = developerDue;
        task.stageAssignments.developer.status = 'pending';

        task.stageAssignments.tester.user = tester._id;
        task.stageAssignments.tester.deadline = testerDue;
        task.stageAssignments.tester.status = 'pending';

        task.assignedTo = designer._id;
        setTaskState(task, {
            status: STATUS.DESIGN_IN_PROGRESS,
            stage: STAGE.DESIGN,
            note: `Manager assigned team ${team.name} to the project`,
            actor: req.user._id
        });

        const teamRecipients = [designer, developer, tester].filter(Boolean);
        const assignmentMessage = 'You have been assigned a task. Please check your dashboard.';
        await notifyUsers({
            recipients: teamRecipients.map(member => member._id),
            message: assignmentMessage,
            task: task._id,
            stage: STAGE.DESIGN
        });
        for (const member of teamRecipients) {
            if (member?.email) {
                enqueueEmail(() => trySendTaskStageEmail({
                    email: member.email,
                    name: member.name || member.email,
                    roleLabel: formatRoleLabel(member.role),
                    taskTitle: task.title,
                    message: assignmentMessage
                }));
            }
        }
    } else {
        const directUser = await User.findById(normalizedUserId).select('_id name email role category categories');
        if (!directUser) {
            res.status(404);
            throw new Error('Selected user not found');
        }
        if (!['designer', 'developer', 'tester'].includes(directUser.role)) {
            res.status(400);
            throw new Error('Direct assignment is allowed only for designer, developer, or tester');
        }

        const managingTeam = teams.find(item => item.members.some(member => member.toString() === directUser._id.toString()));
        if (!managingTeam) {
            res.status(403);
            throw new Error('You can only assign tasks to users in your teams');
        }
        if (task.category && !getUserCategories(directUser).includes(task.category)) {
            res.status(400);
            throw new Error(`Selected user categories do not include task category (${task.category})`);
        }

        const fullTeam = await Team.findById(managingTeam._id)
            .populate('members', 'name email role category categories');
        if (!fullTeam) {
            res.status(404);
            throw new Error('Assigned team not found');
        }

        const roleMap = {
            designer: fullTeam.members.find(member => member.role === 'designer') || null,
            developer: fullTeam.members.find(member => member.role === 'developer') || null,
            tester: fullTeam.members.find(member => member.role === 'tester') || null
        };
        const missingRoles = Object.entries(roleMap).filter(([, member]) => !member).map(([role]) => role);
        if (missingRoles.length) {
            res.status(400);
            throw new Error(`Assigned team is missing required roles: ${missingRoles.map(formatRoleLabel).join(', ')}`);
        }

        task.assignedTeam = fullTeam._id;
        task.assignedTo = directUser._id;

        task.stageAssignments.designer.user = roleMap.designer._id;
        task.stageAssignments.developer.user = roleMap.developer._id;
        task.stageAssignments.tester.user = roleMap.tester._id;

        const designerDue = designerDeadline ? parseDeadline(designerDeadline, 'designer') : null;
        const developerDue = developerDeadline ? parseDeadline(developerDeadline, 'developer') : null;
        const testerDue = testerDeadline ? parseDeadline(testerDeadline, 'tester') : null;

        ensureWithinProjectDeadline(designerDue);
        ensureWithinProjectDeadline(developerDue);
        ensureWithinProjectDeadline(testerDue);

        if (designerDue) task.stageAssignments.designer.deadline = designerDue;
        if (developerDue) task.stageAssignments.developer.deadline = developerDue;
        if (testerDue) task.stageAssignments.tester.deadline = testerDue;

        if (directUser.role === 'designer') {
            const requiredDesignerDue = parseDeadline(designerDeadline, 'designer', true);
            ensureWithinProjectDeadline(requiredDesignerDue);
            task.stageAssignments.designer.deadline = requiredDesignerDue;
            task.stageAssignments.designer.status = 'in_progress';
            task.stageAssignments.developer.status = 'pending';
            task.stageAssignments.tester.status = 'pending';
            setTaskState(task, {
                status: STATUS.DESIGN_IN_PROGRESS,
                stage: STAGE.DESIGN,
                note: `Manager assigned task directly to ${directUser.name || directUser.email} (designer)`,
                actor: req.user._id
            });
        } else if (directUser.role === 'developer') {
            const requiredDeveloperDue = parseDeadline(developerDeadline, 'developer', true);
            ensureWithinProjectDeadline(requiredDeveloperDue);
            const designerCompletion = designerDue || new Date();
            if (requiredDeveloperDue.getTime() < designerCompletion.getTime()) {
                res.status(400);
                throw new Error('Developer deadline cannot be before designer completion deadline');
            }
            task.stageAssignments.developer.deadline = requiredDeveloperDue;
            task.stageAssignments.developer.status = 'in_progress';
            task.stageAssignments.designer.status = 'completed';
            task.stageAssignments.tester.status = 'pending';
            setTaskState(task, {
                status: STATUS.DEVELOPMENT_IN_PROGRESS,
                stage: STAGE.DEVELOPMENT,
                note: `Manager assigned task directly to ${directUser.name || directUser.email} (developer)`,
                actor: req.user._id
            });
        } else {
            const requiredTesterDue = parseDeadline(testerDeadline, 'tester', true);
            ensureWithinProjectDeadline(requiredTesterDue);
            const developerCompletion = developerDue || new Date();
            if (requiredTesterDue.getTime() < developerCompletion.getTime()) {
                res.status(400);
                throw new Error('Tester deadline cannot be before developer deadline');
            }
            task.stageAssignments.tester.deadline = requiredTesterDue;
            task.stageAssignments.tester.status = 'in_progress';
            task.stageAssignments.designer.status = 'completed';
            task.stageAssignments.developer.status = 'completed';
            setTaskState(task, {
                status: STATUS.TESTING_IN_PROGRESS,
                stage: STAGE.TESTING,
                note: `Manager assigned task directly to ${directUser.name || directUser.email} (tester)`,
                actor: req.user._id
            });
        }

        const directAssignmentMessage = 'You have been assigned a task. Please check your dashboard.';
        await notifyUsers({
            recipients: [directUser._id],
            message: directAssignmentMessage,
            task: task._id,
            stage: task.currentStage
        });
        if (directUser?.email) {
            enqueueEmail(() => trySendTaskStageEmail({
                email: directUser.email,
                name: directUser.name || directUser.email,
                roleLabel: formatRoleLabel(directUser.role),
                taskTitle: task.title,
                message: directAssignmentMessage
            }));
        }
    }

    task.managerDecision = {
        decision: 'accepted',
        comment: task.managerDecision?.comment || '',
        reviewedBy: task.managerDecision?.reviewedBy || req.user._id,
        reviewedAt: task.managerDecision?.reviewedAt || new Date()
    };

    task.markModified('stageAssignments');

    const updated = await task.save();
    await updated.populate('assignedTo', 'name email role category');
    await updated.populate('assignedTeam', 'name');
    await updated.populate('manager', 'name email');
    await updated.populate({ path: 'stageAssignments.designer.user', select: 'name email role category' });
    await updated.populate({ path: 'stageAssignments.developer.user', select: 'name email role category' });
    await updated.populate({ path: 'stageAssignments.tester.user', select: 'name email role category' });

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
        .populate('assignedTo', 'name email role category')
        .populate('assignedTeam', 'name')
        .populate('manager', 'name email role category')
        .populate('createdBy', 'username name email role category')
        .populate({ path: 'stageAssignments.designer.user', select: 'name email role category' })
        .populate({ path: 'stageAssignments.developer.user', select: 'name email role category' })
        .populate({ path: 'stageAssignments.tester.user', select: 'name email role category' })
        .sort({ createdAt: -1 });

    const unique = dedupeTasks(tasks);
    for (const task of unique) {
        const changed = await applyDelayCheck({ task, actor: req.user._id });
        const deadlineNotified = await applyDeadlineNotices({ task, actor: req.user._id });
        if (changed || deadlineNotified) {
            await task.save();
        }
    }

    res.json(unique);
}));

router.get('/performance-report', protect, roleRequired('manager'), asyncHandler(async (req, res) => {
    const days = Math.max(1, Math.min(parseInt(req.query.days, 10) || 180, 3650));
    const sinceDate = new Date(Date.now() - (days * 24 * 60 * 60 * 1000));
    const { teams, teamIds, memberIds } = await collectManagerTeamData(req.user._id);

    const supervisedUserIds = Array.from(memberIds);
    const users = await User.find({ _id: { $in: supervisedUserIds }, isActive: true })
        .select('_id name email role')
        .lean();

    const tasks = await Task.find({
        createdAt: { $gte: sinceDate },
        $or: [
            { manager: req.user._id },
            { assignedTeam: { $in: teamIds } },
            { assignedTo: { $in: supervisedUserIds } }
        ]
    })
        .select('status deadline updatedAt manager assignedTo assignedTeam stageAssignments history')
        .lean();

    const report = buildPerformanceReport({ users, tasks });

    const userMetricMap = report.users.reduce((acc, item) => {
        acc[item.userId.toString()] = item;
        return acc;
    }, {});

    const teamsReport = teams.map(team => {
        const members = (team.members || []).map(memberId => userMetricMap[memberId.toString()]).filter(Boolean);
        const teamSummary = members.reduce((acc, item) => {
            acc.totalAssigned += item.totalAssigned;
            acc.successfulTasks += item.successfulTasks;
            acc.failedTasks += item.failedTasks;
            acc.completedOnTime += item.completedOnTime;
            acc.delayedTasks += item.delayedTasks;
            return acc;
        }, { totalAssigned: 0, successfulTasks: 0, failedTasks: 0, completedOnTime: 0, delayedTasks: 0 });

        const denominator = teamSummary.successfulTasks + teamSummary.failedTasks;
        const successRatio = denominator > 0 ? Number(((teamSummary.successfulTasks / denominator) * 100).toFixed(2)) : 0;

        return {
            teamId: team._id,
            teamName: team.name,
            memberCount: team.members.length,
            successRatio,
            ...teamSummary
        };
    });

    res.json({
        generatedAt: new Date(),
        windowDays: days,
        ...report,
        teams: teamsReport
    });
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
    await updated.populate('assignedTo', 'name email role category');
    await updated.populate('assignedTeam', 'name');
    await updated.populate('manager', 'name email role category');
    await updated.populate('createdBy', 'username name email role category');

    res.json(updated);
}));

// Manager fetches users by role (for dynamic team creation)
router.get('/users', protect, roleRequired('manager'), asyncHandler(async (req, res) => {
    const { role } = req.query;
    
    let query = {};
    if (role) {
        // Only allow fetching designer, developer, tester roles
        if (!['designer', 'developer', 'tester'].includes(role)) {
            res.status(400);
            throw new Error('Invalid role. Only designer, developer, and tester are allowed.');
        }
        query.role = role;
    } else {
        // If no role specified, return designer, developer, tester only
        query.role = { $in: ['designer', 'developer', 'tester'] };
    }
    
    // Filter by manager's categories
    const managerCategories = getUserCategories(req.user);
    if (managerCategories.length > 0) {
        query.$or = [
            { categories: { $in: managerCategories } },
            { category: { $in: managerCategories } }
        ];
    }
    
    const users = await User.find(query)
        .select('_id name email role category categories')
        .sort({ role: 1, name: 1 });
    
    res.json(users);
}));

module.exports = router;
