const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
    recipient: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    message: {
        type: String,
        required: true
    },
    task: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Task',
        default: null
    },
    stage: {
        type: String,
        default: ''
    },
    read: {
        type: Boolean,
        default: false
    },
    meta: {
        type: Object,
        default: () => ({})
    }
}, {
    timestamps: true
});

module.exports = mongoose.model('Notification', notificationSchema);
