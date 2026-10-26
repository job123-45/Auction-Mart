const assert = require("node:assert/strict");
const http = require("node:http");
const Module = require("node:module");
const test = require("node:test");
const cors = require("cors");
const express = require("express");

const { createCorsOptions, createPostgresConfig, validateSupabaseUrl } = require("../securityConfig");
const { createAuthMiddleware, requireAdmin } = require("../middleware/authMiddleware");

function responseRecorder() {
    return {
        statusCode: 200,
        body: null,
        status(code) { this.statusCode = code; return this; },
        json(body) { this.body = body; return this; },
    };
}

function withMockDatabase(state, loadController) {
    const dbPath = require.resolve("../db");
    const controllerPath = require.resolve(loadController);
    const originalDb = require.cache[dbPath];
    const fakeDb = {
        query: (...args) => state.query(...args),
        getOne: (...args) => state.getOne(...args),
        run: (...args) => state.run(...args),
        supabase: { storage: { from: () => ({ remove: async () => ({ error: null }) }) } },
    };
    const fakeModule = new Module(dbPath);
    fakeModule.filename = dbPath;
    fakeModule.loaded = true;
    fakeModule.exports = fakeDb;
    require.cache[dbPath] = fakeModule;
    delete require.cache[controllerPath];
    try {
        return require(controllerPath);
    } finally {
        delete require.cache[controllerPath];
        if (originalDb) require.cache[dbPath] = originalDb;
        else delete require.cache[dbPath];
    }
}

test("Supabase auth middleware rejects missing and invalid tokens and attaches only verified users", async () => {
    let verifiedToken;
    const auth = createAuthMiddleware(async (token) => {
        verifiedToken = token;
        if (token === "valid-session") return { data: { user: { id: "user-1", email: "owner@example.test" } }, error: null };
        return { data: { user: null }, error: new Error("invalid or expired") };
    });

    const missing = responseRecorder();
    await auth({ headers: {} }, missing, () => assert.fail("next called without a token"));
    assert.equal(missing.statusCode, 401);

    const invalid = responseRecorder();
    await auth({ headers: { authorization: "Bearer expired-session" } }, invalid, () => assert.fail("next called for an invalid token"));
    assert.equal(invalid.statusCode, 401);
    assert.doesNotMatch(JSON.stringify(invalid.body), /expired-session|stack|secret/i);

    const malformed = responseRecorder();
    await auth({ headers: { authorization: "Bearer token with-spaces" } }, malformed, () => assert.fail("next called for malformed credentials"));
    assert.equal(malformed.statusCode, 401);

    const verifiedUser = { headers: { authorization: "bEaReR valid-session" } };
    await auth(verifiedUser, responseRecorder(), () => {});
    assert.equal(verifiedToken, "valid-session");
    assert.equal(verifiedUser.user.email, "owner@example.test");
});

test("only trusted app_metadata grants admin access", () => {
    const regular = responseRecorder();
    let regularNext = false;
    requireAdmin({ user: { user_metadata: { role: "admin" }, app_metadata: { role: "user" } } }, regular, () => { regularNext = true; });
    assert.equal(regular.statusCode, 403);
    assert.equal(regularNext, false);

    const admin = responseRecorder();
    let adminNext = false;
    requireAdmin({ user: { app_metadata: { roles: ["admin"] } } }, admin, () => { adminNext = true; });
    assert.equal(adminNext, true);
});

test("feedback read and moderation endpoints require a verified administrator", async (t) => {
    const state = {
        query: async () => [],
        getOne: async () => null,
        run: async () => ({ rowCount: 0, rows: [] }),
    };
    const router = withMockDatabase(state, "../routes/feedbackRoutes");
    const app = express();
    app.use("/api/feedback", router);
    const server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    t.after(() => new Promise((resolve) => server.close(resolve)));
    const baseUrl = `http://127.0.0.1:${server.address().port}/api/feedback`;

    const missing = await fetch(baseUrl);
    assert.equal(missing.status, 401);

    const dbPath = require.resolve("../db");
    const previousDb = require.cache[dbPath];
    const authDb = new Module(dbPath);
    authDb.filename = dbPath;
    authDb.loaded = true;
    authDb.exports = {
        ...state,
        supabase: {
            auth: {
                async getUser(token) {
                    return {
                        error: null,
                        data: { user: { id: "verified-id", email: "reviewer@example.test", app_metadata: token === "admin" ? { role: "admin" } : { role: "user" } } },
                    };
                },
            },
        },
    };
    require.cache[dbPath] = authDb;
    try {
        const regular = await fetch(baseUrl, { headers: { Authorization: "Bearer regular" } });
        assert.equal(regular.status, 403);
        const admin = await fetch(baseUrl, { headers: { Authorization: "Bearer admin" } });
        assert.equal(admin.status, 200);
    } finally {
        if (previousDb) require.cache[dbPath] = previousDb;
        else delete require.cache[dbPath];
    }
});

