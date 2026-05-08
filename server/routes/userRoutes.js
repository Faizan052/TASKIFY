const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const asyncHandler = require('express-async-handler');
const User = require('../models/User');
const Task = require('../models/Task');
const Team = require('../models/Team');
const Notification = require('../models/Notification');
const OTP = require('../models/OTP');
const { generateOTP, sendOTPEmail } = require('../utils/emailService');
const { trySendWelcomeEmail, trySendTaskStageEmail } = require('../utils/emailNotifications');
const { analyzeRequestFeasibility } = require('../utils/feasibilityService');
const { validateEmail } = require('../utils/validation');
const { normalizeEmail, assertUniqueIdentity } = require('../utils/identity');
const upload = require('../middleware/upload');
const { protect } = require('../middleware/auth');
const { roleRequired } = require('../middleware/roles');
const { STATUS, STAGE, setTaskState, notifyUsers, notifyRoles, getActiveStageKey, hasHistoryNote, markTaskDelayed } = require('../utils/taskWorkflow');

const CATEGORY_OPTIONS = ['website', 'mobile-app', 'desktop-app', 'testing', 'updation', 'design', 'api', 'database', 'other'];
const ROLES_REQUIRING_CATEGORY = ['developer', 'designer', 'tester'];

const STAGE_ROLE_LABELS = {
    designer: 'Designer',
    developer: 'Developer',
    tester: 'Tester'
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
    if (updated && task.manager) {
        await notifyUsers({
            recipients: [task.manager],
            message: `Deadline exceeded for ${STAGE_ROLE_LABELS[stageKey]} on task ${task.title}.`,
            task: task._id,
            stage: task.currentStage
        });
    }
    return updated;
};

const normalizeCategories = (value) => {
    if (Array.isArray(value)) {
        return value.map(item => (item || '').toString().trim()).filter(Boolean);
    }
    if (typeof value === 'string') {
        const trimmed = value.trim();
        if (!trimmed) return [];
        if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
            try {
                const parsed = JSON.parse(trimmed);
                if (Array.isArray(parsed)) {
                    return parsed.map(item => (item || '').toString().trim()).filter(Boolean);
                }
            } catch (_err) {
                // fall through to comma-separated handling
            }
        }
        if (trimmed.includes(',')) {
            return trimmed.split(',').map(item => item.trim()).filter(Boolean);
        }
    }
    if (typeof value === 'string' && value.trim()) {
        return [value.trim()];
    }
    return [];
};

// Send OTP for user registration (POST)
router.post('/send-otp', asyncHandler(async (req, res) => {
    const { email, name, role } = req.body;
    const categories = normalizeCategories(req.body.categories ?? req.body.category);

    // Validate email
    const emailValidation = validateEmail(email);
    if (!emailValidation.valid) {
        res.status(400);
        throw new Error(emailValidation.error);
    }

    const trimmedEmail = normalizeEmail(emailValidation.email);

    // Validate role
    const allowed = ['developer','designer','tester','client'];
    if (role && !allowed.includes(role)) {
        res.status(400);
        throw new Error('Invalid role');
    }

    if (ROLES_REQUIRING_CATEGORY.includes(role)) {
        if (!categories.length) {
            res.status(400);
            throw new Error('At least one category is required for this role');
        }
        const invalidCategories = categories.filter(item => !CATEGORY_OPTIONS.includes(item));
        if (invalidCategories.length > 0) {
            res.status(400);
            throw new Error('Invalid categories provided');
        }
    }

    // Check if user already exists
    try {
        await assertUniqueIdentity({ email: trimmedEmail });
    } catch (identityError) {
        res.status(400);
        throw new Error(identityError.message);
    }

    // Generate OTP
    const otp = generateOTP();

    // Delete any existing OTPs for this email
    await OTP.deleteMany({ email: trimmedEmail, userType: 'user' });

    // Save OTP to database
    await OTP.create({
        email: trimmedEmail,
        otp,
        userType: 'user'
    });

    // Send OTP email
    await sendOTPEmail(trimmedEmail, otp, name || 'User');

    res.json({ 
        message: 'OTP sent to your email. Please check your inbox.',
        email: trimmedEmail
    });
}));

