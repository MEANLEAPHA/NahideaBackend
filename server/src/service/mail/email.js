
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
  logger: true,
  debug: true
});


const sendVerifyCodeEmail = async (to, pinCode) => {
  const subject = 'Your Verification Code';
  const html = `<p>Your verification code is: <b>${pinCode}</b></p>`;
  
  try {
    const info = await transporter.sendMail({
      from: `"Nahidea" <${process.env.EMAIL_USER}>`,
      to,
      subject,
      html
    });
    console.log('✅ Verification email sent:', info.response);
  } catch (error) {
    console.error('❌ Error sending verification email:', error);
  }
};



const sendResendPinEmail = async (to, pinCode) => {
    const subject = 'Your New Verification Code';
    const html = `<p>Your new verification code is: <b>${pinCode}</b></p>`;

    try {
        const info = await transporter.sendMail({
            from: `"Nahidea" <${process.env.EMAIL_USER}>`,
            to,
            subject,
            html
        });
        console.log('✅ Resend verification email sent:', info.response);
    } catch (error) {
        console.error('❌ Error sending resend verification email:', error);
    }
};

const sendVerifyCodeForgetPasswordEmail = async (to, pinCode) => {
  const subject = 'Reset Your Nahidea Password';
  const html = `
    <p>We received a request to reset your nahIdea password.</p>
    <p>Use the following 6-digit code:</p>
    <h2 style="letter-spacing: 3px;">${pinCode}</h2>
    <p>This code is valid for 10 minutes. If you didn’t request this, please ignore the email.</p>
  `;

  try {
    const info = await transporter.sendMail({
      from: `"Nahidea" <${process.env.EMAIL_USER}>`,
      to,
      subject,
      html
    });
    console.log('✅ Password reset email sent:', info.response);
  } catch (error) {
    console.error('❌ Error sending password reset email:', error);
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
        console.log('✅ Email sent:', info.response);
    } catch (error) {
        console.error('❌ Error sending email:', error);
    }
};


module.exports = { sendEmail, sendVerifyCodeEmail, sendResendPinEmail,  sendVerifyCodeForgetPasswordEmail};

