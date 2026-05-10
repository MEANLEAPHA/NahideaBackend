
const db = require("../../config/db");

const generateAnonymousName = () => {

    const generateNum = Array.from(
        { length: 6 },
        () => Math.floor(Math.random() * 10)
    ).join("");

    return `An${generateNum}nymous`;
};

const generateAnonymousBgColor = () => {

    const colors = [
        "yellowgreen",
        "skyblue",
        "tomato",
        "yellow",
        "purple",
        "orange",
        "grey",
        "black",
        "brown",
        "pink",
        "cyan"
    ];

    const randomIndex = Math.floor(
        Math.random() * colors.length
    );

    return colors[randomIndex];
};

// const addComment = async (req, res) => {
//   const connection = await db.getConnection();

//   try {
//     await connection.beginTransaction();

//     const userId = req.user.userId;
//     const {
//       username,
//       comment_id,//
//       content,
//       gif_url,
//       user_id_mention,
//       username_mention,
//       is_anonymous
//     } = req.body;
//     const { postId } = req.params;

//     if (!postId) {
//       return res.status(400).json({ message: "Missing postId" });
//     }
//     if (!content && !gif_url) {
//       return res.status(400).json({ message: "Content or GIF required" });
//     }

   

//     let finalParentId = null;
//     let parentOwnerId = null;
//     let finalAnonymousName = null;
//     let finalAnonymousBgColor = null;

//     if (Number(is_anonymous) === 1) {
//       const [existingIdentity] = await connection.query(
//         `SELECT anonymous_name, anonymous_bg_color
//          FROM comments
//          WHERE post_id = ? AND user_id = ? AND is_anonymous = 1 AND is_deleted = 0
//          LIMIT 1`,
//         [postId, userId]
//       );
//       if (existingIdentity.length > 0) {
//         finalAnonymousName = existingIdentity[0].anonymous_name;
//         finalAnonymousBgColor = existingIdentity[0].anonymous_bg_color;
//       } else {
//         finalAnonymousName = generateAnonymousName();
//         finalAnonymousBgColor = generateAnonymousBgColor();
//       }
//     }

//     // reply logic
//     if (comment_id) {
//       const [parentRows] = await connection.query(
//         `SELECT id, parent_id, user_id
//          FROM comments
//          WHERE id = ?`,
//         [comment_id]
//       );
//       if (!parentRows.length) {
//         return res.status(404).json({ message: "Parent comment not found" });
//       }
//       const parent = parentRows[0];
//       finalParentId = parent.parent_id || parent.id;
//       parentOwnerId = parent.user_id;
//     }

//     // create comment
//     const [result] = await connection.query(
//       `INSERT INTO comments
//        (post_id, parent_id, user_id, username, content, gif_url,
//         user_id_mention,username_mention, is_anonymous, anonymous_name, anonymous_bg_color)
//        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
//       [
//         postId,
//         finalParentId,
//         userId,

//         username,
//         content || null,
//         gif_url || null,
//         user_id_mention || null,
//         username_mention || null,
//         is_anonymous || 0,
//         finalAnonymousName,
//         finalAnonymousBgColor
//       ]
//     );

//     // increment reply_count on top-level parent
//     if (finalParentId) {
//       await connection.query(
//         `UPDATE comments SET reply_count = reply_count + 1 WHERE id = ?`,
//         [finalParentId]
//       );
//     }

//     // notify top-level parent owner
//     if (parentOwnerId && parentOwnerId !== userId ) {
//       await connection.query(
//         `INSERT INTO notifications
//          (receiver_id, sender_id, type, content, post_id, comment_id, is_viewed)
//          VALUES (?, ?, 'comment_reply', '${username} replied to ${parentOwnerId === user_id_mention ? 'you' : username_mention }${parentOwnerId === user_id_mention ? '' : ' on your comment'}: ${content.slice(0, 100) + (content.length > 100 ? '...' : '')}', ?, ?, 0)`,
//         [parentOwnerId, userId, postId, result.insertId]
//       );
//     }

