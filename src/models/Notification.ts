import mongoose from 'mongoose';

const notificationSchema = new mongoose.Schema({
    toUser: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    fromUser: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, enum: ['like', 'reply', 'mention'], required: true },
    message: { type: String, required: true },
    relatedId: { type: mongoose.Schema.Types.ObjectId, ref: 'Message' },
    isRead: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now }
});

export const Notification = mongoose.model('Notification', notificationSchema);
