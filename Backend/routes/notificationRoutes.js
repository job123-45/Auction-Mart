const express = require("express");
const router = express.Router();
const authMiddleware = require("../middleware/authMiddleware");
const notificationController = require("../controllers/notificationController");

router.get("/me", authMiddleware, notificationController.getNotifications);
router.post("/", authMiddleware, notificationController.createNotification);
router.put("/:id/read", authMiddleware, notificationController.markAsRead);
router.delete("/me", authMiddleware, notificationController.clearNotifications);

module.exports = router;
