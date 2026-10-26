const authMiddleware = require("./authMiddleware");

const feedbackMiddleware = (req, res, next) => {
    if (!req.headers.authorization) return next();
    return authMiddleware(req, res, next);
};

module.exports = feedbackMiddleware;
