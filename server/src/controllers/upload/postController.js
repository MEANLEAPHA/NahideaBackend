const pool = require("../../config/db");
const { Errors } = require("../../util/error/error");
const { uploadToHostinger, convertAndUpload } = require("../../service/hostinger/ftp")
const multer = require("multer");
const upload = multer({ dest: "temp/" });
require("dotenv").config();


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



      const userId = req.user.userId;


      if(!post_type){
        return res.status(400).json({ message: "Missing post type." });
      };

      const [result] = await pool.query(
        "INSERT INTO posts (user_id, post_type, is_anonymous) VALUES (?, ?, ?)",
        [userId, post_type, isAnonymous]
      );

      const postId = result.insertId;

      // Nomalize and storing Tags
      if (tags && tags.length > 0) {
        await Promise.all(tags.map(async (rawTag) => {
          const name = rawTag.trim().toLowerCase();
          const label = rawTag.trim();

          const [rows] = await pool.query("SELECT id FROM tags WHERE name = ?", [name]);

          let tagId;
          if (rows.length > 0) {
            tagId = rows[0].id;
          } else {
            const [insertTags] = await pool.query(
              "INSERT INTO tags (name, label) VALUES (?, ?)",
              [name, label]
            );
            tagId = insertTags.insertId;
          }

          await pool.query("INSERT INTO post_tags (post_id, tag_id) VALUES (?, ?)", [postId, tagId]);
        }));
      }

      // Storing posts by post_type
      switch(post_type){

        case "content" :
          try{

            let mediaUrl = [];
            let mediaType = [];
            const contentFiles = req.files?.contentFile || [];
            const uploadPromises = contentFiles.map(f => convertAndUpload(f, "content"));
            const results = await Promise.all(uploadPromises);
            mediaUrl = results.map(r => r.url);
            mediaType = results.map(r => r.type);

            await pool.query(
              `INSERT INTO content(user_id, post_id, type, title, media_type, media_url, is_anonymous)
                    VALUES(?, ?, ?, ?, ?, ?, ?)`,
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
          break;

        case "confession":
          try{

            let mediaUrl;
            let mediaType;

            const confessionFile = req.files?.confessionFile?.[0];
            if (confessionFile) {
            const result = await convertAndUpload(confessionFile, "confession");
            mediaUrl = result.url;
            mediaType = result.type;
            }
            const media_url = mediaUrl || null;
            const media_type = mediaType || null;

            await pool.query(
                `INSERT INTO confession(user_id, post_id, type, title, media_type, media_url, is_anonymous) 
                VALUE(?, ?, ?, ?, ?, ?, ?)`,
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
          break;
        
        case "question":
          try{

            let questionMediaUrl;
            const questionFile = req.files?.questionFile?.[0];
            if (questionFile) {
            const result = await convertAndUpload(questionFile, "question");
            questionMediaUrl = result.url || null;
            }
            
            const [questionResult] = await pool.query(
                "INSERT INTO question (post_id, question_type, title, media_url, question_related_to) VALUES (?, ?, ?, ?, ?)",
                [postId, question_type, question_title, questionMediaUrl, question_related_to]
            );

              const questionId = questionResult.insertId;
              switch (question_type) {
                case "openend":

                  await db.query(
                    "INSERT INTO question_openend (question_id) VALUES (?)",
                    [questionId]
                  );
                  break;

                case "closedend":

                  await db.query(
                    "INSERT INTO question_closedend (question_id, yes_title, no_title) VALUES (?, ?, ?)",
                    [questionId, req.body.yesTitle, req.body.noTitle]
                  );
                  break;

                case "range":
                  
                  await db.query(
                    "INSERT INTO question_range (question_id, range_min, range_max, step, default_range_value) VALUES (?, ?, ?, ?, ?)",
                    [questionId, req.body.min, req.body.max, req.body.step, req.body.rangeValue]
                  );
                  break;

                case "singlechoice":

                  const [sc] = await db.query(
                    "INSERT INTO question_singlechoice (question_id) VALUES (?)",
                    [questionId]
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
                    "INSERT INTO question_multiplechoice (question_id, include_all_above) VALUES (?, ?)",
                    [questionId, req.body.include_all_above]
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
                    "INSERT INTO question_rankingorder (question_id) VALUES (?)",
                    [questionId]
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
                    "INSERT INTO question_rating (question_id, rating_icon_id) VALUES (?, ?)",
                    [questionId, req.body.rating_icon_id]
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
          break;

        default :
         return res.status(400).json({error: "Invalid post type"});

      };
    
      res.json({ message: "Post created", postId });

      }
      catch(error){
        console.error(error.message);
        await Errors(error.message, error.code, "postController", error.stack);
        return res.status(500).json({ message: "Sorry, something's wrong" });
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