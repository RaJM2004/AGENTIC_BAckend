
import mongoose from 'mongoose';

const executionSchema = new mongoose.Schema({
    workflowId: { type: mongoose.Schema.Types.ObjectId, ref: 'Workflow', required: true },
    userId: { type: String, required: true },
    status: { type: String, enum: ['running', 'completed', 'failed'], default: 'running' },
    nodeLogs: { type: Array, default: [] }, // Array of { nodeId, status, input, output, logs, startTime, endTime }
    startedAt: { type: Date, default: Date.now },
    finishedAt: { type: Date }
});

export const Execution = mongoose.model('Execution', executionSchema);
