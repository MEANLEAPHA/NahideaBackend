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
const ftp = require("basic-ftp");
require("dotenv").config();

async function uploadToHostinger(localFile, remoteFile) {
    const client = new ftp.Client(30000); // 30s timeout
    client.ftp.verbose = true; // log FTP commands for debugging

    try {
        await client.access({
            host: process.env.FTP_HOST,
            user: process.env.FTP_USER,
            password: process.env.FTP_PASSWORD,
            secure: process.env.FTP_SECURE === "true" // cast to boolean
        });

        // Force passive mode (important for shared hosting)
        client.prepareTransfer = client.prepareTransferPassive;

        // Ensure remote directories exist before upload
        const remoteDir = remoteFile.substring(0, remoteFile.lastIndexOf("/"));
        if (remoteDir) {
            await client.ensureDir(remoteDir);
        }

        await client.uploadFrom(localFile, remoteFile);
        console.log(`Uploaded ${localFile} to ${remoteFile}`);
    } catch (err) {
        console.error("FTP error:", err);
        throw new Error("FTP upload failed: " + err.message);
    } finally {
        client.close();
    }
}

module.exports = { uploadToHostinger };
