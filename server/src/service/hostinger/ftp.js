
// const sharp = require("sharp");
// const path = require("path");
// const fs = require("fs");
// const ftp = require("basic-ftp");
// require("dotenv").config();
// const ftpuRL = process.env.FTP_URL;
// async function uploadToHostinger(localFile, remoteFile) {
//     const client = new ftp.Client(30000);
//     client.ftp.verbose = false;
//     try {
//         await client.access({
//             host: process.env.FTP_HOST,
//             user: process.env.FTP_USER,
//             password: process.env.FTP_PASSWORD,
//             secure: process.env.FTP_SECURE === "true"
//         });
    

//         await client.uploadFrom(localFile, remoteFile);
//     } catch (err) {
//         console.error("FTP error:", err);
//         throw new Error("FTP upload failed: " + err.message);
//     } finally {
//         client.close();
//     }
// }

// // Convert to WebP before upload
// // helper
// async function convertAndUpload(file, folder) {
//     const baseName = Date.now() + "-" + path.parse(file.originalname).name;
//     const webpName = baseName + ".webp";
//     const tempPath = path.join("temp", webpName);

//     if (file.mimetype.startsWith("image")) {
//         // Convert to WebP
//         await sharp(file.path)
//             .webp({ quality: 80 })
//             .toFile(tempPath);

//         // Upload WebP
//         await uploadToHostinger(tempPath, `${folder}/${webpName}`);

//         fs.unlinkSync(tempPath);

//         return { url: `${ftpuRL}/img/${folder}/${webpName}`, type: "image" };
//     } else {
//         // Non-image: upload original
//         await uploadToHostinger(file.path, `${folder}/${file.originalname}`);
//         return {
//             url: `${ftpuRL}/img/${folder}/${file.originalname}`,
//             type: file.mimetype.startsWith("video") ? "video" : "other"
//         };
//     }
// }

// module.exports = { uploadToHostinger, convertAndUpload };

// mvp-upload.js
const sharp = require("sharp");
const path = require("path");
const fs = require("fs");
const ftp = require("basic-ftp");
require("dotenv").config();

const FTP_URL = process.env.FTP_URL;

/**
 * Create a safe filename from user-uploaded file
 */
function getSafeFileName(file) {
  const parsed = path.parse(file.originalname);

  let name = parsed.name.trim();
  name = name.replace(/\s+/g, "-"); // replace spaces
  name = name.replace(/[^a-zA-Z0-9-_]/g, "_"); // sanitize unsafe chars

  return `${name}${parsed.ext.toLowerCase()}`;
}

/**
 * Upload file to Hostinger via FTP
 */
async function uploadToHostinger(localFile, remoteFile) {
  const client = new ftp.Client(30000); // 30s timeout
  client.ftp.verbose = false;

  try {
    await client.access({
      host: process.env.FTP_HOST,
      user: process.env.FTP_USER,
      password: process.env.FTP_PASSWORD,
      secure: process.env.FTP_SECURE === "true",
    });

    await client.uploadFrom(localFile, remoteFile);
  } catch (err) {
    console.error("FTP error:", err);
    throw new Error("FTP upload failed: " + err.message);
  } finally {
    client.close();
  }
}

/**
 * Convert image to WebP and upload, or upload original if not image
 */
async function convertAndUpload(file, folder) {
  // Ensure temp dir exists
  if (!fs.existsSync("temp")) {
    fs.mkdirSync("temp");
  }

  const safeName = getSafeFileName(file);

  if (file.mimetype.startsWith("image")) {
    const webpName = `${Date.now()}-${safeName.replace(/\.[^.]+$/, "")}.webp`;
    const tempPath = path.join("temp", webpName);

    try {
      // Convert to WebP
      await sharp(file.path)
        .webp({ quality: 80 })
        .toFile(tempPath);

      // Upload WebP
      await uploadToHostinger(tempPath, `${folder}/${webpName}`);

      // Cleanup
      await fs.promises.unlink(tempPath);

      return { url: `${FTP_URL}/img/${folder}/${webpName}`, type: "image" };
    } catch (err) {
      console.error("Conversion/Upload error:", err);
      throw new Error("Image conversion/upload failed: " + err.message);
    }
  } else {
    const remoteName = `${Date.now()}-${safeName}`;
    try {
      await uploadToHostinger(file.path, `${folder}/${remoteName}`);
      return {
        url: `${FTP_URL}/img/${folder}/${remoteName}`,
        type: file.mimetype.startsWith("video") ? "video" : "other",
      };
    } catch (err) {
      console.error("Upload error:", err);
      throw new Error("File upload failed: " + err.message);
    }
  }
}

module.exports = { uploadToHostinger, convertAndUpload, getSafeFileName };
