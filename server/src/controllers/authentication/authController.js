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
        message: "Email and Password are required"
      });
    }

    const [users] = await pool.query(
      "SELECT * FROM users WHERE email = ?",
      [email]
    );

    if (users.length === 0) {
      return res.status(404).json({
        message: "No user found with this Email"
      });
    }

    const user = users[0];

    const passwordValid = await bcrypt.compare(password, user.password_hash);

    if (!passwordValid) {
      return res.status(401).json({
        message: "Invalid Password"
      });
    }

    if (user.is_verified === 0) {
      return res.status(403).json({
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
      message: "Login Successfully",
      token,
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
      message: "Server Error, Please try again later",
    });
  }
};

//Register Or Signup
const register = async (req, res) => {
  try {

    const { username, email, password} = req.body;

    if (!username || !email || !password) {
      return res.status(400).json({
        message: "Username, Email and Password are required"
      });
    }

    const [existingUser] = await pool.query(
      "SELECT id FROM users WHERE email = ?",
      [email]
    );

    if (existingUser.length > 0) {
      return res.status(409).json({
        message: "Oups! This Email is already registered"
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const pinCode = Math.floor(100000 + Math.random() * 900000).toString();

    await pool.query(
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

      await pool.query("DELETE FROM users WHERE email = ?", [email]);

      await Errors(
        emailError.message,
        emailError.code || "EMAIL_ERROR",
        `sendPinCodeEmail | email:${email}`,
        emailError.stack
      );
      
      return res.status(506).json({ message: "Sever can't send the PIN at this moment. Please try again later" });
    }

    return res.status(200).json({
      message: emailSent
        ? "Registration successful. Please check your email."
        : "Registration successful but email failed. Please resend verification.",
      needsVerification: true,
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
    if(!email){
      return res.status(401).json({ message: "Email is required" });
    }

    if (!pin || pin.trim().length !== 6) {
      return res.status(402).json({ message: "Invalid PIN format" });
    }

    const pinTrimmed = pin.trim();

    const [users] = await pool.query(
      "SELECT * FROM users WHERE email = ? AND pin_code = ?",
      [email, pinTrimmed]
    );

    if (!users.length) {
      return res.status(400).json({ message: "No Registrant found. Please register first" });
    }
    const user = users[0];

    if (user.pin_attempts >= 5) {
      return res.status(429).json({
        message: "Too many attempts. Please Request a new PIN",
      });
    }

    if (user.pin_code !== pinTrimmed) {
      await pool.query(
        "UPDATE users SET pin_attempts = pin_attempts + 1 WHERE id = ?",
        [user.id]
      );

      return res.status(403).json({ message: "Invalid PIN" });
    }

    

    const pinAgeMinutes =
      (Date.now() - new Date(user.pin_created_at).getTime()) / 60000;

    if (pinAgeMinutes > 10) {
      return res.status(405).json({ message: "Your PIN has expired, please request a new one" });
    }

    await pool.query(
      "UPDATE users SET is_verified = 1, pin_code = NULL, pin_attempts = 0, pin_created_at = NULL WHERE email = ?",
      [email]
    );

    return res.status(200).json({ message: "Email verified Successfully" });

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
    
    const {email} = req.body;
    if(!email){
      return res.status(401).json({ message: "Email is required" });
    }
    const [[user]] = await pool.query(
      "SELECT pin_created_at FROM users WHERE email = ?",
      [email]
    );
 
    if(!user){
      return res.status(404).json({ message: "No Registrant found. Please register first" });
    }
    // 🚨 prevent spam (5 min cooldown)
    if (user.pin_created_at) {
      const diff =
        (Date.now() - new Date(user.pin_created_at).getTime()) / 1000;

      if (diff < 300) {
        return res.status(429).json({
          message: "Please wait 5 minutes before requesting new PIN",
        });
      }
    }

    const pinCode = Math.floor(100000 + Math.random() * 900000).toString();

    await pool.query(
      "UPDATE users SET pin_code = ?, pin_created_at = NOW(), pin_attempts = 0 WHERE email = ?",
      [pinCode, email]
    );
   
    try{
      await sendResendPinEmail(email, pinCode);
    }
    catch(EmailError){
      console.error(EmailError);
      return res.status(506).json({ message: "Sever can't send the PIN at this moment. Please try again later" });
    }

    res.status(200).json({ message: "New PIN sent" });

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
      return res.status(400).json({ message: "Email is required" });
    }

    const trimmedEmail = email.trim();

    const [[user]] = await pool.query(
      "SELECT id, pin_created_at FROM users WHERE email = ?",
      [trimmedEmail]
    );


    if (!user) {
      return res.status(404).json({
        message: "No user found with this Email",
      });
    }


    if (user?.pin_created_at) {
      const diff =
        (Date.now() - new Date(user.pin_created_at).getTime()) / 1000;

      if (diff < 60) {
        return res.status(429).json({
          message: "Please wait before requesting again",
        });
      }
    }

    

    const pinCode = Math.floor(100000 + Math.random() * 900000).toString();

    await pool.query(
      "UPDATE users SET pin_code = ?, pin_created_at = NOW() WHERE id = ?",
      [pinCode, user.id]
    );

    try{
      await sendVerifyCodeForgetPasswordEmail(trimmedEmail, pinCode);
    }
    catch(EmailError){
      console.error(EmailError);
      return res.status(506).json({ message: "Sever can't send the PIN at this moment. Please try again later" });
    }

    return res.status(200).json({
      message: "A verification code has been sent to your Email",
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
      return res.status(400).json({ message: "Email and PIN are required" });
    }

    const [[user]] = await pool.query(
      "SELECT id, pin_code, pin_created_at, pin_attempts FROM users WHERE email = ?",
      [email.trim()]
    );

  
    if (!user) {
      return res.status(404).json({ message: "No user found with this Email" });
    }

   
    if (user.pin_attempts >= 5) {
      return res.status(429).json({
        message: "Too many attempts, please request a new PIN",
      });
    }

    if (user.pin_code !== pin.trim()) {
      await pool.query(
        "UPDATE users SET pin_attempts = pin_attempts + 1 WHERE id = ?",
        [user.id]
      );

      return res.status(421).json({ message: "Invalid PIN" });
    }

    const pinAgeMinutes =
      (Date.now() - new Date(user.pin_created_at).getTime()) / 60000;

    if (pinAgeMinutes > 10) {
      return res.status(422).json({ message: "Your PIN has expired, please request a new one" });
    }

    // ✅ SUCCESS → clear PIN + attempts
    await pool.query(
      "UPDATE users SET pin_code = NULL, pin_attempts = 0, reset_verified = 1 WHERE id = ?",
      [user.id]
    );

    return res.status(200).json({ message: "PIN verified successfully" });

  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Server error" });
  }
};
const resendForgetPasswordPin = async (req, res) => {
  try {

    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ message: "Email is required" });
    }

    const [[user]] = await pool.query(
      "SELECT id, pin_created_at FROM users WHERE email = ?",
      [email.trim()]
    );

    
    if (!user) {
      return res.status(404).json({ message: "No user found with this Email" });
    }

    // ⏱ cooldown 5min
    if (user.pin_created_at) {
      const diff =
        (Date.now() - new Date(user.pin_created_at).getTime()) / 1000;

      if (diff < 300) {
        return res.status(429).json({
          message: "Please wait 5 minutes before requesting a new PIN",
        });
      }
    }

    const pinCode = Math.floor(100000 + Math.random() * 900000).toString();

    await pool.query(
      "UPDATE users SET pin_code = ?, pin_created_at = NOW(), pin_attempts = 0 WHERE id = ?",
      [pinCode, user.id]
    );

    try{
      await sendVerifyCodeForgetPasswordEmail(email, pinCode);
    }
    catch(EmailError){
      console.error(EmailError);
      return res.status(506).json({ message: "Sever can't send the PIN at this moment. Please try again later" });
    }

    return res.status(200).json({ message: "New PIN sent" });

  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Server error" });
  }
};

const setNewPassword = async (req, res) => {
  try {
    const { email, newPassword } = req.body;

    if (!email || !newPassword) {
      return res.status(400).json({ message: "Email and new password are required" });
    }

    // 🔐 strong password check (same as frontend)
    const passwordRegex =
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z\d])[^\s]{8,}$/;

    if (!passwordRegex.test(newPassword)) {
      return res.status(401).json({ message: "Password is not strong enough" });
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
       SET password_hash = ?, reset_verified = 0 
       WHERE id = ?`,
      [hashedPassword, user.id]
    );

    return res.status(200).json({ message: "Password reset successfully" });

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


