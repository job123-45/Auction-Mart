// ============================================================
// bidController.js
// Handles bid-related business logic:
//   - placeBid      → POST /bids/place
//   - getUserBids   → GET  /bids/user/me
//   - getAuctionBids→ GET  /bids/auction/:auction_id
//   - getHighestBids→ GET  /bids/highest
//
// Uses Supabase PostgreSQL via the db helpers.
// ============================================================

const { query, getOne, run } = require("../db");

// ============================================================
// POST /bids/place
// Places a bid on any auction (demo or user-created)
// ============================================================
const placeBid = async (req, res) => {
    const { auction_id, bid_amount, max_bid } = req.body;
    const user_email = req.user.email;
    const user_name = req.user.user_metadata?.name || user_email;

    if (!auction_id || !Number.isFinite(Number(bid_amount)) || Number(bid_amount) <= 0) {
        return res.status(400).json({
            message: "auction_id and a positive bid_amount are required."
        });
    }

    const idText = String(auction_id).replace(/^db-/, "");
    const numericAuctionId = /^\d+$/.test(idText) ? Number(idText) : null;
    const numericBidAmount = Number(bid_amount);
    const numericMaxBid = max_bid === undefined || max_bid === null || max_bid === "" ? null : Number(max_bid);

    if (!numericAuctionId || !Number.isSafeInteger(numericAuctionId)) {
        return res.status(400).json({ message: "A valid database auction ID is required." });
    }
    if (!Number.isFinite(numericBidAmount) || numericBidAmount <= 0 ||
        (numericMaxBid !== null && (!Number.isFinite(numericMaxBid) || numericMaxBid < numericBidAmount))) {
        return res.status(400).json({ message: "Bid amounts must be positive, and max_bid cannot be below bid_amount." });
    }

    try {
        const lot = await getOne(
            `SELECT seller_email, status FROM auction_lots WHERE id = $1`,
            [numericAuctionId]
        );
        if (!lot) return res.status(404).json({ message: "Auction not found." });
        if (lot.status !== "active") return res.status(409).json({ message: "Auction is not active." });
        if (String(lot.seller_email || "").toLowerCase() === String(user_email).toLowerCase()) {
            return res.status(403).json({ message: "Sellers cannot bid on their own items." });
        }

        // First, update any previous bids by this user on this auction to 'outbid'
        await run(
            `UPDATE bids SET bid_status = 'outbid' WHERE auction_id = $1 AND user_email = $2`,
            [auction_id, user_email]
        );

        // Insert the new bid
        const sql = `
            INSERT INTO bids (auction_id, user_email, user_name, bid_amount, max_bid, bid_status)
            VALUES ($1, $2, $3, $4, $5, 'winning')
            RETURNING id
        `;

        const values = [
            auction_id,
            user_email,
            user_name || null,
            numericBidAmount,
            numericMaxBid
        ];

        const result = await run(sql, values);

        res.status(201).json({
            message: "Bid placed successfully",
            bidId: result.rows[0].id,
            auction_id,
            bid_amount: numericBidAmount,
            bid_status: 'winning'
        });
    } catch (err) {
        return res.status(500).json({ message: "Unable to place bid." });
    }
};

// ============================================================
// GET /bids/user/me
// Returns the authenticated user's bids (latest per auction)
// ============================================================
const getUserBids = async (req, res) => {
    const authenticatedEmail = req.user.email;

    // Get the latest bid per auction for this user
    const sql = `
        SELECT b.id, b.auction_id, b.user_email, b.user_name, b.bid_amount, b.max_bid, b.bid_status, b.created_at
        FROM bids b
        INNER JOIN (
            SELECT auction_id, MAX(id) as max_id
            FROM bids
            WHERE user_email = $1
            GROUP BY auction_id
        ) latest ON b.id = latest.max_id
        ORDER BY b.created_at DESC
    `;

    try {
        const rows = await query(sql, [authenticatedEmail]);
        res.status(200).json(rows);
    } catch (err) {
        return res.status(500).json({ message: "Unable to load your bids." });
    }
};

// ============================================================
// GET /bids/auction/:auction_id
// Returns all bids placed on a specific auction
// ============================================================
const getAuctionBids = async (req, res) => {
    const { auction_id } = req.params;
    const idText = String(auction_id || "").replace(/^db-/, "");
    const numericId = /^\d+$/.test(idText) ? Number(idText) : null;
    if (!numericId || !Number.isSafeInteger(numericId)) {
        return res.status(400).json({ message: "A valid auction ID is required." });
    }

    try {
        const auction = await getOne("SELECT status FROM auction_lots WHERE id = $1", [numericId]);
        if (!auction || auction.status !== "active") {
            return res.status(404).json({ message: "Auction not found." });
        }

        const rows = await query(
            `SELECT id, auction_id, 'Bidder' AS user_name, bid_amount, bid_status, created_at
             FROM bids WHERE auction_id IN ($1, $2) ORDER BY created_at DESC`,
            [`db-${numericId}`, String(numericId)]
        );
        res.status(200).json(rows);
    } catch (err) {
        return res.status(500).json({ message: "Unable to load auction bids." });
    }
};

// ============================================================
// GET /bids/highest
// Returns the highest bid amount, total bid count, and highest
// bidder info for every auction that has received at least one bid.
// ============================================================
const getHighestBids = async (req, res) => {
    const sql = `
        WITH active_bids AS (
            SELECT b.*
            FROM bids b
            INNER JOIN auction_lots a
              ON (b.auction_id = 'db-' || a.id::text OR b.auction_id = a.id::text)
            WHERE a.status = 'active'
        )
        SELECT DISTINCT ON (b.auction_id)
            b.auction_id,
            b.bid_amount   AS highest_bid,
            counts.total_bids
        FROM active_bids b
        INNER JOIN (
            SELECT auction_id, MAX(bid_amount) AS max_amount, COUNT(*) AS total_bids
            FROM active_bids
            GROUP BY auction_id
        ) counts ON b.auction_id = counts.auction_id AND b.bid_amount = counts.max_amount
        ORDER BY b.auction_id, b.created_at DESC
    `;

    try {
        const rows = await query(sql, []);
        res.status(200).json(rows);
    } catch (err) {
        return res.status(500).json({ message: "Unable to load highest bids." });
    }
};

module.exports = {
    placeBid,
    getUserBids,
    getAuctionBids,
    getHighestBids
};
