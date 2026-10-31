import nodemailer from 'nodemailer';
import { config } from '../config/index.js';

let transporter = null;

export function getEmailTransporter() {
  if (transporter) return transporter;

  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (user && pass) {
    const cleanPass = pass.replace(/\s+/g, '');
    transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: user.trim(),
        pass: cleanPass,
      },
    });
    console.log('[EmailService] Gmail SMTP Transporter configured for:', user);
  } else {
    // Development / fallback logger transporter if no SMTP credentials set yet
    transporter = {
      sendMail: async (mailOptions) => {
        console.log('----------------------------------------------------');
        console.log('[EmailService DEV MOCK] Outgoing Email:');
        console.log('To:', mailOptions.to);
        console.log('Subject:', mailOptions.subject);
        console.log('Text Content:', mailOptions.text);
        console.log('----------------------------------------------------');
        return { messageId: 'mock-' + Date.now() };
      }
    };
    console.log('[EmailService] Running with in-console email logger (set SMTP_USER and SMTP_PASS in .env for production sending).');
  }

  return transporter;
}

export async function sendOtpEmail(email, otpCode, purpose = 'Verification') {
  const mailer = getEmailTransporter();

  const mailOptions = {
    from: process.env.SMTP_FROM || `"DocVault Security" <${process.env.SMTP_USER || 'security@docvault.local'}>`,
    to: email,
    subject: `Your DocVault ${purpose} Code: ${otpCode}`,
    text: `Your DocVault verification code is: ${otpCode}. It expires in 10 minutes. If you did not request this, ignore this email.`,
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #0b1512; color: #f8fafc; padding: 40px 20px; border-radius: 12px; max-width: 500px; margin: 0 auto; border: 1px solid rgba(52, 211, 153, 0.2);">
        <div style="text-align: center; margin-bottom: 24px;">
          <h1 style="color: #34d399; font-size: 24px; font-weight: 800; margin: 0; letter-spacing: -0.5px;">DocVault</h1>
          <p style="color: #94a3b8; font-size: 13px; margin: 6px 0 0 0;">Zero-Knowledge Cryptographic Vault</p>
        </div>

        <div style="background: rgba(18, 40, 34, 0.85); border: 1px solid rgba(52, 211, 153, 0.25); border-radius: 10px; padding: 24px; text-align: center;">
          <p style="color: #cbd5e1; font-size: 14px; margin-top: 0; line-height: 1.5;">
            Use the following one-time verification code to complete your ${purpose.toLowerCase()}:
          </p>

          <div style="background: #022c22; border: 1.5px dashed #10b981; border-radius: 8px; padding: 14px 24px; display: inline-block; margin: 18px 0; font-size: 32px; font-weight: 800; letter-spacing: 8px; color: #6ee7b7; font-family: monospace;">
            ${otpCode}
          </div>

          <p style="color: #94a3b8; font-size: 12px; margin: 12px 0 0 0;">
            This OTP is valid for <strong>10 minutes</strong>. Never share this code with anyone.
          </p>
        </div>

        <div style="text-align: center; margin-top: 24px; font-size: 11px; color: #64748b;">
          If you did not request this code, you can safely ignore this email.
        </div>
      </div>
    `
  };

  return await mailer.sendMail(mailOptions);
}

