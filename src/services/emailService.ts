import emailjs from '@emailjs/nodejs';
import dotenv from 'dotenv';

dotenv.config();

// Note: dotenv.config() is called at the top of the file

export const sendOtpEmail = async (email: string, otp: string) => {
    const SERVICE_ID = process.env.EMAILJS_SERVICE_ID || '';
    const TEMPLATE_ID = process.env.EMAILJS_TEMPLATE_ID || '';
    const PRIVATE_KEY = process.env.EMAILJS_PRIVATE_KEY || '';
    const PUBLIC_KEY = process.env.EMAILJS_PUBLIC_KEY || '';

    if (!SERVICE_ID || !TEMPLATE_ID || !PUBLIC_KEY || !PRIVATE_KEY) {
        console.error('EmailJS Env Vars:', {
            SERVICE_ID: !!SERVICE_ID,
            TEMPLATE_ID: !!TEMPLATE_ID,
            PUBLIC_KEY: !!PUBLIC_KEY,
            PRIVATE_KEY: !!PRIVATE_KEY
        });
        throw new Error('EmailJS Configuration is missing in .env file (check Service ID, Template ID, Public Key, and Private Key)');
    }

    // Initialize/Re-init inside the call
    emailjs.init({
        publicKey: PUBLIC_KEY,
        privateKey: PRIVATE_KEY,
    });

    console.log(`[EmailJS] Attempting to send OTP to: ${email}`);

    try {
        const templateParams = {
            to_email: email, // This MUST match the variable in your EmailJS Template Settings
            otp_code: otp,
            project_name: 'Anvriksh Tech Solutions'
        };

        const result = await emailjs.send(
            SERVICE_ID,
            TEMPLATE_ID,
            templateParams
        );

        return result;
    } catch (error) {
        console.error('EmailJS Error:', error);
        throw error;
    }
};
