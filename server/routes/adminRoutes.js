const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const asyncHandler = require('express-async-handler');
const Admin = require('../models/Admin');
const User = require('../models/User');
const Team = require('../models/Team');
const Task = require('../models/Task');
const Message = require('../models/Message');
const Notification = require('../models/Notification');
const OTP = require('../models/OTP');
const PasswordReset = require('../models/PasswordReset');
const { generateOTP, sendOTPEmail } = require('../utils/emailService');
const { trySendWelcomeEmail, trySendNewPasswordEmail } = require('../utils/emailNotifications');
const { validateEmail } = require('../utils/validation');
const { normalizeEmail, normalizeUsername, assertUniqueIdentity } = require('../utils/identity');
const { protect, adminOnly } = require('../middleware/auth');
const upload = require('../middleware/upload');
const { buildPerformanceReport } = require('../utils/performanceReports');

// Check if admin exists (GET)
router.get('/check-exists', asyncHandler(async (req, res) => {
    const adminCount = await Admin.countDocuments();
    res.json({ exists: adminCount > 0 });
}));

// Send OTP for admin registration (POST)
router.post('/send-otp', asyncHandler(async (req, res) => {
    const { email, name } = req.body;

    // Check if admin already exists
    const adminCount = await Admin.countDocuments();
    if (adminCount > 0) {
        res.status(400);
        throw new Error('An administrator account already exists in the system');
    }

    // Validate email
    const emailValidation = validateEmail(email);
    if (!emailValidation.valid) {
        res.status(400);
        throw new Error(emailValidation.error);
    }

    const trimmedEmail = emailValidation.email;

    // Generate OTP
    const otp = generateOTP();

    // Delete any existing OTPs for this email
    await OTP.deleteMany({ email: trimmedEmail, userType: 'admin' });

    // Save OTP to database
    await OTP.create({
        email: trimmedEmail,
        otp,
        userType: 'admin'
    });

    // Send OTP email
    await sendOTPEmail(trimmedEmail, otp, name || 'Admin');

    res.json({ 
        message: 'OTP sent to your email. Please check your inbox.',
        email: trimmedEmail
    });
}));

// Admin Registration (POST) - Only allowed if no admin exists and OTP is verified
router.post('/register', asyncHandler(async (req, res) => {
    const { name, username, email, password } = req.body;
    const normalizedUsername = normalizeUsername(username);
    const normalizedEmail = normalizeEmail(email);

    // Check if admin already exists
    const adminCount = await Admin.countDocuments();
    if (adminCount > 0) {
        res.status(400);
        throw new Error('An administrator account already exists in the system');
    }

    // Validate required fields
    if (!name || !username || !password) {
        res.status(400);
        throw new Error('Name, username, and password are required');
    }

    // Check if username is already taken
    try {
        await assertUniqueIdentity({ email: normalizedEmail, username: normalizedUsername });
    } catch (identityError) {
        res.status(400);
        throw new Error(identityError.message);
    }

    // Create admin
    const admin = await Admin.create({
        username: normalizedUsername,
        email: normalizedEmail || '',
        password,
        phone: '',
        department: ''
    });

    if (admin) {
        await trySendWelcomeEmail({
            email: admin.email,
            name: admin.username,
            role: 'admin',
            errorMessage: 'Welcome email failed but registration successful:'
        });

        res.status(201).json({
            _id: admin._id,
            username: admin.username,
            email: admin.email,
            message: 'Admin registered successfully'
        });
    } else {
        res.status(400);
        throw new Error('Failed to create admin account');
    }
}));

// Admin Login (POST)
router.post('/login', asyncHandler(async (req, res) => {
    const { username, password } = req.body;
    const normalizedUsername = normalizeUsername(username);

    const admin = await Admin.findOne({ username: normalizedUsername });
    
    if (admin && (await admin.matchPassword(password))) {
        res.json({
            _id: admin._id,
            username: admin.username,
            role: 'admin',
            token: jwt.sign({ id: admin._id, model: 'Admin' }, process.env.JWT_SECRET, {
                expiresIn: '30d'
            })
        });
    } else {
        res.status(401);
        throw new Error('Invalid username or password');
    }
}));

