const nodemailer = require('nodemailer');
require('dotenv').config();

const transporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST,
    port: process.env.EMAIL_PORT,
    secure: false,
    requireTLS: true,
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    },
});


const getVerificationHTML = (pinCode) => `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Verify Your Email</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            background: #eef2f6;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif;
            padding: 20px;
        }
        .container {
            max-width: 560px;
            margin: 0 auto;
            background: #ffffff;
            border-radius: 32px;
            box-shadow: 0 20px 60px -12px rgba(0,20,30,0.25);
            overflow: hidden;
        }
        .header {
            padding: 32px 36px 0;
            display: flex;
            align-items: center;
            justify-content: space-between;
            border-bottom: 2px solid #f0f4fa;
            padding-bottom: 20px;
        }
        .logo-area {
            display: flex;
            align-items: center;
            gap: 12px;
        }
        .logo-icon {
            width: 48px;
            height: 48px;
            background: linear-gradient(145deg, #1d2b3f, #0f1a2a);
            border-radius: 16px;
            display: flex;
            align-items: center;
            justify-content: center;
            color: white;
            font-size: 22px;
            font-weight: 700;
        }
        .logo-text {
            font-size: 24px;
            font-weight: 700;
            color: #0b1a2b;
        }
        .logo-text span {
            font-weight: 400;
            font-size: 14px;
            color: #4b637a;
            margin-left: 6px;
        }
        .badge {
            background: #eef3fa;
            padding: 4px 14px;
            border-radius: 100px;
            font-size: 11px;
            font-weight: 600;
            color: #1f3a57;
            border: 1px solid #dce5ef;
            text-transform: uppercase;
        }
        .content {
            padding: 32px 36px 28px;
        }
        .greeting {
            font-size: 28px;
            font-weight: 700;
            color: #0b1a2b;
            margin-bottom: 8px;
        }
        .subtext {
            font-size: 16px;
            line-height: 1.6;
            color: #2d4a66;
            margin-bottom: 28px;
        }
        .code-box {
            background: #f6faff;
            border-radius: 20px;
            padding: 24px 20px;
            text-align: center;
            border: 1px solid #e6edf8;
            margin-bottom: 28px;
        }
        .code-label {
            font-size: 13px;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 1.5px;
            color: #52718c;
            margin-bottom: 12px;
        }
        .code {
            font-family: 'SF Mono', 'Menlo', 'Monaco', monospace;
            font-size: 42px;
            font-weight: 700;
            letter-spacing: 14px;
            color: #0c253b;
            background: white;
            padding: 14px 12px;
            border-radius: 16px;
            display: inline-block;
            border: 1px solid #dfe9f3;
            padding-left: 20px;
        }
        .code-expiry {
            margin-top: 14px;
            font-size: 13px;
            color: #3b6485;
        }
        .code-expiry span {
            background: #e3edf8;
            padding: 3px 16px;
            border-radius: 40px;
        }
        .actions {
            display: flex;
            flex-wrap: wrap;
            gap: 12px;
            justify-content: center;
            margin: 6px 0 24px;
        }
        .btn-primary {
            background: linear-gradient(145deg, #1d3450, #14273e);
            color: white !important;
            text-decoration: none;
            padding: 14px 44px;
            border-radius: 60px;
            font-weight: 600;
            font-size: 16px;
            box-shadow: 0 6px 18px -6px rgba(20,45,80,0.3);
            border: 1px solid rgba(255,255,255,0.1);
            display: inline-block;
        }
        .btn-secondary {
            background: transparent;
            color: #1f3f5e;
            text-decoration: none;
            padding: 14px 32px;
            border-radius: 60px;
            font-weight: 500;
            font-size: 15px;
            border: 1.5px solid #cbdae9;
            display: inline-block;
        }
        .info-box {
            background: #f8fafd;
            border-radius: 14px;
            padding: 16px 20px;
            border-left: 4px solid #1d3450;
            margin-top: 6px;
        }
        .info-box p {
            font-size: 14px;
            color: #3a5b7a;
            line-height: 1.5;
        }
        .info-box strong {
            color: #0a253d;
        }
        .footer {
            padding: 20px 36px 32px;
            border-top: 1px solid #e9f0f8;
            display: flex;
            justify-content: space-between;
            align-items: center;
            flex-wrap: wrap;
            gap: 12px;
        }
        .footer-left {
            font-size: 13px;
            color: #6b86a1;
            display: flex;
            align-items: center;
            gap: 8px;
        }
        .footer-right {
            font-size: 12px;
            color: #6b86a1;
            background: #ecf3fa;
            padding: 4px 16px;
            border-radius: 50px;
            font-weight: 500;
        }
        .footer-note {
            font-size: 12px;
            color: #809bb5;
            text-align: center;
            padding: 0 36px 24px;
            opacity: 0.7;
        }
        @media (max-width: 480px) {
            .header, .content, .footer {
                padding-left: 20px;
                padding-right: 20px;
            }
            .greeting { font-size: 24px; }
            .code { font-size: 32px; letter-spacing: 10px; padding-left: 16px; }
            .btn-primary, .btn-secondary { width: 100%; text-align: center; }
            .actions { flex-direction: column; }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <div class="logo-area">
             
                <div class="logo-text">Nahidea <span>• verify</span></div>
            </div>
      
        </div>
        <div class="content">
            <h1 class="greeting">Confirm your email</h1>
            <p class="subtext">
                Thanks for signing up! To complete your registration, please confirm your email address using the code below or by clicking the button.
            </p>
            <div class="code-box">
                <div class="code-label">🔐 verification code</div>
                <div class="code">${pinCode}</div>
                <div class="code-expiry">
                    <span>⏱️ valid for 10 minutes</span>
                </div>
            </div>

            <div class="info-box">
                <p>
                    <strong>✉️ Didn't request this?</strong> You can safely ignore this email. 
                    For any questions, contact our support team.
                </p>
            </div>
        </div>
        <div class="footer">
            <div class="footer-left">
                 Nahidea · secure account
            </div>
         
        </div>
        <div class="footer-note">
            This is an automated message from Nahidea. Please do not reply to this email.
        </div>
    </div>
</body>
</html>
`;

