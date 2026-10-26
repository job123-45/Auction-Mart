const express = require("express");
const router = express.Router();
const { placeBid, getUserBids, getAuctionBids, getHighestBids } = require("../controllers/bidController");
const authMiddleware = require("../middleware/authMiddleware");

// POST /bids/place — Place a bid on an auction
router.post("/place", authMiddleware, placeBid);

// GET /bids/highest — Get highest bid + count per auction
router.get("/highest", getHighestBids);

// GET /bids/user/:email — Get all bids by a user
router.get("/user/:email", authMiddleware, getUserBids);

// GET /bids/auction/:auction_id - Get all bids for an auction
router.get("/auction/:auction_id", getAuctionBids);

module.exports = router;