//     // if replying to a reply, increment that reply’s count and notify its owner
//     if (comment_id && comment_id !== finalParentId) {
//       await connection.query(
//         `UPDATE comments SET reply_count = reply_count + 1 WHERE id = ?`,
//         [parent_id]
//       );

//       const [replyRows] = await connection.query(
//         `SELECT user_id FROM comments WHERE id = ?`,
//         [comment_id]
//       );
//       const replyOwnerId = replyRows[0]?.user_id;

//       if (
//         replyOwnerId && // check if reply owner id exist
//         replyOwnerId !== userId && // compare current user with reply owner id prevent self notification
//         replyOwnerId !== parentOwnerId // if reply comment is not the parent comment owner
//       ) {
//         await connection.query(
//           `INSERT INTO notifications
//            (receiver_id, sender_id, type, content, post_id, comment_id, is_viewed)
//            VALUES (?, ?, 'comment_reply', '${username} replied to youss: ${content.slice(0, 100) + (content.length > 100 ? '...' : '')}',?, ?, 0)`,
//           [replyOwnerId, userId, postId, result.insertId]
//         );
//       }
//     }

//     await connection.commit();
//     res.status(201).json({ message: "Comment created", comment_id: result.insertId });
//   } catch (err) {
//     await connection.rollback();
//     console.error(err);
//     res.status(500).json({ message: "Server error" });
//   } finally {
//     connection.release();
//   }
// };
const addComment = async (req, res) => {
  const connection = await db.getConnection();

  try {

    await connection.beginTransaction();

    const userId = req.user.userId;

    const {
      username,
      comment_id,
      content,
      gif_url,
      user_id_mention,
      username_mention,
      is_anonymous
    } = req.body;

    const { postId } = req.params;

    // =========================
    // VALIDATION
    // =========================

    if (!postId) {
      return res.status(400).json({
        message: "Missing postId"
      });
    }

    if (!content && !gif_url) {
      return res.status(400).json({
        message: "Content or GIF required"
      });
    }

    // =========================
    // NOTIFICATION TEXT
    // =========================

    const notificationText = content
      ? content.slice(0, 100) +
        (content.length > 100 ? "..." : "")
      : "GIF";

    // =========================
    // ANONYMOUS IDENTITY
    // =========================

    let finalAnonymousName = null;
    let finalAnonymousBgColor = null;

    if (Number(is_anonymous) === 1) {

      const [existingIdentity] = await connection.query(
        `
        SELECT anonymous_name, anonymous_bg_color
        FROM comments
        WHERE post_id = ?
        AND user_id = ?
        AND is_anonymous = 1
        AND is_deleted = 0
        LIMIT 1
        `,
        [postId, userId]
      );

      if (existingIdentity.length > 0) {

        finalAnonymousName =
          existingIdentity[0].anonymous_name;

        finalAnonymousBgColor =
          existingIdentity[0].anonymous_bg_color;

      } else {

        finalAnonymousName =
          generateAnonymousName();

        finalAnonymousBgColor =
          generateAnonymousBgColor();
      }
    }

    // =========================
    // REPLY LOGIC
    // =========================

    let finalParentId = null;

    if (comment_id) {

      const [parentRows] = await connection.query(
        `
        SELECT id, parent_id
        FROM comments
        WHERE id = ?
        `,
        [comment_id]
      );

      if (!parentRows.length) {

        return res.status(404).json({
          message: "Parent comment not found"
        });
      }

      const parentComment = parentRows[0];

      // always store top-level parent
      finalParentId =
        parentComment.parent_id || parentComment.id;
    }

    // =========================
    // CREATE COMMENT
    // =========================

    const [result] = await connection.query(
      `
      INSERT INTO comments
      (
        post_id,
        parent_id,
        user_id,
        username,
        content,
        gif_url,
        user_id_mention,
        username_mention,
        is_anonymous,
        anonymous_name,
        anonymous_bg_color
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        postId,
        finalParentId,
        userId,
        username,
        content || null,
        gif_url || null,
        user_id_mention || null,
        username_mention || null,
        is_anonymous || 0,
        finalAnonymousName,
        finalAnonymousBgColor
      ]
    );

    // =========================
    // UPDATE REPLY COUNT
    // =========================

    if (finalParentId) {

      await connection.query(
        `
        UPDATE comments
        SET reply_count = reply_count + 1
        WHERE id = ?
        `,
        [finalParentId]
      );
    }

    // =========================
    // NOTIFICATION LOGIC
    // =========================

    if (comment_id) {

      // comment being replied to
      const [replyRows] = await connection.query(
        `
        SELECT id, user_id, username, parent_id
        FROM comments
        WHERE id = ?
        `,
        [comment_id]
      );

      const replyComment = replyRows[0];

      if (replyComment) {

        const replyOwnerId =
          replyComment.user_id;

        const replyOwnerUsername =
          replyComment.username;

        // top-level parent comment
        const [topRows] = await connection.query(
          `
          SELECT id, user_id, username
          FROM comments
          WHERE id = ?
          `,
          [finalParentId]
        );

        const topComment = topRows[0];

        const parentOwnerId =
          topComment?.user_id;

        // =====================================
        // CASE 1
        // DIRECT REPLY TO PARENT COMMENT
        // =====================================

        if (comment_id === finalParentId) {

          if (
            parentOwnerId &&
            parentOwnerId !== userId
          ) {

            await connection.query(
              `
              INSERT INTO notifications
              (
                receiver_id,
                sender_id,
                type,
                content,
                post_id,
                comment_id,
                is_viewed
              )
              VALUES (?, ?, 'comment_reply', ?, ?, ?, 0)
              `,
              [
                parentOwnerId,
                userId,
                `${username} replied to your comment: ${notificationText}`,
                postId,
                result.insertId
              ]
            );
          }
        }

        // =====================================
        // CASE 2
        // REPLY TO REPLY
        // =====================================

        else {

          // -----------------------------------
          // SAME USER:
          // parent owner == reply owner
          // -----------------------------------

          if (parentOwnerId === replyOwnerId) {

            // Example:
            //
            // User1 parent
            // User2 reply
            // User1 reply back
            // User4 reply to User1
            //
            // User1 should ONLY get:
            // "User4 replied to you"

            if (replyOwnerId !== userId) {

              await connection.query(
                `
                INSERT INTO notifications
                (
                  receiver_id,
                  sender_id,
                  type,
                  content,
                  post_id,
                  comment_id,
                  is_viewed
                )
                VALUES (?, ?, 'comment_reply', ?, ?, ?, 0)
                `,
                [
                  replyOwnerId,
                  userId,
                  `${username} replied to you: ${notificationText}`,
                  postId,
                  result.insertId
                ]
              );
            }
          }

          // -----------------------------------
          // DIFFERENT USERS
          // -----------------------------------

          else {

            // notify parent owner

            if (
              parentOwnerId &&
              parentOwnerId !== userId
            ) {

              await connection.query(
                `
                INSERT INTO notifications
                (
                  receiver_id,
                  sender_id,
                  type,
                  content,
                  post_id,
                  comment_id,
                  is_viewed
                )
                VALUES (?, ?, 'comment_reply', ?, ?, ?, 0)
                `,
                [
                  parentOwnerId,
                  userId,
                  `${username} replied to ${replyOwnerUsername} on your comment: ${notificationText}`,
                  postId,
                  result.insertId
                ]
              );
            }

            // notify reply owner

            if (
              replyOwnerId &&
              replyOwnerId !== userId
            ) {

              await connection.query(
                `
                INSERT INTO notifications
                (
                  receiver_id,
                  sender_id,
                  type,
                  content,
                  post_id,
                  comment_id,
                  is_viewed
                )
                VALUES (?, ?, 'comment_reply', ?, ?, ?, 0)
                `,
                [
                  replyOwnerId,
                  userId,
                  `${username} replied to you: ${notificationText}`,
                  postId,
                  result.insertId
                ]
              );
            }
          }
        }
      }
    }

    // =========================
    // SUCCESS
    // =========================

    await connection.commit();

    return res.status(201).json({
      message: "Comment created",
      comment_id: result.insertId
    });

  } catch (err) {

    await connection.rollback();

    console.error(err);

    return res.status(500).json({
      message: "Server error"
    });

  } finally {

    connection.release();
  }
};
const updateComment = async (req, res) => {

    try {

        const userId = req.user.userId;

        const { commentId } = req.params;

        const { content } = req.body;

        if (!content) {
      
            return res.status(400).json(
                {
                message: "Content required", 
                }
        );
        }

        const [result] = await db.query(
            `UPDATE comments
             SET content = ?,
                 is_edited = 1
             WHERE id = ?
             AND user_id = ? AND is_deleted = 0`,
            [content, commentId, userId]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({
                message: "Comment not found"
            });
        }

        res.status(200).json({
            message: "Comment updated"
        });

    } catch (err) {

        console.error(err);

        res.status(500).json({
            message: "Server error"
        });
    }
};
const deleteComment = async (req, res) => {
    try{
        const userId = req.user.userId;
        const { commentId } = req.params;

        const [result] = await db.query(
            "UPDATE comments SET is_deleted = 1, content = '[deleted]' WHERE id = ? AND user_id = ? AND is_deleted = 0",
            [commentId, userId]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: "Comment not found" });
        }

        res.status(200).json({ message: "Comment deleted" });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Server error" });
    }
};

const getCommentsByPostId = async (req, res) => {

    try {

        const userId = req.user.userId;

        const { postId } = req.params;

        let { page = 1, limit = 10 } = req.query;

        page = Math.max(parseInt(page) || 1, 1);

        limit = Math.min(
            Math.max(parseInt(limit) || 10, 1),
            50
        );

        const offset = (page - 1) * limit;

        // top-level comments only
        const [topComments] = await db.query(
            `SELECT
                c.id,
                c.post_id,
                c.parent_id,
                c.user_id,

                CASE
                    WHEN c.is_deleted = 1 THEN '[deleted]'
                    ELSE c.content
                END AS content,

                c.username,
                c.gif_url,
                c.username_mention,
                c.is_anonymous,
                c.anonymous_name,
                c.anonymous_bg_color,
                c.likes_count,
                c.reply_count,
                c.is_deleted,
                c.is_edited,
                c.created_at,
                c.updated_at,

                EXISTS(
                    SELECT 1
                    FROM comment_likes cl
                    WHERE cl.comment_id = c.id
                    AND cl.user_id = ?
                ) AS is_liked

            FROM comments c

            WHERE c.post_id = ?
            AND c.parent_id IS NULL

            ORDER BY c.created_at DESC

            LIMIT ?
            OFFSET ?`,
            [userId, postId, limit, offset]
        );

        // no comments
        if (!topComments.length) {
            return res.json({
                comments: [],
                pagination: {
                    page,
                    limit,
                    has_more: false
                }
            });
        }

        // parent ids
        const parentIds = topComments.map(c => c.id);

        // fetch replies
        const [replies] = await db.query(
            `SELECT
                c.id,
                c.post_id,
                c.parent_id,
                c.user_id,

                CASE
                    WHEN c.is_deleted = 1 THEN '[deleted]'
                    ELSE c.content
                END AS content,

                c.username,
                c.gif_url,
                c.username_mention,
                c.is_anonymous,
                c.anonymous_name,
                c.anonymous_bg_color,
                c.likes_count,
                c.reply_count,
                c.is_deleted,
                c.is_edited,
                c.created_at,
                c.updated_at,

                EXISTS(
                    SELECT 1
                    FROM comment_likes cl
                    WHERE cl.comment_id = c.id
                    AND cl.user_id = ?
                ) AS is_liked

            FROM comments c

            WHERE c.parent_id IN (?)

            ORDER BY c.created_at ASC`,
            [userId, parentIds.length ? parentIds : [0]] // ensure array expands
            // [userId, parentIds]
        );

        // group replies
        const grouped = {};

        topComments.forEach(comment => {
            grouped[comment.id] = {
                ...comment,
                replies: []
            };
        });

        replies.forEach(reply => {

            if (grouped[reply.parent_id]) {
                grouped[reply.parent_id].replies.push(reply);
            }
        });

        // count total top-level comments
        const [countRows] = await db.query(
            `SELECT COUNT(*) as total
             FROM comments
             WHERE post_id = ?
             AND parent_id IS NULL`,
            [postId]
        );

        const total = countRows[0].total;

        res.json({
            comments: Object.values(grouped),

            pagination: {
                page,
                limit,
                total,
                total_pages: Math.ceil(total / limit),
                has_more: offset + limit < total
            }
        });

    } catch (err) {

        console.error(err);

        res.status(500).json({
            message: "Error fetching comments"
        });
    }
};

const getAnonIdentity = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { postId } = req.params;

    if (!postId) {
      return res.status(400).json({ message: "Missing postId" });
    }

    const [rows] = await db.query(
      "SELECT is_anonymous, anonymous_name, anonymous_bg_color FROM comments WHERE post_id=? AND user_id=? LIMIT 1",
      [postId, userId]
    );

    if (rows.length > 0) {
      // Found existing identity
      return res.json({
        exists: true,
        is_anonymous: rows[0].is_anonymous,
        anonymous_name: rows[0].anonymous_name,
        anonymous_bg_color: rows[0].anonymous_bg_color
      });
    }

    // No identity yet
    return res.json({ exists: false });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
};

const reportComment = async (req, res) => {

    try {

        const userId = req.user.userId;

        const { commentId } = req.params;

        const {
            report_type,
            reason
        } = req.body;

        const allowedTypes = [
            'spam',
            'harassment',
            'hate_speech',
            'nudity',
            'violence',
            'misinformation',
            'self_harm',
            'bullying',
            'illegal_activity',
            'scam',
            'other'
        ];

        if (!allowedTypes.includes(report_type)) {
            return res.status(400).json({
                message: "Invalid report type"
            });
        }

        await db.query(
            `INSERT INTO comment_reports
            (
                comment_id,
                reporter_id,
                report_type,
                reason
            )
            VALUES (?, ?, ?, ?)`,
            [
                commentId,
                userId,
                report_type,
                reason || null
            ]
        );

        res.json({
            message: "Comment reported"
        });

    } catch (err) {

        if (err.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({
                message: "Already reported"
            });
        }

        console.error(err);

        res.status(500).json({
            message: "Server error"
        });
    }
};


const likeComment = async (req, res) => {

    const connection = await db.getConnection();

    try {

        await connection.beginTransaction();

        const userId = req.user.userId;
        const { commentId } = req.params;

        // =========================================
        // CHECK IF USER ALREADY LIKED
        // =========================================

        const [existingLike] = await connection.query(
            `
            SELECT id
            FROM comment_likes
            WHERE comment_id = ?
            AND user_id = ?
            `,
            [commentId, userId]
        );

        // =========================================
        // GET COMMENT INFO
        // =========================================

        const [commentRows] = await connection.query(
            `
            SELECT
                c.id,
                c.user_id,
                c.post_id
            FROM comments c
            WHERE c.id = ?
            AND c.is_deleted = 0
            `,
            [commentId]
        );

        if (!commentRows.length) {

            await connection.rollback();

            return res.status(404).json({
                message: "Comment not found"
            });
        }

        const commentOwnerId = commentRows[0].user_id;
        const postId = commentRows[0].post_id;

        // aggregate notification key
        const aggregateKey =
            `comment_like_${commentOwnerId}_${commentId}`;

        // =========================================
        // UNLIKE
        // =========================================

        if (existingLike.length > 0) {

            // -------------------------------------
            // REMOVE LIKE
            // -------------------------------------

            await connection.query(
                `
                DELETE FROM comment_likes
                WHERE comment_id = ?
                AND user_id = ?
                `,
                [commentId, userId]
            );

            // -------------------------------------
            // DECREASE LIKE COUNT
            // -------------------------------------

            await connection.query(
                `
                UPDATE comments
                SET likes_count = GREATEST(likes_count - 1, 0)
                WHERE id = ?
                `,
                [commentId]
            );

            // -------------------------------------
            // GET UPDATED TOTAL LIKES
            // -------------------------------------

            const [[likeData]] = await connection.query(
                `
                SELECT COUNT(*) AS totalLikes
                FROM comment_likes
                WHERE comment_id = ?
                `,
                [commentId]
            );

            const totalLikes = likeData.totalLikes;

            // -------------------------------------
            // IF NO LIKES LEFT
            // DELETE NOTIFICATION
            // -------------------------------------

            if (totalLikes === 0) {

                await connection.query(
                    `
                    DELETE FROM notifications
                    WHERE aggregate_key = ?
                    `,
                    [aggregateKey]
                );
            }

            // -------------------------------------
            // OTHERWISE UPDATE NOTIFICATION
            // -------------------------------------

            else {

                // get newest liker
                const [[latestLiker]] = await connection.query(
                    `
                    SELECT
                        cl.user_id,
                        u.username
                    FROM comment_likes cl
                    JOIN users u
                        ON u.id = cl.user_id
                    WHERE cl.comment_id = ?
                    ORDER BY cl.id DESC
                    LIMIT 1
                    `,
                    [commentId]
                );

                // build notification text
                let notificationContent;

                if (totalLikes === 1) {

                    notificationContent =
                        `${latestLiker.username} liked your comment`;

                } else {

                    notificationContent =
                        `${latestLiker.username} and ${totalLikes - 1} others liked your comment`;
                }

                // update notification
                await connection.query(
                    `
                    UPDATE notifications
                    SET
                        sender_id = ?,
                        content = ?,
                        is_viewed = 0,
                        created_at = NOW()
                    WHERE aggregate_key = ?
                    `,
                    [
                        latestLiker.user_id,
                        notificationContent,
                        aggregateKey
                    ]
                );
            }

            // -------------------------------------
            // SUCCESS
            // -------------------------------------

            await connection.commit();

            return res.json({
                liked: false
            });
        }

        // =========================================
        // LIKE
        // =========================================

        // -----------------------------------------
        // INSERT LIKE
        // -----------------------------------------

        await connection.query(
            `
            INSERT INTO comment_likes
            (comment_id, user_id)
            VALUES (?, ?)
            `,
            [commentId, userId]
        );

        // -----------------------------------------
        // INCREASE COMMENT LIKE COUNT
        // -----------------------------------------

        await connection.query(
            `
            UPDATE comments
            SET likes_count = likes_count + 1
            WHERE id = ?
            `,
            [commentId]
        );

        // =========================================
        // NOTIFICATION LOGIC
        // =========================================

        // don't notify self-like
        if (commentOwnerId !== userId) {

            // -------------------------------------
            // GET TOTAL LIKES
            // -------------------------------------

            const [[likeData]] = await connection.query(
                `
                SELECT COUNT(*) AS totalLikes
                FROM comment_likes
                WHERE comment_id = ?
                `,
                [commentId]
            );

            const totalLikes = likeData.totalLikes;

            // -------------------------------------
            // GET CURRENT USERNAME
            // -------------------------------------

            const [[currentUser]] = await connection.query(
                `
                SELECT username
                FROM users
                WHERE id = ?
                `,
                [userId]
            );

            // -------------------------------------
            // BUILD NOTIFICATION CONTENT
            // -------------------------------------

            let notificationContent;

            if (totalLikes === 1) {

                notificationContent =
                    `${currentUser.username} liked your comment`;

            } else {

                notificationContent =
                    `${currentUser.username} and ${totalLikes - 1} other${totalLikes - 1 > 1 ? 's' : ''} liked your comment`;
            }

            // -------------------------------------
            // FIND EXISTING AGGREGATED NOTIFICATION
            // -------------------------------------

            const [existingNotification] = await connection.query(
                `
                SELECT id
                FROM notifications
                WHERE aggregate_key = ?
                LIMIT 1
                `,
                [aggregateKey]
            );

            // -------------------------------------
            // UPDATE EXISTING NOTIFICATION
            // -------------------------------------

            if (existingNotification.length > 0) {

                await connection.query(
                    `
                    UPDATE notifications
                    SET
                        sender_id = ?,
                        content = ?,
                        is_viewed = 0,
                        created_at = NOW()
                    WHERE aggregate_key = ?
                    `,
                    [
                        userId,
                        notificationContent,
                        aggregateKey
                    ]
                );
            }

            // -------------------------------------
            // CREATE NEW NOTIFICATION
            // -------------------------------------

            else {

                await connection.query(
                    `
                    INSERT INTO notifications
                    (
                        receiver_id,
                        sender_id,
                        type,
                        content,
                        post_id,
                        comment_id,
                        aggregate_key,
                        is_viewed
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?, 0)
                    `,
                    [
                        commentOwnerId,
                        userId,
                        'comment_like',
                        notificationContent,
                        postId,
                        commentId,
                        aggregateKey
                    ]
                );
            }
        }

        // =========================================
        // SUCCESS
        // =========================================

        await connection.commit();

        return res.json({
            liked: true
        });

    } catch (err) {

        await connection.rollback();

        console.error(err);

        return res.status(500).json({
            message: "Server error"
        });

    } finally {

        connection.release();
    }
};
// const likeComment = async (req, res) => {

//     const connection = await db.getConnection();

//     try {

//         await connection.beginTransaction();

//         const userId = req.user.userId;
//         const { commentId } = req.params;

//         const [existing] = await connection.query(
//             `SELECT id
//              FROM comment_likes
//              WHERE comment_id = ?
//              AND user_id = ?`,
//             [commentId, userId]
//         );

//         // UNLIKE
//         if (existing.length > 0) {

//             await connection.query(
//                 `DELETE FROM comment_likes
//                  WHERE comment_id = ?
//                  AND user_id = ?`,
//                 [commentId, userId]
//             );

//             await connection.query(
//                 `UPDATE comments
//                  SET likes_count = GREATEST(likes_count - 1, 0)
//                  WHERE id = ?`,
//                 [commentId]
//             );
//             await connection.query(
//                 `DELETE FROM notifications
//                 WHERE sender_id = ?
//                 AND comment_id = ?
//                 AND type = 'comment_like'`,
//                 [userId, commentId]
//             );

//             await connection.commit();

//             return res.json({
//                 liked: false
//             });
//         }

//         const [commentExists] = await connection.query(
//             `SELECT id, user_id, post_id
//             FROM comments
//             WHERE id = ?
//             AND is_deleted = 0`,
//             [commentId]
//         );

//         if (!commentExists.length) {

//             await connection.rollback();

//             return res.status(404).json({
//                 message: "Comment not found"
//             });
//         }

//         // LIKE
//         await connection.query(
//             `INSERT INTO comment_likes
//             (comment_id, user_id)
//             VALUES (?, ?)`,
//             [commentId, userId]
//         );

//         await connection.query(
//             `UPDATE comments
//             SET likes_count = likes_count + 1
//             WHERE id = ?`,
//             [commentId]
//         );
//         const commentOwnerId = commentExists[0].user_id;
//         const postId = commentExists[0].post_id;
//         if (commentOwnerId !== userId) {
//             await connection.query(
//                 `INSERT INTO notifications
//                 (
//                     receiver_id,
//                     sender_id,
//                     type,
//                     post_id,
//                     comment_id,
//                     is_viewed
//                 )
//                 VALUES (?, ?, ?, ?, ?, 0)`,
//                 [
//                     commentOwnerId,
//                     userId,
//                     'comment_like',
//                     postId,
//                     commentId
//                 ]
//             );
//         }
//         await connection.commit();

//         res.json({
//             liked: true
//         });

//     } catch (err) {

//         await connection.rollback();

//         console.error(err);

//         res.status(500).json({
//             message: "Server error"
//         });

//     } finally {
//         connection.release();
//     }
// };

module.exports = {
     addComment, 
     updateComment, 
     deleteComment, 
     getCommentsByPostId, 
     getAnonIdentity,
     reportComment,
     likeComment
};


