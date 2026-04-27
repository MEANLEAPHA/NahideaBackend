

// module.exports = { uploadGif, getGifs, searchGif };
const pool = require("../../config/db");
const cloudinary = require("../../config/cloudinary");
const { redisClient } = require("../../config/redisClient");

const uploadGif = async (req, res) => {
  try {
    const {gif_name, gif_label, gif_url, gif_type } = req.body;

    await pool.query(
      "INSERT INTO gifs (gif_name, gif_label, gif_url, gif_type) VALUES (?, ?, ?, ?)",
      [gif_name, gif_label, gif_url, gif_type]
    );

    res.json({
      success: true,
      gif_url: gif_url,
    });
     await redisClient.del("gifs:page:1");

  } catch (err) {
    console.error("UPLOAD ERROR:", err);
    res.status(500).json({ success: false, error: "Upload failed" });
  }
};

// const getGifs = async (req, res) => {
//   try {
//     const page = parseInt(req.query.page) ||1;
//     const limit = 25;
//     const offset = (page - 1) * limit;

//     const CACHE_KEY = `gifs:page:${page}`;


//     const cached = await redisClient.get(CACHE_KEY);

//     if(cached){
//       console.log('cache hit on gif')
//       return res.status(200).json({
//         data: JSON.parse(cached)
//       })
//     }
//     const [rows] = await pool.query(
//       "SELECT * FROM gifs ORDER BY created_at DESC LIMIT ? OFFSET ?",
//       [limit, offset]
//     );
//     if(!rows.length){
//       return res.status(200).json({ source: "db", data: [] });
//     }
//     await redisClient.set(CACHE_KEY, JSON.stringify(rows));
//     return res.status(200).json({
//       data: rows
//     })
//   } catch (err) {
//     res.status(500).json({ error: "Fetch failed" });
//   }
// };

// const searchGif = async (req, res) => {
//   try {
//     const page = parseInt(req.query.page) || 1;
//     const limit = 25;
//     const offset = (page - 1) * limit;

//     const { name } = req.query;

//     const CACHE_KEY = `gifs:${name}:page:${page}`;

//     const cached = await redisClient.get(CACHE_KEY);

//     if (cached) {
//       console.log("CACHE HIT");
//       return res.status(200).json({
//         source: "cache",
//         data: JSON.parse(cached),
//       });
//     }

//     console.log("CACHE MISS → DB");

//     const [rows] = await pool.query(
//       `SELECT * 
//       FROM gifs 
//       WHERE gif_name LIKE ? 
//           OR gif_label LIKE ? 
//       ORDER BY created_at DESC 
//       LIMIT ? OFFSET ?`,
//       [`%${name}%`, `%${name}%`, limit, offset]
//     );


//     if (!rows.length) {
//       return res.status(200).json({ source: "db", data: [] });
//     }

//     await redisClient.set(CACHE_KEY, JSON.stringify(rows));

//     return res.status(200).json({
//       data: rows,
//     });
//   } catch (err) {
//     res.status(500).json({ error: "Fetch failed" });
//   }
// };
   // getGifs
const getGifs = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 25;
    const offset = (page - 1) * limit;

    const CACHE_KEY = `gifs:page:${page}`;
    const cached = await redisClient.get(CACHE_KEY);

    if (cached) {
      console.log("cache hit on gif");
      return res.status(200).json({ data: JSON.parse(cached) });
    }

    const [rows] = await pool.query(
      "SELECT * FROM gifs ORDER BY created_at DESC LIMIT ? OFFSET ?",
      [limit, offset]
    );

    if (!rows.length) {
      return res.status(200).json({ source: "db", data: [] });
    }

    await redisClient.set(CACHE_KEY, JSON.stringify(rows));
    return res.status(200).json({ data: rows });
  } catch (err) {
    res.status(500).json({ error: "Fetch failed" });
  }
};

// searchGif
const searchGif = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 25;
    const offset = (page - 1) * limit;
    const { name } = req.query;

    const CACHE_KEY = `gifs:${name}:page:${page}`;
    const cached = await redisClient.get(CACHE_KEY);

    if (cached) {
      console.log("CACHE HIT");
      return res.status(200).json({ source: "cache", data: JSON.parse(cached) });
    }

    console.log("CACHE MISS → DB");

    const [rows] = await pool.query(
      `SELECT * 
       FROM gifs 
       WHERE gif_name LIKE ? 
          OR gif_label LIKE ? 
       ORDER BY created_at DESC 
       LIMIT ? OFFSET ?`,
      [`%${name}%`, `%${name}%`, limit, offset]
    );

    if (!rows.length) {
      return res.status(200).json({ source: "db", data: [] });
    }

    await redisClient.set(CACHE_KEY, JSON.stringify(rows));
    return res.status(200).json({ data: rows });
  } catch (err) {
    res.status(500).json({ error: "Fetch failed" });
  }
};


module.exports = { uploadGif, getGifs, searchGif };