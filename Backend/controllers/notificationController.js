const { query, run } = require("../db");

const getNotifications = async (req, res) => {
    try {
        const rows = await query(
            "SELECT id, message, is_read, created_at FROM notifications WHERE user_email = $1 ORDER BY created_at DESC",
            [req.user.email]
        );
        res.status(200).json(rows);
    } catch (err) {
        res.status(500).json({ message: "Unable to load notifications." });
    }
};

const createNotification = async (req, res) => {
    const { message } = req.body;
    if (typeof message !== "string" || !message.trim() || message.length > 1000) {
        return res.status(400).json({ message: "A message of at most 1000 characters is required." });
    }
    try {
        const result = await run(
            "INSERT INTO notifications (user_email, message) VALUES ($1, $2) RETURNING id, message, is_read, created_at",
            [req.user.email, message.trim()]
        );
        res.status(201).json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ message: "Unable to create notification." });
    }
};

const markAsRead = async (req, res) => {
    try {
        const result = await run(
            "UPDATE notifications SET is_read = TRUE WHERE id = $1 AND user_email = $2",
            [req.params.id, req.user.email]
        );
        if (!result.rowCount) return res.status(404).json({ message: "Notification not found." });
        res.status(200).json({ message: "Marked as read" });
    } catch (err) {
        res.status(500).json({ message: "Unable to update notification." });
    }
};

const clearNotifications = async (req, res) => {
    try {
        await run("DELETE FROM notifications WHERE user_email = $1", [req.user.email]);
        res.status(200).json({ message: "Notifications cleared" });
    } catch (err) {
        res.status(500).json({ message: "Unable to clear notifications." });
    }
};

module.exports = { getNotifications, createNotification, markAsRead, clearNotifications };
