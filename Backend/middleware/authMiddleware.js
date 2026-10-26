const createAuthMiddleware = (getUser) => async (req, res, next) => {
    const authHeader = req.headers.authorization || "";
    const match = /^Bearer\s+(\S+)$/i.exec(authHeader);
    if (!match) {
        return res.status(401).json({ message: "Authentication required." });
    }

    try {
        const { data, error } = await getUser(match[1]);
        if (error || !data.user) {
            return res.status(401).json({ message: "Invalid or expired session." });
        }
        req.user = data.user;
        return next();
    } catch {
        return res.status(401).json({ message: "Unable to verify session." });
    }
};

const authMiddleware = createAuthMiddleware((token) =>
    require("../db").supabase.auth.getUser(token)
);

const requireAdmin = (req, res, next) => {
    const metadata = req.user?.app_metadata || {};
    const roles = Array.isArray(metadata.roles) ? metadata.roles : [];
    if (metadata.role === "admin" || roles.includes("admin")) return next();
    return res.status(403).json({ message: "Administrator access required." });
};

module.exports = authMiddleware;
module.exports.requireAdmin = requireAdmin;
module.exports.createAuthMiddleware = createAuthMiddleware;
