import nodemailer from 'nodemailer';

let smtpTransporter = null;

/**
 * Configure Nodemailer SMTP Transporter with fast connection timeouts (3.5s max)
 * Uses SSL port 465 for resilient cloud dispatch across cloud firewalls
 */
function getSmtpTransporter() {
  if (smtpTransporter) return smtpTransporter;

  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (user && pass) {
    const cleanPass = pass.replace(/\s+/g, '');
    smtpTransporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: Number(process.env.SMTP_PORT) || 465,
      secure: Number(process.env.SMTP_PORT) === 465 || !process.env.SMTP_PORT, // true for 465
      auth: {
        user: user.trim(),
        pass: cleanPass,
      },
      connectionTimeout: 1800,
      greetingTimeout: 1800,
      socketTimeout: 2000,
    });
    console.log('[EmailService] Gmail SMTP Transporter initialized on port', process.env.SMTP_PORT || 465, 'for:', user);
  }

  return smtpTransporter;
}

/**
 * Dispatch email via Resend REST API (HTTPS Port 443 - zero firewall blocks)
 */
async function sendViaResend({ apiKey, to, subject, html, text }) {
  console.log(`[EmailService] Attempting fast HTTPS dispatch via Resend API to: ${to}`);
  const rawSender = process.env.RESEND_FROM || 'DocVault <onboarding@resend.dev>';
  const sender = rawSender.replace(/"/g, '').trim();

  let cleanKey = (apiKey || '').trim();
  if (cleanKey.startsWith('ire_')) {
    cleanKey = cleanKey.slice(1);
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 2000);

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${cleanKey}`,
        'Content-Type': 'application/json',
      },
      signal: controller.signal,
      body: JSON.stringify({
        from: sender,
        to: [to],
        subject,
        html,
        text,
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      if (res.status === 403 && data.message?.includes('only send testing emails to your own email address')) {
        console.warn(`[EmailService] Resend Sandbox restriction: ${data.message}`);
        const sandboxErr = new Error(data.message);
        sandboxErr.isResendSandbox = true;
        throw sandboxErr;
      }
      throw new Error(data.message || `Resend API Error: ${res.statusText}`);
    }

    console.log(`[EmailService] Successfully dispatched via Resend API. Message ID: ${data.id}`);
    return { messageId: data.id, provider: 'resend' };
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Master OTP Email Dispatcher
 */
export async function sendOtpEmail(email, otpCode, purpose = 'Verification') {
  const mailOptions = {
    from: process.env.SMTP_FROM || `"DocVault Security" <${process.env.SMTP_USER || 'akshatmishraxic29@gmail.com'}>`,
    to: email,
    subject: `Your DocVault ${purpose} Code: ${otpCode}`,
    text: `Your DocVault verification code is: ${otpCode}. It expires in 10 minutes. If you did not request this, ignore this email.`,
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #0b1512; color: #f8fafc; padding: 40px 20px; border-radius: 12px; max-width: 500px; margin: 0 auto; border: 1px solid rgba(52, 211, 153, 0.2);">
        <div style="text-align: center; margin-bottom: 24px;">
          <h1 style="color: #34d399; font-size: 24px; font-weight: 800; margin: 0; letter-spacing: -0.5px;">DocVault</h1>
          <p style="color: #94a3b8; font-size: 13px; margin: 6px 0 0 0;">Secure Cryptographic Document Vault</p>
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
    `,
  };

  const isRenderCloud = Boolean(process.env.RENDER || process.env.NODE_ENV === 'production');

  // Strategy A: If Resend API Key is configured, use fast HTTPS port 443 first (takes ~300ms)
  if (process.env.RESEND_API_KEY) {
    try {
      return await sendViaResend({
        apiKey: process.env.RESEND_API_KEY,
        to: mailOptions.to,
        subject: mailOptions.subject,
        html: mailOptions.html,
        text: mailOptions.text,
      });
    } catch (resendErr) {
      console.warn('[EmailService] Resend dispatch bypassed/failed:', resendErr.message);
      // Fall through to Strategy B (Gmail SMTP) without blocking
    }
  }

  // Strategy B: Gmail SMTP Transporter (attempted with fast connection timeout)
  const transporter = getSmtpTransporter();
  if (transporter) {
    try {
      console.log(`[EmailService] Attempting Gmail SMTP dispatch to: ${email}`);
      const result = await transporter.sendMail(mailOptions);
      console.log('[EmailService] Gmail SMTP dispatch succeeded! Message ID:', result.messageId);
      return result;
    } catch (smtpErr) {
      console.warn('[EmailService] Gmail SMTP dispatch error/blocked:', smtpErr.message);
    }
  }

  // Strategy C: Dev & Cloud Sandbox Fallback
  console.warn('========================================================================');
  console.warn(`DISPATCHED OTP FOR [ ${email} ]: >>> ${otpCode} <<<`);
  console.warn('========================================================================');

  return { 
    messageId: 'mock-sandbox-' + Date.now(), 
    mocked: true, 
    devOtp: otpCode,
    sandboxRestricted: true
  };
}
