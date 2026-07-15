const db = require("../../config/db");
const { cachePost, ranking } = require("../../config/redisClient");

const generateAnonymousName = () => {

    const generateNum = Array.from(
        { length: 6 },
        () => Math.floor(Math.random() * 10)
    ).join("");

    return `An${generateNum}nymous`;
};

const generateAnonymousBgColor = () => {

    const colors = [
    "#8B5CF6", // violet
    "#EC4899", // pink
    "#38BDF8", // sky
    "#818CF8", // indigo
    "#EAB308", // yellow
    "#4ADE80", // green
    "#F87171", // red
    "#FB923C", // orange
    "#22D3EE", // cyan
    "#2DD4BF", // teal
    "#F472B6", // rose
    "#A78BFA", // purple
    "#FCA5A5", // soft red
    "#FACC15", // amber
    "#60A5FA", // blue
    "#34D399", // emerald
    "#FB7185", // pink-red
    "#6366F1", // indigo
    "#A855F7", // medium purple
    "#3B82F6", // medium blue
  ];

    const randomIndex = Math.floor(
        Math.random() * colors.length
    );

    return colors[randomIndex];
};

const addComment = async (req, res) => {
  const client = await db.connect();

  try {

    await client.query("BEGIN");

    const userId = req.user.userId;
    const today = new Date().toISOString().split("T")[0]; //  YYYY-MM-DD
    const currentDate = today; // keep full YYYY-MM-DD
    const currentMonth = today.slice(0, 7).replace("-", "");
    const { postId } = req.params;

    const {
      username,
      comment_id,
      content,
      gif_url,
      user_id_mention,
      username_mention,
      is_anonymous
    } = req.body;


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

    const postOwnerResult = await client.query(
      `SELECT user_id FROM posts WHERE id = $1`,
      [postId]
    );
    const postOwnerId = postOwnerResult.rows[0]?.user_id;

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

      const existingIdentityResult = await client.query(
        `
        SELECT anonymous_name, anonymous_bg_color
        FROM comments
        WHERE post_id = $1
        AND user_id = $2
        AND is_anonymous = 1
        AND is_deleted = 0
        LIMIT 1
        `,
        [postId, userId]
      );
      const existingIdentity = existingIdentityResult.rows;

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

      const parentRowsResult = await client.query(
        `
        SELECT id, parent_id
        FROM comments
        WHERE id = $1
        `,
        [comment_id]
      );
      const parentRows = parentRowsResult.rows;

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

    const result = await client.query(
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
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING id
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
    const insertedCommentId = result.rows[0].id;

    // =========================
    // UPDATE REPLY COUNT
    // =========================

    if (finalParentId) {

      await client.query(
        `
        UPDATE comments
        SET reply_count = reply_count + 1
        WHERE id = $1
        `,
        [finalParentId]
      );
    }

    // =========================
    // NOTIFICATION LOGIC
    // =========================

    if (comment_id) {

      // comment being replied to
      const replyRowsResult = await client.query(
        `
        SELECT id, user_id, username, parent_id
        FROM comments
        WHERE id = $1
        `,
        [comment_id]
      );
      const replyRows = replyRowsResult.rows;

      const replyComment = replyRows[0];

      if (replyComment) {

        const replyOwnerId =
          replyComment.user_id;

        const replyOwnerUsername =
          replyComment.username;

        // top-level parent comment
        const topRowsResult = await client.query(
          `
          SELECT id, user_id, username
          FROM comments
          WHERE id = $1
          `,
          [finalParentId]
        );
        const topRows = topRowsResult.rows;

        const topComment = topRows[0];

        const parentOwnerId =
          topComment?.user_id;

        // =====================================
        // CASE 1
        // DIRECT REPLY TO PARENT COMMENT
        // =====================================
        // Fixed: comment_id (from req.body, type unknown) vs finalParentId
        // (always a string from Postgres bigint) — compare as strings so
        // this branch is chosen correctly regardless of incoming type.
        if (String(comment_id) === String(finalParentId)) {

          if (
            parentOwnerId &&
            String(parentOwnerId) !== String(userId)
          ) {

            await client.query(
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
              VALUES ($1, $2, 'comment_reply', $3, $4, $5, 0)
              `,
              [
                parentOwnerId,
                userId,
                `${username} replied to your comment: ${notificationText}`,
                postId,
                insertedCommentId
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
          // Both sides are DB-sourced strings here, safe to compare directly.
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

            if (String(replyOwnerId) !== String(userId)) {

              await client.query(
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
                VALUES ($1, $2, 'comment_reply', $3, $4, $5, 0)
                `,
                [
                  replyOwnerId,
                  userId,
                  `${username} replied to you: ${notificationText}`,
                  postId,
                  insertedCommentId
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
              String(parentOwnerId) !== String(userId)
            ) {

              await client.query(
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
                VALUES ($1, $2, 'comment_reply', $3, $4, $5, 0)
                `,
                [
                  parentOwnerId,
                  userId,
                  `${username} replied to ${replyOwnerUsername} on your comment: ${notificationText}`,
                  postId,
                  insertedCommentId
                ]
              );
            }

            // notify reply owner

            if (
              replyOwnerId &&
              String(replyOwnerId) !== String(userId)
            ) {

              await client.query(
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
                VALUES ($1, $2, 'comment_reply', $3, $4, $5, 0)
                `,
                [
                  replyOwnerId,
                  userId,
                  `${username} replied to you: ${notificationText}`,
                  postId,
                  insertedCommentId
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

    await client.query(
        `UPDATE posts SET comments_count = comments_count + 1 WHERE id = $1`,
        [postId]
    )
    await ranking.zIncrBy(`trendingPost:day:${currentDate}`, 5, postId.toString());
    await ranking.zIncrBy(`hof:month:${currentMonth}`, 3, userId.toString());
    if (postOwnerId && String(postOwnerId) !== String(userId)) {
      await ranking.zIncrBy(`hof:month:${currentMonth}`, 2, postOwnerId.toString());
    }

    await client.query("COMMIT");

    return res.status(201).json({
      message: "Comment created",
      comment_id: insertedCommentId
    });

  } catch (err) {

    await client.query("ROLLBACK");

    console.error(err);

    return res.status(500).json({
      message: "Server error"
    });

  } finally {

    client.release();
  }
};

const updateComment = async (req, res) => {

    try {

        const userId = req.user.userId;

        const { commentId } = req.params;

        const { content, gif_url } = req.body;

        if (!content) {
      
            return res.status(400).json(
                {
                message: "Content required", 
                }
        );
        }

        const result = await db.query(
            `UPDATE comments
             SET content = $1,
                 gif_url = $2,
                 is_edited = 1
             WHERE id = $3
             AND user_id = $4 AND is_deleted = 0`,
            [content, gif_url, commentId, userId]
        );

        if (result.rowCount === 0) {
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
  try {
    const today = new Date().toISOString().split("T")[0]; // "2026-05-20"
    const currentDate = today; // keep full YYYY-MM-DD
    const currentMonth = today.slice(0, 7).replace("-", "");
    const userId = req.user.userId;
    const commentId = req.params.commentId;
    const postId = req.params.postId;

    const result = await db.query(
      "UPDATE comments SET is_deleted = 1, content = '[deleted]' WHERE id = $1 AND user_id = $2 AND is_deleted = 0",
      [commentId, userId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ message: "Comment not found" });
    }
    
    const postOwnerResult = await db.query(
      `SELECT user_id FROM posts WHERE id = $1`,
      [postId]
    );
    const postOwnerId = postOwnerResult.rows[0]?.user_id;


    await db.query(
      "UPDATE posts SET comments_count = comments_count - 1 WHERE id = $1",
      [postId]
    )
    // Build today's trending key
    const todayTrendingKey = `trendingPost:day:${currentDate}`;

    // Check if today's trending key exists
    const exists = await ranking.exists(todayTrendingKey);
    if (exists) {
      // Only decrement if the key is for today
      await ranking.zIncrBy(todayTrendingKey, -5, postId.toString());
    }
    await ranking.zIncrBy(`hof:month:${currentMonth}`, -3, userId.toString());
        if (postOwnerId && String(postOwnerId) !== String(userId)) {
      await ranking.zIncrBy(`hof:month:${currentMonth}`, -2, postOwnerId.toString());
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
    limit = Math.min(Math.max(parseInt(limit) || 10, 1), 50);
    const offset = (page - 1) * limit;

    // Get user's liked comments as SET (exactly like attachUserStates)
    const likedRowsResult = await db.query(
      `SELECT comment_id FROM comment_likes WHERE user_id = $1`,
      [userId]
    );
    const likedRows = likedRowsResult.rows;
    const likedSet = new Set(likedRows.map(row => row.comment_id));

    // top-level comments only
    const topCommentsResult = await db.query(
      `SELECT
        c.id,
        c.post_id,
        c.parent_id,
        c.user_id,
        CASE
          WHEN c.is_deleted = 1 THEN '[deleted]'
          ELSE c.content
        END AS content,
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
        u.avatar_url,
        u.username AS original_username
      FROM comments c
      LEFT JOIN users u ON c.user_id = u.id
      WHERE c.post_id = $1
      AND c.parent_id IS NULL
      AND c.is_deleted = 0
      ORDER BY c.created_at DESC
      LIMIT $2 OFFSET $3`,
      [postId, limit, offset]
    );
    const topComments = topCommentsResult.rows;

    if (!topComments.length) {
      return res.json({
        comments: [],
        pagination: {
          page,
          limit,
          total: 0,
          total_pages: 0,
          has_more: false
        }
      });
    }

    const parentIds = topComments.map(c => c.id);

    // fetch replies
    const repliesResult = await db.query(
      `SELECT
        c.id,
        c.post_id,
        c.parent_id,
        c.user_id,
        CASE
          WHEN c.is_deleted = 1 THEN '[deleted]'
          ELSE c.content
        END AS content,
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
        u.avatar_url,
        u.username AS original_username
      FROM comments c
      LEFT JOIN users u ON c.user_id = u.id
      WHERE c.parent_id = ANY($1)
      AND c.is_deleted = 0
      ORDER BY c.created_at ASC`,
      [parentIds]
    );
    const replies = repliesResult.rows;

    // Build response with is_liked from Set
    const commentsMap = {};
    topComments.forEach(comment => {
      commentsMap[comment.id] = {
        id: comment.id,
        post_id: comment.post_id,
        parent_id: comment.parent_id,
        user_id: comment.user_id,
        content: comment.content,
        gif_url: comment.gif_url,
        username_mention: comment.username_mention,
        is_anonymous: comment.is_anonymous,
        anonymous_name: comment.anonymous_name,
        anonymous_bg_color: comment.anonymous_bg_color,
        likes_count: comment.likes_count,
        reply_count: comment.reply_count,
        is_deleted: comment.is_deleted,
        is_edited: comment.is_edited,
        created_at: comment.created_at,
        updated_at: comment.updated_at,
        avatar_url: comment.is_anonymous === 1 ? null : comment.avatar_url,
        username: comment.is_anonymous === 1 ? comment.anonymous_name : comment.original_username,
        is_liked: likedSet.has(comment.id),
        replies: []
      };
    });

    replies.forEach(reply => {
      if (commentsMap[reply.parent_id]) {
        commentsMap[reply.parent_id].replies.push({
          id: reply.id,
          post_id: reply.post_id,
          parent_id: reply.parent_id,
          user_id: reply.user_id,
          content: reply.content,
          gif_url: reply.gif_url,
          username_mention: reply.username_mention,
          is_anonymous: reply.is_anonymous,
          anonymous_name: reply.anonymous_name,
          anonymous_bg_color: reply.anonymous_bg_color,
          likes_count: reply.likes_count,
          reply_count: reply.reply_count,
          is_deleted: reply.is_deleted,
          is_edited: reply.is_edited,
          created_at: reply.created_at,
          updated_at: reply.updated_at,
          avatar_url: reply.is_anonymous === 1 ? null : reply.avatar_url,
          username: reply.is_anonymous === 1 ? reply.anonymous_name : reply.original_username,
          is_liked: likedSet.has(reply.id)
        });
      }
    });

    const countRowsResult = await db.query(
      `SELECT COUNT(*) as total
       FROM comments
       WHERE post_id = $1
       AND parent_id IS NULL
       AND is_deleted = 0`,
      [postId]
    );
    const countRows = countRowsResult.rows;

    const total = countRows[0].total;

    const totalN = Number(total);
    res.json({
      comments: Object.values(commentsMap),
      pagination: {
        page,
        limit,
        totalN,
        total_pages: Math.ceil(totalN / limit),
        has_more: offset + limit < totalN
      }
    });

  } catch (err) {
    console.error("getCommentsByPostId error:", err);
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

    const result = await db.query(
      `SELECT anonymous_name, anonymous_bg_color
       FROM comments
       WHERE post_id = $1 AND user_id = $2 AND is_anonymous = 1 AND is_deleted = 0
       ORDER BY id ASC
       LIMIT 1`,
      [postId, userId]
    );
    const rows = result.rows;

    if (rows.length > 0) {
      return res.json({
        exists: true,
        anonymous_name: rows[0].anonymous_name,
        anonymous_bg_color: rows[0].anonymous_bg_color,
      });
    }

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
            VALUES ($1, $2, $3, $4)`,
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

        if (err.code === '23505') {
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

    const client = await db.connect();
    const today = new Date().toISOString().split("T")[0]; //  YYYY-MM-DD
    const currentDate = today; // keep full YYYY-MM-DD
    const currentMonth = today.slice(0, 7).replace("-", "");
    try {

        await client.query("BEGIN");

        const userId = req.user.userId;
        const { commentId } = req.params;

        // =========================================
        // CHECK IF USER ALREADY LIKED
        // =========================================

        const existingLikeResult = await client.query(
            `
            SELECT id
            FROM comment_likes
            WHERE comment_id = $1
            AND user_id = $2
            `,
            [commentId, userId]
        );
        const existingLike = existingLikeResult.rows;

        // =========================================
        // GET COMMENT INFO
        // =========================================

        const commentRowsResult = await client.query(
            `
            SELECT
                c.id,
                c.user_id,
                c.post_id
            FROM comments c
            WHERE c.id = $1
            AND c.is_deleted = 0
            `,
            [commentId]
        );
        const commentRows = commentRowsResult.rows;

        if (!commentRows.length) {

            await client.query("ROLLBACK");

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

            await client.query(
                `
                DELETE FROM comment_likes
                WHERE comment_id = $1
                AND user_id = $2
                `,
                [commentId, userId]
            );

            // -------------------------------------
            // DECREASE LIKE COUNT
            // -------------------------------------

            await client.query(
                `
                UPDATE comments
                SET likes_count = GREATEST(likes_count - 1, 0)
                WHERE id = $1
                `,
                [commentId]
            );

            // -------------------------------------
            // GET UPDATED TOTAL LIKES
            // -------------------------------------

            const likeDataResult = await client.query(
                `
                SELECT COUNT(*) AS totalLikes
                FROM comment_likes
                WHERE comment_id = $1
                `,
                [commentId]
            );
            const likeData = likeDataResult.rows[0];

            const totalLikes = likeData.totallikes;

            // -------------------------------------
            // IF NO LIKES LEFT
            // DELETE NOTIFICATION
            // -------------------------------------

            if (Number(totalLikes) === 0) {

                await client.query(
                    `
                    DELETE FROM notifications
                    WHERE aggregate_key = $1
                    `,
                    [aggregateKey]
                );
            }

            // -------------------------------------
            // OTHERWISE UPDATE NOTIFICATION
            // -------------------------------------

            else {

                // get newest liker
                const latestLikerResult = await client.query(
                    `
                    SELECT
                        cl.user_id,
                        u.username
                    FROM comment_likes cl
                    JOIN users u
                        ON u.id = cl.user_id
                    WHERE cl.comment_id = $1
                    ORDER BY cl.id DESC
                    LIMIT 1
                    `,
                    [commentId]
                );
                const latestLiker = latestLikerResult.rows[0];

                // build notification text
                let notificationContent;

                if (Number(totalLikes) === 1) {

                    notificationContent =
                        `${latestLiker.username} liked your comment`;

                } else {

                    notificationContent =
                        `${latestLiker.username} and ${Number(totalLikes) - 1} others liked your comment`;
                }

                // update notification
                await client.query(
                    `
                    UPDATE notifications
                    SET
                        sender_id = $1,
                        content = $2,
                        is_viewed = 0,
                        created_at = NOW()
                    WHERE aggregate_key = $3
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
            await ranking.zIncrBy(`hof:month:${currentMonth}`, -0.5, userId.toString());
            if (String(commentOwnerId) !== String(userId)) {
              await ranking.zIncrBy(`hof:month:${currentMonth}`, -1, commentOwnerId.toString());
            }
            await client.query("COMMIT");

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

        await client.query(
            `
            INSERT INTO comment_likes
            (comment_id, user_id)
            VALUES ($1, $2)
            `,
            [commentId, userId]
        );

        // -----------------------------------------
        // INCREASE COMMENT LIKE COUNT
        // -----------------------------------------

        await client.query(
            `
            UPDATE comments
            SET likes_count = likes_count + 1
            WHERE id = $1
            `,
            [commentId]
        );

        // =========================================
        // NOTIFICATION LOGIC
        // =========================================

        // don't notify self-like
        // Fixed: commentOwnerId (DB string) vs userId (JWT, likely number) —
        // compare as strings so self-likes are correctly suppressed.
        if (String(commentOwnerId) !== String(userId)) {

            // -------------------------------------
            // GET TOTAL LIKES
            // -------------------------------------

            const likeDataResult = await client.query(
                `
                SELECT COUNT(*) AS totalLikes
                FROM comment_likes
                WHERE comment_id = $1
                `,
                [commentId]
            );
            const likeData = likeDataResult.rows[0];

            const totalLikes = likeData.totallikes;

            // -------------------------------------
            // GET CURRENT USERNAME
            // -------------------------------------

            const currentUserResult = await client.query(
                `
                SELECT username
                FROM users
                WHERE id = $1
                `,
                [userId]
            );
            const currentUser = currentUserResult.rows[0];

            // -------------------------------------
            // BUILD NOTIFICATION CONTENT
            // -------------------------------------

            let notificationContent;

            if (Number(totalLikes)=== 1) {

                notificationContent =
                    `${currentUser.username} liked your comment`;

            } else {

                notificationContent =
                    `${currentUser.username} and ${Number(totalLikes) - 1} other${Number(totalLikes) - 1 > 1 ? 's' : ''} liked your comment`;
            }

            // -------------------------------------
            // FIND EXISTING AGGREGATED NOTIFICATION
            // -------------------------------------

            const existingNotificationResult = await client.query(
                `
                SELECT id
                FROM notifications
                WHERE aggregate_key = $1
                LIMIT 1
                `,
                [aggregateKey]
            );
            const existingNotification = existingNotificationResult.rows;

            // -------------------------------------
            // UPDATE EXISTING NOTIFICATION
            // -------------------------------------

            if (existingNotification.length > 0) {

                await client.query(
                    `
                    UPDATE notifications
                    SET
                        sender_id = $1,
                        content = $2,
                        is_viewed = 0,
                        created_at = NOW()
                    WHERE aggregate_key = $3
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

                await client.query(
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
                    VALUES ($1, $2, $3, $4, $5, $6, $7, 0)
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
        await ranking.zIncrBy(`hof:month:${currentMonth}`, 0.5, userId.toString());
        if (String(commentOwnerId) !== String(userId)) {
            await ranking.zIncrBy(`hof:month:${currentMonth}`, 1, commentOwnerId.toString());
        }
        await client.query("COMMIT");

        return res.json({
            liked: true
        });

    } catch (err) {

        await client.query("ROLLBACK");

        console.error(err);

        return res.status(500).json({
            message: "Server error"
        });

    } finally {

        client.release();
    }
};


module.exports = {
     addComment, 

     updateComment, 

     deleteComment, 

     getCommentsByPostId,

     getAnonIdentity,

     reportComment,

     likeComment
};