// Public registration for developer/designer/tester/client
router.post('/register', asyncHandler(async (req, res) => {
    const { name, email, password, role, otp } = req.body;
    const categories = normalizeCategories(req.body.categories ?? req.body.category);
    
    // Validation: Check required fields
    if (!name || !email || !password || !role || !otp) {
        res.status(400);
        throw new Error('All fields including OTP are required');
    }
    
    // Validation: Name length
    const trimmedName = name.trim();
    if (trimmedName.length < 2 || trimmedName.length > 50) {
        res.status(400);
        throw new Error('Name must be between 2 and 50 characters');
    }
    
    // Validation: Email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const trimmedEmail = normalizeEmail(email);
    if (!emailRegex.test(trimmedEmail)) {
        res.status(400);
        throw new Error('Invalid email format');
    }
    
    // Validation: Password strength
    if (password.length < 8) {
        res.status(400);
        throw new Error('Password must be at least 8 characters');
    }
    if (!/[a-z]/.test(password)) {
        res.status(400);
        throw new Error('Password must contain at least one lowercase letter');
    }
    if (!/[A-Z]/.test(password)) {
        res.status(400);
        throw new Error('Password must contain at least one uppercase letter');
    }
    if (!/[0-9]/.test(password)) {
        res.status(400);
        throw new Error('Password must contain at least one number');
    }
    
    // Validation: Role
    const allowed = ['developer','designer','tester','client'];
    if (!allowed.includes(role)) {
        res.status(400);
        throw new Error('Invalid role for self-registration');
    }

    if (ROLES_REQUIRING_CATEGORY.includes(role)) {
        if (!categories.length) {
            res.status(400);
            throw new Error('At least one category is required for this role');
        }
        const invalidCategories = categories.filter(item => !CATEGORY_OPTIONS.includes(item));
        if (invalidCategories.length > 0) {
            res.status(400);
            throw new Error('Invalid categories provided');
        }
    }

    // Verify OTP
    const otpRecord = await OTP.findOne({ 
        email: trimmedEmail, 
        otp: otp.trim(),
        userType: 'user',
        expiresAt: { $gt: new Date() }
    });

    if (!otpRecord) {
        res.status(400);
        throw new Error('Invalid or expired OTP. Please request a new one.');
    }

    // Check if user already exists
    try {
        await assertUniqueIdentity({ email: trimmedEmail });
    } catch (identityError) {
        res.status(400);
        throw new Error(identityError.message);
    }

    // Create user with validated data
    const user = await User.create({ 
        name: trimmedName, 
        email: trimmedEmail, 
        password, 
        role,
        categories: ROLES_REQUIRING_CATEGORY.includes(role) ? categories : [],
        category: ROLES_REQUIRING_CATEGORY.includes(role) ? (categories[0] || '') : ''
    });
    
    // Delete used OTP
    await OTP.deleteOne({ _id: otpRecord._id });
    
    if (user) {
        await trySendWelcomeEmail({
            email: user.email,
            name: user.name,
            role: user.role,
            errorMessage: 'Welcome email failed but registration successful:'
        });

        res.status(201).json({ 
            _id: user._id, 
            name: user.name, 
            email: user.email, 
            role: user.role,
            categories: user.categories || [],
            category: user.category,
            message: 'Registration successful'
        });
    } else {
        res.status(400);
        throw new Error('Invalid user data');
    }
}));

// User Login (POST)
router.post('/login', asyncHandler(async (req, res) => {
    const { email, password } = req.body;
    
    // Validation: Check required fields
    if (!email || !password) {
        res.status(400);
        throw new Error('Email and password are required');
    }
    
    // Sanitize email (keep case for backward compatibility with existing users)
    const trimmedEmail = normalizeEmail(email);

    const user = await User.findOne({ email: trimmedEmail });
    
    if (user && (await user.matchPassword(password))) {
        // Check if user account is active
        if (user.isActive === false) {
            res.status(403);
            throw new Error('ACCOUNT_DEACTIVATED');
        }
        
        res.json({
            _id: user._id,
            name: user.name,
            email: user.email,
            role: user.role,
            categories: user.categories || [],
            category: user.category,
            token: jwt.sign({ id: user._id }, process.env.JWT_SECRET, {
                expiresIn: '30d'
            })
        });
    } else {
        res.status(401);
        throw new Error('Invalid email or password');
    }
}));

