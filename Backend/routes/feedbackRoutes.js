const express = require("express");
const router = express.Router();
const feedbackController = require("../controllers/feedbackController");
const authMiddleware = require("../middleware/authMiddleware");
const requireAdmin = authMiddleware.requireAdmin;
const feedbackMiddleware = require("../middleware/feedbackMiddleware");

// POST /api/feedback - Create feedback (Authenticated or unauthenticated users)
router.post("/", feedbackMiddleware, feedbackController.submitFeedback);

// Feedback records and status changes are restricted to Supabase admins.
router.get("/", authMiddleware, requireAdmin, feedbackController.getAllFeedback);
router.get("/:id", authMiddleware, requireAdmin, feedbackController.getFeedbackById);
router.patch("/:id/status", authMiddleware, requireAdmin, feedbackController.updateFeedbackStatus);

module.exports = router;
