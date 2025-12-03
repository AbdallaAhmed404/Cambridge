const jwt = require("jsonwebtoken");
const util = require("util");
const asyncverify = util.promisify(jwt.verify);
const customError = require("../customError");

const isAdmin = async (req, res, next) => {
    const bearer = req.headers.authorization;

    if (!bearer || !bearer.startsWith("Bearer ")) {
        return next(customError({
            statusCode: 401,
            message: "Authorization token is missing or invalid"
        }));
    }

    const token = bearer.split(" ")[1];

    try {
        const decoded = await asyncverify(token, process.env.JWT_SECRET);
        
        if (decoded.role !== 'admin') {
            return next(customError({
                statusCode: 403,
                message: "Access denied. Admins only"
            }));
        }

        req.user = decoded;
        next();
    } catch (error) {
        return next(customError({
            statusCode: 401,
            message: "Invalid or expired token"
        }));
    }
};

module.exports = isAdmin;
