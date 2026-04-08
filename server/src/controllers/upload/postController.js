const pool = require("../../config/db");
const { Errors } = require("../../util/error/error");
const { uploadToHostinger, convertAndUpload } = require("../../service/hostinger/ftp")
const multer = require("multer");
const upload = multer({ dest: "temp/" });
require("dotenv").config();



const createPost = async (req, res) => {
  try {
    const { post_type, tags = [], isAnonymous } = req.body;
    const userId = req.user.userId;

    if (!post_type) {
      return res.status(400).json({ message: "Missing post type." });
    }

    // ⏱ Cooldown: max 5 attempts per minute
    const [attempts] = await pool.query(
      `SELECT COUNT(*) as count 
       FROM post_attempts 
       WHERE user_id = ? AND timestamp > NOW() - INTERVAL 1 MINUTE`,
      [userId]
    );
    if (attempts[0].count >= 5) {
      return res.status(429).json({ message: "Please wait 1 minute before posting again." });
    }
   

    // Insert base post
    const [result] = await pool.query(
      "INSERT INTO posts (user_id, post_type, is_anonymous) VALUES (?, ?, ?)",
      [userId, post_type, isAnonymous]
    );
    const postId = result.insertId;

    // Normalize & store tags
    if (tags.length > 0) {
      await Promise.all(tags.map(async (rawTag) => {
        const name = rawTag.trim().toLowerCase();
        const label = rawTag.trim();
        const [rows] = await pool.query("SELECT id FROM tags WHERE name = ?", [name]);
        let tagId = rows.length ? rows[0].id : (await pool.query(
          "INSERT INTO tags (name, label) VALUES (?, ?)", [name, label]
        ))[0].insertId;
        await pool.query("INSERT INTO post_tags (post_id, tag_id) VALUES (?, ?)", [postId, tagId]);
      }));
    }

    // Handlers for each post type
    const handlers = {
      content: async () => {
        const files = req.files?.contentFile || [];
        const results = await Promise.all(files.map(f => convertAndUpload(f, "content")));
        const urls = results.map(r => r.url);
        const types = results.map(r => r.type);
        await pool.query(
          `INSERT INTO content(user_id, post_id, type, title, media_type, media_url, is_anonymous)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [userId, postId, req.body.content_type, req.body.content_title,
           JSON.stringify(types), JSON.stringify(urls), isAnonymous]
        );
      },
      confession: async () => {
        const file = req.files?.confessionFile?.[0];
        const result = file ? await convertAndUpload(file, "confession") : {};
        await pool.query(
          `INSERT INTO confession(user_id, post_id, type, title, media_type, media_url, is_anonymous)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [userId, postId, req.body.confession_type, req.body.confession_title,
           result.type || null, result.url || null, isAnonymous]
        );
      },
      question: async () => {
        const file = req.files?.questionFile?.[0];
        const result = file ? await convertAndUpload(file, "question") : {};
        const [qRes] = await pool.query(
          "INSERT INTO question(post_id, question_type, title, media_url, question_related_to) VALUES (?, ?, ?, ?, ?)",
          [postId, req.body.question_type, req.body.question_title, result.url || null, req.body.question_related_to]
        );
        const qId = qRes.insertId;
        // Delegate to sub‑type insertions
        switch (req.body.question_type) {
          case "openend": await pool.query("INSERT INTO openend (question_id) VALUES (?)", [qId]); break;
          case "closedend": await pool.query("INSERT INTO closedend (question_id, yes_title, no_title) VALUES (?, ?, ?)", [qId, req.body.yesTitle, req.body.noTitle]); break;
          case "range": await pool.query("INSERT INTO question_range (question_id, range_min, range_max, step, default_range_value) VALUES (?, ?, ?, ?, ?)", [qId, req.body.rangeMin, req.body.rangeMax, req.body.rangeStep, req.body.defaultRangeValue]); break;
          case "singlechoice": {
            const [sc] = await pool.query("INSERT INTO singlechoice (question_id) VALUES (?)", [qId]);
            const choices = req.body.choices || [];
            await Promise.all(choices.map(c => pool.query("INSERT INTO singlechoice_option (singlechoice_id, choice_text) VALUES (?, ?)", [sc.insertId, c])));
            break;
          }
          case "multiplechoice": {
            const [mc] = await pool.query("INSERT INTO multiplechoice (question_id, include_all_above) VALUES (?, ?)", [qId, req.body.include_all_above]);
            const choices = req.body.choices || [];
            await Promise.all(choices.map(c => pool.query("INSERT INTO multiplechoice_option (multiplechoice_id, choice_text) VALUES (?, ?)", [mc.insertId, c])));
            break;
          }
          case "rankingorder": {
            const [ro] = await pool.query("INSERT INTO rankingorder (question_id) VALUES (?)", [qId]);
            const ranking = req.body.ranking || [];
            await Promise.all(ranking.map((val, idx) => pool.query("INSERT INTO ranking_item (ranking_id, position, item_text) VALUES (?, ?, ?)", [ro.insertId, idx, val])));
            break;
          }
          case "rating": await pool.query("INSERT INTO rating (question_id, rating_icon_id) VALUES (?, ?)", [qId, req.body.rating_icon_id]); break;
          default: return res.status(400).json({ error: "Invalid question type" });
        }
      },
      repost: async () => {
        await pool.query("INSERT INTO repost(post_id, title) VALUES (?, ?)", [postId, req.body.repost_title]);
      }
    };

    if (!handlers[post_type]) {
      return res.status(400).json({ error: "Invalid post type" });
    }
    await handlers[post_type]();
     await pool.query("INSERT INTO post_attempts (user_id, timestamp) VALUES (?, NOW())", [userId]);

    return res.status(200).json({ message: "Post created", postId });
  } catch (error) {
    console.error(error.message);
    await Errors(error.message, error.code, "post-controller", error.stack);
    return res.status(500).json({ message: "Sorry, Server Error" });
  }
};








const getPosts = async (req, res) => {
  const [rows] = await pool.query(
    "SELECT p.*, u.username FROM posts p JOIN users u ON p.user_id = u.id ORDER BY p.created_at DESC"
  );
  res.json(rows);
};

const getPostById = async (req, res) => {
  const { id } = req.params;

  const [post] = await pool.query(
    "SELECT * FROM posts WHERE id=?",
    [id]
  );

  const [comments] = await pool.query(
    "SELECT * FROM comments WHERE post_id=?",
    [id]
  );

  const [options] = await pool.query(
    "SELECT * FROM decision_options WHERE post_id=?",
    [id]
  );

  res.json({ post: post[0], comments, options });
};



const markSolved = async (req, res) => {
  const { id } = req.params;

  await pool.query(
    "UPDATE posts SET status='solved' WHERE id=? AND user_id=?",
    [id, req.user.id]
  );

  res.json({ message: "Marked as solved" });
};

module.exports = {
  createPost,
  getPosts,
  getPostById,
  markSolved,
  upload
};