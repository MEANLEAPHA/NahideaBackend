// const verifyEmail = async (req, res) => {
//   try {
//     const { pin } = req.body;
//     const {email} = req.user.email;
//     const pinTrimmed = pin.trim();
    
//     const [users] = await pool.query(
//       'SELECT * FROM users WHERE email = ? AND pin_code = ?',
//       [email, pinTrimmed]
//     );

//     if (!users || users.length === 0) {
//       return res.status(400).json({ message: 'Invalid PIN code.' });
//     }

//     const user = users[0];
    
//     const pinAgeMinutes = (Date.now() - new Date(user.pin_created_at).getTime()) / 60000;

//     if (pinAgeMinutes > 10) {
//       return res.status(400).json({ message: 'PIN code expired. Please request a new one :)' });
//     }

//     // Update status and clear PIN
//     await pool.query(
//       'UPDATE users SET is_verified = ?, pin_code = NULL, pin_created_at = NULL WHERE email = ?',
//       [1, email]
//     );

//     console.log("Email verified successfully for", email);
//     return res.json({ message: 'Email verified successfully!' });

//   } catch (error) {
//     console.error(error.message);
//     await Errors(
//       error. message,
//       error.code,
//       'verifyEmail',
//       error.stack
//     )
//     return res.status(500).json({ message: 'Server error' });
//   }
// };


// const resendverifyEmailPin = async (req, res) => {
//   try {
//     const {userId} = req.user.userId;

//     // Generate new 6-digit PIN
//     const pinCode = Math.floor(100000 + Math.random() * 900000).toString();
//     const createdAt = new Date();

//     // Update pin and timestamp in pool
//     await pool.query(
//       `UPDATE users SET pin_code = ?, pin_created_at = ? WHERE id = ?`,
//       [pinCode, createdAt, userId]
//     );

//     // Get user's email
//     const [[user]] = await pool.query(`SELECT email FROM users WHERE id = ?`, [userId]);

//     // Use the resend email function from email.js
//     await sendResendPinEmail(user.email, pinCode);

//     res.json({ message: "New verification code has been sent. Please check your email." });

//   } catch (error) {
//     await Errors(
//         error.message,
//         error.code || "EMAIL_ERROR",
//         `resendverifyEmailPin`,
//         error.stack
//       );
//   }
// };


// const forgetPassword = async (req, res) => {
//   const { email } = req.body;

//   if (!email) return res.status(400).json({ message: "Please provide your email" });

//   const [[user]] = await pool.query("SELECT * FROM users WHERE email = ?", [email]);

//   if (!user) return res.status(404).json({ message: "No user found with this email!" });

//   const pinCode = Math.floor(100000 + Math.random() * 900000).toString();

//   await pool.query(`
//     UPDATE users SET pin_code = ?, pin_created_at = NOW() WHERE email = ?
//   `, [pinCode, email]);

//   await sendVerifyCodeForgetPasswordEmail(email, pinCode); 

//   res.json({ message: "PIN has been sent to your email, please check your email :)" });
// };


// const verifyforgetPasswordPin = async (req, res) => {
//   const { email, pin } = req.body;

//   const [[user]] = await pool.query(
//     "SELECT * FROM users WHERE email = ? AND pin_code = ?",
//     [email, pin.trim()]
//   );

//   if (!user) return res.status(400).json({ message: "Invalid PIN" });

//   const pinAgeMinutes = (Date.now() - new Date(user.pin_created_at).getTime()) / 60000;

//   if (pinAgeMinutes > 10) {
//     return res.status(400).json({ message: "PIN expired. Please request a new one." });
//   }

//   res.json({ message: "PIN verified. You can now reset your password." });
// };



// const resendForgetPasswordPin = async (req, res) => {
//   const { email } = req.body;

//   if (!email) {
//     return res.status(400).json({ message: "Email is required" });
//   }

//   // Check if the user exists
//   const [[user]] = await pool.query("SELECT * FROM users WHERE email = ?", [email]);

//   if (!user) {
//     return res.status(404).json({ message: "No user found with this email" });
//   }

//   // Generate a new PIN
//   const pinCode = Math.floor(100000 + Math.random() * 900000).toString();

//   // Save it to the database with new timestamp
//   await pool.query(
//     `UPDATE users SET pin_code = ?, pin_created_at = NOW() WHERE email = ?`,
//     [pinCode, email]
//   );

//   // Send email using your existing function
//   await sendVerifyCodeForgetPasswordEmail(email, pinCode);

//   res.json({ message: "A new PIN has been sent to your email." });
// };

// const setNewPassword = async (req, res) => {
//   const { email, pin, newPassword } = req.body;

//   if (!email  || !pin || !newPassword) {
//     return res.status(400).json({ message: "Missing fields" ,});
//   }

//   const [[user]] = await pool.query(
//     "SELECT * FROM users WHERE email = ? AND pin_code = ?",
//     [email, pin.trim()]
//   );

//   if (!user) return res.status(400).json({ message: "Invalid PIN or Email" });

//   const pinAgeMinutes = (Date.now() - new Date(user.pin_created_at).getTime()) / 60000;
//   if (pinAgeMinutes > 10) {
//     return res.status(400).json({ message: "PIN expired. Please request a new one." });
//   }

//   const hashedPassword = await bcrypt.hash(newPassword, 10);

//   await pool.query(`
//     UPDATE users SET password = ?, pin_code = NULL, pin_created_at = NULL WHERE email = ?
//   `, [hashedPassword, email]);

//   res.json({ message: "Password reset successfully :)" });

// };