import { Router } from 'express';
import { getAdminStats, getAllUsers } from '../controllers/adminController';
import { authMiddleware, adminMiddleware } from '../middleware/auth';

const router = Router();

router.use(authMiddleware);
router.use(adminMiddleware);

router.get('/stats', getAdminStats);
router.get('/users', getAllUsers);

export default router;
