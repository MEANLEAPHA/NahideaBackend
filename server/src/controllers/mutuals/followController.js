const db = require("../../config/db");

const { createNotification } = require("../notifications/notificationController");

const getFollowStatus = async (req, res) => {

    try {

        const currentUserId =
            req.user.userId;

        const targetUserId =
            req.params.userId;

        /*
        DO I FOLLOW THEM?
        */

        const following =
        await db.query(
            `
            SELECT id
            FROM follows
            WHERE follower_id=$1
            AND following_id=$2
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

        const followsYou =
        await db.query(
            `
            SELECT id
            FROM follows
            WHERE follower_id=$1
            AND following_id=$2
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
            following.rowCount &&
            followsYou.rowCount
        ) {

            state = "mutual";

        } else if (
            following.rowCount
        ) {

            state = "following";

        } else if (
            followsYou.rowCount
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

const followUser = async (req, res) => {

    const followerId = req.user.userId;
    const followingId = req.params.userId;

    if (followerId == followingId) {

        return res.status(400).json({
            message: "Cannot follow yourself"
        });

    }

    const client = await db.connect();

    try {

        await client.query("BEGIN");

        /*
        CHECK EXISTING
        */

        const existing =
        await client.query(
            `
            SELECT id
            FROM follows
            WHERE follower_id=$1
            AND following_id=$2
            `,
            [followerId, followingId]
        );

        if (existing.rowCount) {

            await client.query("ROLLBACK");

            return res.status(409).json({
                message: "Already following"
            });

        }

        /*
        CREATE FOLLOW
        */

        await client.query(
            `
            INSERT INTO follows (
                follower_id,
                following_id
            )
            VALUES ($1, $2)
            `,
            [followerId, followingId]
        );

        /*
        UPDATE COUNTS
        */

        await client.query(
            `
            UPDATE users
            SET following_count =
                following_count + 1
            WHERE id=$1
            `,
            [followerId]
        );

        await client.query(
            `
            UPDATE users
            SET followers_count =
                followers_count + 1
            WHERE id=$1
            `,
            [followingId]
        );

        /*
        CHECK IF FOLLOW BACK
        */

        const mutual =
        await client.query(
            `
            SELECT id
            FROM follows
            WHERE follower_id=$1
            AND following_id=$2
            `,
            [followingId, followerId]
        );

        /*
        NOTIFICATION
        */

        const rows = await client.query(
            `SELECT username FROM users WHERE id=$1`,
            [followerId]
        );

        const followerUsername = rows.rows[0].username;

        await createNotification({

            receiverId: followingId,

            senderId: followerId,
            type: mutual.rowCount
                ? "follow_back"
                : "follow",

            content: mutual.rowCount
                ? `${followerUsername} followed you back`
                : `started following you`

        });

        await client.query("COMMIT");

        return res.json({

            success: true,

            mutual: !!mutual.rowCount

        });

    } catch (err) {

        await client.query("ROLLBACK");

        console.log(err);

        return res.status(500).json({
            message: "Server error"
        });

    } finally {

        client.release();

    }

};

const unfollowUser = async (req, res) => {
    const followerId = req.user.userId;
    const followingId = req.params.userId;
    const client = await db.connect();

    try {
        await client.query("BEGIN");

        const result = await client.query(
            `DELETE FROM follows WHERE follower_id=$1 AND following_id=$2`,
            [followerId, followingId]
        );

        // Only update counts if a follow was actually deleted
        if (result.rowCount) {
            await client.query(
                `UPDATE users SET following_count = following_count - 1 WHERE id=$1`,
                [followerId]
            );
            await client.query(
                `UPDATE users SET followers_count = followers_count - 1 WHERE id=$1`,
                [followingId]
            );
        }

        await client.query("COMMIT");

        // Always return success (just with different status)
        return res.json({
            message: result.rowCount ? "Unfollowed" : "Already not following",
            mutual: false
        });

    } catch (err) {
        await client.query("ROLLBACK");
        return res.status(500).json({
            message: err.message
        });
    } finally {
        client.release();
    }
};
module.exports = { followUser, unfollowUser, getFollowStatus };