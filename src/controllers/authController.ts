import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { User } from '../models/User';
import { sendOtpEmail, sendWelcomeEmail } from '../services/emailService';
import { AuthRequest } from '../middleware/auth';
import { OAuth2Client } from 'google-auth-library';

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
const JWT_SECRET = process.env.JWT_SECRET || 'your_super_secret_key_change_me';

export const googleLogin = async (req: Request, res: Response): Promise<void> => {
    try {
        const { idToken } = req.body;
        if (!idToken) {
            res.status(400).json({ message: 'ID Token is required' });
            return;
        }

        const ticket = await client.verifyIdToken({
            idToken,
            audience: process.env.GOOGLE_CLIENT_ID,
        });

        const payload = ticket.getPayload();
        if (!payload || !payload.email) {
            res.status(400).json({ message: 'Invalid token' });
            return;
        }

        const { sub: googleId, email, name, picture } = payload;

        let user = await User.findOne({ email });

        if (!user) {
            // Create new user if they don't exist
            user = new User({
                email,
                name: name || 'Google User',
                googleId,
                authType: 'google',
                isVerified: true, // Google accounts are verified
                avatar: picture,
                walletBalance: 0
            });
            await user.save();
        } else {
            // Update existing user to linked Google account if not already
            if (!user.googleId) {
                user.googleId = googleId;
                user.authType = 'google';
                user.isVerified = true;
                if (!user.avatar) user.avatar = picture;
                await user.save();
            }
        }

        const token = jwt.sign(
            { userId: user._id, role: user.role },
            JWT_SECRET,
            { expiresIn: '1d' }
        );

        // Send Welcome email (First time only)
        if (!user.welcomeEmailSent) {
            sendWelcomeEmail(user.email, user.name, 'Welcome to the family. You have successfully signed in with Google.');
            user.welcomeEmailSent = true;
            await user.save();
        }

        res.json({
            token,
            userId: user._id,
            role: user.role,
            name: user.name,
            email: user.email,
            walletBalance: user.walletBalance,
            avatar: user.avatar
        });
    } catch (error) {
        console.error('Google login error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

export const updateProfile = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const userId = req.user?.userId;
        const { name, avatar, mfaEnabled } = req.body;

        const user = await User.findById(userId);
        if (!user) {
            res.status(404).json({ message: 'User not found' });
            return;
        }

        if (name) user.name = name;
        if (avatar !== undefined) user.avatar = avatar;
        if (mfaEnabled !== undefined) user.mfaEnabled = mfaEnabled;

        await user.save();

        res.json({
            message: 'Profile updated successfully',
            user: {
                userId: user._id,
                name: user.name,
                email: user.email,
                role: user.role,
                avatar: user.avatar,
                mfaEnabled: user.mfaEnabled,
                walletBalance: user.walletBalance
            }
        });
    } catch (error) {
        console.error('Update profile error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

export const deleteProfile = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const userId = req.user?.userId;

        const user = await User.findByIdAndDelete(userId);
        if (!user) {
            res.status(404).json({ message: 'User not found' });
            return;
        }

        res.json({ message: 'Account deleted successfully' });
    } catch (error) {
        console.error('Delete profile error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

export const register = async (req: Request, res: Response): Promise<void> => {
    try {
        const { email, password, name } = req.body;

        const existingUser = await User.findOne({ email });
        if (existingUser) {
            res.status(400).json({ message: 'User already exists' });
            return;
        }

        const hashedPassword = await bcrypt.hash(password, 12);
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        const otpExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 mins

        // Auto-assign admin role for primary admin email
        const role = email === 'admin@anvriksh.io' ? 'admin' : 'user';

        const user = new User({
            email,
            password: hashedPassword,
            name,
            role,
            verificationOtp: otp,
            otpExpires,
            isVerified: email === 'admin@anvriksh.io' // Auto-verify admin for convenience
        });

        await user.save();

        try {
            await sendOtpEmail(email, otp);
            res.status(201).json({ message: 'User created. Please check your email for OTP.' });
        } catch (mailError) {
            console.error('Failed to send OTP email:', mailError);
            res.status(201).json({ message: 'User created, but failed to send OTP. Please contact support.' });
        }
    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

export const verifyOtp = async (req: Request, res: Response): Promise<void> => {
    try {
        const { email, otp } = req.body;
        const user = await User.findOne({ email });

        if (!user) {
            res.status(404).json({ message: 'User not found' });
            return;
        }

        if (user.verificationOtp !== otp || (user.otpExpires && user.otpExpires < new Date())) {
            res.status(400).json({ message: 'Invalid or expired OTP' });
            return;
        }

        user.isVerified = true;
        user.verificationOtp = undefined;
        user.otpExpires = undefined;
        await user.save();

        // Send Signup Success email (First time only)
        if (!user.welcomeEmailSent) {
            sendWelcomeEmail(user.email, user.name, 'Your account has been successfully verified. Welcome to our platform!');
            user.welcomeEmailSent = true;
            await user.save();
        }

        res.json({ message: 'Email verified successfully' });
    } catch (error) {
        console.error('OTP verification error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

export const login = async (req: Request, res: Response): Promise<void> => {
    try {
        const { email, password } = req.body;

        const user = await User.findOne({ email });
        if (!user) {
            res.status(401).json({ message: 'Invalid credentials' });
            return;
        }

        if (!user.isVerified) {
            res.status(403).json({ message: 'Please verify your email first' });
            return;
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            res.status(401).json({ message: 'Invalid credentials' });
            return;
        }
        const token = jwt.sign(
            { userId: user._id, role: user.role },
            JWT_SECRET,
            { expiresIn: '1d' }
        );

        // Login successful - no welcome email sent for returning users

        res.json({
            token,
            userId: user._id,
            role: user.role,
            name: user.name,
            email: user.email,
            walletBalance: user.walletBalance
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

export const resendOtp = async (req: Request, res: Response): Promise<void> => {
    try {
        const { email } = req.body;
        const user = await User.findOne({ email });

        if (!user) {
            res.status(404).json({ message: 'User not found' });
            return;
        }

        if (user.isVerified) {
            res.status(400).json({ message: 'Email already verified' });
            return;
        }

        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        const otpExpires = new Date(Date.now() + 10 * 60 * 1000);

        user.verificationOtp = otp;
        user.otpExpires = otpExpires;
        await user.save();

        try {
            await sendOtpEmail(email, otp);
            res.json({ message: 'OTP resent successfully. Please check your email.' });
        } catch (mailError) {
            console.error('Failed to resend OTP email:', mailError);
            res.status(500).json({ message: 'Failed to send OTP email' });
        }
    } catch (error) {
        console.error('Resend OTP error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

export const addFunds = async (req: Request, res: Response): Promise<void> => {
    try {
        const { id } = req.params;
        const { amount } = req.body;
        const user = await User.findById(id);

        if (!user) {
            res.status(404).json({ message: 'User not found' });
            return;
        }

        user.walletBalance += amount;
        await user.save();

        res.json({ walletBalance: user.walletBalance });
    } catch (error) {
        console.error('Add funds error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

export const getUsers = async (req: Request, res: Response): Promise<void> => {
    try {
        const users = await User.find().select('-password');
        res.json(users);
    } catch (error) {
        console.error('Get users error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};
