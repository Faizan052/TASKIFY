const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true
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
        required: true,
        trim: true,
        lowercase: true,
        unique: true
    },
    password: {
        type: String,
        required: true
    }
    ,
    role: {
        type: String,
        enum: ['hr', 'manager', 'developer', 'designer', 'tester', 'client'],
        required: true,
        default: 'client'
    },
    categories: {
        type: [String],
        enum: ['website', 'mobile-app', 'desktop-app', 'testing', 'updation', 'design', 'api', 'database', 'other'],
        default: [],
        validate: {
            validator: function validateCategories(value) {
                if (!Array.isArray(value)) return false;
                return value.length === new Set(value).size;
            },
            message: 'Duplicate categories are not allowed'
        },
        required: function requiredCategories() {
            return ['manager', 'developer', 'designer', 'tester'].includes(this.role);
        }
    },
    category: {
        type: String,
        enum: ['website', 'mobile-app', 'desktop-app', 'testing', 'updation', 'design', 'api', 'database', 'other'],
        default: undefined
    },
    profilePhoto: {
        type: String,
        default: ''
    },
    lastSeen: {
        type: Date,
        default: Date.now
    },
    isActive: {
        type: Boolean,
        default: true
    },
    approvalStatus: {
        type: String,
        enum: ['pending', 'approved', 'rejected'],
        default: 'approved'
    },
    approvalReviewedAt: {
        type: Date,
        default: null
    }
}, {
    timestamps: true
});

userSchema.methods.matchPassword = async function(enteredPassword) {
    return await bcrypt.compare(enteredPassword, this.password);
};

userSchema.pre('validate', function(next) {
    if (typeof this.category === 'string' && this.category.trim() === '') {
        this.category = undefined;
    }
    return next();
});

userSchema.pre('save', async function(next) {
    if (typeof this.email === 'string') {
        this.email = this.email.trim().toLowerCase();
    }

    if (Array.isArray(this.categories)) {
        this.categories = Array.from(new Set(this.categories.filter(Boolean)));
    }

    if ((!Array.isArray(this.categories) || this.categories.length === 0) && this.category) {
        this.categories = [this.category];
    }

    if ((!this.category || this.category === '') && Array.isArray(this.categories) && this.categories.length > 0) {
        this.category = this.categories[0];
    }

    if (!this.isModified('password')) {
        return next();
    }
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    return next();
});

// Indexes for improved query performance
userSchema.index({ email: 1 });
userSchema.index({ role: 1 });
userSchema.index({ role: 1, category: 1 });
userSchema.index({ role: 1, categories: 1 });
userSchema.index({ isActive: 1, role: 1 });

module.exports = mongoose.model('User', userSchema);