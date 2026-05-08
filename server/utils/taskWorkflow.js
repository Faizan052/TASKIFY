const Notification = require('../models/Notification');
const User = require('../models/User');

const STATUS = {
    CLIENT_REQUESTED: 'Client Requested',
    AWAITING_MANAGER_ASSIGNMENT: 'Awaiting Manager Assignment',
    DESIGN_IN_PROGRESS: 'Design In Progress',
    DESIGN_SUBMITTED: 'Design Completed - Pending Manager Review',
    DEVELOPMENT_IN_PROGRESS: 'Development In Progress',
    DEVELOPMENT_SUBMITTED: 'Development Completed - Pending Manager Review',
    TESTING_IN_PROGRESS: 'Testing In Progress',
    TESTING_SUBMITTED: 'Testing Completed - Pending Manager Final Review',
    AWAITING_HR_REVIEW: 'Awaiting HR Review',
    AWAITING_CLIENT_REVIEW: 'Awaiting Client Review',
    CHANGES_REQUESTED: 'Changes Requested',
    COMPLETED: 'Completed',
    DELAYED: 'Delayed'
};

const STAGE = {
    CLIENT_REQUEST: 'client_request',
    HR_REVIEW: 'hr_review',
    MANAGER_PLANNING: 'manager_planning',
    DESIGN: 'design',
    MANAGER_DESIGN_REVIEW: 'manager_design_review',
    DEVELOPMENT: 'development',
    MANAGER_DEVELOPMENT_REVIEW: 'manager_development_review',
    TESTING: 'testing',
    MANAGER_FINAL_REVIEW: 'manager_final_review',
    HR_DELIVERY: 'hr_delivery',
    CLIENT_REVIEW: 'client_review',
    COMPLETED: 'completed',
    CHANGES_REQUESTED: 'changes_requested'
};

const toHistoryEntry = ({ stage = '', status = '', note = '', actor = null }) => ({
    stage,
    status,
    note,
    actor,
    createdAt: new Date()
});

const pushHistory = (task, entry) => {
    task.history = task.history || [];
    task.history.push(toHistoryEntry(entry));
};

const setTaskState = (task, { status, stage, note, actor }) => {
    if (status) {
        task.status = status;
    }
    if (stage) {
        task.currentStage = stage;
    }
    pushHistory(task, { stage: stage || task.currentStage, status: status || task.status, note, actor });
};

const notifyUsers = async ({ recipients = [], message, task = null, stage = '', meta = {} }) => {
    if (!Array.isArray(recipients) || !recipients.length || !message) {
        return;
    }
    const docs = recipients
        .filter(Boolean)
        .map(recipient => ({
            recipient,
            message,
            task,
            stage,
            meta
        }));
    if (!docs.length) return;
    await Notification.insertMany(docs);
};

const notifyRoles = async ({ roles = [], message, task = null, stage = '', meta = {} }) => {
    if (!roles.length || !message) return;
    const users = await User.find({ role: { $in: roles } }).select('_id');
    const recipientIds = users.map(user => user._id);
    await notifyUsers({ recipients: recipientIds, message, task, stage, meta });
};

const ACTIVE_STAGE_BY_CURRENT = {
    [STAGE.DESIGN]: 'designer',
    [STAGE.DEVELOPMENT]: 'developer',
    [STAGE.TESTING]: 'tester'
};

const getActiveStageKey = (task) => {
    if (!task) return null;
    return ACTIVE_STAGE_BY_CURRENT[task.currentStage] || null;
};

const hasHistoryNote = (task, matcher) => {
    if (!task || !Array.isArray(task.history)) return false;
    if (matcher instanceof RegExp) {
        return task.history.some(entry => matcher.test(entry?.note || ''));
    }
    const needle = (matcher || '').toString();
    if (!needle) return false;
    return task.history.some(entry => (entry?.note || '').includes(needle));
};

const markTaskDelayed = ({ task, stageKey, actor }) => {
    if (!task || !stageKey) return false;
    const assignment = task.stageAssignments?.[stageKey];
    if (!assignment) return false;
    assignment.status = 'delayed';
    task.status = STATUS.DELAYED;
    pushHistory(task, {
        stage: task.currentStage,
        status: task.status,
        note: `${stageKey} deadline exceeded`,
        actor
    });
    task.markModified('stageAssignments');
    return true;
};

module.exports = {
    STATUS,
    STAGE,
    setTaskState,
    pushHistory,
    notifyUsers,
    notifyRoles,
    getActiveStageKey,
    hasHistoryNote,
    markTaskDelayed
};
