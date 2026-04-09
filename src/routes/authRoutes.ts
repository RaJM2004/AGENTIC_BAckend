import { Router } from 'express';
import { register, login, googleLogin, getUsers, verifyOtp, resendOtp, addFunds, updateProfile, deleteProfile } from '../controllers/authController';
import { authMiddleware } from '../middleware/auth';

const router = Router();

router.post('/register', register);
router.post('/login', login);
router.post('/google-login', googleLogin);
router.post('/verify-otp', verifyOtp);
router.post('/resend-otp', resendOtp);
router.post('/users/:id/add-funds', addFunds);
router.get('/users', getUsers);
router.put('/profile', authMiddleware, updateProfile);
router.delete('/profile', authMiddleware, deleteProfile);

export default router;
