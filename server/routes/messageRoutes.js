const express = require('express');
const router = express.Router();
const asyncHandler = require('express-async-handler');
const Message = require('../models/Message');
const User = require('../models/User');
const Admin = require('../models/Admin');
const { protect } = require('../middleware/auth');
const { isValidObjectId } = require('../utils/validation');

const ONLINE_WINDOW_MS = 5 * 60 * 1000;

const buildPresence = (lastSeen) => {
    if (!lastSeen) {
        return { isOnline: false, lastSeen: null };
    }
    const seenDate = new Date(lastSeen);
    if (Number.isNaN(seenDate.getTime())) {
        return { isOnline: false, lastSeen: null };
    }
    return {
        isOnline: (Date.now() - seenDate.getTime()) <= ONLINE_WINDOW_MS,
        lastSeen: seenDate
    };
};

const hasExistingConversation = async (currentUserId, currentUserModel, recipientId) => {
    if (!recipientId) return false;
    const existing = await Message.exists({
        $or: [
            { sender: currentUserId, senderModel: currentUserModel, recipient: recipientId },
            { recipient: currentUserId, recipientModel: currentUserModel, sender: recipientId }
        ]
    });
    return Boolean(existing);
};

// Helper to get allowed contacts based on role
const getAllowedContacts = async (user, isAdmin) => {
    const contacts = [];

    if (isAdmin) {
        // Admin can message HR and Managers
        const hrs = await User.find({ role: 'hr' }).select('_id name email role profilePhoto lastSeen');
        const managers = await User.find({ role: 'manager' }).select('_id name email role profilePhoto lastSeen');
        contacts.push(...hrs.map(u => ({ ...u.toObject(), model: 'User' })));
        contacts.push(...managers.map(u => ({ ...u.toObject(), model: 'User' })));
    } else {
        const role = user.role;

        if (role === 'hr') {
            // HR can message Admin, Managers, and Clients
            const admin = await Admin.findOne().select('_id username email profilePhoto lastSeen');
            if (admin) contacts.push({ ...admin.toObject(), name: admin.username, model: 'Admin', role: 'admin' });
            
            const managers = await User.find({ role: 'manager' }).select('_id name email role profilePhoto lastSeen');
            const clients = await User.find({ role: 'client' }).select('_id name email role profilePhoto lastSeen');
            contacts.push(...managers.map(u => ({ ...u.toObject(), model: 'User' })));
            contacts.push(...clients.map(u => ({ ...u.toObject(), model: 'User' })));
        } else if (role === 'manager') {
            // Manager can message HR and Team members
            const hrs = await User.find({ role: 'hr' }).select('_id name email role profilePhoto lastSeen');
            const teamMembers = await User.find({ 
                role: { $in: ['developer', 'designer', 'tester'] } 
            }).select('_id name email role profilePhoto lastSeen');
            contacts.push(...hrs.map(u => ({ ...u.toObject(), model: 'User' })));
            contacts.push(...teamMembers.map(u => ({ ...u.toObject(), model: 'User' })));
        } else if (['developer', 'designer', 'tester'].includes(role)) {
            // Team members can message only Managers
            const managers = await User.find({ role: 'manager' }).select('_id name email role profilePhoto lastSeen');
            contacts.push(...managers.map(u => ({ ...u.toObject(), model: 'User' })));
        } else if (role === 'client') {
            // Client can message HR
            const hrs = await User.find({ role: 'hr' }).select('_id name email role profilePhoto lastSeen');
            contacts.push(...hrs.map(u => ({ ...u.toObject(), model: 'User' })));
        }
    }

    return contacts.map((contact) => {
        const presence = buildPresence(contact.lastSeen);
        return {
            ...contact,
            isOnline: presence.isOnline,
            lastSeen: presence.lastSeen
        };
    });
};

// Get list of contacts user can message
router.get('/contacts', protect, asyncHandler(async (req, res) => {
    const contacts = await getAllowedContacts(req.user, req.isAdmin);
    res.json(contacts);
}));

// Get conversation with a specific user
router.get('/conversation/:recipientId', protect, asyncHandler(async (req, res) => {
    const { recipientId } = req.params;
    if (!isValidObjectId(recipientId)) {
        res.status(400);
        throw new Error('Invalid recipient id');
    }
    const currentUserId = req.user._id;
    const currentUserModel = req.isAdmin ? 'Admin' : 'User';

    // Verify user can message this recipient
    const contacts = await getAllowedContacts(req.user, req.isAdmin);
    const allowedByRole = contacts.some(c => c._id.toString() === recipientId);
    const allowedByHistory = await hasExistingConversation(currentUserId, currentUserModel, recipientId);
    const canMessage = allowedByRole || allowedByHistory;
    
    if (!canMessage) {
        res.status(403);
        throw new Error('Not authorized to message this user');
    }

    // Get all messages between these two users
    const messages = await Message.find({
        sender: { $type: 'objectId' },
        recipient: { $type: 'objectId' },
        $or: [
            { sender: currentUserId, senderModel: currentUserModel, recipient: recipientId },
            { sender: recipientId, recipient: currentUserId, recipientModel: currentUserModel }
        ]
    })
    .sort({ createdAt: 1 })
    .populate('sender', 'name username email profilePhoto')
    .populate('recipient', 'name username email profilePhoto');

    res.json(messages);
}));

