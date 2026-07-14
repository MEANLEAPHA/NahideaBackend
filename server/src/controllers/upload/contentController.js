const pool = require("../../config/db");
const { uploadToHostinger } = require("../../service/hostinger/ftp")
const multer = require("multer");

const upload = multer({ dest: "temp/" });

module.exports = { upload };