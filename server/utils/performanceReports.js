const TERMINAL_SUCCESS_STATUSES = new Set([
    'Awaiting HR Review',
    'Awaiting Client Review',
    'Completed'
]);

const FAILURE_STATUSES = new Set(['Changes Requested']);

const DEFAULT_REPORT_ROLES = ['hr', 'manager', 'designer', 'developer', 'tester', 'client'];

const toId = (value) => {
    if (!value) return '';
    if (typeof value === 'string') return value;
    if (value._id) return value._id.toString();
    return value.toString();
};

const toDate = (value) => {
    if (!value) return null;
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const getTaskMemberByRole = (task, role) => {
    if (!task || !task.stageAssignments || !task.stageAssignments[role]) {
        return null;
    }
    return task.stageAssignments[role].user || null;
};

const getRelevantDeadline = ({ task, role }) => {
    const stageDeadline = task?.stageAssignments?.[role]?.deadline;
    return toDate(stageDeadline || task?.deadline);
};

const getCompletionDate = ({ task, role }) => {
    if (!task) return null;

    if (role === 'designer' || role === 'developer' || role === 'tester') {
        const stage = task.stageAssignments?.[role];
        if (stage?.submittedAt) {
            return toDate(stage.submittedAt);
        }
    }

    if (role === 'manager' && Array.isArray(task.history) && task.history.length > 0) {
        const managerDeliveryEntry = [...task.history].reverse().find(entry => entry.stage === 'hr_delivery');
        if (managerDeliveryEntry?.createdAt) {
            return toDate(managerDeliveryEntry.createdAt);
        }
    }

    return toDate(task.updatedAt);
};

const isTaskInvolvedForUser = ({ task, user }) => {
    const userId = toId(user?._id || user);
    if (!userId || !task) return false;

    const managerId = toId(task.manager);
    const assignedToId = toId(task.assignedTo);
    const designerId = toId(getTaskMemberByRole(task, 'designer'));
    const developerId = toId(getTaskMemberByRole(task, 'developer'));
    const testerId = toId(getTaskMemberByRole(task, 'tester'));

    return [managerId, assignedToId, designerId, developerId, testerId].includes(userId);
};

const buildUserMetric = ({ user, tasks }) => {
    const role = user.role;
    const involvedTasks = tasks.filter(task => isTaskInvolvedForUser({ task, user }));

    let completedOnTime = 0;
    let delayedTasks = 0;
    let failedTasks = 0;
    let rejectedTasks = 0;
    let successfulTasks = 0;

    involvedTasks.forEach(task => {
        if (task?.managerDecision?.decision === 'rejected') {
            rejectedTasks += 1;
        }

        if (FAILURE_STATUSES.has(task.status)) {
            failedTasks += 1;
            return;
        }

        if (TERMINAL_SUCCESS_STATUSES.has(task.status)) {
            successfulTasks += 1;
            const deadline = getRelevantDeadline({ task, role });
            const completionDate = getCompletionDate({ task, role });

            if (deadline && completionDate && completionDate.getTime() <= deadline.getTime()) {
                completedOnTime += 1;
            } else if (deadline && completionDate && completionDate.getTime() > deadline.getTime()) {
                delayedTasks += 1;
            }
            return;
        }

        const deadline = getRelevantDeadline({ task, role });
        if (deadline && deadline.getTime() < Date.now()) {
            delayedTasks += 1;
        }
    });

    const evaluatedTotal = successfulTasks + failedTasks;
    const successRatio = evaluatedTotal > 0 ? Number(((successfulTasks / evaluatedTotal) * 100).toFixed(2)) : 0;
    const failureRatio = evaluatedTotal > 0 ? Number(((failedTasks / evaluatedTotal) * 100).toFixed(2)) : 0;

    return {
        userId: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        totalAssigned: involvedTasks.length,
        successfulTasks,
        failedTasks,
        rejectedTasks,
        completedOnTime,
        delayedTasks,
        successRatio,
        failureRatio
    };
};

const buildSummary = (userMetrics = []) => {
    const totals = userMetrics.reduce((acc, item) => {
        acc.totalAssigned += item.totalAssigned;
        acc.successfulTasks += item.successfulTasks;
        acc.failedTasks += item.failedTasks;
        acc.rejectedTasks += item.rejectedTasks;
        acc.completedOnTime += item.completedOnTime;
        acc.delayedTasks += item.delayedTasks;
        return acc;
    }, {
        totalAssigned: 0,
        successfulTasks: 0,
        failedTasks: 0,
        rejectedTasks: 0,
        completedOnTime: 0,
        delayedTasks: 0
    });

    const evaluatedTotal = totals.successfulTasks + totals.failedTasks;
    const successRatio = evaluatedTotal > 0 ? Number(((totals.successfulTasks / evaluatedTotal) * 100).toFixed(2)) : 0;
    const failureRatio = evaluatedTotal > 0 ? Number(((totals.failedTasks / evaluatedTotal) * 100).toFixed(2)) : 0;

    return {
        ...totals,
        successRatio,
        failureRatio
    };
};

const buildPerformanceReport = ({ users = [], tasks = [] }) => {
    const filteredUsers = users.filter(user => DEFAULT_REPORT_ROLES.includes(user.role));
    const userMetrics = filteredUsers.map(user => buildUserMetric({ user, tasks }));
    const summary = buildSummary(userMetrics);

    return {
        summary,
        users: userMetrics,
        chart: {
            labels: userMetrics.map(item => item.name || item.email),
            successRatio: userMetrics.map(item => item.successRatio),
            failureRatio: userMetrics.map(item => item.failureRatio),
            completedOnTime: userMetrics.map(item => item.completedOnTime),
            delayedTasks: userMetrics.map(item => item.delayedTasks),
            failedTasks: userMetrics.map(item => item.failedTasks),
            rejectedTasks: userMetrics.map(item => item.rejectedTasks),
            successfulTasks: userMetrics.map(item => item.successfulTasks)
        }
    };
};

module.exports = {
    buildPerformanceReport
};
