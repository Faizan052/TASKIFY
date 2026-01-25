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
    COMPLETED: 'Completed'
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

module.exports = {
    STATUS,
    STAGE,
    setTaskState,
    pushHistory,
    notifyUsers,
    notifyRoles
};