test("authenticated listing route uses /me and rejects caller-selected email paths", async (t) => {
    let queryParams;
    const state = {
        query: async (_sql, params) => { queryParams = params; return []; },
        getOne: async () => null,
        run: async () => ({ rowCount: 0, rows: [] }),
    };
    const router = withMockDatabase(state, "../routes/auctionRoutes");
    const dbPath = require.resolve("../db");
    const previousDb = require.cache[dbPath];
    const authDb = new Module(dbPath);
    authDb.filename = dbPath;
    authDb.loaded = true;
    authDb.exports = {
        query: (...args) => state.query(...args),
        getOne: (...args) => state.getOne(...args),
        run: (...args) => state.run(...args),
        supabase: {
            auth: {
                async getUser() {
                    return { error: null, data: { user: { id: "verified-id", email: "owner@example.test" } } };
                },
            },
        },
        storage: { from: () => ({ remove: async () => ({ error: null }) }) },
    };
    require.cache[dbPath] = authDb;

    const app = express();
    app.use("/auction", router);
    const server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    t.after(async () => {
        await new Promise((resolve) => server.close(resolve));
        if (previousDb) require.cache[dbPath] = previousDb;
        else delete require.cache[dbPath];
    });
    const baseUrl = `http://127.0.0.1:${server.address().port}/auction`;

    assert.equal((await fetch(`${baseUrl}/user/me`)).status, 401);
    const ownListings = await fetch(`${baseUrl}/user/me`, { headers: { Authorization: "Bearer valid" } });
    assert.equal(ownListings.status, 200);
    assert.equal(queryParams[0], "owner@example.test");
    assert.equal((await fetch(`${baseUrl}/user/victim@example.test`, { headers: { Authorization: "Bearer valid" } })).status, 404);
});

test("production CORS requires a single HTTPS origin and excludes development origins", () => {
    assert.throws(() => createCorsOptions({ NODE_ENV: "production" }), /CLIENT_URL is required/);
    assert.throws(() => createCorsOptions({ NODE_ENV: "production", CLIENT_URL: "*" }));
    assert.throws(() => createCorsOptions({ NODE_ENV: "production", CLIENT_URL: "http://shop.example.test" }), /HTTPS/);
    assert.throws(() => createCorsOptions({ NODE_ENV: "production", CLIENT_URL: "https://shop.example.test/path" }));

    const options = createCorsOptions({ NODE_ENV: "production", CLIENT_URL: "https://shop.example.test" });
    const check = (origin) => new Promise((resolve, reject) => options.origin(origin, (error, allowed) => error ? reject(error) : resolve(allowed)));
    return Promise.all([
        check("https://shop.example.test").then((allowed) => assert.equal(allowed, true)),
        check("http://localhost:3000").then((allowed) => assert.equal(allowed, false)),
        check("https://attacker.example.test").then((allowed) => assert.equal(allowed, false)),
        check(undefined).then((allowed) => assert.equal(allowed, true)),
    ]);
});

test("development CORS allows configured frontend origins and handles preflight without wildcards", async (t) => {
    const app = express();
    app.use(cors(createCorsOptions({ NODE_ENV: "development", CLIENT_URL: "http://localhost:3000" })));
    app.post("/resource", (_req, res) => res.json({ ok: true }));
    const server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    t.after(() => new Promise((resolve) => server.close(resolve)));
    const address = server.address();
    const response = await fetch(`http://127.0.0.1:${address.port}/resource`, {
        method: "OPTIONS",
        headers: {
            Origin: "http://localhost:3000",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "authorization,content-type",
        },
    });
    assert.equal(response.status, 204);
    assert.equal(response.headers.get("access-control-allow-origin"), "http://localhost:3000");
    assert.equal(response.headers.get("access-control-allow-credentials"), null);
    assert.equal(response.headers.get("access-control-allow-methods").includes("POST"), true);

    const rejected = await fetch(`http://127.0.0.1:${address.port}/resource`, {
        method: "OPTIONS",
        headers: {
            Origin: "https://attacker.example.test",
            "Access-Control-Request-Method": "POST",
        },
    });
    assert.equal(rejected.status, 200);
    assert.equal(rejected.headers.get("access-control-allow-origin"), null);
});

