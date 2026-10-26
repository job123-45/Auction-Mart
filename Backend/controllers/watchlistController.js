const { query, run } = require("../db");

const ensureOwnEmail = (req, res, email) => {
    if (String(req.user?.email || "").toLowerCase() !== String(email || "").toLowerCase()) {
        res.status(403).json({ message: "You can only access your own watchlist." });
        return false;
    }
    return true;
};

const getWatchlist = async (req, res) => {
    const email = req.user.email;
    if (!ensureOwnEmail(req, res, req.params.email)) return;
    try {
        const rows = await query(
            "SELECT auction_id FROM watchlists WHERE user_email = $1",
            [email]
        );
        res.status(200).json(rows.map(row => row.auction_id));
    } catch (err) {
        res.status(500).json({ message: "Unable to load watchlist." });
    }
};

const addToWatchlist = async (req, res) => {
    const { auction_id } = req.body;
    if (!auction_id) return res.status(400).json({ message: "auction_id is required." });
    try {
        await run(
            "INSERT INTO watchlists (user_email, auction_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
            [req.user.email, auction_id]
        );
        res.status(201).json({ message: "Added to watchlist" });
    } catch (err) {
        res.status(500).json({ message: "Unable to update watchlist." });
    }
};

const removeFromWatchlist = async (req, res) => {
    if (!ensureOwnEmail(req, res, req.params.email)) return;
    try {
        await run(
            "DELETE FROM watchlists WHERE user_email = $1 AND auction_id = $2",
            [req.user.email, req.params.auctionId]
        );
        res.status(200).json({ message: "Removed from watchlist" });
    } catch (err) {
        res.status(500).json({ message: "Unable to update watchlist." });
    }
};

module.exports = { getWatchlist, addToWatchlist, removeFromWatchlist };