// User Login (GET) - simple browser form
router.get('/login', (req, res) => {
        // Disable browser autofill on user login
        res.send(`
            <html>
                <body style="font-family:Arial,Helvetica,sans-serif;">
                    <h2>User Login</h2>
                    <form method="post" action="/api/user/login" autocomplete="off">
                        <!-- Hidden dummy inputs to discourage browser autofill -->
                        <input type="text" name="_fakeusernameremembered" style="display:none" autocomplete="off" />
                        <input type="password" name="_fakepasswordremembered" style="display:none" autocomplete="off" />
                        <label>Email: <input name="email" autocomplete="off" /></label><br/>
                        <label>Password: <input type="password" name="password" autocomplete="off" /></label><br/>
                        <button type="submit">Login</button>
                    </form>
                    <p>Use a REST client to call POST /api/user/login with JSON for API testing.</p>
                </body>
            </html>
        `);
});

// Get user's tasks
router.get('/tasks', protect, asyncHandler(async (req, res) => {
    if (req.isAdmin) {
        res.status(403);
        throw new Error('Admin cannot access user routes');
    }

    const membership = await Team.find({ members: req.user._id }).select('_id members');
    const memberTeamIds = membership.map(team => team._id);
    const teamMemberIds = new Set();
    membership.forEach(team => {
        team.members.forEach(member => {
            teamMemberIds.add(member.toString());
        });
    });

    const orConditions = [
        { assignedTo: req.user._id },
        { createdBy: req.user._id },
        { manager: req.user._id },
        { 'stageAssignments.designer.user': req.user._id },
        { 'stageAssignments.developer.user': req.user._id },
        { 'stageAssignments.tester.user': req.user._id }
    ];
    if (memberTeamIds.length > 0) {
        orConditions.push({ assignedTeam: { $in: memberTeamIds } });
    }
    if (teamMemberIds.size > 0) {
        orConditions.push({ assignedTo: { $in: Array.from(teamMemberIds) } });
    }

    const tasks = await Task.find({ $or: orConditions })
        .populate('assignedTo', 'name email role')
        .populate({ path: 'assignedTeam', select: 'name members', populate: { path: 'members', select: 'name email role' } })
        .populate('manager', 'name email')
        .populate('createdBy', 'username name email role')
        .populate({ path: 'stageAssignments.designer.user', select: 'name email role' })
        .populate({ path: 'stageAssignments.developer.user', select: 'name email role' })
        .populate({ path: 'stageAssignments.tester.user', select: 'name email role' })
        .populate({ path: 'attachments.uploadedBy', select: 'name email role' })
        .sort({ createdAt: -1 });

    // Deduplicate in case multiple OR conditions matched the same task
    const unique = [];
    const seen = new Set();
    tasks.forEach(task => {
        if (!seen.has(task._id.toString())) {
            seen.add(task._id.toString());
            unique.push(task);
        }
    });

    for (const task of unique) {
        const changed = await applyDelayCheck({ task, actor: req.user._id });
        if (changed) {
            await task.save();
        }
    }

    res.json(unique);
}));

