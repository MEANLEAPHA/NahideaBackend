// const pool = require("../../config/db");

// const addComment = async (req, res) => {
//   const { content, parent_id } = req.body;
//   const { id } = req.params;

//   await pool.query(
//     "INSERT INTO comments (post_id, user_id, content, parent_id) VALUES (?, ?, ?, ?)",
//     [id, req.user.id, content, parent_id || null]
//   );

//   res.json({ message: "Comment added" });
// };
//  module.exports = {addComment}

//  app.post("/comments", async (req, res) => {
//   try {
//     const {
//       post_id,
//       parent_id,
//       user_id,
//       username,
//       content,
//       gif_url,
//       username_mention
//     } = req.body;

//     if (!post_id || !user_id || !username) {
//       return res.status(400).json({ message: "Missing required fields" });
//     }

//     if (!content && !gif_url) {
//       return res.status(400).json({ message: "Content or GIF required" });
//     }

//     let finalParentId = null;

//     if (parent_id) {
//       const [parent] = await db.query(
//         "SELECT id, parent_id FROM comments WHERE id = ?",
//         [parent_id]
//       );

//       if (!parent.length) {
//         return res.status(404).json({ message: "Parent not found" });
//       }

//       // enforce flat structure
//       finalParentId = parent[0].parent_id || parent[0].id;
//     }

//     const [result] = await db.query(
//       `INSERT INTO comments 
//       (post_id, parent_id, user_id, username, content, gif_url, username_mention)
//       VALUES (?, ?, ?, ?, ?, ?, ?)`,
//       [
//         post_id,
//         finalParentId,
//         user_id,
//         username,
//         content,
//         gif_url,
//         username_mention
//       ]
//     );

//     res.status(201).json({
//       message: "Comment created",
//       comment_id: result.insertId
//     });

//   } catch (err) {
//     console.error(err);
//     res.status(500).json({ message: "Server error" });
//   }
// });
// app.get("/comments/:postId", async (req, res) => {
//   try {
//     const { postId } = req.params;

//     const [rows] = await db.query(
//       "SELECT * FROM comments WHERE post_id = ? ORDER BY created_at ASC",
//       [postId]
//     );

//     const grouped = {};

//     rows.forEach(c => {
//       if (!c.parent_id) {
//         grouped[c.id] = { ...c, replies: [] };
//       }
//     });

//     rows.forEach(c => {
//       if (c.parent_id && grouped[c.parent_id]) {
//         grouped[c.parent_id].replies.push(c);
//       }
//     });

//     res.json(Object.values(grouped));

//   } catch (err) {
//     res.status(500).json({ message: "Error fetching comments" });
//   }
// });