import mongoose from 'mongoose';

const messageSchema = new mongoose.Schema({
    content: { type: String, required: true },
    author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    authorName: { type: String, required: true }, // Cache name to avoid excessive populates
    channel: { type: String, default: 'general' },
    likes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    replyTo: { type: mongoose.Schema.Types.ObjectId, ref: 'Message' },
    attachments: [{ type: String }], // Base64 or URLs
    createdAt: { type: Date, default: Date.now }
});

export const Message = mongoose.model('Message', messageSchema);
