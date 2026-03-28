const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const pool = require('../../config/db');
require('dotenv').config();

const {Errors} = require('../../util/error/error')
const { sendVerifyCodeEmail, sendResendPinEmail, sendVerifyCodeForgetPasswordEmail} = require('../../service/mail/email');
const { createToken } = require('../../service/token/jwtHelp'); // adjust path if needed

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
      await sendVerifyCodeEmail(email, pinCode);
      emailSent = true;

    } catch (emailError) {

      console.error("Email send failed:", emailError);

      await Errors(
        emailError.message,
        emailError.code || "EMAIL_ERROR",
        `sendPinCodeEmail | email:${email}`,
        emailError.stack
      );

      return res.status(500).json({ message: 'Sever Error at Send pin code' });
    }

    // const token = createToken({
    //   userId: result.insertId,
    //   username,
    //   email,
    //   // timezone: timezone || "UTC"
    // });

    return res.status(201).json({
      success: true,
      message: emailSent
        ? "Registration successful. Please check your email."
        : "Registration successful but email failed. Please resend verification.",
      userId: result.insertId,
      email
    });

  } catch (error) {

    console.error("createMember error:", error);

    await Errors(
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


// verifyEmail + send code for fist register
const verifyEmail = async (req, res) => {
  try {
    const { pin, email } = req.body;


    if (!pin || pin.trim().length !== 6) {
      return res.status(400).json({ message: "Invalid PIN format" });
    }

    const pinTrimmed = Number(pin.trim());

    const [users] = await pool.query(
      "SELECT * FROM users WHERE email = ? AND pin_code = ?",
      [email, pinTrimmed]
    );

    if (!users.length) {
      return res.status(400).json({ message: "Invalid PIN code 1" });
    }
    const user = users[0];

    if (user.pin_attempts >= 5) {
      return res.status(429).json({
        message: "Too many attempts. Request new PIN",
      });
    }

    if (user.pin_code !== pinTrimmed) {
      await pool.query(
        "UPDATE users SET pin_attempts = pin_attempts + 1 WHERE id = ?",
        [user.id]
      );

      return res.status(400).json({ message: "Invalid PIN2" });
    }

    

    const pinAgeMinutes =
      (Date.now() - new Date(user.pin_created_at).getTime()) / 60000;

    if (pinAgeMinutes > 10) {
      return res.status(400).json({ message: "PIN expired" });
    }

    await pool.query(
      "UPDATE users SET is_verified = 1, pin_code = NULL, pin_attempts = 0, pin_created_at = NULL WHERE email = ?",
      [email]
    );

    return res.json({ message: "Email verified successfully" });

  } catch (error) {
    console.error(error);
    await Errors(
      error.message,
      error.code,
      "verifyEmail",
      error.stack
    )
    return res.status(500).json({ message: "Server error" });
  }
};

const resendverifyEmailPin = async (req, res) => {
  try {
    const userId = req.user.userId;

    const [[user]] = await pool.query(
      "SELECT email, pin_created_at FROM users WHERE id = ?",
      [userId]
    );

    // 🚨 prevent spam (5 min cooldown)
    if (user.pin_created_at) {
      const diff =
        (Date.now() - new Date(user.pin_created_at).getTime()) / 1000;

      if (diff < 300) {
        return res.status(429).json({
          message: "Please wait before requesting again",
        });
      }
    }

    const pinCode = Math.floor(100000 + Math.random() * 900000).toString();

    await pool.query(
      "UPDATE users SET pin_code = ?, pin_created_at = NOW(), pin_attempts = 0 WHERE id = ?",
      [pinCode, userId]
    );

    await sendResendPinEmail(user.email, pinCode);

    res.json({ message: "New PIN sent" });

  } catch (error) {
    console.error(error);
    await Errors(
      error.message,
      error.code,
      "resendverifyEmailPin",
      error.stack
    )
    return res.status(500).json({ message: "Server error" });
  }
};

// 

    // USER FORGET PASSWORD
//step 1
const forgetPassword = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email || !email.trim()) {
      return res.status(400).json({ message: "Invalid email" });
    }

    const trimmedEmail = email.trim();

    const [[user]] = await pool.query(
      "SELECT id, pin_created_at FROM users WHERE email = ?",
      [trimmedEmail]
    );

    // ✅ prevent spam (60s cooldown)
    if (user?.pin_created_at) {
      const diff =
        (Date.now() - new Date(user.pin_created_at).getTime()) / 1000;

      if (diff < 60) {
        return res.status(429).json({
          message: "Please wait before requesting again",
        });
      }
    }

    // ✅ ALWAYS respond same (no enumeration)
    if (!user) {
      return res.json({
        message: "If this email exists, a PIN has been sent",
      });
    }

    const pinCode = Math.floor(100000 + Math.random() * 900000).toString();

    await pool.query(
      "UPDATE users SET pin_code = ?, pin_created_at = NOW() WHERE id = ?",
      [pinCode, user.id]
    );

    await sendVerifyCodeForgetPasswordEmail(trimmedEmail, pinCode);

    return res.json({
      message: "If this email exists, a PIN has been sent",
    });

  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Server error" });
  }
};


