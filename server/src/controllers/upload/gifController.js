

// module.exports = { uploadGif, getGifs, searchGif };
const pool = require("../../config/db");
const cloudinary = require("../../config/cloudinary");

const uploadGif = async (req, res) => {
  try {
    const { gif_name, gif_label, gif_url, gif_type } = req.body;

    await pool.query(
      "INSERT INTO gifs (gif_name, gif_label, gif_url, gif_type) VALUES (?, ?, ?, ?)",
      [gif_name, gif_label, gif_url, gif_type]
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