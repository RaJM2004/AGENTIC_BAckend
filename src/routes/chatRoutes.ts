
import express from 'express';
import { getMessages, sendMessage, likeMessage, getNotifications, markRead } from '../controllers/chatController';
import { authMiddleware } from '../middleware/auth';

const router = express.Router();

router.get('/messages', authMiddleware, getMessages);
router.post('/messages', authMiddleware, sendMessage);
router.post('/messages/:messageId/like', authMiddleware, likeMessage);
router.get('/notifications', authMiddleware, getNotifications);
router.put('/notifications/:notificationId/read', authMiddleware, markRead);

export default router;
