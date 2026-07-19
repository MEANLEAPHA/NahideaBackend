const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const pool = require('../../config/db'); 
const { ranking } = require("../../config/redisClient"); 
const crypto = require('crypto');
require('dotenv').config();
const { sendVerifyCodeEmail, sendResendPinEmail, sendVerifyCodeForgetPasswordEmail} = require('../../service/mail/email');
const { createToken } = require('../../service/token/jwtHelp');
const { convertAndUpload } = require("../../service/hostinger/ftp");

const { OAuth2Client } = require('google-auth-library');
const axios = require('axios');

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// login logical 
const login = async (req, res) => {
  try {

    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        message: "Email and Password are required"
      });
    }

    const result = await pool.query(
      "SELECT * FROM users WHERE email = $1",
      [email]
    );
    const users = result.rows;

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
    });

    return res.status(200).json({
      message: "Login Successfully",
      token,
    });

  } catch (error) {

    console.error("loginMember error:", error);

    return res.status(500).json({
      message: "Server Error, Please try again later",
    });
  }
};

// Google OAuth login/register
const googleLogin = async (req, res) => {
  try {
    const { credential } = req.body; // ID token from Google Identity Services

    if (!credential) {
      return res.status(400).json({ message: "Missing Google credential" });
    }

    let payload;
    try {
      const ticket = await googleClient.verifyIdToken({
        idToken: credential,
        audience: process.env.GOOGLE_CLIENT_ID,
      });
      payload = ticket.getPayload();
    } catch (verifyErr) {
      console.error("Google token verification failed:", verifyErr);
      return res.status(401).json({ message: "Invalid Google token" });
    }

    const { email, name, sub: providerId, picture } = payload;

    if (!email) {
      return res.status(400).json({ message: "Google account has no email" });
    }

    const existing = await pool.query("SELECT * FROM users WHERE email = $1", [email]);
    let user;
    let isNewUser = false;

    if (existing.rows.length > 0) {
      user = existing.rows[0];

      if (user.auth_provider === 'local' || !user.auth_provider) {
        return res.status(409).json({
          message: "This email is already registered. Please log in with your password instead."
        });
      }

      if (user.auth_provider !== 'google') { 
        return res.status(409).json({
          message: `This email is already registered via ${user.auth_provider}. Please use that method to log in.`
        });
      }

    } else {
      isNewUser = true;

      const generatePlaceholderUsername = () => `user_${crypto.randomBytes(4).toString('hex')}`;
      let usernameBase = generatePlaceholderUsername();

      let attempts = 0;
      while (attempts < 5) {
        const check = await pool.query("SELECT id FROM users WHERE username = $1", [usernameBase]);
        if (check.rows.length === 0) break;
        usernameBase = generatePlaceholderUsername();
        attempts++;
      }

      const insertResult = await pool.query(
        `INSERT INTO users
          (username, email, password_hash, is_verified, auth_provider, provider_id, avatar_url)
        VALUES ($1, $2, NULL, 1, 'google', $3, $4)
        RETURNING *`,
        [usernameBase, email, providerId, picture || null]
      );
      user = insertResult.rows[0];
    }

    const token = createToken({ userId: user.id });

    return res.status(200).json({
      message: "Login Successfully",
      token,
      isNewUser,
      userId: user.id,
      email: user.email
    });

  } catch (error) {
    console.error("googleLogin error:", error);
    return res.status(500).json({ message: "Server Error, Please try again later" });
  }
};

