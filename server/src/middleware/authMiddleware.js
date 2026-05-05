// const jwt = require("jsonwebtoken");
// require("dotenv").config();
// const protect = (req, res, next) => {
//     const token = req.headers.authorization?.split(" ")[1];

//     if(!token) return res.status(401).json({message: "Token required"});

//     try{
//         if (req.method === "OPTIONS") {
//             return next();
// }
//         const decoded = jwt.verify(token, process.env.JWT_SECRET);
//         req.user = decoded;
//         next();
//     }
//     catch(error){
//         res.status(401).json({message : "Invalid or Expired Token"});
//     }

// }

// module.exports = {protect};
const jwt = require("jsonwebtoken");
require("dotenv").config();

const protect = (req, res, next) => {
    // ✅ Handle preflight FIRST
    if (req.method === "OPTIONS") {
        return next();
    }

    const token = req.headers.authorization?.split(" ")[1];

    if (!token) {
        return res.status(401).json({ message: "Token required" });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded;
        next();
    } catch (error) {
        res.status(401).json({ message: "Invalid or Expired Token" });
    }
};

module.exports = { protect };