// Progress task through the workflow
router.put('/tasks/:id/status', protect, asyncHandler(async (req, res) => {
    if (req.isAdmin) {
        res.status(403);
        throw new Error('Admin cannot access user routes');
    }

    const actionRaw = req.body.action || req.body.status || '';
    const normalizedAction = actionRaw.toString().toLowerCase().trim();
    const userRole = req.user.role;

    const task = await Task.findById(req.params.id);

    if (!task) {
        res.status(404);
        throw new Error('Task not found');
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
            } else if (!task.stageAssignments[key].status) {
                task.stageAssignments[key].status = 'pending';
            }
        });
    };

    ensureStageStructure();

    const saveAndRespond = async () => {
        await task.save();
        await task.populate('assignedTo', 'name email role');
        await task.populate('assignedTeam', 'name');
        await task.populate('manager', 'name email');
        await task.populate('createdBy', 'username name email role');
        res.json(task);
    };

    switch (userRole) {
        case 'manager': {
            if (!task.manager || task.manager.toString() !== req.user._id.toString()) {
                res.status(403);
                throw new Error('Only the assigned manager can progress this task');
            }

            if (!normalizedAction) {
                res.status(400);
                throw new Error('Specify an action for manager workflow');
            }

            if (['forward-developer', 'approve-design', 'forward-tester', 'approve-development'].includes(normalizedAction)) {
                res.status(400);
                throw new Error('Stage forwarding is handled automatically after each submission');
            }

            if (['send-hr', 'finalize'].includes(normalizedAction)) {
                if (task.currentStage !== STAGE.MANAGER_FINAL_REVIEW) {
                    res.status(400);
                    throw new Error('Task is not awaiting manager final review');
                }
                task.stageAssignments.tester.status = 'approved';
                task.assignedTo = null;
                setTaskState(task, {
                    status: STATUS.AWAITING_HR_REVIEW,
                    stage: STAGE.HR_DELIVERY,
                    note: 'Manager sent the project to HR for delivery',
                    actor: req.user._id
                });
                task.markModified('stageAssignments');
                await notifyRoles({
                    roles: ['hr'],
                    message: `Manager has submitted project ${task.title} for HR review`,
                    task: task._id,
                    stage: STAGE.HR_DELIVERY
                });
                return saveAndRespond();
            }

            if (normalizedAction === 'reopen') {
                const target = (req.body.target || '').toString().toLowerCase();
                const stageConfig = {
                    designer: {
                        key: 'designer',
                        stage: STAGE.DESIGN,
                        status: STATUS.DESIGN_IN_PROGRESS,
                        message: `Manager reopened project ${task.title} for design updates`
                    },
                    developer: {
                        key: 'developer',
                        stage: STAGE.DEVELOPMENT,
                        status: STATUS.DEVELOPMENT_IN_PROGRESS,
                        message: `Manager reopened project ${task.title} for development updates`
                    },
                    tester: {
                        key: 'tester',
                        stage: STAGE.TESTING,
                        status: STATUS.TESTING_IN_PROGRESS,
                        message: `Manager reopened project ${task.title} for testing updates`
                    }
                };

                const config = stageConfig[target];
                if (!config) {
                    res.status(400);
                    throw new Error('Specify target stage as designer, developer, or tester');
                }

                const assignment = task.stageAssignments[config.key];
                if (!assignment || !assignment.user) {
                    res.status(400);
                    throw new Error('No user assigned for the selected stage');
                }

                task.stageAssignments.designer.status = task.stageAssignments.designer.status || 'pending';
                task.stageAssignments.developer.status = task.stageAssignments.developer.status || 'pending';
                task.stageAssignments.tester.status = task.stageAssignments.tester.status || 'pending';

                assignment.status = 'in_progress';
                assignment.submittedAt = null;
                assignment.submissionAttachmentId = null;

                if (config.key === 'designer') {
                    task.stageAssignments.developer.status = 'pending';
                    task.stageAssignments.tester.status = 'pending';
                } else if (config.key === 'developer') {
                    task.stageAssignments.tester.status = 'pending';
                }

                task.assignedTo = assignment.user;
                setTaskState(task, {
                    status: config.status,
                    stage: config.stage,
                    note: req.body.note || 'Manager reopened the project stage',
                    actor: req.user._id
                });
                task.markModified('stageAssignments');
                await notifyUsers({
                    recipients: [assignment.user],
                    message: config.message,
                    task: task._id,
                    stage: config.stage
                });
                return saveAndRespond();
            }

            res.status(400);
            throw new Error('Unsupported manager action');
        }
        case 'client': {
            if (!task.createdBy || task.createdBy.toString() !== req.user._id.toString()) {
                res.status(403);
                throw new Error('Only the requesting client can act on this task');
            }

            if (!normalizedAction) {
                res.status(400);
                throw new Error('Specify an action for client workflow');
            }

            if (['approve', 'accepted', 'accept', 'complete', 'completed'].includes(normalizedAction)) {
                if (task.status !== STATUS.AWAITING_CLIENT_REVIEW) {
                    res.status(400);
                    throw new Error('Task is not ready for client approval');
                }
                task.assignedTo = null;
                setTaskState(task, {
                    status: STATUS.COMPLETED,
                    stage: STAGE.COMPLETED,
                    note: 'Client accepted the project',
                    actor: req.user._id
                });
                await notifyRoles({
                    roles: ['hr'],
                    message: `Client approved project ${task.title}`,
                    task: task._id,
                    stage: STAGE.COMPLETED
                });
                if (task.manager) {
                    await notifyUsers({
                        recipients: [task.manager],
                        message: `Client approved project ${task.title}`,
                        task: task._id,
                        stage: STAGE.COMPLETED
                    });
                }
                return saveAndRespond();
            }

            if (['request-changes', 'changes', 'rework'].includes(normalizedAction)) {
                if (task.status !== STATUS.AWAITING_CLIENT_REVIEW) {
                    res.status(400);
                    throw new Error('Task is not ready for change requests');
                }
                const comment = (req.body.comment || '').toString().trim();
                if (!comment) {
                    res.status(400);
                    throw new Error('Provide a comment or reason for the requested changes');
                }
                task.changeRequests.push({
                    comment,
                    createdBy: req.user._id
                });
                task.assignedTo = null;
                setTaskState(task, {
                    status: STATUS.CHANGES_REQUESTED,
                    stage: STAGE.CHANGES_REQUESTED,
                    note: comment,
                    actor: req.user._id
                });
                await notifyRoles({
                    roles: ['hr'],
                    message: `Client requested revisions for project ${task.title}`,
                    task: task._id,
                    stage: STAGE.CHANGES_REQUESTED,
                    meta: { comment }
                });
                if (task.manager) {
                    await notifyUsers({
                        recipients: [task.manager],
                        message: `Client requested revisions for project ${task.title}`,
                        task: task._id,
                        stage: STAGE.CHANGES_REQUESTED,
                        meta: { comment }
                    });
                }
                task.markModified('changeRequests');
                return saveAndRespond();
            }

            res.status(400);
            throw new Error('Unknown client action');
        }
        default: {
            res.status(403);
            throw new Error('Role not permitted to progress tasks');
        }
    }
}));

