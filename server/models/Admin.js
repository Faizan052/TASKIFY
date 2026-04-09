const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const adminSchema = new mongoose.Schema({
    username: {
        type: String,
        required: true,
        trim: true,
        lowercase: true,
        unique: true
    },
    phone: {
        type: String,
        default: ''
    },
    department: {
        type: String,
        default: ''
    },
    email: {
        type: String,
        lowercase: true,
        trim: true,
        default: ''
    },
    password: {
        type: String,
        required: true
    },
    profilePhoto: {
        type: String,
        default: ''
    },
    lastSeen: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true
});

adminSchema.methods.matchPassword = async function(enteredPassword) {
    return await bcrypt.compare(enteredPassword, this.password);
};

adminSchema.pre('save', async function(next) {
    if (typeof this.username === 'string') {
        this.username = this.username.trim().toLowerCase();
    }
    if (typeof this.email === 'string') {
        this.email = this.email.trim().toLowerCase();
    }

    if (!this.isModified('password')) {
        return next();
    }
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    return next();
});

const Admin = mongoose.model('Admin', adminSchema);

module.exports = Admin;