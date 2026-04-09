import { Resend } from 'resend';
import dotenv from 'dotenv';

dotenv.config();

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM_EMAIL = 'info@anvriksh.com'; // Verified domain email

export const sendOtpEmail = async (email: string, otp: string) => {
    try {
        console.log(`[Resend] Attempting to send OTP to: ${email}`);
        const { data, error } = await resend.emails.send({
            from: `${process.env.SMTP_FROM_NAME || 'YUGMA'} <${FROM_EMAIL}>`,
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
        });

        if (error) {
            console.error('[Resend] OTP Error:', error);
            throw error;
        }

        console.log('[Resend] OTP sent:', data?.id);
        return data;
    } catch (error) {
        console.error('[Resend] Fatal OTP Error:', error);
        throw error;
    }
};

export const sendWelcomeEmail = async (email: string, userName: string, message: string = 'Welcome to the family.') => {
    try {
        console.log(`[Resend] Sending welcome email to: ${email}`);
        const { data, error } = await resend.emails.send({
            from: `${process.env.SMTP_FROM_NAME || 'YUGMA'} <${FROM_EMAIL}>`,
            to: email,
            subject: `Welcome to Yugma!`,
            html: `
                <div style="background-color: #09090b; padding: 40px 10px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #ffffff;">
                  <div style="max-width: 500px; margin: auto; background-color: #0d0d12; border: 1px solid #1e1e2e; border-radius: 12px; padding: 32px; box-shadow: 0 4px 20px rgba(0,0,0,0.3);">
                    
                    <div style="margin-bottom: 32px;">
                      <img src="https://anvriksh.com/logo1.png" alt="YUGMA" style="height: 28px;" />
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
        });

        if (error) {
            console.error('[Resend] Welcome Error:', error);
            return;
        }

        console.log('[Resend] Welcome email sent:', data?.id);
        return data;
    } catch (error) {
        console.error('[Resend] Fatal Welcome Error:', error);
    }
};
