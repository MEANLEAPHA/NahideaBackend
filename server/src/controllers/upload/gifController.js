// const pool = require("../../config/db");
// const GIPHY_API_KEY = process.env.GIPHY_API_KEY;
// const ffmpeg = require("fluent-ffmpeg");
// const stream = require("stream");
// const FormData = require("form-data");
// const fetch = require("node-fetch");

// const uploadGif = async (req, res) => {
//   try {
//     const { gif_name,userId } = req.body;
//     // const userId = req.user.userId;
//     const file = req.file;
//     if (!file) return res.status(400).json({ error: "No file uploaded" });

//     // Stream the uploaded buffer into ffmpeg
//     const bufferStream = new stream.PassThrough();
//     bufferStream.end(file.buffer);

//     // Capture ffmpeg output into memory
//     const chunks = [];
//     await new Promise((resolve, reject) => {
//       ffmpeg(bufferStream)
//         .outputOptions([
//           "-t 5", // limit to 5 seconds
//           "-vf fps=10,scale=320:-1:flags=lanczos" // resize & frame rate
//         ])
//         .toFormat("gif")
//         .pipe()
//         .on("data", (chunk) => chunks.push(chunk))
//         .on("end", resolve)
//         .on("error", reject);
//     });

//     const gifBuffer = Buffer.concat(chunks);

//     // Upload to GIPHY
//     const formData = new FormData();
//     formData.append("file", gifBuffer, { filename: "upload.gif" });
//     formData.append("api_key", GIPHY_API_KEY);

//     const response = await fetch("https://upload.giphy.com/v1/gifs", {
//       method: "POST",
//       body: formData
//     });

//     if (response.status === 429) {
//       return res.status(429).json({
//         success: false,
//         error: "Hourly limit reached (42 uploads). Try again in one hour."
//       });
//     }

//     if (!response.ok) throw new Error("GIPHY upload failed");

//     const data = await response.json();
//     const gifUrl = `https://media.giphy.com/media/${data.data.id}/giphy.gif`;

//     await pool.query(
//       "INSERT INTO gifs (user_id, gif_name, gif_url) VALUES (?, ?, ?)",
//       [userId, gif_name, gifUrl]
//     );

//     res.json({ success: true, gif_url: gifUrl });
//   } catch (err) {
//     console.error(err.message);
//     res.status(500).json({ success: false, error: "Upload failed" });
//   }
// };
// // const uploadGif = async (req, res) => {
// //   try {
// //     const { userId, gif_name } = req.body;
// //     const file = req.file;
// //     if (!file) return res.status(400).json({ error: "No file uploaded" });

// //     const formData = new FormData();
// //     formData.append("file", file.buffer, { filename: file.originalname });
// //     formData.append("api_key", GIPHY_API_KEY);

// //     const response = await fetch("https://upload.giphy.com/v1/gifs", {
// //       method: "POST",
// //       body: formData
// //     });

// //     if (response.status === 429) {
// //       return res.status(429).json({
// //         success: false,
// //         error: "Hourly limit reached (42 uploads). Try again in one hour."
// //       });
// //     }

// //     if (!response.ok) {
// //       throw new Error("GIPHY upload failed");
// //     }

// //     const data = await response.json();
// //     const gifUrl = `https://media.giphy.com/media/${data.data.id}/giphy.gif`;

// //     await pool.query(
// //       "INSERT INTO gifs (user_id, gif_name, gif_url) VALUES (?, ?, ?)",
// //       [userId, gif_name, gifUrl]
// //     );

// //     res.json({ success: true, gif_url: gifUrl });
// //   } catch (err) {
// //     console.error(err.message);
// //     res.status(500).json({ success: false, error: "Upload failed" });
// //   }
// // };

// const getGifs = async (req, res) => {
//   try {
//     const [rows] = await pool.query("SELECT * FROM gifs ORDER BY created_at DESC");
//     res.json(rows);
//   } catch {
//     res.status(500).json({ error: "Failed to fetch GIFs" });
//   }
// };

// const searchGif = async (req, res) => {
//   try {
//     const { name } = req.query;
//     const [rows] = await pool.query(
//       "SELECT * FROM gifs WHERE gif_name LIKE ? ORDER BY created_at DESC",
//       [`%${name}%`]
//     );
//     res.json(rows);
//   } catch {
//     res.status(500).json({ error: "Search failed" });
//   }
// };

// module.exports = { uploadGif, getGifs, searchGif };
const pool = require("../../config/db");
const cloudinary = require("../../config/cloudinary");

const uploadGif = async (req, res) => {
  try {
    const { gif_name, userId } = req.body;
    const file = req.file;

    if (!file) {
      return res.status(400).json({ success: false, error: "No file" });
    }

    // 🔴 HARD validation (don’t trust frontend)
    if (file.size > 10 * 1024 * 1024) {
      return res.status(400).json({ error: "Max 10MB allowed" });
    }

    const isGif = file.mimetype === "image/gif";

    // upload raw file first
    const uploadResult = await new Promise((resolve, reject) => {
      cloudinary.uploader.upload_stream(
        {
          resource_type: "auto",
          folder: "nahidea/raw",
        },
        (err, result) => {
          if (err) return reject(err);
          resolve(result);
        }
      ).end(file.buffer);
    });

    let finalGifUrl;

    if (isGif) {
      // no conversion needed
      finalGifUrl = uploadResult.secure_url;
    } else {
      // 🔥 convert image/video → GIF
      finalGifUrl = cloudinary.url(uploadResult.public_id, {
        resource_type: "video",
        format: "gif",
        transformation: [
          { duration: 5 },
          { fps: 10 },
          { width: 320, crop: "scale" }
        ]
      });
    }

    await pool.query(
      "INSERT INTO gifs (user_id, gif_name, gif_url) VALUES (?, ?, ?)",
      [userId, gif_name, finalGifUrl]
    );

    res.json({
      success: true,
      gif_url: finalGifUrl,
    });

  } catch (err) {
    console.error("UPLOAD ERROR:", err);
    res.status(500).json({ success: false, error: "Upload failed" });
  }
};

const getGifs = async (req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT * FROM gifs ORDER BY created_at DESC"
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: "Fetch failed" });
  }
};

const searchGif = async (req, res) => {
  try {
    const { name } = req.query;

    const [rows] = await pool.query(
      "SELECT * FROM gifs WHERE gif_name LIKE ? ORDER BY created_at DESC",
      [`%${name}%`]
    );

    res.json(rows);
  } catch {
    res.status(500).json({ error: "Search failed" });
  }
};

module.exports = { uploadGif, getGifs, searchGif };