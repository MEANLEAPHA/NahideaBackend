// const ftp = require("basic-ftp");
// require("dotenv").config();
// async function uploadToHostinger(localFile, remoteFile) {
//     const client = new ftp.Client();
//     try {
//         await client.access({
//             host: process.env.FTP_HOST,
//             user: process.env.FTP_USER,
//             password: process.env.FTP_PASSWORD,
//             secure: process.env.FTP_SECURE
//         });
//         await client.uploadFrom(localFile, remoteFile);
//     } catch (err) {
//         console.error("FTP error:", err);
//         throw new Error("FTP upload failed: " + err.message);
//     } finally {
//         client.close();
//     }
// }

// module.exports={
//     uploadToHostinger
// }

const sharp = require("sharp");
const path = require("path");
const fs = require("fs");
const ftp = require("basic-ftp");
require("dotenv").config();

async function uploadToHostinger(localFile, remoteFile) {
    const client = new ftp.Client(30000);
    client.ftp.verbose = true;
    try {
        await client.access({
            host: process.env.FTP_HOST,
            user: process.env.FTP_USER,
            password: process.env.FTP_PASSWORD,
            secure: process.env.FTP_SECURE === "true"
        });
    

        await client.uploadFrom(localFile, remoteFile);
    } catch (err) {
        console.error("FTP error:", err);
        throw new Error("FTP upload failed: " + err.message);
    } finally {
        client.close();
    }
}

// Convert to WebP before upload
// helper
async function convertAndUpload(file, folder) {
    const baseName = Date.now() + "-" + path.parse(file.originalname).name;
    const webpName = baseName + ".webp";
    const tempPath = path.join("temp", webpName);

    if (file.mimetype.startsWith("image")) {
        // Convert to WebP
        await sharp(file.path)
            .webp({ quality: 80 })
            .toFile(tempPath);

        // Upload WebP
        await uploadToHostinger(tempPath, `${folder}/${webpName}`);

        fs.unlinkSync(tempPath);

        return { url: `${ftpuRL}/img/${folder}/${webpName}`, type: "image" };
    } else {
        // Non-image: upload original
        await uploadToHostinger(file.path, `${folder}/${file.originalname}`);
        return {
            url: `${ftpuRL}/img/${folder}/${file.originalname}`,
            type: file.mimetype.startsWith("video") ? "video" : "other"
        };
    }
}

module.exports = { uploadToHostinger, convertAndUpload };
