
import 'dotenv/config';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { User } from '../models/User';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/workflow-automation';

const seedAdmin = async () => {
    try {
        console.log('Connecting to database...');
        await mongoose.connect(MONGODB_URI);
        console.log('Connected to database.');

        const adminEmail = 'admin@anvriksh.io';
        const existingAdmin = await User.findOne({ email: adminEmail });

        if (existingAdmin) {
            console.log('Admin user already exists. Updating password...');
            const hashedPassword = await bcrypt.hash('Admin@Anvriksh2026', 12);
            existingAdmin.password = hashedPassword;
            existingAdmin.role = 'admin';
            existingAdmin.isVerified = true;
            await existingAdmin.save();
            console.log('Admin password updated successfully.');
        } else {
            console.log('Creating new admin user...');
            const hashedPassword = await bcrypt.hash('Admin@Anvriksh2026', 12);
            const admin = new User({
                email: adminEmail,
                password: hashedPassword,
                name: 'System Admin',
                role: 'admin',
                isVerified: true
            });
            await admin.save();
            console.log('Admin user created successfully.');
        }

        console.log('-----------------------------------');
        console.log('Admin Credentials:');
        console.log(`Email: ${adminEmail}`);
        console.log('Password: Admin@Anvriksh2026');
        console.log('-----------------------------------');

    } catch (error) {
        console.error('Error seeding admin user:', error);
    } finally {
        await mongoose.disconnect();
        console.log('Disconnected from database.');
    }
};

seedAdmin();
