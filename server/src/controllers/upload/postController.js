const pool = require("../../config/db");
const { Errors } = require("../../util/error/error");
const { uploadToHostinger } = require("../../service/hostinger/ftp")
const multer = require("multer");
const upload = multer({ dest: "temp/" });
// Type of post are : questiion, content, confession
const createPost = async (req, res) => {
  try{
      const { post_type, title, type, isAnonymous, tags = []} = req.body;
      const {userId} = req.user.userId;

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

                const fileUrl = `https://picocolor.site/img/${fileName}`;
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
        }
            await pool.query(
              `INSERT INTO content(user_id, post_id, type, title, media_type, media_url, is_anonymous)
                    VALUES(?, ?, ?, ?, ?, ?)`,
                    [userId, postId, type, title, JSON.stringify(mediaType), JSON.stringify(mediaUrl), isAnonymous]
            )
        }
        catch(error){
          console.error(error.message);
          await Errors(error.message, error.code, "contentController(content post)", error.stack);
          return res.status(500).json({
            message: "Sorry, something's wrong",
            success: false,
            error: error.message,
            stack: error.stack,
            code: error.code || "UNKNOWN"
        });
        }
      };

      if(post_type === "question"){
          try{
             //   for (let opt of options) {
            //     await pool.query(
            //       "INSERT INTO decision_options (post_id, option_text) VALUES (?, ?)",
            //       [postId, opt]
            //     );
            //   }
            // }
          }
          catch(error){
            console.error(error.message);
            await Errors(error.message, error.code, "contentController(question post)", error.stack);
            return res.status(500).json({
              message: "Sorry, something's wrong",
              success: false,
              error: error.message,
              stack: error.stack,
              code: error.code || "UNKNOWN"
            });
          }
        };

        if(post_type === "confession"){
          try{

            }
            catch(error){
              console.error(error.message);
              await Errors(error.message, error.code, "contentController(confession post)", error.stack);
              return res.status(500).json({
                message: "Sorry, something's wrong",
                success: false,
                error: error.message,
                stack: error.stack,
                code: error.code || "UNKNOWN"
              });
            }
        };

        res.json({ message: "Post created", postId });

      }
      catch(error){
          console.error(error.message);
          await Errors(error.message, error.code, "postController", error.stack);
          return res.status(500).json({
                message: "Sorry, something's wrong",
                success: false,
                error: error.message,
                stack: error.stack,
                code: error.code || "UNKNOWN"
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