router.post('/analyze-request', protect, roleRequired('client'), upload.single('document'), asyncHandler(async (req, res) => {
    const { deadline, category, title, description } = req.body;

    if (!title || !description) {
        res.status(400);
        throw new Error('Title and description are required for feasibility check');
    }

    if (!deadline) {
        res.status(400);
        throw new Error('Deadline is required for feasibility check');
    }

    const deadlineDate = new Date(deadline);
    if (Number.isNaN(deadlineDate.getTime())) {
        res.status(400);
        throw new Error('Provide a valid deadline for feasibility check');
    }

    const result = await analyzeRequestFeasibility({
        deadline,
        category,
        title,
        description,
        file: req.file || null
    });

    res.json(result);
}));

router.post('/tasks', protect, roleRequired('client'), upload.array('attachments', 8), asyncHandler(async (req, res) => {
    if (req.isAdmin) {
        res.status(403);
        throw new Error('Admin cannot access user routes');
    }

    const { title, description, deadline, category } = req.body;
    if (!title || !description || !deadline) {
        res.status(400);
        throw new Error('Title, description, and deadline are required');
    }

    const parsedDeadline = new Date(deadline);
    if (Number.isNaN(parsedDeadline.getTime())) {
        res.status(400);
        throw new Error('Provide a valid deadline');
    }

    const attachments = (req.files || []).map(file => ({
        stage: 'client-request',
        filename: file.filename,
        originalName: file.originalname,
        size: file.size,
        mimeType: file.mimetype,
        uploadedBy: req.user._id
    }));

    const task = new Task({
        title,
        description,
        deadline: parsedDeadline,
        category: category || 'other',
        attachments,
        createdBy: req.user._id,
        createdByModel: 'User',
        createdByRole: req.user.role
    });

    setTaskState(task, {
        status: STATUS.CLIENT_REQUESTED,
        stage: STAGE.CLIENT_REQUEST,
        note: 'Client submitted project request',
        actor: req.user._id
    });

    await task.save();
    await task.populate('createdBy', 'name email role');

    await notifyRoles({
        roles: ['hr'],
        message: `New project request ${task.title} submitted by ${req.user.name || req.user.email}`,
        task: task._id,
        stage: STAGE.CLIENT_REQUEST
    });

    res.status(201).json(task);
}));