const getResendVerificationHTML = (pinCode) => `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>New Verification Code</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            background: #f0f4f9;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif;
            padding: 20px;
        }
        .container {
            max-width: 560px;
            margin: 0 auto;
            background: #ffffff;
            border-radius: 32px;
            box-shadow: 0 20px 60px -12px rgba(0,20,30,0.2);
            overflow: hidden;
        }
        .header {
            background: linear-gradient(135deg, #1a2a40, #0f1a2a);
            padding: 32px 36px 28px;
        }
        .header-content {
            display: flex;
            align-items: center;
            justify-content: space-between;
        }
        .logo-white {
            display: flex;
            align-items: center;
            gap: 12px;
            color: white;
        }
        .logo-icon-white {
            width: 44px;
            height: 44px;
            background: rgba(255,255,255,0.15);
            border-radius: 14px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 20px;
            border: 1px solid rgba(255,255,255,0.1);
        }
        .logo-white h2 {
            font-size: 22px;
            font-weight: 600;
        }
        .logo-white span {
            font-weight: 400;
            font-size: 13px;
            opacity: 0.7;
            margin-left: 4px;
        }
        .new-badge {
            background: #f39c12;
            color: white;
            padding: 4px 16px;
            border-radius: 100px;
            font-size: 12px;
            font-weight: 700;
            text-transform: uppercase;
        }
        .header-sub {
            color: rgba(255,255,255,0.8);
            margin-top: 12px;
            font-size: 14px;
        }
        .content {
            padding: 36px 36px 28px;
        }
        .greeting {
            font-size: 26px;
            font-weight: 700;
            color: #0b1a2b;
            margin-bottom: 8px;
        }
        .greeting small {
            font-size: 16px;
            font-weight: 400;
            color: #4b637a;
            display: block;
            margin-top: 4px;
        }
        .subtext {
            font-size: 16px;
            line-height: 1.7;
            color: #2d4a66;
            margin-bottom: 28px;
        }
        .highlight-box {
            background: linear-gradient(135deg, #fef9e7, #fdf2d0);
            border-radius: 20px;
            padding: 28px 24px;
            text-align: center;
            border: 2px solid #f9e4b3;
            margin-bottom: 28px;
        }
        .code-label {
            font-size: 13px;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 1.5px;
            color: #7d6b3a;
            margin-bottom: 12px;
        }
        .code {
            font-family: 'SF Mono', 'Menlo', 'Monaco', monospace;
            font-size: 44px;
            font-weight: 700;
            letter-spacing: 14px;
            color: #1a2a40;
            background: white;
            padding: 14px 12px;
            border-radius: 16px;
            display: inline-block;
            border: 1px solid #e8dbb8;
            padding-left: 20px;
        }
        .code-expiry {
            margin-top: 14px;
            font-size: 13px;
            color: #7d6b3a;
        }
        .code-expiry span {
            background: rgba(255,255,255,0.7);
            padding: 3px 16px;
            border-radius: 40px;
        }
        .actions {
            display: flex;
            flex-wrap: wrap;
            gap: 12px;
            justify-content: center;
            margin: 6px 0 24px;
        }
        .btn-warning {
            background: linear-gradient(145deg, #f39c12, #e67e22);
            color: white !important;
            text-decoration: none;
            padding: 14px 44px;
            border-radius: 60px;
            font-weight: 600;
            font-size: 16px;
            box-shadow: 0 6px 18px -6px rgba(243,156,18,0.4);
            border: 1px solid rgba(255,255,255,0.2);
            display: inline-block;
        }
        .btn-outline-dark {
            background: transparent;
            color: #1f3f5e;
            text-decoration: none;
            padding: 14px 32px;
            border-radius: 60px;
            font-weight: 500;
            font-size: 15px;
            border: 1.5px solid #cbdae9;
            display: inline-block;
        }
        .info-box {
            background: #f8fafd;
            border-radius: 14px;
            padding: 16px 20px;
            border-left: 4px solid #f39c12;
            margin-top: 6px;
        }
        .info-box p {
            font-size: 14px;
            color: #3a5b7a;
            line-height: 1.5;
        }
        .info-box strong {
            color: #0a253d;
        }
        .footer {
            padding: 20px 36px 32px;
            border-top: 1px solid #e9f0f8;
            display: flex;
            justify-content: space-between;
            align-items: center;
            flex-wrap: wrap;
            gap: 12px;
        }
        .footer-left {
            font-size: 13px;
            color: #6b86a1;
            display: flex;
            align-items: center;
            gap: 8px;
        }
        .footer-right {
            font-size: 12px;
            color: #6b86a1;
            background: #ecf3fa;
            padding: 4px 16px;
            border-radius: 50px;
            font-weight: 500;
        }
        .footer-note {
            font-size: 12px;
            color: #809bb5;
            text-align: center;
            padding: 0 36px 24px;
            opacity: 0.7;
        }
        @media (max-width: 480px) {
            .header, .content, .footer {
                padding-left: 20px;
                padding-right: 20px;
            }
            .greeting { font-size: 22px; }
            .code { font-size: 34px; letter-spacing: 10px; padding-left: 16px; }
            .btn-warning, .btn-outline-dark { width: 100%; text-align: center; }
            .actions { flex-direction: column; }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <div class="header-content">
                <div class="logo-white">
                    <h2>Nahidea <span>• new code</span></h2>
                </div>
            </div>
            <div class="header-sub">
                A new verification code has been generated for your account
            </div>
        </div>
        <div class="content">
            <h1 class="greeting">
                Your New Verification Code
                <small>Please use this new code to verify your email</small>
            </h1>
            <p class="subtext">
                We've generated a new verification code for your Nahidea account. 
                Use the code below to complete your email verification.
            </p>
            <div class="highlight-box">
                <div class="code-label">🔑 new verification code</div>
                <div class="code">${pinCode}</div>
                <div class="code-expiry">
                    <span>⏱️ valid for 10 minutes</span>
                </div>
            </div>
            <div class="info-box">
                <p>
                    <strong>⚠️ This is a new code.</strong> The previous code has been invalidated. 
                    If you didn't request this, please contact support.
                </p>
            </div>
        </div>
        <div class="footer">
            <div class="footer-left">
             Nahidea · secure account
            </div>
        </div>
        <div class="footer-note">
            This is an automated message from Nahidea. Please do not reply to this email.
        </div>
    </div>
</body>
</html>
`;


