// middleware/protect.js
const jwt = require("jsonwebtoken");
const util = require('util');
const User = require('../models/UserModel'); // تأكد من المسار الصحيح
const asyncVerify = util.promisify(jwt.verify);
// const customError = require('../customError'); // افترض أنك تستخدم هذا الملف لإدارة الأخطاء

const JWT_SECRET = process.env.JWT_SECRET; // يجب أن يكون نفس السر المستخدم في توليد الـ token

const protect = async (req, res, next) => {
    const bearer = req.headers.authorization;
    let token;

    // 1. التحقق من وجود الـ token
    if (bearer && bearer.startsWith("Bearer ")) {
        token = bearer.split(" ")[1]; 
    }

    if (!token) {
        // يمكنك استخدام customError أو الرد مباشرة
        return res.status(401).json({ message: "You are not logged in! Please log in to get access." });
        // return next(customError({ statusCode: 401, message: "You are not logged in! Please log in to get access." }));
    }

    try {
        // 2. التحقق من صلاحية الـ token
        const decoded = await asyncVerify(token, JWT_SECRET);
        
        // 3. التحقق من وجود المستخدم (اختياري ولكنه موصى به)
        const currentUser = await User.findById(decoded.id);

        if (!currentUser) {
            return res.status(401).json({ message: "The user belonging to this token no longer exists." });
            // return next(customError({ statusCode: 401, message: "The user belonging to this token no longer exists." }));
        }

        // 4. وضع بيانات المستخدم في req.user للمرور إلى الـ middleware التالي
        // ملاحظة: الـ token الخاص بك يحتوي على id و email و role
        req.user = decoded; 
        next();
    } catch (error) {
        // الـ token غير صالح أو منتهي الصلاحية
        console.error("JWT Verification Error:", error);
        return res.status(401).json({ message: "Invalid or expired token." });
        // return next(customError({ statusCode: 401, message: "Invalid or expired token." }));
    }
};

module.exports = protect;