import { Request, Response } from 'express';
import { Message } from '../models/Message';
import { Notification } from '../models/Notification';
import { User } from '../models/User';

interface AuthRequest extends Request {
    user?: { userId: string };
}

export const getMessages = async (req: AuthRequest, res: Response) => {
    try {
        const { channel = 'general' } = req.query;
        const messages = await Message.find({ channel })
            .sort({ createdAt: -1 }) // Newest first for fetching
            .limit(50)
            .populate('replyTo', 'content authorName');

        res.json(messages.reverse()); // return oldest first for chat flow
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

export const sendMessage = async (req: AuthRequest, res: Response) => {
    try {
        const { content, channel = 'general', replyToId, attachments = [] } = req.body;
        const userId = req.user?.userId;

        const user = await User.findById(userId);
        if (!user) return res.status(404).json({ error: 'User not found' });

        const message = new Message({
            content,
            author: userId,
            authorName: user.name,
            channel,
            replyTo: replyToId,
            attachments
        });

        await message.save();

        // Handle Notifications
        if (replyToId) {
            const originalMsg = await Message.findById(replyToId);
            if (originalMsg && originalMsg.author.toString() !== userId) {
                await Notification.create({
                    toUser: originalMsg.author,
                    fromUser: userId,
                    type: 'reply',
                    message: `${user.name} replied to your message in #${channel}`,
                    relatedId: message._id
                });
            }
        }

        const populated = await Message.findById(message._id).populate('replyTo', 'content authorName');
        res.status(201).json(populated);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

export const likeMessage = async (req: AuthRequest, res: Response) => {
    try {
        const { messageId } = req.params;
        const userId = req.user?.userId;

        const message = await Message.findById(messageId);
        if (!message) return res.status(404).json({ error: 'Message not found' });

        const user = await User.findById(userId);
        if (!user) return res.status(404).json({ error: 'User not found' });

        const likeIndex = message.likes.indexOf(userId as any);
        let isLike = false;

        if (likeIndex === -1) {
            // Like
            message.likes.push(userId as any);
            isLike = true;

            // Notify author if not self-like
            if (message.author.toString() !== userId) {
                // Check if notification already exists to avoid spamming toggle
                const existing = await Notification.findOne({
                    toUser: message.author,
                    fromUser: userId,
                    type: 'like',
                    relatedId: message._id
                });

                if (!existing) {
                    await Notification.create({
                        toUser: message.author,
                        fromUser: userId,
                        type: 'like',
                        message: `${user.name} liked your message`,
                        relatedId: message._id
                    });
                }
            }
        } else {
            // Unlike
            message.likes.splice(likeIndex, 1);
        }

        await message.save();
        res.json({ message, isLike });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

export const getNotifications = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user?.userId;
        const notifications = await Notification.find({ toUser: userId })
            .sort({ createdAt: -1 })
            .limit(20)
            .populate('fromUser', 'name');

        res.json(notifications);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

export const markRead = async (req: AuthRequest, res: Response) => {
    try {
        const { notificationId } = req.params;
        await Notification.findByIdAndUpdate(notificationId, { isRead: true });
        res.json({ success: true });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};
