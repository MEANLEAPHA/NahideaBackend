const pool = require("../../config/db");

const {createNotification} = require("../notifications/notificationController");

// const getFollowStatus = async (req, res) => {

//   try {

//     const currentUserId =
//       req.user.userId;

//     const targetUserId =
//       req.params.userId;

//     const [rows] =
//       await pool.query(
//         `
//         SELECT status
//         FROM follows
//         WHERE follower_id=?
//         AND following_id=?
//         LIMIT 1
//         `,
//         [
//           currentUserId,
//           targetUserId
//         ]
//       );

//     if (!rows.length) {

//       return res.json({
//         status: "none"
//       });

//     }

//     return res.json({
//       status: rows[0].status
//     });

//   } catch (err) {

//     return res.status(500).json({
//       message: "Server error"
//     });

//   }

// };

const getFollowStatus =
async (req, res) => {

    try {

        const currentUserId =
            req.user.userId;

        const targetUserId =
            req.params.userId;

        /*
        DO I FOLLOW THEM?
        */

        const [following] =
        await pool.query(
            `
            SELECT id
            FROM follows
            WHERE follower_id=?
            AND following_id=?
            LIMIT 1
            `,
            [
                currentUserId,
                targetUserId
            ]
        );

        /*
        DO THEY FOLLOW ME?
        */

        const [followsYou] =
        await pool.query(
            `
            SELECT id
            FROM follows
            WHERE follower_id=?
            AND following_id=?
            LIMIT 1
            `,
            [
                targetUserId,
                currentUserId
            ]
        );

        /*
        RELATIONSHIP STATE
        */

        let state = "follow";

        if (
            following.length &&
            followsYou.length
        ) {

            state = "mutual";

        } else if (
            following.length
        ) {

            state = "following";

        } else if (
            followsYou.length
        ) {

            state = "follows_you";

        }

        return res.json({
            state
        });

    } catch (err) {

        console.log(err);

        return res.status(500).json({
            message: "Server error"
        });

    }

};
// const followUser = async (req, res) => {

//     const followerId = req.user.userId;

//     const followingId = req.params.userId;

//     // prevent self follow
//     if (followerId == followingId) {

//         return res.status(400).json({
//             message: "Cannot follow yourself"
//         });

//     }

//     const connection = await pool.getConnection();

//     try {

//         await connection.beginTransaction();

//         /*
//         |--------------------------------------------------------------------------
//         | LOCK TARGET USER
//         |--------------------------------------------------------------------------
//         |
//         | Prevent race conditions
//         |
//         */

//         const [users] = await connection.query(
//             `
//             SELECT id, is_private
//             FROM users
//             WHERE id=?
//             FOR UPDATE
//             `,
//             [followingId]
//         );

//         if (!users.length) {

//             throw new Error("User not found");

//         }

//         const targetUser = users[0];

//         /*
//         |--------------------------------------------------------------------------
//         | CHECK EXISTING FOLLOW
//         |--------------------------------------------------------------------------
//         */

//         const [existing] = await connection.query(
//             `
//             SELECT *
//             FROM follows
//             WHERE follower_id=?
//             AND following_id=?
//             `,
//             [
//                 followerId,
//                 followingId
//             ]
//         );

//         if (existing.length) {

//             await connection.rollback();

//             return res.status(409).json({
//                 message: "Already followed/requested"
//             });

//         }

//         /*
//         |--------------------------------------------------------------------------
//         | PRIVATE ACCOUNT => pending
//         | PUBLIC ACCOUNT => accepted
//         |--------------------------------------------------------------------------
//         */

//         const status = targetUser.is_private
//             ? "pending"
//             : "accepted";

//         /*
//         |--------------------------------------------------------------------------
//         | INSERT FOLLOW ROW
//         |--------------------------------------------------------------------------
//         */

//         const [result] = await connection.query(
//             `
//             INSERT INTO follows (
//                 follower_id,
//                 following_id,
//                 status,
//                 accepted_at
//             )
//             VALUES (?, ?, ?, ?)
//             `,
//             [
//                 followerId,
//                 followingId,
//                 status,
//                 status === "accepted"
//                     ? new Date()
//                     : null
//             ]
//         );

