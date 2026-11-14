// server/utils/sendEmail.js
// Production-safe SMTP email transporter with reliable socket timeouts and connection cleanup

import nodemailer from 'nodemailer';

/**
 * Send an email via SMTP or fallback to simulated logging in non-production.
 * Enforces explicit connection/socket timeouts and transport closure to prevent hung connections.
 *
 * @param {Object} options
 * @param {string} options.email - Recipient email
 * @param {string} options.subject - Email subject line
 * @param {string} options.message - Plain text body
 * @param {string} [options.html] - HTML body
 * @returns {Promise<{ success: boolean, simulated?: boolean, messageId?: string, reason?: string }>}
 */
export const sendEmail = async ({ email, subject, message, html }) => {
    const isProduction = process.env.NODE_ENV === 'production';
    const hasSmtpConfig = process.env.SMTP_HOST && process.env.SMTP_PORT && process.env.SMTP_USER && process.env.SMTP_PASS;

    if (hasSmtpConfig) {
        const port = parseInt(process.env.SMTP_PORT, 10) || 587;
        const transporter = nodemailer.createTransport({
            host: process.env.SMTP_HOST,
            port,
            secure: port === 465,
            auth: {
                user: process.env.SMTP_USER,
                pass: process.env.SMTP_PASS
            },
            // Explicit socket and handshake timeouts
            connectionTimeout: 8000, // 8s to establish TCP connection
            greetingTimeout: 5000,   // 5s to receive SMTP greeting
            socketTimeout: 10000     // 10s of socket inactivity
        });

        const senderEmail = process.env.FROM_EMAIL || process.env.EMAIL_FROM || `RentHub Security <no-reply@renthub.com>`;

        const mailOptions = {
            from: senderEmail,
            to: email,
            subject,
            text: message,
            html: html || message.replace(/\n/g, '<br>')
        };

        let timer = null;
        try {
            const sendPromise = transporter.sendMail(mailOptions);
            const timeoutPromise = new Promise((_, reject) => {
                timer = setTimeout(() => {
                    try {
                        transporter.close(); // Cleanly abort hung socket connections
                    } catch (e) {
                        // Safe close
                    }
                    const timeoutErr = new Error('SMTP connection or message dispatch timed out.');
                    timeoutErr.code = 'ETIMEDOUT';
                    reject(timeoutErr);
                }, 12000);
            });

            const info = await Promise.race([sendPromise, timeoutPromise]);
            return { success: true, messageId: info.messageId };
        } catch (error) {
            try {
                transporter.close();
            } catch (e) {
                // Safe close
            }
            console.error('[Email Service Error]', error.message || error);
            throw error;
        } finally {
            if (timer) clearTimeout(timer);
        }
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