const getPasswordResetHTML = (pinCode) => `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Reset Your Password</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            background: #f0f4f9;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif;
            padding: 20px;
        }
        .container {
            max-width: 560px;
            margin: 0 auto;
            background: #ffffff;
            border-radius: 32px;
            box-shadow: 0 20px 60px -12px rgba(0,20,30,0.2);
            overflow: hidden;
        }
        .header {
            background:#fd7648;
            padding: 32px 36px 28px;
        }
        .header-content {
            display: flex;
            align-items: center;
            justify-content: space-between;
        }
        .logo-white {
            display: flex;
            align-items: center;
            gap: 12px;
            color: white;
        }
        .logo-icon-white {
            width: 44px;
            height: 44px;
            background: rgba(255,255,255,0.15);
            border-radius: 14px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 20px;
            border: 1px solid rgba(255,255,255,0.1);
        }
        .logo-white h2 {
            font-size: 22px;
            font-weight: 600;
        }
        .logo-white span {
            font-weight: 400;
            font-size: 13px;
            opacity: 0.7;
            margin-left: 4px;
        }
        .security-badge {
            background: rgba(255,255,255,0.2);
            color: white;
            padding: 4px 16px;
            border-radius: 100px;
            font-size: 11px;
            font-weight: 600;
            text-transform: uppercase;
            border: 1px solid rgba(255,255,255,0.2);
        }
        .header-sub {
            color: rgba(255,255,255,0.9);
            margin-top: 12px;
            font-size: 14px;
        }
        .content {
            padding: 36px 36px 28px;
        }
        .greeting {
            font-size: 26px;
            font-weight: 700;
            color: #0b1a2b;
            margin-bottom: 8px;
        }
        .greeting small {
            font-size: 16px;
            font-weight: 400;
            color: #4b637a;
            display: block;
            margin-top: 4px;
        }
        .subtext {
            font-size: 16px;
            line-height: 1.7;
            color: #2d4a66;
            margin-bottom: 28px;
        }
        .security-box {
            background: linear-gradient(135deg, #fdf2f2, #fde8e8);
            border-radius: 20px;
            padding: 28px 24px;
            text-align: center;
            border: 2px solid #f5c8c8;
            margin-bottom: 28px;
        }
        .code-label {
            font-size: 13px;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 1.5px;
            color: #8b3a3a;
            margin-bottom: 12px;
        }
        .code {
            font-family: 'SF Mono', 'Menlo', 'Monaco', monospace;
            font-size: 44px;
            font-weight: 700;
            letter-spacing: 14px;
            color: #1a2a40;
            background: white;
            padding: 14px 12px;
            border-radius: 16px;
            display: inline-block;
            border: 1px solid #e8c8c8;
            padding-left: 20px;
        }
        .code-expiry {
            margin-top: 14px;
            font-size: 13px;
            color: #8b3a3a;
        }
        .code-expiry span {
            background: rgba(255,255,255,0.7);
            padding: 3px 16px;
            border-radius: 40px;
        }
        .actions {
            display: flex;
            flex-wrap: wrap;
            gap: 12px;
            justify-content: center;
            margin: 6px 0 24px;
        }
        .btn-danger {
            background: linear-gradient(145deg, #c0392b, #e74c3c);
            color: white !important;
            text-decoration: none;
            padding: 14px 44px;
            border-radius: 60px;
            font-weight: 600;
            font-size: 16px;
            box-shadow: 0 6px 18px -6px rgba(192,57,43,0.4);
            border: 1px solid rgba(255,255,255,0.2);
            display: inline-block;
        }
        .btn-outline-dark {
            background: transparent;
            color: #1f3f5e;
            text-decoration: none;
            padding: 14px 32px;
            border-radius: 60px;
            font-weight: 500;
            font-size: 15px;
            border: 1.5px solid #cbdae9;
            display: inline-block;
        }
        .warning-box {
            background: #fef9e7;
            border-radius: 14px;
            padding: 16px 20px;
            border-left: 4px solid #e74c3c;
            margin-top: 6px;
        }
        .warning-box p {
            font-size: 14px;
            color: #5d4a1a;
            line-height: 1.5;
        }
        .warning-box strong {
            color: #c0392b;
        }
        .footer {
            padding: 20px 36px 32px;
            border-top: 1px solid #e9f0f8;
            display: flex;
            justify-content: space-between;
            align-items: center;
            flex-wrap: wrap;
            gap: 12px;
        }
        .footer-left {
            font-size: 13px;
            color: #6b86a1;
            display: flex;
            align-items: center;
            gap: 8px;
        }
        .footer-right {
            font-size: 12px;
            color: #6b86a1;
            background: #ecf3fa;
            padding: 4px 16px;
            border-radius: 50px;
            font-weight: 500;
        }
        .footer-note {
            font-size: 12px;
            color: #809bb5;
            text-align: center;
            padding: 0 36px 24px;
            opacity: 0.7;
        }
        @media (max-width: 480px) {
            .header, .content, .footer {
                padding-left: 20px;
                padding-right: 20px;
            }
            .greeting { font-size: 22px; }
            .code { font-size: 34px; letter-spacing: 10px; padding-left: 16px; }
            .btn-danger, .btn-outline-dark { width: 100%; text-align: center; }
            .actions { flex-direction: column; }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <div class="header-content">
                <div class="logo-white">
                    <h2>Nahidea <span>• security</span></h2>
                </div>
               
            </div>
            <div class="header-sub">
                A password reset request was made for your account
            </div>
        </div>
        <div class="content">
            <h1 class="greeting">
                Reset Your Password
                <small>Use this code to set a new password</small>
            </h1>
            <p class="subtext">
                We received a request to reset your Nahidea account password. 
                Use the 6-digit code below to proceed with the password reset process.
            </p>
            <div class="security-box">
                <div class="code-label">🔑 password reset code</div>
                <div class="code">${pinCode}</div>
                <div class="code-expiry">
                    <span>⏱️ valid for 10 minutes</span>
                </div>
            </div>
            <div class="warning-box">
                <p>
                    <strong>⚠️ Didn't request this?</strong> 
                    You can safely ignore this email. Your password will not change unless you use the code above. 
                    If you're concerned, contact support.
                </p>
            </div>
        </div>
        <div class="footer">
            <div class="footer-left">
              Nahidea · secure account
            </div>
        </div>
        <div class="footer-note">
            This is an automated security message from Nahidea. Please do not reply to this email.
        </div>
    </div>
</body>
</html>
`;

