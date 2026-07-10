const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const pool = require('../../config/db'); 
require('dotenv').config();
const { sendVerifyCodeEmail, sendResendPinEmail, sendVerifyCodeForgetPasswordEmail} = require('../../service/mail/email');
const { createToken } = require('../../service/token/jwtHelp');
const { convertAndUpload } = require("../../service/hostinger/ftp");

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

//     let avatarUrl = null;
//     let bannerUrl = null;


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
//       // No new file — frontend sent back the existing banner URL as a plain string, keep it
//       bannerUrl = req.body.banner;
//     }

//     // Handle avatar
//     if (avatarType === 'file' && req.files?.avatar) {
//       try {
//         const uploadedUrl = await convertAndUpload(req.files?.avatar?.[0], "avatar");
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

//     // VALIDATION
//     if (!profession || !location || !nickname || !userId || !email || !bio) {
//       return res.status(400).json({
//         success: false,
//         message: "Missing required fields",
//       });
//     }

//     // Check for duplicate nickname
//     const nicknameResult = await pool.query(
//       `
//         SELECT id
//         FROM users
//         WHERE nickname = $1
//         AND id != $2
//         LIMIT 1
//       `,
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
      return res.status(400).json({
        success: false,
        message: "Missing required fields",
      });
    }

    // Fetch current values first — these become the fallback if nothing new is uploaded
    const currentUserResult = await pool.query(
      `SELECT avatar_url, banner_url FROM users WHERE id = $1 AND email = $2 LIMIT 1`,
      [parseInt(userId), email]
    );

    if (currentUserResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    const currentUser = currentUserResult.rows[0];

    let avatarUrl = currentUser.avatar_url;
    let bannerUrl = currentUser.banner_url;

    // Handle banner upload (if a new file was sent)
    if (req.files?.banner) {
      try {
        const uploadedUrl = await convertAndUpload(req.files.banner[0], "banner");
        bannerUrl = uploadedUrl.url;
      } catch (uploadError) {
        console.error("Banner upload error:", uploadError);
        return res.status(500).json({
          success: false,
          message: "Failed to upload banner image",
        });
      }
    } else if (req.body.banner) {
      bannerUrl = req.body.banner; // unchanged, frontend echoed the existing URL
    }
    // else: neither a new file nor a URL was sent — keep currentUser.banner_url as-is

    // Handle avatar
    if (avatarType === 'file' && req.files?.avatar) {
      try {
        const uploadedUrl = await convertAndUpload(req.files.avatar[0], "avatar");
        avatarUrl = uploadedUrl.url;
      } catch (uploadError) {
        console.error("Avatar upload error:", uploadError);
        return res.status(500).json({
          success: false,
          message: "Failed to upload avatar image",
        });
      }
    } else if (avatarType === 'url' && req.body.avatar) {
      avatarUrl = req.body.avatar;
    }
    // else: keep currentUser.avatar_url as-is

    // Check for duplicate nickname
    const nicknameResult = await pool.query(
      `SELECT id FROM users WHERE nickname = $1 AND id != $2 LIMIT 1`,
      [nickname, userId]
    );

    if (nicknameResult.rows.length > 0) {
      return res.status(409).json({
        success: false,
        message: "Nickname already taken",
      });
    }

    // UPDATE USER
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

    console.log("Profile updated successfully");
    return res.status(200).json({
      message: "Profile updated successfully",
    });
  } catch (err) {
    console.log(err.message);
    return res.status(500).json({
      message: "Internal server error",
    });
  }
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

    return res.status(200).json({
      userData: result.rows[0]
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
    getUserInfoById
}