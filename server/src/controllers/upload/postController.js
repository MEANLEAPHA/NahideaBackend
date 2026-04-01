const pool = require("../../config/db");
const { Errors } = require("../../util/error/error");
const { uploadToHostinger } = require("../../service/hostinger/ftp")
const multer = require("multer");
const upload = multer({ dest: "temp/" });
require("dotenv").config();

const ftpuRL = process.env.FTP_HOST;
// Type of post are : questiion, content, confession
const createPost = async (req, res) => {
  try{
      const { post_type, tags = [], isAnonymous,

               // content
               content_title, content_type,

               // confession
               confession_title, confession_type,

               // question 
               question_type, question_title, question_related_to

              } = req.body;
      const {userId} = req.user.userId;

      if(!post_type){
        return res.status(400).json({ message: "Missing post type." });
      }

      const [result] = await pool.query(
        "INSERT INTO posts (user_id, type, is_anonymous) VALUES (?, ?, ?, ?, ?)",
        [userId, post_type, isAnonymous]
      );

      const postId = result.insertId;


      // Nomalize and storing Tags
      if(tags && tags.length > 0){
        for(const rawTags of tags){
          const name = rawTags.trim().toLowerCase();
          const label = rawTags.trim();

          const [rows] = await pool.query(
            "SELECT id FROM tags WHERE name = ?",
            [name]
          );

          let tagId;
          if(rows.length > 0){
            tagId = rows[0].id;
          }
          else{
            const [insertTags] = await pool.query(
              "INSERT INTO tags (name, label) VALUES (?, ?)",
              [name, label]
            );
            tagId = insertTags.insertId;
          };

          // Then use that tagId to insert into post

          await pool.query(
            "INSERT INTO post_tags (post_id, tag_id) VALUES (?, ?)",
            [postId, tagId]
          )
        }
      }
     

      // Storing posts by post_type
      if(post_type === "content"){
        try{

          let mediaUrl = [];
          let mediaType = [];

          if (req.files && req.files.length > 0) {

              const uploadPromises = req.files.map(async (file) => {
                  const fileName = Date.now() + "-" + file.originalname;
                  await uploadToHostinger(file.path, fileName);

                  const fileUrl = `${ftpuRL}/img/content/${fileName}`;
                  const type = file.mimetype.startsWith("image")
                      ? "image"
                      : file.mimetype.startsWith("video")
                      ? "video"
                      : "other";

                  return { url: fileUrl, type };
              });

              const results = await Promise.all(uploadPromises);
              mediaUrl = results.map(r => r.url);
              mediaType = results.map(r => r.type);
          };

            await pool.query(
              `INSERT INTO content(user_id, post_id, type, title, media_type, media_url, is_anonymous)
                    VALUES(?, ?, ?, ?, ?, ?)`,
                    [userId, postId, content_type, content_title, JSON.stringify(mediaType), JSON.stringify(mediaUrl), isAnonymous]
            );

        }
        catch(error){
          console.error(error.message);
          await Errors(error.message, error.code, "contentController(content post)", error.stack);
          return res.status(500).json({
            message: "Sorry, something's wrong",
          });
        }
      };

       if(post_type === "confession"){
          try{
            //single media
            let mediaUrl;
            let mediaType;

            if (req.files && req.files.length > 0) {
                const file = req.files[0];
                const fileName = Date.now() + "-" + file.originalname;
                await uploadToHostinger(file.path, fileName);

                mediaUrl = `${ftpuRL}/img/confession/${fileName}`;
                mediaType = file.mimetype.startsWith("image")
                    ? "image"
                    : file.mimetype.startsWith("video")
                    ? "video"
                    : "other";
            };
            const media_url = mediaUrl || null;
            const media_type = mediaType || null;

            await pool.query(
                `INSERT INTO confession(user_id, post_id, type, title, media_type, media_url, is_anonymous) 
                VALUE(?, ?, ?, ?, ?, ?)`,
                [userId, postId, confession_type, confession_title, media_type, media_url, isAnonymous]
              );
          }
          catch(error){
            console.error(error.message);
            await Errors(error.message, error.code, "contentController(confession post)", error.stack);
            return res.status(500).json({
              message: "Sorry, something's wrong",
            });
        }
        };

      if(post_type === "question"){
          try{
              const [questionResult] = await db.query(
                  "INSERT INTO question (post_id, question_type, title, question_related_to) VALUES (?, ?, ?, ?)",
                  [postId, question_type, question_title, question_related_to]
              );
              const questionId = questionResult.insertId;

              switch (question_type) {
                case "openend":
                  await db.query(
                    "INSERT INTO question_openend (question_id, media) VALUES (?, ?)",
                    [questionId, req.body.media]
                  );
                  break;

                case "closedend":
                  await db.query(
                    "INSERT INTO question_closedend (question_id, yes_title, no_title, yes_media, no_media) VALUES (?, ?, ?, ?, ?)",
                    [questionId, req.body.yesTitle, req.body.noTitle, req.body.yesFile, req.body.noFile]
                  );
                  break;

                case "range":
                  await db.query(
                    "INSERT INTO question_range (question_id, min, max, step, default_value, media) VALUES (?, ?, ?, ?, ?, ?)",
                    [questionId, req.body.rangeMin, req.body.rangeMax, req.body.rangeStep, req.body.defaultRangeValue, req.body.media]
                  );
                  break;

                case "singlechoice":
                  const [sc] = await db.query(
                    "INSERT INTO question_singlechoice (question_id, media) VALUES (?, ?)",
                    [questionId, req.body.media]
                  );
                  const singleChoiceId = sc.insertId;
                  (req.body["choices[]"] || []).forEach(async (choice) => {
                    await db.query(
                      "INSERT INTO singlechoice_option (singlechoice_id, choice_text) VALUES (?, ?)",
                      [singleChoiceId, choice]
                    );
                  });
                  break;

                case "multiplechoice":
                  const [mc] = await db.query(
                    "INSERT INTO question_multiplechoice (question_id, include_all_above, media) VALUES (?, ?, ?)",
                    [questionId, req.body.include_all_above, req.body.media]
                  );
                  const multipleChoiceId = mc.insertId;
                  (req.body["choices[]"] || []).forEach(async (choice) => {
                    await db.query(
                      "INSERT INTO multiplechoice_option (multiplechoice_id, choice_text) VALUES (?, ?)",
                      [multipleChoiceId, choice]
                    );
                  });
                  break;

                case "rankingorder":
                  const [ro] = await db.query(
                    "INSERT INTO question_rankingorder (question_id, media) VALUES (?, ?)",
                    [questionId, req.body.media]
                  );
                  const rankingId = ro.insertId;
                  Object.entries(req.body)
                    .filter(([key]) => key.startsWith("ranking["))
                    .forEach(async ([key, value]) => {
                      const position = parseInt(key.match(/\[(\d+)\]/)[1], 10);
                      await db.query(
                        "INSERT INTO ranking_item (ranking_id, position, item_text) VALUES (?, ?, ?)",
                        [rankingId, position, value]
                      );
                    });
                  break;

                case "rating":
                  await db.query(
                    "INSERT INTO question_rating (question_id, rating_icon_id, media) VALUES (?, ?, ?)",
                    [questionId, req.body.rating_icon_id, req.body.media]
                  );
                  break;

                default:
                  return res.status(400).json({ error: "Invalid question type" });
              }

          }
          catch(error){
            console.error(error.message);
            await Errors(error.message, error.code, "contentController(question post)", error.stack);
            return res.status(500).json({
              message: "Sorry, something's wrong"});
          }
        };

        res.json({ message: "Post created", postId });

      }
      catch(error){
          console.error(error.message);
          await Errors(error.message, error.code, "postController", error.stack);
          return res.status(500).json({
                message: "Sorry, something's wrong",
          });
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