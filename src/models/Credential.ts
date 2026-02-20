
import mongoose from 'mongoose';

const credentialSchema = new mongoose.Schema({
    service: { type: String, required: true }, // e.g., 'groq', 'openai'
    name: { type: String, required: true },
    value: { type: String, required: true },
    userId: { type: String, required: true },
    createdAt: { type: Date, default: Date.now }
});

export const Credential = mongoose.model('Credential', credentialSchema);
