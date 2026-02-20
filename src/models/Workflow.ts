
import mongoose from 'mongoose';

const workflowSchema = new mongoose.Schema({
    nodes: { type: Array, required: true },
    edges: { type: Array, required: true },
    name: { type: String, default: 'Untitled Workflow' },
    createdBy: { type: String, default: 'default-user' }
}, { timestamps: true });

export const Workflow = mongoose.model('Workflow', workflowSchema);