// Upload stage deliverables and supporting files
router.post('/tasks/:id/attachments', protect, upload.single('file'), asyncHandler(async (req, res) => {
    if (req.isAdmin) {
        res.status(403);
        throw new Error('Admin cannot access user routes');
    }

    if (!req.file) {
        res.status(400);
        throw new Error('Attach a file to upload');
    }

    const task = await Task.findById(req.params.id);
    if (!task) {
        res.status(404);
        throw new Error('Task not found');
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
            } else if (!task.stageAssignments[key].status) {
                task.stageAssignments[key].status = 'pending';
            }
        });
    };

    ensureStageStructure();

    const fileEntry = {
        stage: '',
        filename: req.file.filename,
        originalName: req.file.originalname,
        size: req.file.size,
        mimeType: req.file.mimetype,
        uploadedBy: req.user._id
    };

    const timestamp = new Date();
    const role = req.user.role;

    if (role === 'designer') {
        if (!task.stageAssignments.designer.user || task.stageAssignments.designer.user.toString() !== req.user._id.toString()) {
            res.status(403);
            throw new Error('You are not assigned as the designer for this project');
        }
        if (task.currentStage !== STAGE.DESIGN) {
            res.status(400);
            throw new Error('Design stage is not active');
        }
        const developerAssignment = task.stageAssignments.developer || {};
        if (!developerAssignment.user) {
            res.status(400);
            throw new Error('Developer assignment is missing for this task');
        }
        await applyDelayCheck({ task, actor: req.user._id });
        fileEntry.stage = 'design';
        task.attachments.push(fileEntry);
        const attachmentId = task.attachments[task.attachments.length - 1]._id;
        task.stageAssignments.designer.status = 'completed';
        task.stageAssignments.designer.submittedAt = timestamp;
        task.stageAssignments.designer.submissionAttachmentId = attachmentId;
        task.stageAssignments.developer.status = 'in_progress';
        task.stageAssignments.developer.submittedAt = null;
        task.stageAssignments.developer.submissionAttachmentId = null;
        task.assignedTo = developerAssignment.user;
        setTaskState(task, {
            status: STATUS.DEVELOPMENT_IN_PROGRESS,
            stage: STAGE.DEVELOPMENT,
            note: 'Designer completed the stage; development activated',
            actor: req.user._id
        });
        task.markModified('stageAssignments');
        const developer = await User.findById(developerAssignment.user).select('name email role');
        await notifyUsers({
            recipients: developer ? [developer._id] : [],
            message: 'Designer has completed the task. It is now your turn to proceed.',
            task: task._id,
            stage: STAGE.DEVELOPMENT
        });
        if (developer?.email) {
            await trySendTaskStageEmail({
                email: developer.email,
                name: developer.name || developer.email,
                roleLabel: 'Developer',
                taskTitle: task.title,
                message: 'Designer has completed the task. It is now your turn to proceed.'
            });
        }
    } else if (role === 'developer') {
        if (!task.stageAssignments.developer.user || task.stageAssignments.developer.user.toString() !== req.user._id.toString()) {
            res.status(403);
            throw new Error('You are not assigned as the developer for this project');
        }
        if (task.currentStage !== STAGE.DEVELOPMENT) {
            res.status(400);
            throw new Error('Development stage is not active');
        }
        const testerAssignment = task.stageAssignments.tester || {};
        if (!testerAssignment.user) {
            res.status(400);
            throw new Error('Tester assignment is missing for this task');
        }
        await applyDelayCheck({ task, actor: req.user._id });
        fileEntry.stage = 'development';
        task.attachments.push(fileEntry);
        const attachmentId = task.attachments[task.attachments.length - 1]._id;
        task.stageAssignments.developer.status = 'completed';
        task.stageAssignments.developer.submittedAt = timestamp;
        task.stageAssignments.developer.submissionAttachmentId = attachmentId;
        task.stageAssignments.tester.status = 'in_progress';
        task.stageAssignments.tester.submittedAt = null;
        task.stageAssignments.tester.submissionAttachmentId = null;
        task.assignedTo = testerAssignment.user;
        setTaskState(task, {
            status: STATUS.TESTING_IN_PROGRESS,
            stage: STAGE.TESTING,
            note: 'Developer completed the stage; testing activated',
            actor: req.user._id
        });
        task.markModified('stageAssignments');
        const tester = await User.findById(testerAssignment.user).select('name email role');
        await notifyUsers({
            recipients: tester ? [tester._id] : [],
            message: 'Developer has completed the task. Testing phase is now active.',
            task: task._id,
            stage: STAGE.TESTING
        });
        if (tester?.email) {
            await trySendTaskStageEmail({
                email: tester.email,
                name: tester.name || tester.email,
                roleLabel: 'Tester',
                taskTitle: task.title,
                message: 'Developer has completed the task. Testing phase is now active.'
            });
        }
    } else if (role === 'tester') {
        if (!task.stageAssignments.tester.user || task.stageAssignments.tester.user.toString() !== req.user._id.toString()) {
            res.status(403);
            throw new Error('You are not assigned as the tester for this project');
        }
        if (task.currentStage !== STAGE.TESTING) {
            res.status(400);
            throw new Error('Testing stage is not active');
        }
        await applyDelayCheck({ task, actor: req.user._id });
        fileEntry.stage = 'testing';
        task.attachments.push(fileEntry);
        const attachmentId = task.attachments[task.attachments.length - 1]._id;
        task.stageAssignments.tester.status = 'completed';
        task.stageAssignments.tester.submittedAt = timestamp;
        task.stageAssignments.tester.submissionAttachmentId = attachmentId;
        task.assignedTo = task.manager || null;
        setTaskState(task, {
            status: STATUS.TESTING_SUBMITTED,
            stage: STAGE.MANAGER_FINAL_REVIEW,
            note: 'Tester completed the stage; manager final review pending',
            actor: req.user._id
        });
        task.markModified('stageAssignments');
        await notifyUsers({
            recipients: task.manager ? [task.manager] : [],
            message: 'Testing completed. Task is ready for final review.',
            task: task._id,
            stage: STAGE.MANAGER_FINAL_REVIEW
        });
        if (task.manager) {
            const managerUser = await User.findById(task.manager).select('name email role');
            if (managerUser?.email) {
                await trySendTaskStageEmail({
                    email: managerUser.email,
                    name: managerUser.name || managerUser.email,
                    roleLabel: 'Manager',
                    taskTitle: task.title,
                    message: 'Testing completed. Task is ready for final review.'
                });
            }
        }
    } else if (role === 'client') {
        fileEntry.stage = 'client-feedback';
        task.attachments.push(fileEntry);
    } else if (role === 'hr') {
        if (task.currentStage !== STAGE.HR_DELIVERY) {
            res.status(400);
            throw new Error('HR can upload files only during delivery stage');
        }
        fileEntry.stage = 'hr';
        task.attachments.push(fileEntry);
    } else {
        res.status(403);
        throw new Error('Role not permitted to upload files for this project');
    }

    task.markModified('attachments');
    await task.save();

    const attachment = task.attachments[task.attachments.length - 1];

    await task.populate('assignedTo', 'name email role');
    await task.populate('assignedTeam', 'name');
    await task.populate('manager', 'name email');
    await task.populate('createdBy', 'username name email role');

    res.status(201).json({ attachment, task });
}));