// step 2
const verifyforgetPasswordPin = async (req, res) => {
  try {
    const { email, pin } = req.body;

    if (!email || !pin || pin.trim().length !== 6) {
      return res.status(400).json({ message: "Invalid input" });
    }

    const [[user]] = await pool.query(
      "SELECT id, pin_code, pin_created_at, pin_attempts FROM users WHERE email = ?",
      [email.trim()]
    );

  
    if (!user) {
      return res.status(400).json({ message: "Invalid PIN" });
    }

   
    if (user.pin_attempts >= 5) {
      return res.status(429).json({
        message: "Too many attempts. Request new PIN",
      });
    }

    if (user.pin_code !== pin.trim()) {
      await pool.query(
        "UPDATE users SET pin_attempts = pin_attempts + 1 WHERE id = ?",
        [user.id]
      );

      return res.status(400).json({ message: "Invalid PIN" });
    }

    const pinAgeMinutes =
      (Date.now() - new Date(user.pin_created_at).getTime()) / 60000;

    if (pinAgeMinutes > 10) {
      return res.status(400).json({ message: "PIN expired" });
    }

    // ✅ SUCCESS → clear PIN + attempts
    await pool.query(
      "UPDATE users SET pin_code = NULL, pin_attempts = 0 WHERE id = ?",
      [user.id]
    );

    return res.json({ message: "PIN verified" });

  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Server error" });
  }
};
const resendForgetPasswordPin = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.json({ message: "If email exists, PIN sent" });
    }

    const [[user]] = await pool.query(
      "SELECT id, pin_created_at FROM users WHERE email = ?",
      [email.trim()]
    );

    // no leak
    if (!user) {
      return res.json({ message: "If email exists, PIN sent" });
    }

    // ⏱ cooldown 5min
    if (user.pin_created_at) {
      const diff =
        (Date.now() - new Date(user.pin_created_at).getTime()) / 1000;

      if (diff < 300) {
        return res.status(429).json({
          message: "Wait before requesting again",
        });
      }
    }

    const pinCode = Math.floor(100000 + Math.random() * 900000).toString();

    await pool.query(
      "UPDATE users SET pin_code = ?, pin_created_at = NOW(), pin_attempts = 0 WHERE id = ?",
      [pinCode, user.id]
    );

    await sendVerifyCodeForgetPasswordEmail(email, pinCode);

    return res.json({ message: "If email exists, PIN sent" });

  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Server error" });
  }
};

const setNewPassword = async (req, res) => {
  try {
    const { email, newPassword } = req.body;

    if (!email || !newPassword) {
      return res.status(400).json({ message: "Missing fields" });
    }

    // 🔐 strong password check (same as frontend)
    const passwordRegex =
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z\d])[^\s]{8,}$/;

    if (!passwordRegex.test(newPassword)) {
      return res.status(400).json({ message: "Weak password" });
    }

    const [[user]] = await pool.query(
      "SELECT id, reset_verified FROM users WHERE email = ?",
      [email.trim()]
    );

    if (!user || user.reset_verified !== 1) {
      return res.status(403).json({ message: "Unauthorized request" });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    await pool.query(
      `UPDATE users 
       SET password = ?, reset_verified = 0 
       WHERE id = ?`,
      [hashedPassword, user.id]
    );

    return res.json({ message: "Password reset successful" });

  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Server error" });
  }
};


//  USER WANT TO CHANGE CURRENT PASSWORD
const changePassword = async (req, res) => {
  const {userId} = req.user.userId;
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword) {
    return res.status(400).json({ message: "Missing current or new password." });
  }

  const [[user]] = await pool.query("SELECT password FROM users WHERE user_id = ?", [userId]);

  const isMatch = await bcrypt.compare(currentPassword, user.password);
  if (!isMatch) {
    return res.status(401).json({ message: "Incorrect current password." });
  }

  const hashed = await bcrypt.hash(newPassword, 10);
  await pool.query("UPDATE users SET password = ? WHERE user_id = ?", [hashed, userId]);

  res.json({ message: "Password updated successfully." });
};

const newPassword = async (req, res) => {
  const { email, newPassword, pin } = req.body;

  if (!email || !newPassword || !pin) {
    return res.status(400).json({ message: "Email, PIN, and new password are required" });
  }

  try {
    const normalizedEmail = email.trim().toLowerCase();
    const trimmedPin = pin.trim();

    // Check if the user with matching PIN exists
    const [[user]] = await pool.query(
      "SELECT * FROM users WHERE email = ? AND pin_code = ?",
      [normalizedEmail, trimmedPin]
    );

    if (!user) {
      return res.status(400).json({ message: "Invalid email or PIN" });
    }

    // Check if the PIN is still valid (within 10 minutes)
    const pinAgeMinutes = (Date.now() - new Date(user.pin_created_at).getTime()) / 60000;
    if (pinAgeMinutes > 10) {
      return res.status(400).json({ message: "PIN has expired, please request a new one" });
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Update password and clear PIN
    await pool.query(
      `UPDATE users SET password = ?, pin_code = NULL, pin_created_at = NULL WHERE email = ?`,
      [hashedPassword, normalizedEmail]
    );

    return res.json({ message: "Password updated successfully. You can now log in." });

  } catch (error) {
    console.error("Error in updatePassword:", error);
    return res.status(500).json({ message: "Server error during password update" });
  }
};


module.exports = {
    login,
    register,
    verifyEmail,
    resendverifyEmailPin,

    // forget password process

      // step 1
      forgetPassword,
      //step 2
      verifyforgetPasswordPin,
      // step 2.1 if user miss the first Pin request for new one
      resendForgetPasswordPin,
      // last step or step 3
      setNewPassword,

    // user want to change current password
      changePassword,
      newPassword,
}


