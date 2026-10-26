require("dotenv").config({ path: require("path").resolve(__dirname, "../.env") });
const express = require("express");
const path = require("path");
require("./db");
const cors = require("cors");

const app = express();

// Auction routes
const auctionRoutes = require("./routes/auctionRoutes");

// Bid routes
const bidRoutes = require("./routes/bidRoutes");

// Watchlist and Notification routes
const watchlistRoutes = require("./routes/watchlistRoutes");
const notificationRoutes = require("./routes/notificationRoutes");

const allowedOrigins = [
    "http://localhost:5173",
    "http://localhost:3000",
    process.env.CLIENT_URL
].filter(Boolean);

app.use(cors({
    origin(origin, callback) {
        if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
        return callback(new Error("Origin is not allowed by CORS"));
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"]
}));
app.use(express.json({ limit: "1mb" }));

// Removed /uploads route as we use Supabase storage exclusively

// Mount routes
app.use("/auction", auctionRoutes);
app.use("/bids", bidRoutes);
app.use("/api/feedback", require("./routes/feedbackRoutes"));
app.use("/watchlist", watchlistRoutes);
app.use("/notification", notificationRoutes);

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
