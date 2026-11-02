import nodemailer from 'nodemailer';

let smtpTransporter = null;

/**
 * Configure Nodemailer SMTP Transporter with connection timeouts
 */
function getSmtpTransporter() {
  if (smtpTransporter) return smtpTransporter;

  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (user && pass) {
    const cleanPass = pass.replace(/\s+/g, '');
    smtpTransporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: user.trim(),
        pass: cleanPass,
      },
      connectionTimeout: 8000, // 8s timeout to avoid hanging on blocked cloud ports
      greetingTimeout: 8000,
      socketTimeout: 10000,
    });
    console.log('[EmailService] Gmail SMTP Transporter initialized for:', user);
  }

  return smtpTransporter;
}

/**
 * Dispatch email via Resend REST API (HTTPS Port 443 - Never blocked by Render/AWS/Cloud)
 */
async function sendViaResend({ apiKey, from, to, subject, html, text }) {
  console.log(`[EmailService] Attempting HTTPS dispatch via Resend API to: ${to}`);
  // If user has not configured a custom verified domain, default to Resend's free onboarding domain
  const sender = process.env.RESEND_FROM || 'DocVault <onboarding@resend.dev>';

  // Auto-heal accidental leading characters (e.g. "ire_..." -> "re_...")
  let cleanKey = (apiKey || '').trim();
  if (cleanKey.startsWith('ire_')) {
    cleanKey = cleanKey.slice(1);
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${cleanKey}`,
      'Content-Type': 'application/json',
    },
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

  console.log(`[EmailService] Successfully sent via Resend API. Message ID: ${data.id}`);
  return { messageId: data.id, provider: 'resend' };
}

/**
 * Dispatch email via Brevo REST API (HTTPS Port 443 - Never blocked by Render/AWS/Cloud)
 */
async function sendViaBrevo({ apiKey, from, to, subject, html, text }) {
  console.log(`[EmailService] Attempting HTTPS dispatch via Brevo API to: ${to}`);
  const senderEmail = from || process.env.SMTP_USER || 'security@docvault.local';

  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'api-key': apiKey.trim(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      sender: { name: 'DocVault Security', email: senderEmail },
      to: [{ email: to }],
      subject,
      htmlContent: html,
      textContent: text,
    }),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.message || `Brevo API Error: ${res.statusText}`);
  }

  console.log(`[EmailService] Successfully sent via Brevo API. Message ID: ${data.messageId}`);
  return { messageId: data.messageId, provider: 'brevo' };
}

/**
 * Master OTP Email Dispatcher with automatic Render / Cloud fallback
 */
export async function sendOtpEmail(email, otpCode, purpose = 'Verification') {
  const mailOptions = {
    from: process.env.SMTP_FROM || `"DocVault Security" <${process.env.SMTP_USER || 'security@docvault.local'}>`,
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
    `
  };

  // Provider 1: Resend HTTP API (Port 443 - Recommended for Render)
  if (process.env.RESEND_API_KEY) {
    try {
      return await sendViaResend({
        apiKey: process.env.RESEND_API_KEY,
        from: mailOptions.from,
        to: mailOptions.to,
        subject: mailOptions.subject,
        html: mailOptions.html,
        text: mailOptions.text,
      });
    } catch (err) {
      console.error('[EmailService] Resend dispatch failed:', err.message);
      if (err.isResendSandbox) {
        console.warn('========================================================================');
        console.warn(`[EmailService RESEND SANDBOX NOTIFICATION] Recipient: ${email}`);
        console.warn('Resend testing mode only delivers to account owner: akshatmishra2904@gmail.com');
        console.warn(`FALLBACK VERIFICATION CODE FOR [ ${email} ]: >>> ${otpCode} <<<`);
        console.warn('========================================================================');
        return {
          messageId: 'resend-sandbox-' + Date.now(),
          mocked: true,
          devOtp: otpCode,
          warning: 'Resend free testing domain is restricted to account owner email.'
        };
      }
    }
  }

  // Provider 2: Brevo HTTP API (Port 443)
  if (process.env.BREVO_API_KEY) {
    try {
      return await sendViaBrevo({
        apiKey: process.env.BREVO_API_KEY,
        from: process.env.SMTP_USER,
        to: mailOptions.to,
        subject: mailOptions.subject,
        html: mailOptions.html,
        text: mailOptions.text,
      });
    } catch (err) {
      console.error('[EmailService] Brevo dispatch failed:', err.message);
    }
  }

  // Provider 3: Gmail SMTP Transporter (Port 587/465)
  const transporter = getSmtpTransporter();
  if (transporter) {
    try {
      console.log(`[EmailService] Attempting Gmail SMTP dispatch to: ${email}`);
      const result = await transporter.sendMail(mailOptions);
      console.log('[EmailService] Gmail SMTP dispatch succeeded! Message ID:', result.messageId);
      return result;
    } catch (smtpErr) {
      console.error('[EmailService ERROR] Gmail SMTP dispatch failed:', smtpErr.message);

      // Detect Render egress firewall blocking SMTP ports
      const isFirewallBlocked = smtpErr.code === 'ETIMEDOUT' || smtpErr.code === 'ECONNREFUSED' || smtpErr.message.includes('timeout');
      if (isFirewallBlocked) {
        console.warn('========================================================================');
        console.warn('[EmailService CLOUD ALERT] Render/Cloud firewall blocked SMTP port 587!');
        console.warn('Render Free Tier blocks outbound SMTP ports 25, 465, and 587 to prevent spam.');
        console.warn('SOLUTION: Set RESEND_API_KEY in Render Environment Variables (works over port 443).');
        console.warn(`EMERGENCY LOGGED OTP FOR [ ${email} ]: >>> ${otpCode} <<<`);
        console.warn('========================================================================');

        // Graceful fallback: Do not crash account creation on Render Free Tier
        return {
          messageId: 'mock-firewall-' + Date.now(),
          mocked: true,
          devOtp: otpCode,
          warning: 'Render Free Tier blocked outbound SMTP. Fallback active.'
        };
      }

      console.warn(`[EmailService] SMTP error (${smtpErr.message}). Falling back to emergency OTP logging for: ${email}`);
      return {
        messageId: 'mock-error-' + Date.now(),
        mocked: true,
        devOtp: otpCode,
        warning: smtpErr.message
      };
    }
  }

  // Fallback 4: In-Console Logger (When no credentials exist in Render environment)
  console.warn('========================================================================');
  console.warn('[EmailService NO CREDENTIALS CONFIGURED]');
  console.warn('Neither RESEND_API_KEY nor SMTP_USER / SMTP_PASS found in environment variables.');
  console.warn('Please add SMTP_USER & SMTP_PASS (or RESEND_API_KEY) to your Render Dashboard.');
  console.warn(`DISPATCHED OTP FOR [ ${email} ]: >>> ${otpCode} <<<`);
  console.warn('========================================================================');

  return { messageId: 'mock-console-' + Date.now(), mocked: true };
}
