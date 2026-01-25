const mongoose = require('mongoose');

const assignmentStageSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null
    },
    deadline: {
        type: Date,
        default: null
    },
    status: {
        type: String,
        enum: ['pending', 'in_progress', 'submitted', 'approved', 'revisions']
    },
    submittedAt: {
        type: Date,
        default: null
    },
    submissionAttachmentId: {
        type: mongoose.Schema.Types.ObjectId,
        default: null
    }
}, { _id: false });

const attachmentSchema = new mongoose.Schema({
    stage: {
        type: String,
        enum: [
            'client-request',
            'design',
            'development',
            'testing',
            'manager',
            'hr',
            'client-feedback'
        ],
        required: true
    },
    filename: {
        type: String,
        required: true
    },
    originalName: {
        type: String,
        required: true
    },
    size: {
        type: Number,
        default: 0
    },
    mimeType: {
        type: String,
        default: ''
    },
    uploadedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    uploadedAt: {
        type: Date,
        default: () => new Date()
    }
}, { _id: true });

const taskSchema = new mongoose.Schema({
    title: {
        type: String,
        required: true
    },
    description: {
        type: String,
        required: true
    },
    deadline: {
        type: Date,
        required: true
    },
    status: {
        type: String,
        enum: [
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
        ],
        default: 'Client Requested'
    },
    currentStage: {
        type: String,
        enum: [
            'client_request',
            'hr_review',
            'manager_planning',
            'design',
            'manager_design_review',
            'development',
            'manager_development_review',
            'testing',
            'manager_final_review',
            'hr_delivery',
            'client_review',
            'completed',
            'changes_requested'
        ],
        default: 'client_request'
    },
    assignedTo: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    assignedTeam: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Team'
    },
    manager: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    stageAssignments: {
        designer: {
            type: assignmentStageSchema,
            default: () => ({ status: 'pending' })
        },
        developer: {
            type: assignmentStageSchema,
            default: () => ({ status: 'pending' })
        },
        tester: {
            type: assignmentStageSchema,
            default: () => ({ status: 'pending' })
        }
    },
    attachments: {
        type: [attachmentSchema],
        default: []
    },
    changeRequests: {
        type: [{
            comment: { type: String, required: true },
            createdAt: { type: Date, default: () => new Date() },
            createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }
        }],
        default: []
    },
    history: {
        type: [{
            stage: { type: String, default: '' },
            status: { type: String, default: '' },
            note: { type: String, default: '' },
            actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
            createdAt: { type: Date, default: () => new Date() }
        }],
        default: []
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        refPath: 'createdByModel',
        required: true
    },
    createdByModel: {
        type: String,
        enum: ['User', 'Admin'],
        required: true
    },
    createdByRole: {
        type: String,
        enum: ['admin', 'hr', 'manager', 'client'],
        required: true
    }
}, {
    timestamps: true
});

module.exports = mongoose.model('Task', taskSchema);