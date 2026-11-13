// server/utils/sendEmail.js
// Production-safe SMTP email transporter with development fallback

import nodemailer from 'nodemailer';

/**
 * Send an email via SMTP or fallback to simulated logging in non-production.
 * @param {Object} options
 * @param {string} options.email - Recipient email
 * @param {string} options.subject - Email subject line
 * @param {string} options.message - Plain text body
 * @param {string} [options.html] - HTML body
 * @returns {Promise<{ success: boolean, simulated?: boolean, messageId?: string }>}
 */
export const sendEmail = async ({ email, subject, message, html }) => {
    const isProduction = process.env.NODE_ENV === 'production';
    const hasSmtpConfig = process.env.SMTP_HOST && process.env.SMTP_PORT && process.env.SMTP_USER && process.env.SMTP_PASS;

    if (hasSmtpConfig) {
        const transporter = nodemailer.createTransport({
            host: process.env.SMTP_HOST,
            port: parseInt(process.env.SMTP_PORT, 10) || 587,
            secure: parseInt(process.env.SMTP_PORT, 10) === 465,
            auth: {
                user: process.env.SMTP_USER,
                pass: process.env.SMTP_PASS
            }
        });

        const senderEmail = process.env.FROM_EMAIL || process.env.EMAIL_FROM || `RentHub Security <no-reply@renthub.com>`;

        const mailOptions = {
            from: senderEmail,
            to: email,
            subject,
            text: message,
            html: html || message.replace(/\n/g, '<br>')
        };

        const info = await transporter.sendMail(mailOptions);
        return { success: true, messageId: info.messageId };
    }

    // SMTP not configured
    if (isProduction) {
        console.warn('[Email Service] SMTP credentials not configured in production environment. Email not dispatched.');
        return { success: false, reason: 'SMTP unconfigured' };
    }

    // Safe simulation in development and testing
    console.log(`\n================== [DEV EMAIL NOTIFICATION] ==================`);
    console.log(`To: ${email}`);
    console.log(`Subject: ${subject}`);
    console.log(`Message:\n${message}`);
    console.log(`==============================================================\n`);

    return { success: true, simulated: true };
};

export default sendEmail;
