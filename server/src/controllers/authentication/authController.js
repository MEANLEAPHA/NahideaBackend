const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const pool = require('../../config/db');
require('dotenv').config();

const { sendPinCodeEmail, sendResendPinEmail, sendResetPasswordPinEmail} = require('../../service/mail/email');
const { createToken } = require('../../service/token/jwtHelp'); // adjust path if needed


// const {uploadToS3, deleteFromS3 } = require("../middleware/AWSuploadMiddleware");
// login logical 
const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Email and password are required"
      });
    }

    const [users] = await pool.query(
      "SELECT * FROM users WHERE email = ?",
      [email]
    );

    if (users.length === 0) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    const user = users[0];

    const passwordValid = await bcrypt.compare(password, user.password_hash);

    if (!passwordValid) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password"
      });
    }

    if (user.is_verified === 0) {
      return res.status(403).json({
        success: false,
        message: "Please verify your email before logging in",
        needsVerification: true
      });
    }

    const token = createToken({
      userId: user.id,
      username: user.username,
      email: user.email
    });

    return res.status(200).json({
      success: true,
      message: "Login successful",
      token,
      userId: user.id,
      username: user.username,
    //   timezone: user.timezone || "UTC"
    });

  } catch (error) {

    console.error("loginMember error:", error);

    await logError(
      error.message,
      error.code,
      "loginMember",
      error.stack
    );

    return res.status(500).json({
      success: false,
      message: "Internal server error"
    });
  }
};

//Register Or Signup
const register = async (req, res) => {
  try {
    const { username, email, password} = req.body;

    if (!username || !email || !password) {
      return res.status(400).json({
        success: false,
        message: "Username, email and password are required"
      });
    }

    const [existingUser] = await pool.query(
      "SELECT id FROM users WHERE email = ?",
      [email]
    );

    if (existingUser.length > 0) {
      return res.status(409).json({
        success: false,
        message: "Email already registered"
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const pinCode = Math.floor(100000 + Math.random() * 900000).toString();

    const [result] = await pool.query(
      `INSERT INTO users
      (username, email, password_hash, pin_code, pin_created_at)
      VALUES (?, ?, ?, ?, NOW())`,
      [username, email, hashedPassword, pinCode]
    );

    let emailSent = false;

    try {
      await sendPinCodeEmail(email, pinCode);
      emailSent = true;

    } catch (emailError) {

      console.error("Email send failed:", emailError);

      await logError(
        emailError.message,
        emailError.code || "EMAIL_ERROR",
        `sendPinCodeEmail | email:${email}`,
        emailError.stack
      );
    }

    const token = createToken({
      userId: result.insertId,
      username,
      email,
      timezone: timezone || "UTC"
    });

    return res.status(201).json({
      success: true,
      message: emailSent
        ? "Registration successful. Please check your email."
        : "Registration successful but email failed. Please resend verification.",
      userId: result.insertId,
      token
    });

  } catch (error) {

    console.error("createMember error:", error);

    await logError(
      error.message,
      error.code,
      "createMember",
      error.stack
    );

    return res.status(500).json({
      success: false,
      message: "Internal server error"
    });
  }
};


const logError = async ({
  message,
  code = "UNKNOWN",
  location = "UNKNOWN",
  stack = null
}) => {
  try {

   
    console.error({
      message,
      code,
      location,
      stack,

    });

    await pool.query(
      `INSERT INTO error (message, code, location, stack, error_at)
       VALUES (?, ?, ?, ?, ?, NOW())`,
      [
        message,
        code,
        location,
        stack
      ]
    );

  } catch (loggingError) {
    console.error("Error while storing error log:", loggingError.message);

  }
};

module.exports = {
    login,
    register
}