// Facebook OAuth login/register
const facebookLogin = async (req, res) => {
  try {
    const { accessToken } = req.body;

    if (!accessToken) {
      return res.status(400).json({ message: "Missing Facebook access token" });
    }

    let fbUser;
    try {
    
      const verifyRes = await axios.get("https://graph.facebook.com/debug_token", {
        params: {
          input_token: accessToken,
          access_token: `${process.env.FACEBOOK_APP_ID}|${process.env.FACEBOOK_APP_SECRET}`,
        },
      });

      const tokenData = verifyRes.data.data;
      if (!tokenData.is_valid || tokenData.app_id !== process.env.FACEBOOK_APP_ID) {
        return res.status(401).json({ message: "Invalid Facebook token" });
      }

      const profileRes = await axios.get("https://graph.facebook.com/me", {
        params: {
          fields: "id,name,email,picture",
          access_token: accessToken,
        },
      });
      fbUser = profileRes.data;

    } catch (verifyErr) {
      console.error("Facebook verification failed:", verifyErr.response?.data || verifyErr.message);
      return res.status(401).json({ message: "Invalid Facebook token" });
    }

    const { email, name, id: providerId, picture } = fbUser;

    if (!email) {
      return res.status(400).json({
        message: "Your Facebook account has no email attached. Please register with email instead."
      });
    }

    const existing = await pool.query("SELECT * FROM users WHERE email = $1", [email]);
    let user;
    let isNewUser = false;

    if (existing.rows.length > 0) {
      user = existing.rows[0];

      if (user.auth_provider === 'local' || !user.auth_provider) {
        return res.status(409).json({
          message: "This email is already registered. Please log in with your password instead."
        });
      }

      if (user.auth_provider !== 'facebook') { 
        return res.status(409).json({
          message: `This email is already registered via ${user.auth_provider}. Please use that method to log in.`
        });
      }

    } else {
      isNewUser = true;

      const generatePlaceholderUsername = () => `user_${crypto.randomBytes(4).toString('hex')}`;
      let usernameBase = generatePlaceholderUsername();

      let attempts = 0;
      while (attempts < 5) {
        const check = await pool.query("SELECT id FROM users WHERE username = $1", [usernameBase]);
        if (check.rows.length === 0) break;
        usernameBase = generatePlaceholderUsername();
        attempts++;
      }

      const insertResult = await pool.query(
        `INSERT INTO users
          (username, email, password_hash, is_verified, auth_provider, provider_id, avatar_url)
        VALUES ($1, $2, NULL, 1, 'google', $3, $4)
        RETURNING *`,
        [usernameBase, email, providerId, picture || null]
      );
      user = insertResult.rows[0];
    }

    const token = createToken({ userId: user.id });

    return res.status(200).json({
      message: "Login Successfully",
      token,
      isNewUser,
      userId: user.id,
      email: user.email
    });

  } catch (error) {
    console.error("facebookLogin error:", error);
    return res.status(500).json({ message: "Server Error, Please try again later" });
  }
};

// GitHub OAuth — step 1: redirect user to GitHub's authorize page
const githubRedirect = (req, res) => {
  const params = new URLSearchParams({
    client_id: process.env.GITHUB_CLIENT_ID,
    redirect_uri: process.env.GITHUB_CALLBACK_URL,
    scope: "read:user user:email",
  });
  res.redirect(`https://github.com/login/oauth/authorize?${params.toString()}`);
};

