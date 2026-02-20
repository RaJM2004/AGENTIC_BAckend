import mongoose, { Schema } from 'mongoose';

const userSchema = new Schema({
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    name: { type: String, required: true },
    role: { type: String, enum: ['user', 'admin'], default: 'user' },
    walletBalance: { type: Number, default: 0 },
    isVerified: { type: Boolean, default: false },
    verificationOtp: { type: String },
    otpExpires: { type: Date },
    avatar: { type: String }, // Base64 or URL
    mfaEnabled: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now }
});

export const User = mongoose.model('User', userSchema);