// Get current user's profile
router.get('/profile', protect, asyncHandler(async (req, res) => {
    if (req.isAdmin) {
        // Admins use admin routes
        res.status(403);
        throw new Error('Admin has separate profile route');
    }
    const user = await User.findById(req.user._id).select('-password');
    if (!user) {
        res.status(404);
        throw new Error('User not found');
    }
    res.json(user);
}));

// Update current user's basic profile (name + contact fields + profile photo)
router.put('/profile/basic', protect, upload.single('profilePhoto'), asyncHandler(async (req, res) => {
    if (req.isAdmin) {
        res.status(403);
        throw new Error('Admin has separate profile route');
    }

    const user = await User.findById(req.user._id);
    if (!user) {
        res.status(404);
        throw new Error('User not found');
    }

    const { name, phone, department } = req.body;
    const categories = normalizeCategories(req.body.categories ?? req.body.category);

    if (typeof name === 'string') {
        const trimmed = name.trim();
        if (trimmed) {
            user.name = trimmed;
        }
    }

    if (typeof phone === 'string') {
        user.phone = phone.trim();
    }

    if (typeof department === 'string') {
        user.department = department.trim();
    }

    if (ROLES_REQUIRING_CATEGORY.includes(user.role)) {
        if (Object.prototype.hasOwnProperty.call(req.body, 'categories') || Object.prototype.hasOwnProperty.call(req.body, 'category')) {
            if (!categories.length) {
                res.status(400);
                throw new Error('At least one category is required for this role');
            }
            const invalidCategories = categories.filter(item => !CATEGORY_OPTIONS.includes(item));
            if (invalidCategories.length > 0) {
                res.status(400);
                throw new Error('Invalid categories provided');
            }
            user.categories = Array.from(new Set(categories));
            user.category = user.categories[0] || '';
        }
    }

    if (req.file && req.file.filename) {
        user.profilePhoto = `/uploads/${req.file.filename}`;
    }

    const updated = await user.save();
    res.json({
        _id: updated._id,
        name: updated.name,
        email: updated.email,
        role: updated.role,
        profilePhoto: updated.profilePhoto || '',
        phone: updated.phone || '',
        department: updated.department || '',
        categories: updated.categories || [],
        category: updated.category || '',
        lastSeen: updated.lastSeen || null
    });
}));

