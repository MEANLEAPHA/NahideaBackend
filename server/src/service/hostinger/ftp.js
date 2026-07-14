// const sharp = require("sharp");
// const path = require("path");
// const fs = require("fs");
// const ftp = require("basic-ftp");
// require("dotenv").config();

// const FTP_URL = process.env.FTP_URL;

// /**
//  * Create a safe filename from user-uploaded file
//  */
// function getSafeFileName(file) {
//   const parsed = path.parse(file.originalname);

//   let name = parsed.name.trim();
//   name = name.replace(/\s+/g, "-"); // replace spaces
//   name = name.replace(/[^a-zA-Z0-9-_]/g, "_"); // sanitize unsafe chars

//   return `${name}${parsed.ext.toLowerCase()}`;
// }

// /**
//  * Upload file to Hostinger via FTP
//  */
// async function uploadToHostinger(localFile, remoteFile) {
//   const client = new ftp.Client(30000); // 30s timeout
//   client.ftp.verbose = false;

//   try {
//     await client.access({
//       host: process.env.FTP_HOST,
//       user: process.env.FTP_USER,
//       password: process.env.FTP_PASSWORD,
//       secure: process.env.FTP_SECURE === "true",
//     });

//     await client.uploadFrom(localFile, remoteFile);
//   } catch (err) {
//     console.error("FTP error:", err);
//     throw new Error("FTP upload failed: " + err.message);
//   } finally {
//     client.close();
//   }
// }

// /**
//  * Convert image to WebP and upload, or upload original if not image
//  */
// async function convertAndUpload(file, folder) {
//   // Ensure temp dir exists
//   if (!fs.existsSync("temp")) {
//     fs.mkdirSync("temp");
//   }

//   const safeName = getSafeFileName(file);

//   if (file.mimetype.startsWith("image")) {
//     const webpName = `${Date.now()}-${safeName.replace(/\.[^.]+$/, "")}.webp`;
//     const tempPath = path.join("temp", webpName);

//     try {
//       // Convert to WebP
//       await sharp(file.path)
//         .webp({ quality: 80 })
//         .toFile(tempPath);

//       // Upload WebP
//       await uploadToHostinger(tempPath, `${folder}/${webpName}`);

//       // Cleanup
//       await fs.promises.unlink(tempPath);

//       return { url: `${FTP_URL}/img/${folder}/${webpName}`, type: "image" };
//     } catch (err) {
//       console.error("Conversion/Upload error:", err);
//       throw new Error("Image conversion/upload failed: " + err.message);
//     }
//   } else {
//     const remoteName = `${Date.now()}-${safeName}`;
//     try {
//       await uploadToHostinger(file.path, `${folder}/${remoteName}`);
//       return {
//         url: `${FTP_URL}/img/${folder}/${remoteName}`,
//         type: file.mimetype.startsWith("video") ? "video" : "other",
//       };
//     } catch (err) {
//       console.error("Upload error:", err);
//       throw new Error("File upload failed: " + err.message);
//     }
//   }
// }

// module.exports = { uploadToHostinger, convertAndUpload, getSafeFileName };
const sharp = require("sharp");
const path = require("path");
const fs = require("fs");
const ftp = require("basic-ftp");
require("dotenv").config();

const FTP_URL = process.env.FTP_URL;

function getSafeFileName(file) {
  const parsed = path.parse(file.originalname);
  let name = parsed.name.trim();
  name = name.replace(/\s+/g, "-");
  name = name.replace(/[^a-zA-Z0-9-_]/g, "_");
  return `${name}${parsed.ext.toLowerCase()}`;
}

async function uploadToHostinger(localFile, remoteFile) {
  const client = new ftp.Client(30000);
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

async function cleanupTempFile(filePath) {
  try {
    await fs.promises.unlink(filePath);
  } catch (err) {
    if (err.code !== "ENOENT") console.error("Temp cleanup failed:", err);
  }
}

async function convertAndUpload(file, folder) {
  if (!fs.existsSync("temp")) {
    fs.mkdirSync("temp");
  }

  const safeName = getSafeFileName(file);

  try {
    // Images only for now — video/other file types aren't a supported feature yet,
    // so we reject them outright rather than silently accepting whatever is sent.
    if (!file.mimetype.startsWith("image")) {
      throw new Error("Only image uploads are currently supported.");
    }

    const webpName = `${Date.now()}-${safeName.replace(/\.[^.]+$/, "")}.webp`;
    const tempPath = path.join("temp", webpName);

    try {
      // sharp will throw if the actual bytes aren't valid image data —
      // this is what protects us from a renamed/fake file, not the mimetype string.
      await sharp(file.path).webp({ quality: 80 }).toFile(tempPath);
      await uploadToHostinger(tempPath, `${folder}/${webpName}`);
      await cleanupTempFile(tempPath);
      return { url: `${FTP_URL}/img/${folder}/${webpName}`, type: "image" };
    } catch (err) {
      console.error("Conversion/Upload error:", err);
      throw new Error("Image conversion/upload failed: " + err.message);
    }
  } finally {
    // Always clean up the original temp file — success or failure —
    // so disk usage doesn't quietly grow over time.
    await cleanupTempFile(file.path);
  }
}

module.exports = { uploadToHostinger, convertAndUpload, getSafeFileName };