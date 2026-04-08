const pool = require("../../config/db");
const { Errors } = require("../../util/error/error");
const { uploadToHostinger, convertAndUpload } = require("../../service/hostinger/ftp")
const multer = require("multer");
const upload = multer({ dest: "temp/" });
require("dotenv").config();

const Joi = require("joi");

// Validation schema
const postSchema = Joi.object({
  post_type: Joi.string().valid("content", "confession", "question", "repost").required(),
  tags: Joi.array().items(Joi.string().trim()).default([]),
  isAnonymous: Joi.boolean().default(false).optional(), 

  content_title: Joi.string().optional(),
  content_type: Joi.string().optional(),

  confession_title: Joi.string().optional(),
  confession_type: Joi.string().optional(),

  question_type: Joi.string().optional(),
  question_title: Joi.string().optional(),
  question_related_to: Joi.string().optional(),

    yesTitle: Joi.string().optional(),
    noTitle: Joi.string().optional(),
    rangeMin: Joi.number().optional(),
    rangeMax: Joi.number().optional(),
    rangeStep: Joi.number().optional(),
    defaultRangeValue: Joi.number().optional(),
    choices: Joi.array().items(Joi.string()).optional(),
    include_all_above: Joi.number().valid(0, 1).default(0).optional(),
    ranking: Joi.array().items(Joi.string()).optional(),
    rating_icon_id: Joi.number().optional(),

  repost_title: Joi.string().optional()
});

const createPost = async (req, res) => {
  const { error, value } = postSchema.validate(req.body);

  if (error) {
    return res.status(400).json({ code: 400, message: error.details[0].message });
  }

  const { post_type, tags, isAnonymous } = value;
  const userId = req.user.userId;

  try {
    // Rate limit: max 5 posts in 10 minutes
    const [attempts] = await pool.query(
      `SELECT COUNT(*) as count 
       FROM post_attempts 
       WHERE user_id = ? AND timestamp > NOW() - INTERVAL 10 MINUTE`,
      [userId]
    );
    if (attempts[0].count >= 5) {
      return res.status(429).json({ code: 429, message: "Please wait 10 minutes before posting again." });
    }

    // Start transaction
    await pool.query("START TRANSACTION");

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

    // Handlers
    const handlers = {
      content: async () => {
        const files = req.files?.contentFile || [];
        const results = await Promise.all(files.map(f => convertAndUpload(f, "content")));
        const urls = results.map(r => r.url);
        const types = results.map(r => r.type);
        await pool.query(
          `INSERT INTO content(user_id, post_id, type, title, media_type, media_url, is_anonymous)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [userId, postId, value.content_type, value.content_title,
           JSON.stringify(types), JSON.stringify(urls), isAnonymous]
        );
      },
      confession: async () => {
        const file = req.files?.confessionFile?.[0];
        const result = file ? await convertAndUpload(file, "confession") : {};
        await pool.query(
          `INSERT INTO confession(user_id, post_id, type, title, media_type, media_url, is_anonymous)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [userId, postId, value.confession_type, value.confession_title,
           result.type || null, result.url || null, isAnonymous]
        );
      },
      question: async () => {
        const file = req.files?.questionFile?.[0];
        const result = file ? await convertAndUpload(file, "question") : {};
        const [qRes] = await pool.query(
          "INSERT INTO question(post_id, question_type, title, media_url, question_related_to) VALUES (?, ?, ?, ?, ?)",
          [postId, value.question_type, value.question_title, result.url || null, value.question_related_to]
        );
        const qId = qRes.insertId;

        switch (value.question_type) {
          case "openend": await pool.query("INSERT INTO openend (question_id) VALUES (?)", [qId]); break;
          case "closedend": await pool.query("INSERT INTO closedend (question_id, yes_title, no_title) VALUES (?, ?, ?)", [qId, value.yesTitle, value.noTitle]); break;
          case "range": await pool.query("INSERT INTO question_range (question_id, range_min, range_max, step, default_range_value) VALUES (?, ?, ?, ?, ?)", [qId, value.rangeMin, value.rangeMax, value.rangeStep, value.defaultRangeValue]); break;
          case "singlechoice": {
            const [sc] = await pool.query("INSERT INTO singlechoice (question_id) VALUES (?)", [qId]);
            await Promise.all((value.choices || []).map(c => pool.query("INSERT INTO singlechoice_option (singlechoice_id, choice_text) VALUES (?, ?)", [sc.insertId, c])));
            break;
          }
          case "multiplechoice": {
            const [mc] = await pool.query("INSERT INTO multiplechoice (question_id, include_all_above) VALUES (?, ?)", [qId, value.include_all_above]);
            await Promise.all((value.choices || []).map(c => pool.query("INSERT INTO multiplechoice_option (multiplechoice_id, choice_text) VALUES (?, ?)", [mc.insertId, c])));
            break;
          }
          case "rankingorder": {
            const [ro] = await pool.query("INSERT INTO rankingorder (question_id) VALUES (?)", [qId]);
            await Promise.all((value.ranking || []).map((val, idx) => pool.query("INSERT INTO ranking_item (ranking_id, position, item_text) VALUES (?, ?, ?)", [ro.insertId, idx, val])));
            break;
          }
          case "rating": await pool.query("INSERT INTO rating (question_id, rating_icon_id) VALUES (?, ?)", [qId, value.rating_icon_id]); break;
          default: return res.status(400).json({ code: 400, message: "Invalid question type" });
        }
      },
      repost: async () => {
        await pool.query("INSERT INTO repost(post_id, title) VALUES (?, ?)", [postId, value.repost_title]);
      }
    };

    if (!handlers[post_type]) {
      return res.status(400).json({ code: 400, message: "Invalid post type" });
    }
    await handlers[post_type]();

    // Record attempt
    await pool.query("INSERT INTO post_attempts (user_id, timestamp) VALUES (?, NOW())", [userId]);

    // Commit transaction
    await pool.query("COMMIT");

    return res.status(201).json({message: "Post created successfully", postId });
  } catch (error) {
    await pool.query("ROLLBACK");
    console.error(error.message);
    await Errors(error.message, error.code, "post-controller", error.stack);
    return res.status(500).json({ code: 500, message: "Internal Server Error" });
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