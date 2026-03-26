const pool = require("../../config/db");
const { Errors } = require("../../util/error/error");
const { uploadToHostinger } = require("../../service/hostinger/ftp")
const multer = require("multer");

// Multer setup for multiple files
const upload = multer({ dest: "temp/" });

const content = async (req, res) => {
    try {
        const { userId, type, title, isAnonymous } = req.body;

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

        const [create] = await pool.query(
            `INSERT INTO content(user_id, type, title, media_type, media_url, is_anonymous)
             VALUES(?, ?, ?, ?, ?, ?)`,
            [userId, type, title, JSON.stringify(mediaType), JSON.stringify(mediaUrl), isAnonymous]
        );

        const contentId = create.insertId;
        res.status(200).json({ success: true, contentId, mediaUrl });
    } catch (error) {
        console.error("Error creating content:", error);
        await Errors(error.message, error.code, "contentController", error.stack);
        return res.status(500).json({
            success: false,
            error: error.message,
            stack: error.stack,
            code: error.code || "UNKNOWN"
        });
    }
};


module.exports = { content, upload };