//         /*
//         |--------------------------------------------------------------------------
//         | UPDATE COUNTS ONLY IF ACCEPTED
//         |--------------------------------------------------------------------------
//         */

//         if (status === "accepted") {

//             await connection.query(
//                 `
//                 UPDATE users
//                 SET following_count = following_count + 1
//                 WHERE id=?
//                 `,
//                 [followerId]
//             );

//             await connection.query(
//                 `
//                 UPDATE users
//                 SET followers_count = followers_count + 1
//                 WHERE id=?
//                 `,
//                 [followingId]
//             );

//         }

//         /*
//         |--------------------------------------------------------------------------
//         | CREATE NOTIFICATION
//         |--------------------------------------------------------------------------
//         */

//         await createNotification({

//             receiverId: followingId,

//             senderId: followerId,

//             type: "follow",

//             content:
//                 status === "pending"
//                     ? "requested to follow you"
//                     : "started following you"

//         });

//         await connection.commit();

//         return res.status(201).json({

//             success: true,

//             status,

//             message:
//                 status === "pending"
//                     ? "Follow request sent"
//                     : "Followed successfully"

//         });

//     } catch (err) {

//         await connection.rollback();

//         console.log(err);

//         return res.status(500).json({
//             message: "Server error"
//         });

//     } finally {

//         connection.release();

//     }

// };

const followUser = async (req, res) => {

    const followerId = req.user.userId;
    const followingId = req.params.userId;

    if (followerId == followingId) {

        return res.status(400).json({
            message: "Cannot follow yourself"
        });

    }

    const connection = await pool.getConnection();

    try {

        await connection.beginTransaction();

        /*
        CHECK EXISTING
        */

        const [existing] =
        await connection.query(
            `
            SELECT id
            FROM follows
            WHERE follower_id=?
            AND following_id=?
            `,
            [followerId, followingId]
        );

        if (existing.length) {

            await connection.rollback();

            return res.status(409).json({
                message: "Already following"
            });

        }

        /*
        CREATE FOLLOW
        */

        await connection.query(
            `
            INSERT INTO follows (
                follower_id,
                following_id
            )
            VALUES (?, ?)
            `,
            [followerId, followingId]
        );

        /*
        UPDATE COUNTS
        */

        await connection.query(
            `
            UPDATE users
            SET following_count =
                following_count + 1
            WHERE id=?
            `,
            [followerId]
        );

        await connection.query(
            `
            UPDATE users
            SET followers_count =
                followers_count + 1
            WHERE id=?
            `,
            [followingId]
        );

        /*
        CHECK IF FOLLOW BACK
        */

        const [mutual] =
        await connection.query(
            `
            SELECT id
            FROM follows
            WHERE follower_id=?
            AND following_id=?
            `,
            [followingId, followerId]
        );

        /*
        NOTIFICATION
        */

        await createNotification({

            receiverId: followingId,

            senderId: followerId,
            type: mutual.length
                ? "follow_back"
                : "follow",

            content: mutual.length
                ? "followed you back"
                : "started following you"

        });

        await connection.commit();

        return res.json({

            success: true,

            mutual: !!mutual.length

        });

    } catch (err) {

        await connection.rollback();

        console.log(err);

        return res.status(500).json({
            message: "Server error"
        });

    } finally {

        connection.release();

    }

};


// const unfollowUser = async (req, res) => {

//     const followerId = req.user.userId;

//     const followingId = req.params.userId;
//   console.log('Unfollow request:', { followerId, followingId }); // Add this
//     const connection = await pool.getConnection();

//     try {

//         await connection.beginTransaction();

//         /*
//         |--------------------------------------------------------------------------
//         | DELETE FOLLOW
//         |--------------------------------------------------------------------------
//         */

//         const [result] = await connection.query(
//             `
//             DELETE FROM follows
//             WHERE follower_id=?
//             AND following_id=?
//             `,
//             [
//                 followerId,
//                 followingId
//             ]
//         );

//         if (!result.affectedRows) {

//             throw new Error("Not following");

//         }

