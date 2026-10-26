// ============================================================
// auctionRoutes.js
// Defines all HTTP routes for the auction lot module.
//
// Routes:
//   POST   /auction/create          → Create a new auction lot
//   GET    /auction/all             → Get all auction lots
//   GET    /auction/user/me         → Get the authenticated user's listings
//   GET    /auction/:id             → Get one auction lot by ID
//   DELETE /auction/:id             → Delete an auction lot
//   PUT    /auction/:id             → Update an auction lot
//
// User-owned routes use /me paths so email addresses are not placed in URLs.
// ============================================================

const express = require("express");
const router = express.Router();

// Import the upload middleware (Multer config)
// "upload.single('image')" means we expect ONE file with the field name "image"
const upload = require("../middleware/uploadMiddleware");
const authMiddleware = require("../middleware/authMiddleware");

// Import all controller functions
const {
    createAuctionLot,
    getAllAuctions,
    getAuctionById,
    getUserListings,
    deleteAuction,
    updateAuction
} = require("../controllers/auctionController");

// ============================================================
// POST /auction/create
// Creates a new auction lot.
// Uses multer middleware to handle the image file upload first,
// then passes control to the createAuctionLot controller.
//
// The uploaded file will be available as req.file inside the controller.
// ============================================================
router.post(
    "/create",
    authMiddleware,
    // Multer processes the files before the controller runs
    (req, res, next) => {
        upload.array("images", 5)(req, res, (err) => {
            if (err) {
                // Handle multer-specific errors (file size, wrong type, etc.)
                return res.status(400).json({ message: err.message });
            }
            // No error — continue to the controller
            next();
        });
    },
    createAuctionLot
);

// ============================================================
// GET /auction/all
// Returns all auction lots in the database.
// ============================================================
router.get("/all", getAllAuctions);

// ============================================================
// GET /auction/user/me
// Returns all listings created by the authenticated seller.
//
// IMPORTANT: This route is placed BEFORE /auction/:id
//            so Express matches "user" correctly, not as an ID.
// ============================================================
router.get("/user/me", authMiddleware, getUserListings);

// ============================================================
// GET /auction/:id
// Returns a single auction lot by its numeric ID.
// Example: GET /auction/5
// ============================================================
router.get("/:id", getAuctionById);

// ============================================================
// DELETE /auction/:id
// Deletes an auction lot and its associated image file.
// Example: DELETE /auction/5
// ============================================================
router.delete("/:id", authMiddleware, deleteAuction);

// ============================================================
// PUT /auction/:id
// Updates an auction lot and handles optional new image uploads.
// ============================================================
router.put(
    "/:id",
    authMiddleware,
    (req, res, next) => {
        upload.array("images", 5)(req, res, (err) => {
            if (err) {
                return res.status(400).json({ message: err.message });
            }
            next();
        });
    },
    updateAuction
);

module.exports = router;
