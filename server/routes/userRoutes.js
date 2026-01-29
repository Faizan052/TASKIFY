const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const asyncHandler = require('express-async-handler');
const User = require('../models/User');
const Task = require('../models/Task');
const Team = require('../models/Team');
const Notification = require('../models/Notification');
const OTP = require('../models/OTP');
const { generateOTP, sendOTPEmail, sendWelcomeEmail } = require('../utils/emailService');
const upload = require('../middleware/upload');
const { protect } = require('../middleware/auth');
const { roleRequired } = require('../middleware/roles');
const { STATUS, STAGE, setTaskState, notifyUsers, notifyRoles } = require('../utils/taskWorkflow');

// Send OTP for user registration (POST)
router.post('/send-otp', asyncHandler(async (req, res) => {
    const { email, name, role } = req.body;

    // Validate email
    if (!email) {
        res.status(400);
        throw new Error('Email is required');
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const trimmedEmail = email.trim().toLowerCase();
    if (!emailRegex.test(trimmedEmail)) {
        res.status(400);
        throw new Error('Invalid email format');
    }

    // Validate role
    const allowed = ['developer','designer','tester','client'];
    if (role && !allowed.includes(role)) {
        res.status(400);
        throw new Error('Invalid role');
    }

    // Check if user already exists
    const exists = await User.findOne({ email: trimmedEmail });
    if (exists) {
        res.status(400);
        throw new Error('User already exists with this email');
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
    const trimmedEmail = email.trim().toLowerCase();
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
    const exists = await User.findOne({ email: trimmedEmail });
    if (exists) {
        res.status(400);
        throw new Error('User already exists with this email');
    }

    // Create user with validated data
    const user = await User.create({ 
        name: trimmedName, 
        email: trimmedEmail, 
        password, 
        role 
    });
    
    // Delete used OTP
    await OTP.deleteOne({ _id: otpRecord._id });
    
    if (user) {
        // Send welcome email
        try {
            await sendWelcomeEmail(user.email, user.name, user.role);
        } catch (emailError) {
            console.log('Welcome email failed but registration successful:', emailError);
        }

        res.status(201).json({ 
            _id: user._id, 
            name: user.name, 
            email: user.email, 
            role: user.role,
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
    const trimmedEmail = email.trim();

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

            const parseDeadline = (value, label) => {
                if (!value) {
                    res.status(400);
                    throw new Error(`Provide a ${label} deadline before forwarding`);
                }
                const dt = new Date(value);
                if (Number.isNaN(dt.getTime())) {
                    res.status(400);
                    throw new Error(`Provide a valid ${label} deadline`);
                }
                return dt;
            };

            if (['forward-developer', 'approve-design'].includes(normalizedAction)) {
                if (task.currentStage !== STAGE.MANAGER_DESIGN_REVIEW) {
                    res.status(400);
                    throw new Error('Task is not waiting for design approval');
                }
                const developerAssignment = task.stageAssignments.developer || {};
                if (!developerAssignment.user) {
                    res.status(400);
                    throw new Error('Assign a developer before forwarding the project');
                }
                const developerDeadline = parseDeadline(req.body.developerDeadline, 'developer');
                task.stageAssignments.designer.status = 'approved';
                task.stageAssignments.developer.status = 'in_progress';
                task.stageAssignments.developer.submittedAt = null;
                task.stageAssignments.developer.submissionAttachmentId = null;
                task.stageAssignments.developer.deadline = developerDeadline;
                task.assignedTo = developerAssignment.user;
                setTaskState(task, {
                    status: STATUS.DEVELOPMENT_IN_PROGRESS,
                    stage: STAGE.DEVELOPMENT,
                    note: 'Manager forwarded the project to development',
                    actor: req.user._id
                });
                task.markModified('stageAssignments');
                await notifyUsers({
                    recipients: [developerAssignment.user],
                    message: `Manager has forwarded project ${task.title} for development`,
                    task: task._id,
                    stage: STAGE.DEVELOPMENT
                });
                return saveAndRespond();
            }

            if (['forward-tester', 'approve-development'].includes(normalizedAction)) {
                if (task.currentStage !== STAGE.MANAGER_DEVELOPMENT_REVIEW) {
                    res.status(400);
                    throw new Error('Task is not waiting for development approval');
                }
                const testerAssignment = task.stageAssignments.tester || {};
                if (!testerAssignment.user) {
                    res.status(400);
                    throw new Error('Assign a tester before forwarding the project');
                }
                const testerDeadline = parseDeadline(req.body.testerDeadline, 'tester');
                task.stageAssignments.developer.status = 'approved';
                task.stageAssignments.tester.status = 'in_progress';
                task.stageAssignments.tester.submittedAt = null;
                task.stageAssignments.tester.submissionAttachmentId = null;
                task.stageAssignments.tester.deadline = testerDeadline;
                task.assignedTo = testerAssignment.user;
                setTaskState(task, {
                    status: STATUS.TESTING_IN_PROGRESS,
                    stage: STAGE.TESTING,
                    note: 'Manager forwarded the project to testing',
                    actor: req.user._id
                });
                task.markModified('stageAssignments');
                await notifyUsers({
                    recipients: [testerAssignment.user],
                    message: `Manager has forwarded project ${task.title} for testing`,
                    task: task._id,
                    stage: STAGE.TESTING
                });
                return saveAndRespond();
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

// Client submits a new task request
// AI Analysis for document feasibility check
router.post('/analyze-request', protect, roleRequired('client'), upload.single('document'), asyncHandler(async (req, res) => {
    const { deadline, category, title, description } = req.body;
    
    if (!req.file) {
        res.status(400);
        throw new Error('Document file is required for analysis');
    }

    if (!deadline) {
        res.status(400);
        throw new Error('Deadline is required for analysis');
    }

    // Calculate days until deadline
    const deadlineDate = new Date(deadline);
    const today = new Date();
    const diffTime = deadlineDate - today;
    const daysAvailable = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    // Enhanced AI Analysis
    const fileSize = req.file.size;
    const fileSizeMB = fileSize / (1024 * 1024);
    const fileName = req.file.originalname.toLowerCase();

    // Complexity scoring system
    let complexityScore = 0;
    let baseEstimate = 14;

    // Category-based estimates with more intelligence
    const categoryData = {
        'website': { 
            baseMin: 14, baseMax: 45, weight: 1.0,
            keywords: ['responsive', 'database', 'api', 'admin', 'payment', 'authentication', 'dashboard'],
            complexFactors: { responsive: 2, database: 5, api: 4, admin: 3, payment: 7, authentication: 4, dashboard: 4 }
        },
        'mobile-app': { 
            baseMin: 21, baseMax: 60, weight: 1.3,
            keywords: ['ios', 'android', 'native', 'push', 'camera', 'gps', 'payment', 'offline'],
            complexFactors: { native: 7, push: 3, camera: 4, gps: 3, payment: 7, offline: 5 }
        },
        'desktop-app': { 
            baseMin: 21, baseMax: 60, weight: 1.2,
            keywords: ['windows', 'mac', 'linux', 'installer', 'database', 'sync'],
            complexFactors: { multiplatform: 10, installer: 3, database: 5, sync: 6 }
        },
        'testing': { 
            baseMin: 7, baseMax: 14, weight: 0.5,
            keywords: ['automated', 'integration', 'unit', 'load', 'security'],
            complexFactors: { automated: 2, integration: 3, load: 4, security: 5 }
        },
        'updation': { 
            baseMin: 3, baseMax: 14, weight: 0.6,
            keywords: ['migration', 'refactor', 'upgrade', 'dependency'],
            complexFactors: { migration: 5, refactor: 7, upgrade: 3, dependency: 2 }
        },
        'design': { 
            baseMin: 7, baseMax: 21, weight: 0.8,
            keywords: ['prototype', 'animation', 'branding', 'mockup', 'illustration'],
            complexFactors: { prototype: 2, animation: 4, branding: 5, illustration: 3 }
        },
        'api': { 
            baseMin: 10, baseMax: 30, weight: 0.9,
            keywords: ['rest', 'graphql', 'websocket', 'authentication', 'documentation'],
            complexFactors: { rest: 2, graphql: 5, websocket: 6, authentication: 4, documentation: 2 }
        },
        'database': { 
            baseMin: 7, baseMax: 21, weight: 0.8,
            keywords: ['migration', 'optimization', 'replication', 'backup', 'sharding'],
            complexFactors: { migration: 4, optimization: 3, replication: 6, backup: 2, sharding: 8 }
        },
        'other': { baseMin: 14, baseMax: 30, weight: 1.0, keywords: [], complexFactors: {} }
    };

    const catData = categoryData[category] || categoryData['other'];

    // Analyze description for complexity keywords
    const fullText = `${title} ${description}`.toLowerCase();
    let keywordMatches = 0;

    if (catData.keywords && catData.keywords.length > 0) {
        catData.keywords.forEach(keyword => {
            if (fullText.includes(keyword)) {
                keywordMatches++;
                complexityScore += catData.complexFactors[keyword] || 2;
            }
        });
    }

    // File size intelligence
    if (fileSizeMB > 10) {
        complexityScore += 15; // Very detailed requirements
    } else if (fileSizeMB > 5) {
        complexityScore += 10;
    } else if (fileSizeMB > 2) {
        complexityScore += 5;
    } else if (fileSizeMB < 0.1) {
        complexityScore -= 5; // Very brief, possibly simple
    }

    // File type intelligence
    if (fileName.endsWith('.pdf')) {
        complexityScore += 2; // PDFs usually detailed
    } else if (fileName.endsWith('.docx') || fileName.endsWith('.doc')) {
        complexityScore += 3; // Word docs often very detailed
    }

    // Calculate base estimate
    if (complexityScore > 25) {
        baseEstimate = catData.baseMax;
    } else if (complexityScore > 15) {
        baseEstimate = Math.ceil((catData.baseMin + catData.baseMax) * 0.7);
    } else if (complexityScore > 5) {
        baseEstimate = Math.ceil((catData.baseMin + catData.baseMax) / 2);
    } else {
        baseEstimate = catData.baseMin;
    }

    // Add QA buffer (20%)
    const estimatedDays = Math.ceil(baseEstimate * 1.2);

    // Determine complexity level
    let complexity = 'medium';
    if (complexityScore > 20 || keywordMatches > 5) {
        complexity = 'high';
    } else if (complexityScore < 8 && keywordMatches < 2) {
        complexity = 'low';
    }

    const feasible = daysAvailable >= estimatedDays;
    const buffer = daysAvailable - estimatedDays;

    let message = '';
    let recommendations = [];
    let allowSubmit = true;

    if (feasible) {
        if (buffer > 21) {
            message = `🎉 Excellent Planning! Your project has a very comfortable timeline. Our AI analyzed ${keywordMatches} complexity indicators and estimates ${estimatedDays} days for quality delivery. With ${daysAvailable} days provided, you have a generous ${buffer}-day buffer for refinements and iterations.`;
            recommendations = [
                'Timeline is exceptionally well-planned',
                'Ample time for thorough testing and quality assurance',
                'Buffer allows for scope adjustments if needed',
                'Multiple review cycles possible',
                'Time for detailed documentation'
            ];
        } else if (buffer > 14) {
            message = `✅ Great Timeline! Based on ${complexityScore} complexity points identified, your deadline provides a solid buffer. Estimated completion: ${estimatedDays} days. Available: ${daysAvailable} days. This allows for proper development and testing.`;
            recommendations = [
                'Timeline is well-balanced and achievable',
                'Sufficient buffer for quality delivery',
                'Clear requirements will optimize the timeline',
                'Regular feedback loops recommended',
                'Time available for minor scope adjustments'
            ];
        } else if (buffer > 7) {
            message = `✅ Good Timeline. Your project is feasible with moderate buffer time. AI detected ${keywordMatches} key complexity factors. Estimated: ${estimatedDays} days, Available: ${daysAvailable} days.`;
            recommendations = [
                'Timeline is achievable with focused execution',
                'Provide clear and detailed requirements upfront',
                'Be available for quick feedback and approvals',
                'Prioritize features clearly',
                'Minimize scope changes during development'
            ];
        } else {
            message = `⚠️ Tight but Feasible. Your deadline is achievable but requires efficient execution. Complexity analysis shows ${complexity} complexity level. Estimated: ${estimatedDays} days, Available: ${daysAvailable} days. Only ${buffer} days buffer.`;
            recommendations = [
                'Provide extremely clear and detailed requirements',
                'Be highly available for immediate feedback',
                'Avoid any scope changes during development',
                'Quick decision-making will be critical',
                'Daily or frequent check-ins recommended'
            ];
        }
    } else {
        const shortage = Math.abs(buffer);
        message = `❌ Timeline Challenge Detected! Our advanced AI analysis identified ${complexityScore} complexity points and ${keywordMatches} critical features. Estimated delivery time: ${estimatedDays} days. Your deadline: ${daysAvailable} days. Shortage: ${shortage} days.`;
        
        const extensionNeeded = shortage + Math.ceil(estimatedDays * 0.15); // Add 15% more
        
        recommendations = [
            `Extend deadline by ${extensionNeeded} days for quality delivery`,
            `Reduce scope to fit ${daysAvailable}-day timeline`,
            'Consider phased delivery with priority features first',
            'Break project into multiple milestones',
            'Discuss MVP (Minimum Viable Product) approach',
            'Remove lower-priority features',
            'Simplify complex features if possible'
        ];
        
        allowSubmit = shortage < 5; // More strict
        
        if (!allowSubmit) {
            message += ` ⛔ We strongly recommend adjusting requirements or timeline before submission to ensure quality delivery.`;
        } else {
            message += ` ⚠️ You may proceed, but expect a very aggressive schedule with potential quality compromises.`;
        }
    }

    res.json({
        feasible,
        estimatedDays,
        daysAvailable,
        buffer,
        complexity,
        complexityScore,
        keywordMatches,
        message,
        recommendations,
        allowSubmit,
        analysis: {
            fileSize: fileSizeMB.toFixed(2) + ' MB',
            category,
            deadline: deadlineDate.toLocaleDateString(),
            intelligenceLevel: 'Advanced AI v2.0'
        }
    });
}));

router.post('/tasks', protect, roleRequired('client'), upload.array('attachments', 8), asyncHandler(async (req, res) => {
    if (req.isAdmin) {
        res.status(403);
        throw new Error('Admin cannot access user routes');
    }

    const { title, description, deadline, category, aiAnalysis } = req.body;
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

    // Store AI analysis if provided
    if (aiAnalysis) {
        try {
            task.aiAnalysis = typeof aiAnalysis === 'string' ? JSON.parse(aiAnalysis) : aiAnalysis;
        } catch (e) {
            // Ignore parsing errors
        }
    }

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
        fileEntry.stage = 'design';
        task.attachments.push(fileEntry);
        const attachmentId = task.attachments[task.attachments.length - 1]._id;
        task.stageAssignments.designer.status = 'submitted';
        task.stageAssignments.designer.submittedAt = timestamp;
        task.stageAssignments.designer.submissionAttachmentId = attachmentId;
        task.assignedTo = task.manager || null;
        setTaskState(task, {
            status: STATUS.DESIGN_SUBMITTED,
            stage: STAGE.MANAGER_DESIGN_REVIEW,
            note: 'Designer uploaded deliverable',
            actor: req.user._id
        });
        task.markModified('stageAssignments');
        await notifyUsers({
            recipients: task.manager ? [task.manager] : [],
            message: 'Designer has uploaded project files.',
            task: task._id,
            stage: STAGE.MANAGER_DESIGN_REVIEW
        });
    } else if (role === 'developer') {
        if (!task.stageAssignments.developer.user || task.stageAssignments.developer.user.toString() !== req.user._id.toString()) {
            res.status(403);
            throw new Error('You are not assigned as the developer for this project');
        }
        if (task.currentStage !== STAGE.DEVELOPMENT) {
            res.status(400);
            throw new Error('Development stage is not active');
        }
        fileEntry.stage = 'development';
        task.attachments.push(fileEntry);
        const attachmentId = task.attachments[task.attachments.length - 1]._id;
        task.stageAssignments.developer.status = 'submitted';
        task.stageAssignments.developer.submittedAt = timestamp;
        task.stageAssignments.developer.submissionAttachmentId = attachmentId;
        task.assignedTo = task.manager || null;
        setTaskState(task, {
            status: STATUS.DEVELOPMENT_SUBMITTED,
            stage: STAGE.MANAGER_DEVELOPMENT_REVIEW,
            note: 'Developer uploaded deliverable',
            actor: req.user._id
        });
        task.markModified('stageAssignments');
        await notifyUsers({
            recipients: task.manager ? [task.manager] : [],
            message: 'Developer has uploaded the project files.',
            task: task._id,
            stage: STAGE.MANAGER_DEVELOPMENT_REVIEW
        });
    } else if (role === 'tester') {
        if (!task.stageAssignments.tester.user || task.stageAssignments.tester.user.toString() !== req.user._id.toString()) {
            res.status(403);
            throw new Error('You are not assigned as the tester for this project');
        }
        if (task.currentStage !== STAGE.TESTING) {
            res.status(400);
            throw new Error('Testing stage is not active');
        }
        fileEntry.stage = 'testing';
        task.attachments.push(fileEntry);
        const attachmentId = task.attachments[task.attachments.length - 1]._id;
        task.stageAssignments.tester.status = 'submitted';
        task.stageAssignments.tester.submittedAt = timestamp;
        task.stageAssignments.tester.submissionAttachmentId = attachmentId;
        task.assignedTo = task.manager || null;
        setTaskState(task, {
            status: STATUS.TESTING_SUBMITTED,
            stage: STAGE.MANAGER_FINAL_REVIEW,
            note: 'Tester uploaded deliverable',
            actor: req.user._id
        });
        task.markModified('stageAssignments');
        await notifyUsers({
            recipients: task.manager ? [task.manager] : [],
            message: 'Tester has uploaded test files.',
            task: task._id,
            stage: STAGE.MANAGER_FINAL_REVIEW
        });
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
        department: updated.department || ''
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