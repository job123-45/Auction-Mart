const { supabase } = require("../db");

const authMiddleware = async (req, res, next) => {
    const authHeader = req.headers.authorization || "";
    if (!authHeader.startsWith("Bearer ")) {
        return res.status(401).json({ message: "Authentication required." });
    }

    const token = authHeader.slice("Bearer ".length).trim();
    if (!token) return res.status(401).json({ message: "Authentication required." });

    try {
        const { data, error } = await supabase.auth.getUser(token);
        if (error || !data.user) {
            return res.status(401).json({ message: "Invalid or expired session." });
        }
        req.user = data.user;
        return next();
    } catch {
        return res.status(401).json({ message: "Unable to verify session." });
    }
};

const requireAdmin = (req, res, next) => {
    const metadata = req.user?.app_metadata || {};
    const roles = Array.isArray(metadata.roles) ? metadata.roles : [];
    if (metadata.role === "admin" || roles.includes("admin")) return next();
    return res.status(403).json({ message: "Administrator access required." });
};

module.exports = authMiddleware;
module.exports.requireAdmin = requireAdmin;