test("PostgreSQL config verifies remote TLS and keeps non-production loopback development usable", () => {
    const local = createPostgresConfig("postgresql://user:pass@localhost:5432/auction", { NODE_ENV: "development" });
    assert.equal(local.ssl, false);
    const localTls = createPostgresConfig("postgresql://user:pass@localhost:5432/auction?sslmode=require", { NODE_ENV: "development" });
    assert.deepEqual(localTls.ssl, { rejectUnauthorized: true });

    const remote = createPostgresConfig("postgresql://user:pass@db.example.test:5432/auction?sslmode=require", { NODE_ENV: "production" });
    assert.deepEqual(remote.ssl, { rejectUnauthorized: true });
    assert.equal(new URL(remote.connectionString).searchParams.has("sslmode"), false);

    assert.throws(() => createPostgresConfig("postgresql://user:pass@db.example.test:5432/auction?sslmode=disable", { NODE_ENV: "production" }), /cannot disable TLS/);
    assert.throws(() => createPostgresConfig("postgresql://user:pass@localhost:5432/auction?sslmode=disable", { NODE_ENV: "production" }), /cannot disable TLS/);
    assert.throws(() => createPostgresConfig("https://db.example.test", { NODE_ENV: "development" }), /PostgreSQL protocol/);
});

test("Supabase service URLs require HTTPS outside local development", () => {
    assert.equal(validateSupabaseUrl("http://127.0.0.1:54321", { NODE_ENV: "development" }), "http://127.0.0.1:54321");
    assert.equal(validateSupabaseUrl("https://project.example.test", { NODE_ENV: "production" }), "https://project.example.test");
    assert.throws(() => validateSupabaseUrl("http://project.example.test", { NODE_ENV: "production" }), /HTTPS origin/);
    assert.throws(() => validateSupabaseUrl("https://project.example.test/path", { NODE_ENV: "production" }), /HTTPS origin/);
});

test("listing ownership is checked in database mutations and client-supplied identity is ignored", async () => {
    const state = {
        query: async () => [],
        getOne: async () => ({ id: 7, seller_email: "owner@example.test", title: "Old", image_path: "https://images.example.test/old.jpg", starting_price: 10, duration: 60, status: "draft" }),
        runs: [],
        run: async (sql, params) => { state.runs.push({ sql, params }); return { rowCount: 1, rows: [{ image_path: null }] }; },
    };
    const controller = withMockDatabase(state, "../controllers/auctionController");
    const updateRes = responseRecorder();
    await controller.updateAuction({
        params: { id: "7" },
        user: { id: "verified-owner-id", email: "owner@example.test" },
        body: { title: "Updated", seller_email: "attacker@example.test" },
        files: [],
    }, updateRes);
    assert.equal(updateRes.statusCode, 200);
    assert.match(state.runs[0].sql, /WHERE id = \$10 AND lower\(seller_email\) = lower\(\$11\)/i);
    assert.equal(state.runs[0].params[10], "owner@example.test");
    assert.equal(state.runs[0].params[6], "https://images.example.test/old.jpg");

    state.runs.length = 0;
    const denied = responseRecorder();
    await controller.deleteAuction({ params: { id: "7" }, user: { email: "attacker@example.test" } }, denied);
    assert.equal(denied.statusCode, 403);
    assert.equal(state.runs.length, 0);

    state.runs.length = 0;
    const deleteResult = responseRecorder();
    await controller.deleteAuction({ params: { id: "7" }, user: { email: "owner@example.test" } }, deleteResult);
    assert.equal(deleteResult.statusCode, 200);
    assert.match(state.runs[0].sql, /DELETE FROM auction_lots WHERE id = \$1 AND lower\(seller_email\) = lower\(\$2\)/i);
    assert.equal(state.runs[0].params[1], "owner@example.test");
});

