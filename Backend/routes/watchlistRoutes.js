const express = require("express");
const router = express.Router();
const authMiddleware = require("../middleware/authMiddleware");
const watchlistController = require("../controllers/watchlistController");

router.get("/:email", authMiddleware, watchlistController.getWatchlist);
router.post("/", authMiddleware, watchlistController.addToWatchlist);
router.delete("/:email/:auctionId", authMiddleware, watchlistController.removeFromWatchlist);

module.exports = router;