// Admin profile & overview
router.get('/profile', protect, adminOnly, asyncHandler(async (req, res) => {
    const admin = await Admin.findById(req.user._id).select('-password');
    if (!admin) {
        res.status(404);
        throw new Error('Admin not found');
    }

    const managerTeamTasks = await Task.find({ createdByRole: 'manager', assignedTeam: { $ne: null } })
        .populate('assignedTeam', 'name')
        .populate('assignedTo', 'name email role')
        .populate('createdBy', 'name email role')
        .sort({ createdAt: -1 });

    const hrList = await User.find({ role: 'hr' }).select('-password').sort({ createdAt: -1 });
    const managerList = await User.find({ role: 'manager' }).select('-password').sort({ createdAt: -1 });

    res.json({
        admin: {
            _id: admin._id,
            username: admin.username,
            email: admin.email || '',
            phone: admin.phone || '',
            department: admin.department || '',
            profilePhoto: admin.profilePhoto || ''
        },
        hrs: hrList,
        managers: managerList,
        managerTeamTasks
    });
}));

// Update admin basic profile (username + contact + profile photo)
router.put('/profile/basic', protect, adminOnly, upload.single('profilePhoto'), asyncHandler(async (req, res) => {
    const admin = await Admin.findById(req.user._id);
    if (!admin) {
        res.status(404);
        throw new Error('Admin not found');
    }

    const { username, phone, department } = req.body;
    const nextUsername = username ? normalizeUsername(username) : admin.username;
    if (nextUsername && nextUsername !== admin.username) {
        try {
            await assertUniqueIdentity({ username: nextUsername, excludeAdminId: admin._id });
        } catch (identityError) {
            res.status(400);
            throw new Error(identityError.message);
        }
        admin.username = nextUsername;
    }

    if (phone !== undefined) {
        admin.phone = phone;
    }

    if (department !== undefined) {
        admin.department = department;
    }

    if (req.file && req.file.filename) {
        admin.profilePhoto = `/uploads/${req.file.filename}`;
    }

    const updated = await admin.save();
    res.json({
        _id: updated._id,
        username: updated.username,
        email: updated.email || '',
        phone: updated.phone || '',
        department: updated.department || '',
        profilePhoto: updated.profilePhoto || ''
    });
}));