// Update current user's login credentials (password only)
router.put('/credentials', protect, asyncHandler(async (req, res) => {
    if (req.isAdmin) {
        res.status(403);
        throw new Error('Admin has separate credentials route');
    }

    const user = await User.findById(req.user._id);
    if (!user) {
        res.status(404);
        throw new Error('User not found');
    }

    if (user.role === 'hr') {
        res.status(403);
        throw new Error('You can\'t update your password here. Please contact the Admin who created your account to update your password.');
    }

    if (user.role === 'manager') {
        res.status(403);
        throw new Error('You can\'t update your password here. Please contact the HR who created your account to update your password.');
    }

    const { password } = req.body;
    if (!password) {
        res.status(400);
        throw new Error('Password is required');
    }

    if (typeof password !== 'string' || password.length < 8) {
        res.status(400);
        throw new Error('Password must be at least 8 characters');
    }

    user.password = password;
    await user.save();
    res.json({ message: 'Password updated successfully.' });
}));

// Update current user's profile
router.put('/profile', protect, asyncHandler(async (req, res) => {
    if (req.isAdmin) {
        res.status(403);
        throw new Error('Admin has separate profile route');
    }

    const user = await User.findById(req.user._id);
    if (!user) {
        res.status(404);
        throw new Error('User not found');
    }

    const { name, email, password, phone, department } = req.body;

    if (typeof name === 'string') {
        const trimmed = name.trim();
        if (trimmed) {
            user.name = trimmed;
        }
    }

    if (typeof phone === 'string') {
        user.phone = phone.trim();
    }

    if (typeof department === 'string') {
        user.department = department.trim();
    }

    if (email && email !== user.email) {
        res.status(400);
        throw new Error('Email cannot be changed from profile settings');
    }

    if (password) {
        res.status(400);
        throw new Error('Use /api/user/credentials to update password');
    }

    const updated = await user.save();
    res.json({
        _id: updated._id,
        name: updated.name,
        email: updated.email,
        role: updated.role,
        profilePhoto: updated.profilePhoto || '',
        phone: updated.phone || '',
        department: updated.department || ''
    });
}));

// Notifications API
router.get('/notifications', protect, asyncHandler(async (req, res) => {
    if (req.isAdmin) {
        res.status(403);
        throw new Error('Admin cannot access user routes');
    }

    const unreadOnly = req.query.unreadOnly === 'true';
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);

    const filter = { recipient: req.user._id };
    if (unreadOnly) {
        filter.read = false;
    }

    const notifications = await Notification.find(filter)
        .sort({ createdAt: -1 })
        .limit(limit)
        .populate('task', 'title status currentStage manager assignedTo');

    res.json(notifications);
}));

router.put('/notifications/:id/read', protect, asyncHandler(async (req, res) => {
    if (req.isAdmin) {
        res.status(403);
        throw new Error('Admin cannot access user routes');
    }

    const notification = await Notification.findOne({ _id: req.params.id, recipient: req.user._id });
    if (!notification) {
        res.status(404);
        throw new Error('Notification not found');
    }

    notification.read = true;
    await notification.save();
    res.json(notification);
}));

router.put('/notifications/read', protect, asyncHandler(async (req, res) => {
    if (req.isAdmin) {
        res.status(403);
        throw new Error('Admin cannot access user routes');
    }

    const ids = Array.isArray(req.body.ids) ? req.body.ids : [];
    const markAll = req.body.markAll === true;

    const filter = { recipient: req.user._id };
    if (!markAll) {
        if (!ids.length) {
            res.status(400);
            throw new Error('Provide notification ids or set markAll to true');
        }
        filter._id = { $in: ids };
    }

    const result = await Notification.updateMany(filter, { $set: { read: true } });
    res.json({ updated: result.modifiedCount || 0 });
}));

module.exports = router;