import mongoose, { Schema } from 'mongoose';

const userSchema = new Schema({
    email: { type: String, required: true, unique: true },
    password: { type: String }, // Optional for Google users
    name: { type: String, required: true },
    googleId: { type: String }, // For Google OAuth
    authType: { type: String, enum: ['email', 'google'], default: 'email' },
    role: { type: String, enum: ['user', 'admin'], default: 'user' },
    walletBalance: { type: Number, default: 0 },
    isVerified: { type: Boolean, default: false },
    verificationOtp: { type: String },
    otpExpires: { type: Date },
    avatar: { type: String }, // Base64 or URL
    mfaEnabled: { type: Boolean, default: false },
    welcomeEmailSent: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now }
});

export const User = mongoose.model('User', userSchema);