// Send a message
router.post('/send', protect, asyncHandler(async (req, res) => {
    const { recipientId, recipientModel, content } = req.body;

    if (!recipientId || !content || !content.trim()) {
        res.status(400);
        throw new Error('Recipient and message content are required');
    }
    if (!isValidObjectId(recipientId)) {
        res.status(400);
        throw new Error('Invalid recipient id');
    }

    // Verify user can message this recipient
    const contacts = await getAllowedContacts(req.user, req.isAdmin);
    const allowedByRole = contacts.some(c => c._id.toString() === recipientId);
    const allowedByHistory = await hasExistingConversation(req.user._id, req.isAdmin ? 'Admin' : 'User', recipientId);
    const canMessage = allowedByRole || allowedByHistory;
    
    if (!canMessage) {
        res.status(403);
        throw new Error('Not authorized to message this user');
    }

    const message = await Message.create({
        sender: req.user._id,
        senderModel: req.isAdmin ? 'Admin' : 'User',
        recipient: recipientId,
        recipientModel: recipientModel || 'User',
        content: content.trim()
    });

    const populated = await Message.findById(message._id)
        .populate('sender', 'name username email profilePhoto')
        .populate('recipient', 'name username email profilePhoto');

    res.status(201).json(populated);
}));

// Mark messages as read
router.put('/read/:recipientId', protect, asyncHandler(async (req, res) => {
    const { recipientId } = req.params;
    if (!isValidObjectId(recipientId)) {
        res.status(400);
        throw new Error('Invalid recipient id');
    }
    const currentUserId = req.user._id;
    const currentUserModel = req.isAdmin ? 'Admin' : 'User';

    await Message.updateMany(
        {
            sender: recipientId,
            recipient: currentUserId,
            recipientModel: currentUserModel,
            read: false
        },
        {
            $set: { read: true, readAt: new Date() }
        }
    );

    res.json({ message: 'Messages marked as read' });
}));

// Get unread message count
router.get('/unread-count', protect, asyncHandler(async (req, res) => {
    const currentUserId = req.user._id;
    const currentUserModel = req.isAdmin ? 'Admin' : 'User';

    const count = await Message.countDocuments({
        sender: { $type: 'objectId' },
        recipient: { $type: 'objectId' },
        recipient: currentUserId,
        recipientModel: currentUserModel,
        read: false
    });

    res.json({ count });
}));

// Get recent conversations (list of users with last message)
router.get('/conversations', protect, asyncHandler(async (req, res) => {
    const currentUserId = req.user._id;
    const currentUserModel = req.isAdmin ? 'Admin' : 'User';

    // Get all messages involving current user
    const messages = await Message.find({
        sender: { $type: 'objectId' },
        recipient: { $type: 'objectId' },
        $or: [
            { sender: currentUserId, senderModel: currentUserModel },
            { recipient: currentUserId, recipientModel: currentUserModel }
        ]
    })
    .sort({ createdAt: -1 })
    .populate('sender', 'name username email profilePhoto role lastSeen')
    .populate('recipient', 'name username email profilePhoto role lastSeen');

    // Group by conversation partner
    const conversationMap = new Map();
    
    for (const msg of messages) {
        const partnerId = msg.sender._id.toString() === currentUserId.toString() 
            ? msg.recipient._id.toString() 
            : msg.sender._id.toString();
        
        if (!conversationMap.has(partnerId)) {
            const partner = msg.sender._id.toString() === currentUserId.toString() 
                ? msg.recipient 
                : msg.sender;

            if (!partner) {
                continue;
            }
            
            const unreadCount = await Message.countDocuments({
                sender: partnerId,
                recipient: currentUserId,
                recipientModel: currentUserModel,
                read: false
            });

            conversationMap.set(partnerId, {
                user: {
                    _id: partner._id,
                    name: partner.name || partner.username || 'Unknown User',
                    email: partner.email,
                    profilePhoto: partner.profilePhoto,
                    role: partner.role || (msg.sender._id.toString() === currentUserId.toString() ? msg.recipientModel : msg.senderModel) || 'user',
                    model: msg.sender._id.toString() === currentUserId.toString() ? msg.recipientModel : msg.senderModel,
                    ...buildPresence(partner.lastSeen)
                },
                lastMessage: msg.content,
                lastMessageAt: msg.createdAt,
                unreadCount
            });
        }
    }

    const conversations = Array.from(conversationMap.values());
    res.json(conversations);
}));

module.exports = router;
