const ftp = require("basic-ftp");
require("dotenv").config();
async function uploadToHostinger(localFile, remoteFile) {
    const client = new ftp.Client();
    try {
        await client.access({
            host: process.env.FTP_HOST,
            user: process.env.FTP_USER,
            password: process.env.FTP_PASSWORD,
            secure: process.env.FTP_SECURE
        });
        await client.uploadFrom(localFile, remoteFile);
    } catch (err) {
        console.error("FTP error:", err);
        throw new Error("FTP upload failed: " + err.message);
    } finally {
        client.close();
    }
}

module.exports={
    uploadToHostinger
}