// GitHub OAuth — step 2: handle the callback GitHub redirects to
const githubCallback = async (req, res) => {
  try {
    const { code } = req.query;

    if (!code) {
      return res.redirect(`${process.env.FRONTEND_URL}/login?error=github_no_code`);
    }

    // Exchange code for access token
    const tokenRes = await axios.post(
      "https://github.com/login/oauth/access_token",
      {
        client_id: process.env.GITHUB_CLIENT_ID,
        client_secret: process.env.GITHUB_CLIENT_SECRET,
        code,
        redirect_uri: process.env.GITHUB_CALLBACK_URL,
      },
      { headers: { Accept: "application/json" } }
    );

    const { access_token } = tokenRes.data;

    if (!access_token) {
      return res.redirect(`${process.env.FRONTEND_URL}/login?error=github_token_failed`);
    }

    // Fetch profile
    const profileRes = await axios.get("https://api.github.com/user", {
      headers: { Authorization: `Bearer ${access_token}` },
    });
    const profile = profileRes.data;

    let email = profile.email;

    // GitHub often hides email on the profile — fetch it separately if missing
    if (!email) {
      const emailsRes = await axios.get("https://api.github.com/user/emails", {
        headers: { Authorization: `Bearer ${access_token}` },
      });
      const primary = emailsRes.data.find(e => e.primary && e.verified);
      email = primary?.email || null;
    }

    if (!email) {
      return res.redirect(`${process.env.FRONTEND_URL}/login?error=github_no_email`);
    }

    const providerId = profile.id.toString();
    const picture = profile.avatar_url;

    const existing = await pool.query("SELECT * FROM users WHERE email = $1", [email]);
    let user;
    let isNewUser = false;

    if (existing.rows.length > 0) {
      user = existing.rows[0];

      if (user.auth_provider === 'local' || !user.auth_provider) {
        return res.redirect(`${process.env.FRONTEND_URL}/login?error=email_registered_local`);
      }

      if (user.auth_provider !== 'github') {
        return res.redirect(`${process.env.FRONTEND_URL}/login?error=email_registered_other&provider=${user.auth_provider}`);
      }

    } else {
      isNewUser = true;

      const generatePlaceholderUsername = () => `user_${crypto.randomBytes(4).toString('hex')}`;
      let usernameBase = generatePlaceholderUsername();

      let attempts = 0;
      while (attempts < 5) {
        const check = await pool.query("SELECT id FROM users WHERE username = $1", [usernameBase]);
        if (check.rows.length === 0) break;
        usernameBase = generatePlaceholderUsername();
        attempts++;
      }

      const insertResult = await pool.query(
        `INSERT INTO users
          (username, email, password_hash, is_verified, auth_provider, provider_id, avatar_url)
         VALUES ($1, $2, NULL, 1, 'github', $3, $4)
         RETURNING *`,
        [usernameBase, email, providerId, picture || null]
      );
      user = insertResult.rows[0];
    }

    const token = createToken({ userId: user.id });

    // Redirect back to frontend with token in query — frontend picks it up and stores it
    const redirectParams = new URLSearchParams({
      token,
      isNewUser: isNewUser.toString(),
      userId: user.id.toString(),
      email: user.email,
    });

    return res.redirect(`${process.env.FRONTEND_URL}/oauth-callback?${redirectParams.toString()}`);

  } catch (error) {
    console.error("githubCallback error:", error);
    return res.redirect(`${process.env.FRONTEND_URL}/login?error=server_error`);
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

    const existingResult = await pool.query(
      "SELECT id FROM users WHERE email = $1",
      [email]
    );

    if (existingResult.rows.length > 0) {
      return res.status(409).json({
        message: "Oups! This Email is already registered"
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const pinCode = Math.floor(100000 + Math.random() * 900000).toString();

    await pool.query(
      `INSERT INTO users
      (username, email, password_hash, pin_code, pin_created_at)
      VALUES ($1, $2, $3, $4, NOW())`,
      [username, email, hashedPassword, pinCode]
    );

    let emailSent = false;

    try {
      await sendVerifyCodeEmail(email, pinCode);
      emailSent = true;

    } catch (emailError) {
      console.error("Email send failed:", emailError);
      await pool.query("DELETE FROM users WHERE email = $1", [email]);
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

    const result = await pool.query(
      "SELECT * FROM users WHERE email = $1 AND pin_code = $2",
      [email, pinTrimmed]
    );
    const users = result.rows;

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
        "UPDATE users SET pin_attempts = pin_attempts + 1 WHERE id = $1",
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
      "UPDATE users SET is_verified = 1, pin_code = NULL, pin_attempts = 0, pin_created_at = NULL WHERE email = $1",
      [email]
    );

    return res.status(200).json(
      { message: "Email verified Successfully",
        userId: user.id,
        email: user.email
       }
    );

  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Server error" });
  }
};

const resendverifyEmailPin = async (req, res) => {
  try {
    
    const {email} = req.body;
    if(!email){
      return res.status(401).json({ message: "Email is required" });
    }
    const result = await pool.query(
      "SELECT pin_created_at FROM users WHERE email = $1",
      [email]
    );
    const user = result.rows[0];
 
    if(!user){
      return res.status(404).json({ message: "No Registrant found. Please register first" });
    }
    // 🚨 prevent spam (1 min cooldown)
    if (user.pin_created_at) {
      const diff =
        (Date.now() - new Date(user.pin_created_at).getTime()) / 1000;

      if (diff < 60) {
        return res.status(429).json({
          message: "Please wait 1 minutes before requesting new PIN",
        });
      }
    }

    const pinCode = Math.floor(100000 + Math.random() * 900000).toString();

    await pool.query(
      "UPDATE users SET pin_code = $1, pin_created_at = NOW(), pin_attempts = 0 WHERE email = $2",
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
    return res.status(500).json({ message: "Server error" });
  }
};

    // USER FORGET PASSWORD //

//step 1
const forgetPassword = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email || !email.trim()) {
      return res.status(400).json({ message: "Email is required" });
    }

    const trimmedEmail = email.trim();

    const result = await pool.query(
      "SELECT id, pin_created_at FROM users WHERE email = $1",
      [trimmedEmail]
    );
    const user = result.rows[0];


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
      "UPDATE users SET pin_code = $1, pin_created_at = NOW() WHERE id = $2",
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

    const result = await pool.query(
      "SELECT id, pin_code, pin_created_at, pin_attempts FROM users WHERE email = $1",
      [email.trim()]
    );
    const user = result.rows[0];

  
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
        "UPDATE users SET pin_attempts = pin_attempts + 1 WHERE id = $1",
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
      "UPDATE users SET pin_code = NULL, pin_attempts = 0, reset_verified = 1 WHERE id = $1",
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

    const result = await pool.query(
      "SELECT id, pin_created_at FROM users WHERE email = $1",
      [email.trim()]
    );
    const user = result.rows[0];

    
    if (!user) {
      return res.status(404).json({ message: "No user found with this Email" });
    }

    // ⏱ cooldown 1min
    if (user.pin_created_at) {
      const diff =
        (Date.now() - new Date(user.pin_created_at).getTime()) / 1000;

      if (diff < 60) {
        return res.status(429).json({
          message: "Please wait 1 minutes before requesting a new PIN",
        });
      }
    }

    const pinCode = Math.floor(100000 + Math.random() * 900000).toString();

    await pool.query(
      "UPDATE users SET pin_code = $1, pin_created_at = NOW(), pin_attempts = 0 WHERE id = $2",
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

    const result = await pool.query(
      "SELECT id, reset_verified FROM users WHERE email = $1",
      [email.trim()]
    );
    const user = result.rows[0];

    if (!user || user.reset_verified !== 1) {
      return res.status(403).json({ message: "Unauthorized request" });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    await pool.query(
      `UPDATE users 
       SET password_hash = $1, reset_verified = 0 
       WHERE id = $2`,
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

  const result = await pool.query("SELECT password FROM users WHERE user_id = $1", [userId]);
  const user = result.rows[0];

  const isMatch = await bcrypt.compare(currentPassword, user.password);
  if (!isMatch) {
    return res.status(401).json({ message: "Incorrect current password." });
  }

  const hashed = await bcrypt.hash(newPassword, 10);
  await pool.query("UPDATE users SET password = $1 WHERE user_id = $2", [hashed, userId]);

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
    const result = await pool.query(
      "SELECT * FROM users WHERE email = $1 AND pin_code = $2",
      [normalizedEmail, trimmedPin]
    );
    const user = result.rows[0];

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
      `UPDATE users SET password = $1, pin_code = NULL, pin_created_at = NULL WHERE email = $2`,
      [hashedPassword, normalizedEmail]
    );

    return res.json({ message: "Password updated successfully. You can now log in." });

  } catch (error) {
    console.error("Error in updatePassword:", error);
    return res.status(500).json({ message: "Server error during password update" });
  }
};

const getUserInfo = async (req, res) => {
  try {
    const userId = req.user.userId;
    const result = await pool.query(
      "SELECT * FROM users WHERE id = $1",
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "User not found" });
    }

    return res.status(200).json({ userData: result.rows[0] });
  } catch (err) {
    console.error("Error in getUserInfo:", err);
    return res.status(500).json({ message: "Server error" });
  }
};

// const updateUser = async (req, res) => {
//   try {
//     const {
//       profession,
//       location,
//       nickname,
//       userId,
//       email,
//       bio,
//       avatarType,
//     } = req.body;

//     if (!profession || !location || !nickname || !userId || !email || !bio) {
//       return res.status(400).json({
//         success: false,
//         message: "Missing required fields",
//       });
//     }

//     // Fetch current values first — these become the fallback if nothing new is uploaded
//     const currentUserResult = await pool.query(
//       `SELECT avatar_url, banner_url FROM users WHERE id = $1 AND email = $2 LIMIT 1`,
//       [parseInt(userId), email]
//     );

//     if (currentUserResult.rows.length === 0) {
//       return res.status(404).json({ success: false, message: "User not found" });
//     }

//     const currentUser = currentUserResult.rows[0];

//     let avatarUrl = currentUser.avatar_url;
//     let bannerUrl = currentUser.banner_url;

//     // Handle banner upload (if a new file was sent)
//     if (req.files?.banner) {
//       try {
//         const uploadedUrl = await convertAndUpload(req.files.banner[0], "banner");
//         bannerUrl = uploadedUrl.url;
//       } catch (uploadError) {
//         console.error("Banner upload error:", uploadError);
//         return res.status(500).json({
//           success: false,
//           message: "Failed to upload banner image",
//         });
//       }
//     } else if (req.body.banner) {
//       bannerUrl = req.body.banner; // unchanged, frontend echoed the existing URL
//     }
//     // else: neither a new file nor a URL was sent — keep currentUser.banner_url as-is

//     // Handle avatar
//     if (avatarType === 'file' && req.files?.avatar) {
//       try {
//         const uploadedUrl = await convertAndUpload(req.files.avatar[0], "avatar");
//         avatarUrl = uploadedUrl.url;
//       } catch (uploadError) {
//         console.error("Avatar upload error:", uploadError);
//         return res.status(500).json({
//           success: false,
//           message: "Failed to upload avatar image",
//         });
//       }
//     } else if (avatarType === 'url' && req.body.avatar) {
//       avatarUrl = req.body.avatar;
//     }
//     // else: keep currentUser.avatar_url as-is

//     // Check for duplicate nickname
//     const nicknameResult = await pool.query(
//       `SELECT id FROM users WHERE nickname = $1 AND id != $2 LIMIT 1`,
//       [nickname, userId]
//     );

//     if (nicknameResult.rows.length > 0) {
//       return res.status(409).json({
//         success: false,
//         message: "Nickname already taken",
//       });
//     }

//     // UPDATE USER
//     await pool.query(
//       `
//       UPDATE users
//       SET
//         avatar_url = $1,
//         banner_url = $2,
//         profession = $3,
//         work_place = $4,
//         nickname = $5,
//         bio = $6,
//         updated_at = NOW()
//       WHERE id = $7
//       AND email = $8
//       `,
//       [avatarUrl, bannerUrl, profession, location, nickname, bio, parseInt(userId), email]
//     );

//     console.log("Profile updated successfully");
//     return res.status(200).json({
//       message: "Profile updated successfully",
//     });
//   } catch (err) {
//     console.log(err.message);
//     return res.status(500).json({
//       message: "Internal server error",
//     });
//   }
// };
const updateUser = async (req, res) => {
  console.log("[updateUser] Incoming body:", req.body);
  console.log("[updateUser] Incoming files:", req.files ? Object.keys(req.files) : "none");

  try {
    const {
      profession,
      location,
      nickname,
      userId,
      email,
      bio,
      avatarType,
    } = req.body;

    if (!profession || !location || !nickname || !userId || !email || !bio) {
      console.warn("[updateUser] Missing required field(s):", {
        profession: !!profession, location: !!location, nickname: !!nickname,
        userId: !!userId, email: !!email, bio: !!bio,
      });
      return res.status(400).json({
        success: false,
        message: "Missing required fields",
      });
    }

    const currentUserResult = await pool.query(
      `SELECT avatar_url, banner_url FROM users WHERE id = $1 AND email = $2 LIMIT 1`,
      [parseInt(userId), email]
    );

    if (currentUserResult.rows.length === 0) {
      console.warn("[updateUser] No user found for id/email:", { userId, email });
      return res.status(404).json({ success: false, message: "User not found" });
    }

    const currentUser = currentUserResult.rows[0];
    let avatarUrl = currentUser.avatar_url;
    let bannerUrl = currentUser.banner_url;

    console.log("[updateUser] Current DB values:", { avatarUrl, bannerUrl });

    // Banner
    if (req.files?.banner) {
      console.log("[updateUser] Banner file present, uploading...");
      try {
        const uploadedUrl = await convertAndUpload(req.files.banner[0], "banner");
        bannerUrl = uploadedUrl.url;
        console.log("[updateUser] Banner upload success:", bannerUrl);
      } catch (uploadError) {
        console.error("[updateUser] Banner upload FAILED:", uploadError.message);
        return res.status(500).json({
          success: false,
          message: "Failed to upload banner image",
        });
      }
    } else if (req.body.banner) {
      console.log("[updateUser] No banner file, using existing URL from body:", req.body.banner);
      bannerUrl = req.body.banner;
    } else {
      console.log("[updateUser] No banner file or URL sent, keeping current:", bannerUrl);
    }

    // Avatar
    if (avatarType === 'file' && req.files?.avatar) {
      console.log("[updateUser] Avatar file present, uploading...");
      try {
        const uploadedUrl = await convertAndUpload(req.files.avatar[0], "avatar");
        avatarUrl = uploadedUrl.url;
        console.log("[updateUser] Avatar upload success:", avatarUrl);
      } catch (uploadError) {
        console.error("[updateUser] Avatar upload FAILED:", uploadError.message);
        return res.status(500).json({
          success: false,
          message: "Failed to upload avatar image",
        });
      }
    } else if (avatarType === 'url' && req.body.avatar) {
      console.log("[updateUser] Using avatar URL from body:", req.body.avatar);
      avatarUrl = req.body.avatar;
    } else {
      console.log("[updateUser] No avatar file or URL sent, keeping current:", avatarUrl);
    }

    const nicknameResult = await pool.query(
      `SELECT id FROM users WHERE nickname = $1 AND id != $2 LIMIT 1`,
      [nickname, userId]
    );

    if (nicknameResult.rows.length > 0) {
      console.warn("[updateUser] Nickname taken:", nickname);
      return res.status(409).json({
        success: false,
        message: "Nickname already taken",
      });
    }

    console.log("[updateUser] Final values before UPDATE:", {
      avatarUrl, bannerUrl, profession, location, nickname, bio, userId, email,
    });

    await pool.query(
      `
      UPDATE users
      SET
        avatar_url = $1,
        banner_url = $2,
        profession = $3,
        work_place = $4,
        nickname = $5,
        bio = $6,
        updated_at = NOW()
      WHERE id = $7
      AND email = $8
      `,
      [avatarUrl, bannerUrl, profession, location, nickname, bio, parseInt(userId), email]
    );

    console.log("[updateUser] SUCCESS — profile updated for userId:", userId);
    return res.status(200).json({
      message: "Profile updated successfully",
    });
  } catch (err) {
    console.error("[updateUser] UNCAUGHT ERROR:", {
      message: err.message,
      code: err.code,
      detail: err.detail,
      stack: err.stack,
    });
    return res.status(500).json({
      message: "Internal server error",
    });
  }
};

const getCurrentMonthKey = () => {
  const now = new Date();
  return `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;
};

const getUserInfoById = async (req, res) => {
  try {
    const userId = req.params.userId;

    const result = await pool.query(
      `
      SELECT 
        u.username,
        u.avatar_url,
        u.id,
        u.nickname,
        u.banner_url,
        u.profession,
        u.work_place,
        u.bio,
        u.created_at,
        u.followers_count,
        u.following_count,
        COUNT(p.id) as post_count
      FROM users u
      LEFT JOIN posts p ON u.id = p.user_id
      WHERE u.id = $1
      GROUP BY u.id
      `,
      [userId]
    );

    if (!result.rows.length) {
      return res.status(404).json({
        message: "User not found"
      });
    }

    // Fetch THIS profile's rank/score from the live Redis leaderboard —
    // scoped to userId (the profile being viewed), not req.user.userId (the logged-in viewer)
    const redisKey = `hof:month:${getCurrentMonthKey()}`;

    const [totalMembers, ascendingRank, score] = await Promise.all([
      ranking.zCard(redisKey),
      ranking.zRank(redisKey, userId.toString()),
      ranking.zScore(redisKey, userId.toString()),
    ]);

    let rank = null;
    let badgeTier = null;

    if (ascendingRank !== null && score !== null) {
      const descendingRankZeroBased = totalMembers - 1 - ascendingRank;
      rank = descendingRankZeroBased + 1;
      badgeTier = rank <= 10 ? rank : null;
    }

    return res.status(200).json({
      userData: {
        ...result.rows[0],
        rank,
        score: score !== null ? Number(score) : 0,
        badgeTier,
      }
    });

  } catch (err) {
    console.error("Error in getUserInfo:", err);
    return res.status(500).json({
      message: "Server error"
    });
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

    updateUser,

    // get user info
    getUserInfo,
    getUserInfoById,

    // OAuth

    // Google OAuth
    googleLogin,

    // Facebook OAuth
    facebookLogin,

    // GitHub OAuth
    githubRedirect,
    githubCallback
}