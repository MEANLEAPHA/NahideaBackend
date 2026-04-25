const pool = require("../../config/db");
const GIPHY_API_KEY = process.env.GIPHY_API_KEY;

const uploadGif = async (req, res) => {
  try {
    const { userId, gif_name } = req.body;
    const file = req.file;
    if (!file) return res.status(400).json({ error: "No file uploaded" });

    const formData = new FormData();
    formData.append("file", file.buffer, { filename: file.originalname });
    formData.append("api_key", GIPHY_API_KEY);

    const response = await fetch("https://upload.giphy.com/v1/gifs", {
      method: "POST",
      body: formData
    });

    if (response.status === 429) {
      return res.status(429).json({
        success: false,
        error: "Hourly limit reached (42 uploads). Try again in one hour."
      });
    }

    if (!response.ok) {
      throw new Error("GIPHY upload failed");
    }

    const data = await response.json();
    const gifUrl = `https://media.giphy.com/media/${data.data.id}/giphy.gif`;

    await pool.query(
      "INSERT INTO gifs (user_id, gif_name, gif_url) VALUES (?, ?, ?)",
      [userId, gif_name, gifUrl]
    );

    res.json({ success: true, gif_url: gifUrl });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ success: false, error: "Upload failed" });
  }
};

const getGifs = async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT * FROM gifs ORDER BY created_at DESC");
    res.json(rows);
  } catch {
    res.status(500).json({ error: "Failed to fetch GIFs" });
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