test("bid creation binds the verified user's identity and public bid history omits emails and proxy ceilings", async () => {
    const state = {
        query: async () => [],
        getOne: async () => ({ seller_email: "seller@example.test", status: "active" }),
        runs: [],
        run: async (sql, params) => { state.runs.push({ sql, params }); return { rowCount: 1, rows: [{ id: 12 }] }; },
    };
    const controller = withMockDatabase(state, "../controllers/bidController");
    const auctions = withMockDatabase(state, "../controllers/auctionController");
    const result = responseRecorder();
    await controller.placeBid({
        user: { email: "verified@example.test", user_metadata: { name: "Verified Name" } },
        body: { auction_id: "db-8", user_email: "victim@example.test", user_name: "Spoofed", bid_amount: 25, max_bid: 30 },
    }, result);
    assert.equal(result.statusCode, 201);
    assert.equal(state.runs[0].params[1], "verified@example.test");
    assert.equal(state.runs[1].params[1], "verified@example.test");
    assert.equal(state.runs[1].params[2], "Verified Name");

    let publicSql = "";
    state.query = async (sql) => { publicSql = sql; return []; };
    await controller.getAuctionBids({ params: { auction_id: "db-8" } }, responseRecorder());
    assert.doesNotMatch(publicSql, /max_bid|user_email|b\.user_name/i);
    assert.match(publicSql, /'Bidder' AS user_name/i);

    state.query = async (sql) => { publicSql = sql; return []; };
    await auctions.getAllAuctions({}, responseRecorder());
    assert.doesNotMatch(publicSql, /seller_email|user_email|email/i);
    assert.match(publicSql, /CASE WHEN seller_name LIKE '%@%' THEN 'Seller'/i);

    state.query = async (sql) => { publicSql = sql; return []; };
    await controller.getHighestBids({}, responseRecorder());
    assert.doesNotMatch(publicSql, /user_email|user_name|email/i);
    assert.match(publicSql, /a\.status = 'active'/i);

    let hiddenBidReads = 0;
    state.getOne = async () => ({ status: "draft" });
    state.query = async () => { hiddenBidReads += 1; return []; };
    const hidden = responseRecorder();
    await controller.getAuctionBids({ params: { auction_id: "db-8" } }, hidden);
    assert.equal(hidden.statusCode, 404);
    assert.equal(hiddenBidReads, 0);
});

test("private listing and bid queries use verified identity instead of caller-supplied path values", async () => {
    const queries = [];
    const state = {
        query: async (sql, params) => { queries.push({ sql, params }); return []; },
        getOne: async () => null,
        run: async () => ({ rowCount: 0, rows: [] }),
    };
    const controller = withMockDatabase(state, "../controllers/auctionController");
    const result = responseRecorder();
    await controller.getUserListings({ params: { email: "victim@example.test" }, user: { email: "verified@example.test" } }, result);
    assert.equal(result.statusCode, 200);
    assert.equal(queries[0].params[0], "verified@example.test");

    const bids = withMockDatabase(state, "../controllers/bidController");
    await bids.getUserBids({ params: { email: "victim@example.test" }, user: { email: "verified@example.test" } }, responseRecorder());
    assert.equal(queries[1].params[0], "verified@example.test");
});

test("watchlist and notification writes bind the verified email and enforce row ownership", async () => {
    const state = {
        query: async () => [],
        getOne: async () => null,
        runs: [],
        run: async (sql, params) => { state.runs.push({ sql, params }); return { rowCount: 1, rows: [{ id: 1 }] }; },
    };
    const watchlist = withMockDatabase(state, "../controllers/watchlistController");
    const notification = withMockDatabase(state, "../controllers/notificationController");

    const user = { email: "verified@example.test" };
    const addResult = responseRecorder();
    await watchlist.addToWatchlist({ user, body: { auction_id: "db-9", user_email: "victim@example.test" } }, addResult);
    assert.equal(addResult.statusCode, 201);
    assert.equal(state.runs.at(-1).params[0], user.email);

    let ownerReadEmail;
    state.query = async (_sql, params) => { ownerReadEmail = params[0]; return []; };
    await watchlist.getWatchlist({ user, params: { email: "victim@example.test" } }, responseRecorder());
    assert.equal(ownerReadEmail, user.email);

    const notificationResult = responseRecorder();
    await notification.createNotification({ user, body: { user_email: "victim@example.test", message: "Saved" } }, notificationResult);
    assert.equal(notificationResult.statusCode, 201);
    assert.equal(state.runs.at(-1).params[0], user.email);
    assert.doesNotMatch(state.runs.at(-1).sql, /RETURNING\s+\*/i);

    await notification.markAsRead({ user, params: { id: "1" } }, responseRecorder());
    assert.match(state.runs.at(-1).sql, /WHERE id = \$1 AND user_email = \$2/);
    assert.equal(state.runs.at(-1).params[1], user.email);
    state.query = async (_sql, params) => { ownerReadEmail = params[0]; return []; };
    await notification.getNotifications({ user, params: { email: "victim@example.test" } }, responseRecorder());
    assert.equal(ownerReadEmail, user.email);
});
