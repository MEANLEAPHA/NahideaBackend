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
  console.log("[FTP] Connecting to:", process.env.FTP_HOST, "as", process.env.FTP_USER, "secure:", process.env.FTP_SECURE);

  const client = new ftp.Client(30000);
  client.ftp.verbose = true; // turn ON while debugging — flip back to false once confirmed working

  try {
    await client.access({
      host: process.env.FTP_HOST,
      user: process.env.FTP_USER,
      password: process.env.FTP_PASSWORD,
      secure: process.env.FTP_SECURE === "true",
    });
    console.log("[FTP] Connected successfully");

    console.log("[FTP] Uploading:", localFile, "->", remoteFile);
    await client.uploadFrom(localFile, remoteFile);
    console.log("[FTP] Upload complete:", remoteFile);
  } catch (err) {
    console.error("[FTP] FAILED:", {
      message: err.message,
      code: err.code,       // basic-ftp errors often have a numeric FTP response code here
      name: err.name,
      stack: err.stack,
    });
    throw new Error("FTP upload failed: " + err.message);
  } finally {
    client.close();
    console.log("[FTP] Connection closed");
  }
}

async function cleanupTempFile(filePath) {
  try {
    await fs.promises.unlink(filePath);
    console.log("[cleanup] Removed temp file:", filePath);
  } catch (err) {
    if (err.code !== "ENOENT") console.error("[cleanup] Temp cleanup failed:", filePath, err.message);
  }
}

async function convertAndUpload(file, folder) {
  console.log("[convertAndUpload] START", {
    originalname: file?.originalname,
    mimetype: file?.mimetype,
    size: file?.size,
    tempPath: file?.path,
    folder,
  });

  if (!file || !file.path) {
    console.error("[convertAndUpload] No file or file.path provided — multer may not have processed this field");
    throw new Error("No file received for upload");
  }

  if (!fs.existsSync("temp")) {
    fs.mkdirSync("temp");
    console.log("[convertAndUpload] Created temp/ directory");
  }

  const safeName = getSafeFileName(file);
  console.log("[convertAndUpload] Safe filename:", safeName);

  try {
    if (!file.mimetype.startsWith("image")) {
      console.error("[convertAndUpload] Rejected non-image mimetype:", file.mimetype);
      throw new Error("Only image uploads are currently supported.");
    }

    const webpName = `${Date.now()}-${safeName.replace(/\.[^.]+$/, "")}.webp`;
    const tempPath = path.join("temp", webpName);
    console.log("[convertAndUpload] Target webp path:", tempPath);

    try {
      console.log("[convertAndUpload] Starting sharp conversion...");
      await sharp(file.path).webp({ quality: 80 }).toFile(tempPath);
      console.log("[convertAndUpload] Sharp conversion done, file exists:", fs.existsSync(tempPath));

      await uploadToHostinger(tempPath, `${folder}/${webpName}`);
      await cleanupTempFile(tempPath);

      const finalUrl = `${FTP_URL}/img/${folder}/${webpName}`;
      console.log("[convertAndUpload] SUCCESS, final URL:", finalUrl);

      return { url: finalUrl, type: "image" };
    } catch (err) {
      console.error("[convertAndUpload] Conversion/Upload error:", {
        message: err.message,
        stack: err.stack,
      });
      throw new Error("Image conversion/upload failed: " + err.message);
    }
  } finally {
    await cleanupTempFile(file.path);
  }
}

module.exports = { uploadToHostinger, convertAndUpload, getSafeFileName };