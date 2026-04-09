import nodemailer from 'nodemailer';
import dotenv from 'dotenv';

dotenv.config();

const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.hostinger.com',
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: process.env.SMTP_PORT === '465', // true for 465, false for 587
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
    },
    tls: {
        rejectUnauthorized: false // Helps with some hosting provider certificate issues
    },
    connectionTimeout: 10000, // 10 seconds
});

export const sendOtpEmail = async (email: string, otp: string) => {
    const mailOptions = {
        from: `"${process.env.SMTP_FROM_NAME}" <${process.env.SMTP_USER}>`,
        to: email,
        subject: `Your Verification Code: ${otp}`,
        html: `
            <div style="font-family: sans-serif; padding: 20px; color: #333;">
                <h2>Email Verification</h2>
                <p>Hello,</p>
                <p>Your verification code for Yugma is:</p>
                <h1 style="color: #db2777; font-size: 32px; letter-spacing: 5px;">${otp}</h1>
                <p>This code will expire in 10 minutes.</p>
                <p>Best regards,<br/>ANVRiksh Tech Solutions</p>
            </div>
        `,
    };

    try {
        const info = await transporter.sendMail(mailOptions);
        console.log('[Nodemailer] OTP sent:', info.messageId);
        return info;
    } catch (error) {
        console.error('[Nodemailer] OTP Error:', error);
        throw error;
    }
};

export const sendWelcomeEmail = async (email: string, userName: string, message: string = 'Welcome to the family.') => {
    const mailOptions = {
        from: `"${process.env.SMTP_FROM_NAME}" <${process.env.SMTP_USER}>`,
        to: email,
        subject: `Welcome to Yugma!`,
        html: `
            <div style="background-color: #09090b; padding: 40px 10px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #ffffff;">
              <div style="max-width: 500px; margin: auto; background-color: #0d0d12; border: 1px solid #1e1e2e; border-radius: 12px; padding: 32px; box-shadow: 0 4px 20px rgba(0,0,0,0.3);">
                
                <div style="margin-bottom: 32px;">
                  <img src="https://anvriksh.com/logo1.png" alt="YUGMA" style="height: 40px;" />
                </div>

                <h2 style="font-size: 20px; font-weight: 600; margin-bottom: 16px; color: #ffffff;">Welcome to the family.</h2>
                
                <p style="font-size: 15px; line-height: 1.5; color: #94a3b8; margin-bottom: 24px;">
                  Hi <strong style="color: #ffffff;">${userName}</strong>,<br/><br/>
                  ${message} You now have full access to <strong style="color: #ffffff;">Yugma</strong>, developed by Anvriksh Tech Solutions.
                </p>

                <p style="font-size: 15px; line-height: 1.5; color: #94a3b8; margin-bottom: 32px;">
                  Your workspace is ready. Launch your dashboard to start building.
                </p>

                <div style="margin-bottom: 32px;">
                  <a href="https://yugma.anvriksh.com/" style="display: inline-block; background-color: #db2777; color: #ffffff; padding: 12px 32px; border-radius: 6px; font-weight: 600; text-decoration: none; font-size: 14px;">
                    Open Dashboard
                  </a>
                </div>

                <div style="border-top: 1px solid #1e1e2e; padding-top: 24px;">
                  <p style="font-size: 13px; color: #64748b; margin: 0;">
                    Questions? Contact us at <a href="mailto:info@anvriksh.com" style="color: #db2777; text-decoration: none;">info@anvriksh.com</a>
                  </p>
                  <p style="font-size: 12px; color: #475569; margin-top: 16px; text-transform: uppercase; letter-spacing: 0.05em;">
                    Anvriksh Tech Solutions &bull; Yugma Platform
                  </p>
                </div>

              </div>
            </div>
        `,
    };

    try {
        const info = await transporter.sendMail(mailOptions);
        console.log('[Nodemailer] Welcome email sent:', info.messageId);
        return info;
    } catch (error) {
        console.error('[Nodemailer] Welcome Error:', error);
    }
};