// Update admin credentials (password only)
router.put('/credentials', protect, adminOnly, asyncHandler(async (req, res) => {
    const admin = await Admin.findById(req.user._id);
    if (!admin) {
        res.status(404);
        throw new Error('Admin not found');
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

    admin.password = password;
    await admin.save();
    res.json({ message: 'Password updated successfully.' });
}));

// Update admin profile
router.put('/profile', protect, adminOnly, asyncHandler(async (req, res) => {
    const admin = await Admin.findById(req.user._id);
    if (!admin) {
        res.status(404);
        throw new Error('Admin not found');
    }

    const { username, email, password, phone, department } = req.body;

    const nextUsername = username ? normalizeUsername(username) : admin.username;
    const nextEmail = email !== undefined ? normalizeEmail(email) : admin.email;

    if (nextUsername && nextUsername !== admin.username) {
        try {
            await assertUniqueIdentity({ username: nextUsername, excludeAdminId: admin._id });
        } catch (identityError) {
            res.status(400);
            throw new Error(identityError.message);
        }
        admin.username = nextUsername;
    }

    if (email !== undefined) {
        try {
            await assertUniqueIdentity({ email: nextEmail, excludeAdminId: admin._id });
        } catch (identityError) {
            res.status(400);
            throw new Error(identityError.message);
        }
        admin.email = nextEmail;
    }

    if (phone !== undefined) {
        admin.phone = phone;
    }

    if (department !== undefined) {
        admin.department = department;
    }

    if (password) {
        admin.password = password;
    }

    const updated = await admin.save();
    res.json({
        _id: updated._id,
        username: updated.username,
        email: updated.email || '',
        phone: updated.phone || '',
        department: updated.department || ''
    });
}));

// Admin Login (GET) - simple browser form for testing/clickable links
router.get('/login', (req, res) => {
        // Allow browser autofill on admin login only
        res.send(`
            <html>
                <body style="font-family:Arial,Helvetica,sans-serif;">
                    <h2>Admin Login</h2>
                    <form method="post" action="/api/admin/login" autocomplete="off">
                        <!-- Hidden dummy inputs to discourage browser autofill -->
                        <input type="text" name="_fakeusernameremembered" style="display:none" autocomplete="off" />
                        <input type="password" name="_fakepasswordremembered" style="display:none" autocomplete="off" />
                        <label>Username: <input name="username" autocomplete="off" /></label><br/>
                        <label>Password: <input type="password" name="password" autocomplete="off" /></label><br/>
                        <button type="submit">Login</button>
                    </form>
                    <p>Use a REST client to call POST /api/admin/login with JSON for API testing.</p>
                </body>
            </html>
        `);
});

// Create new user
router.post('/users', protect, adminOnly, asyncHandler(async (req, res) => {
    const { name, password } = req.body;
    const email = normalizeEmail(req.body.email);

    try {
        await assertUniqueIdentity({ email });
    } catch (identityError) {
        res.status(400);
        throw new Error(identityError.message);
    }

    const user = await User.create({
        name,
        email,
        password
    });

    if (user) {
        res.status(201).json({
            _id: user._id,
            name: user.name,
            email: user.email
        });
    } else {
        res.status(400);
        throw new Error('Invalid user data');
    }
}));

// Admin: Manage HR users (HRs are stored in User collection with role 'hr')
// Create HR
router.post('/hr', protect, adminOnly, asyncHandler(async (req, res) => {
    const { name, password } = req.body;
    const email = normalizeEmail(req.body.email);

    try {
        await assertUniqueIdentity({ email });
    } catch (identityError) {
        res.status(400);
        throw new Error(identityError.message);
    }

    const user = await User.create({ name, email, password, role: 'hr' });
    if (user) {
        await trySendWelcomeEmail({
            email: user.email,
            name: user.name,
            role: 'hr',
            password,
            errorMessage: 'Welcome email failed but HR created:'
        });

        res.status(201).json({ _id: user._id, name: user.name, email: user.email, role: user.role });
    } else {
        res.status(400);
        throw new Error('Invalid HR data');
    }
}));

// List HRs
router.get('/hr', protect, adminOnly, asyncHandler(async (req, res) => {
    const hrs = await User.find({ role: 'hr' }).select('-password');
    res.json(hrs);
}));

// Update HR
router.put('/hr/:id', protect, adminOnly, asyncHandler(async (req, res) => {
    const hr = await User.findById(req.params.id);
    if (!hr || hr.role !== 'hr') {
        res.status(404);
        throw new Error('HR not found');
    }

    hr.name = req.body.name || hr.name;
    const nextEmail = req.body.email !== undefined ? normalizeEmail(req.body.email) : hr.email;
    if (nextEmail !== hr.email) {
        try {
            await assertUniqueIdentity({ email: nextEmail, excludeUserId: hr._id });
        } catch (identityError) {
            res.status(400);
            throw new Error(identityError.message);
        }
    }
    hr.email = nextEmail;
    const passwordProvided = !!(req.body.password);
    if (passwordProvided) hr.password = req.body.password;

    const updated = await hr.save();

    if (passwordProvided) {
        await trySendNewPasswordEmail({
            email: updated.email,
            name: updated.name,
            password: req.body.password,
            role: 'admin',
            errorMessage: 'Failed to send updated credentials email to HR:'
        });
    }

    res.json({ _id: updated._id, name: updated.name, email: updated.email });
}));

// Delete HR (and their related data) - admin only
router.delete('/hr/:id', protect, adminOnly, asyncHandler(async (req, res) => {
    const hr = await User.findById(req.params.id);
    if (!hr || hr.role !== 'hr') {
        res.status(404);
        throw new Error('HR not found');
    }
    await User.deleteOne({ _id: hr._id });
    // Note: depending on business rules you may want to reassign or delete managers created by this HR
    res.json({ message: 'HR removed' });
}));

// Get all users
router.get('/users', protect, adminOnly, asyncHandler(async (req, res) => {
    const users = await User.find({}).select('-password');
    res.json(users);
}));

// Get single user
router.get('/users/:id', protect, adminOnly, asyncHandler(async (req, res) => {
    const user = await User.findById(req.params.id).select('-password');
    if (!user) {
        res.status(404);
        throw new Error('User not found');
    }
    res.json(user);
}));

// Update user
router.put('/users/:id', protect, adminOnly, asyncHandler(async (req, res) => {
    const user = await User.findById(req.params.id);
    if (!user) {
        res.status(404);
        throw new Error('User not found');
    }

    user.name = req.body.name || user.name;
    const nextEmail = req.body.email !== undefined ? normalizeEmail(req.body.email) : user.email;
    if (nextEmail !== user.email) {
        try {
            await assertUniqueIdentity({ email: nextEmail, excludeUserId: user._id });
        } catch (identityError) {
            res.status(400);
            throw new Error(identityError.message);
        }
    }
    user.email = nextEmail;
    if (req.body.password) user.password = req.body.password;

    const updated = await user.save();
    res.json({ _id: updated._id, name: updated.name, email: updated.email });
}));

// Delete user (and their tasks)
router.delete('/users/:id', protect, adminOnly, asyncHandler(async (req, res) => {
    const user = await User.findById(req.params.id);
    if (!user) {
        res.status(404);
        throw new Error('User not found');
    }

    // Remove tasks assigned to this user
    await Task.deleteMany({ assignedTo: user._id });
    await Team.updateMany(
        { members: user._id },
        { $pull: { members: user._id } }
    );
    await Message.deleteMany({
        $or: [
            { sender: user._id, senderModel: 'User' },
            { recipient: user._id, recipientModel: 'User' }
        ]
    });
    await Notification.deleteMany({ recipient: user._id });
    await User.deleteOne({ _id: user._id });

    res.json({ message: 'User and associated data removed' });
}));

// Get all tasks
router.get('/tasks', protect, adminOnly, asyncHandler(async (req, res) => {
    const tasks = await Task.find({})
        .populate('assignedTo', 'name email role')
        .populate('assignedTeam', 'name')
        .populate('createdBy', 'username name email role')
        .sort({ createdAt: -1 });
    res.json(tasks);
}));

// Get all teams across the organization
router.get('/teams', protect, adminOnly, asyncHandler(async (req, res) => {
    const teams = await Team.find({})
        .populate('manager', 'name email role')
        .populate('members', 'name email role')
        .sort({ createdAt: -1 });
    res.json(teams);
}));

router.get('/performance-report', protect, adminOnly, asyncHandler(async (req, res) => {
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

router.get('/performance-report/user/:userId', protect, adminOnly, asyncHandler(async (req, res) => {
    const user = await User.findById(req.params.userId).select('_id name email role isActive').lean();
    if (!user) {
        res.status(404);
        throw new Error('User not found');
    }

    const tasks = await Task.find({})
        .select('title status deadline updatedAt manager assignedTo assignedTeam stageAssignments history managerDecision createdAt')
        .populate('assignedTeam', 'name')
        .lean();

    const report = buildPerformanceReport({ users: [user], tasks });
    res.json({
        generatedAt: new Date(),
        user,
        report: report.users[0] || null,
        chart: report.chart
    });
}));

router.get('/performance-report/team/:teamId', protect, adminOnly, asyncHandler(async (req, res) => {
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

// Update task
router.put('/tasks/:id', protect, adminOnly, asyncHandler(async (req, res) => {
    const task = await Task.findById(req.params.id);

    if (!task) {
        res.status(404);
        throw new Error('Task not found');
    }

    const normalizeId = (value) => {
        if (value === undefined || value === null || value === '') {
            return null;
        }
        return value.toString();
    };

    const { title, description, deadline, status } = req.body;
    if (title) task.title = title;
    if (description) task.description = description;
    if (deadline) task.deadline = deadline;
    if (status) {
        const validStatuses = [
            'Client Requested',
            'Awaiting Manager Assignment',
            'Design In Progress',
            'Design Completed - Pending Manager Review',
            'Development In Progress',
            'Development Completed - Pending Manager Review',
            'Testing In Progress',
            'Testing Completed - Pending Manager Final Review',
            'Awaiting HR Review',
            'Awaiting Client Review',
            'Changes Requested',
            'Completed'
        ];
        if (!validStatuses.includes(status)) {
            res.status(400);
            throw new Error('Invalid status value');
        }
        task.status = status;
    }

    const hasAssignedTo = Object.prototype.hasOwnProperty.call(req.body, 'assignedTo');
    const hasAssignedTeam = Object.prototype.hasOwnProperty.call(req.body, 'assignedTeam');

    let nextAssignedTo = task.assignedTo ? task.assignedTo.toString() : null;
    let nextAssignedTeam = task.assignedTeam ? task.assignedTeam.toString() : null;

    let assignedUserDoc = null;
    if (hasAssignedTo) {
        const normalizedUserId = normalizeId(req.body.assignedTo);
        if (normalizedUserId) {
            assignedUserDoc = await User.findById(normalizedUserId);
            if (!assignedUserDoc) {
                res.status(404);
                throw new Error('Assigned user not found');
            }
            nextAssignedTo = assignedUserDoc._id.toString();
        } else {
            nextAssignedTo = null;
        }
    }

    let assignedTeamDoc = null;
    if (hasAssignedTeam) {
        const normalizedTeamId = normalizeId(req.body.assignedTeam);
        if (normalizedTeamId) {
            assignedTeamDoc = await Team.findById(normalizedTeamId);
            if (!assignedTeamDoc) {
                res.status(404);
                throw new Error('Assigned team not found');
            }
            nextAssignedTeam = assignedTeamDoc._id.toString();
        } else {
            nextAssignedTeam = null;
        }
    }

    if ((hasAssignedTo || hasAssignedTeam) && !nextAssignedTo && !nextAssignedTeam) {
        res.status(400);
        throw new Error('Task must remain assigned to at least one user or team');
    }

    if (nextAssignedTo && nextAssignedTeam) {
        const team = assignedTeamDoc || await Team.findById(nextAssignedTeam).select('members');
        const isMember = team && team.members.some(member => member.toString() === nextAssignedTo);
        if (!isMember) {
            res.status(400);
            throw new Error('Assigned user is not part of the selected team');
        }
    }

    task.assignedTo = nextAssignedTo ? nextAssignedTo : null;
    task.assignedTeam = nextAssignedTeam ? nextAssignedTeam : null;

    const saved = await task.save();
    await saved.populate('assignedTo', 'name email role');
    await saved.populate('assignedTeam', 'name');
    await saved.populate('createdBy', 'username name email role');
    res.json(saved);
}));

// Delete task
router.delete('/tasks/:id', protect, adminOnly, asyncHandler(async (req, res) => {
    const task = await Task.findById(req.params.id);
    
    if (!task) {
        res.status(404);
        throw new Error('Task not found');
    }

    await Task.deleteOne({ _id: task._id });
    res.json({ message: 'Task removed' });
}));

// Reset Database - Delete selected data except current admin
router.post('/reset-database', protect, adminOnly, asyncHandler(async (req, res) => {
    const currentAdminId = req.user._id;
    const { options } = req.body;

    // If no options provided, don't delete anything
    if (!options || typeof options !== 'object') {
        res.status(400);
        throw new Error('Please select at least one option to reset');
    }

    const deletedItems = [];

    // Delete selected collections
    if (options.users) {
        await User.deleteMany({});
        deletedItems.push('Users');
    }

    if (options.tasks) {
        await Task.deleteMany({});
        deletedItems.push('Tasks');
    }

    if (options.teams) {
        await Team.deleteMany({});
        deletedItems.push('Teams');
    }

    if (options.messages) {
        await Message.deleteMany({});
        deletedItems.push('Messages');
    }

    if (options.notifications) {
        await Notification.deleteMany({});
        deletedItems.push('Notifications');
    }

    if (deletedItems.length === 0) {
        res.status(400);
        throw new Error('No items selected for deletion');
    }

    res.json({ 
        message: `Database reset successfully. Deleted: ${deletedItems.join(', ')}`,
        deletedItems,
        remainingAdmin: currentAdminId 
    });
}));

// Get pending HR password reset requests
router.get('/password-requests', protect, adminOnly, asyncHandler(async (req, res) => {
    try {
        const requests = await PasswordReset.find({
            userType: 'hr-request',
            status: 'pending'
        })
        .populate('requestedBy', 'name email role')
        .sort({ createdAt: -1 });

        res.json(requests);
    } catch (error) {
        console.error('Error fetching password requests:', error);
        res.json([]); // Return empty array on error instead of throwing
    }
}));

// Get all users with management data
router.get('/user-management', protect, adminOnly, asyncHandler(async (req, res) => {
    const users = await User.find({})
        .select('name email role isActive createdAt')
        .sort({ createdAt: -1 });
    res.json(users);
}));

// Toggle user active status
router.patch('/users/:id/toggle-status', protect, adminOnly, asyncHandler(async (req, res) => {
    const user = await User.findById(req.params.id);
    
    if (!user) {
        res.status(404);
        throw new Error('User not found');
    }

    user.isActive = !user.isActive;
    await user.save();

    res.json({
        message: `User ${user.isActive ? 'activated' : 'deactivated'} successfully`,
        user: {
            _id: user._id,
            name: user.name,
            email: user.email,
            role: user.role,
            isActive: user.isActive
        }
    });
}));

// Admin resets HR password
router.post('/reset-hr-password', protect, adminOnly, asyncHandler(async (req, res) => {
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

    // Find the HR user
    const hrUser = await User.findOne({ email: resetRequest.email });
    if (!hrUser) {
        res.status(404);
        throw new Error('HR user not found');
    }

    // Update HR password
    hrUser.password = newPassword;
    await hrUser.save();

    // Send email to HR with new password
    await trySendNewPasswordEmail({
        email: hrUser.email,
        name: hrUser.name,
        password: newPassword,
        role: 'hr',
        errorMessage: 'Failed to send new password email to HR:'
    });

    // Update reset request status
    resetRequest.status = 'completed';
    resetRequest.processedBy = req.user._id;
    await resetRequest.save();

    // Delete the request after processing
    await PasswordReset.deleteOne({ _id: resetRequest._id });

    res.json({
        message: `Password reset successfully for ${hrUser.name}. An email has been sent with the new password.`
    });
}));

module.exports = router;