const sendVerifyCodeEmail = async (to, pinCode) => {
    const subject = 'Your Verification Code';
    const html = getVerificationHTML(pinCode);
    
    try {
        const info = await transporter.sendMail({
            from: `"Nahidea" <${process.env.EMAIL_USER}>`,
            to,
            subject,
            html
        });
        return { success: true, messageId: info.messageId };
    } catch (error) {
        console.error('❌ Error sending verification email:', error);
        throw error;
    }
};

const sendResendPinEmail = async (to, pinCode) => {
    const subject = 'Your New Verification Code';
    const html = getResendVerificationHTML(pinCode);
    
    try {
        const info = await transporter.sendMail({
            from: `"Nahidea" <${process.env.EMAIL_USER}>`,
            to,
            subject,
            html
        });
    
        return { success: true, messageId: info.messageId };
    } catch (error) {
        console.error('❌ Error sending resend verification email:', error);
        throw error;
    }
};

const sendVerifyCodeForgetPasswordEmail = async (to, pinCode) => {
    const subject = 'Reset Your Nahidea Password';
    const html = getPasswordResetHTML(pinCode);
    
    try {
        const info = await transporter.sendMail({
            from: `"Nahidea-Security" <${process.env.EMAIL_USER}>`,
            to,
            subject,
            html
        });
        return { success: true, messageId: info.messageId };
    } catch (error) {
        console.error('❌ Error sending password reset email:', error);
        throw error;
    }
};

const sendEmail = async (to, subject, text) => {
    try {
        const info = await transporter.sendMail({
            from: `"Nahidea" <${process.env.EMAIL_USER}>`,
            to,
            subject,
            text
        });
        return { success: true, messageId: info.messageId };
    } catch (error) {
        console.error('❌ Error sending email:', error);
        throw error;
    }
};

module.exports = { 
    sendEmail, 
    sendVerifyCodeEmail, 
    sendResendPinEmail, 
    sendVerifyCodeForgetPasswordEmail 
};