//         /*
//         |--------------------------------------------------------------------------
//         | DECREASE COUNTS
//         |--------------------------------------------------------------------------
//         */

//         await connection.query(
//             `
//             UPDATE users
//             SET following_count =
//                 following_count - 1
//             WHERE id=?
//             `,
//             [followerId]
//         );

//         await connection.query(
//             `
//             UPDATE users
//             SET followers_count =
//                 followers_count - 1
//             WHERE id=?
//             `,
//             [followingId]
//         );

//         await connection.commit();

//         return res.json({
//             message: "Unfollowed",
//              mutual: false
//         });

//     } catch (err) {

//         await connection.rollback();

//          console.error('Full error details:', err); // Add this
//         return res.status(500).json({
//             message: err.message,
//             details: err.sqlMessage || err.toString() // More details
//         });

//     } finally {

//         connection.release();

//     }

// };
const unfollowUser = async (req, res) => {
    const followerId = req.user.userId;
    const followingId = req.params.userId;
    const connection = await pool.getConnection();

    try {
        await connection.beginTransaction();

        const [result] = await connection.query(
            `DELETE FROM follows WHERE follower_id=? AND following_id=?`,
            [followerId, followingId]
        );

        // Only update counts if a follow was actually deleted
        if (result.affectedRows) {
            await connection.query(
                `UPDATE users SET following_count = following_count - 1 WHERE id=?`,
                [followerId]
            );
            await connection.query(
                `UPDATE users SET followers_count = followers_count - 1 WHERE id=?`,
                [followingId]
            );
        }

        await connection.commit();

        // Always return success (just with different status)
        return res.json({
            message: result.affectedRows ? "Unfollowed" : "Already not following",
            mutual: false
        });

    } catch (err) {
        await connection.rollback();
        return res.status(500).json({
            message: err.message
        });
    } finally {
        connection.release();
    }
};
module.exports = { followUser, unfollowUser, getFollowStatus};


// const acceptFollowRequest = async (req, res) => {

//     const currentUserId = req.user.userId;

//     const requestId = req.params.requestId;

//     const connection = await pool.getConnection();

//     try {

//         await connection.beginTransaction();

//         /*
//         |--------------------------------------------------------------------------
//         | LOCK FOLLOW ROW
//         |--------------------------------------------------------------------------
//         */

//         const [rows] = await connection.query(
//             `
//             SELECT *
//             FROM follows
//             WHERE id=?
//             FOR UPDATE
//             `,
//             [requestId]
//         );

//         if (!rows.length) {

//             throw new Error("Request not found");

//         }

//         const request = rows[0];

//         /*
//         |--------------------------------------------------------------------------
//         | SECURITY CHECK
//         |--------------------------------------------------------------------------
//         */

//         if (
//             request.following_id !== currentUserId
//         ) {

//             throw new Error("Unauthorized");

//         }

//         /*
//         |--------------------------------------------------------------------------
//         | UPDATE STATUS
//         |--------------------------------------------------------------------------
//         */

//         await connection.query(
//             `
//             UPDATE follows
//             SET status='accepted',
//                 accepted_at=NOW()
//             WHERE id=?
//             `,
//             [requestId]
//         );

//         /*
//         |--------------------------------------------------------------------------
//         | UPDATE COUNTS
//         |--------------------------------------------------------------------------
//         */

//         await connection.query(
//             `
//             UPDATE users
//             SET followers_count =
//                 followers_count + 1
//             WHERE id=?
//             `,
//             [currentUserId]
//         );

//         await connection.query(
//             `
//             UPDATE users
//             SET following_count =
//                 following_count + 1
//             WHERE id=?
//             `,
//             [request.follower_id]
//         );

//         await createNotification({

//             receiverId: request.follower_id,

//             senderId: currentUserId,

//             type: "follow",

//             content:
//                 "accepted your follow request"

//         });

//         await connection.commit();

//         return res.json({
//             message: "Follow request accepted"
//         });

//     } catch (err) {

//         await connection.rollback();

//         console.log(err);

//         return res.status(500).json({
//             message: err.message
//         });

//     } finally {

//         connection.release();

//     }

// };
