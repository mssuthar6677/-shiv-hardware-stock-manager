
require("dotenv").config({ override: true });

const express = require("express");
const cors = require("cors");
const { Pool } = require("pg");
const path = require("path");
const crypto = require("crypto");

const app = express();

app.use(cors());
app.use(express.json({ limit: "2mb" }));

// --------------------
// DATABASE
// --------------------

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is missing");
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

// --------------------
// LOGIN CONFIGURATION
// --------------------

const LOGIN_USERNAME = process.env.LOGIN_USERNAME;
const LOGIN_PASSWORD = process.env.LOGIN_PASSWORD;
const AUTH_SECRET = process.env.AUTH_SECRET;

if (!LOGIN_USERNAME || !LOGIN_PASSWORD || !AUTH_SECRET) {
  throw new Error(
    "LOGIN_USERNAME, LOGIN_PASSWORD and AUTH_SECRET are required"
  );
}

function safeEqual(a, b) {
  const aBuf = Buffer.from(String(a));
  const bBuf = Buffer.from(String(b));

  return (
    aBuf.length === bBuf.length &&
    crypto.timingSafeEqual(aBuf, bBuf)
  );
}

function signToken(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString(
    "base64url"
  );

  const signature = crypto
    .createHmac("sha256", AUTH_SECRET)
    .update(body)
    .digest("base64url");

  return `${body}.${signature}`;
}

function verifyToken(token) {
  if (!token || typeof token !== "string") return null;

  const parts = token.split(".");
  if (parts.length !== 2) return null;

  const [body, signature] = parts;

  const expected = crypto
    .createHmac("sha256", AUTH_SECRET)
    .update(body)
    .digest("base64url");

  if (!safeEqual(signature, expected)) return null;

  try {
    const payload = JSON.parse(
      Buffer.from(body, "base64url").toString("utf8")
    );

    if (!payload.exp || payload.exp < Date.now()) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}

// --------------------
// AUTH MIDDLEWARE
// --------------------

function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";

  if (!header.startsWith("Bearer ")) {
    return res.status(401).json({
      error: "Login required",
    });
  }

  const token = header.slice(7);
  const payload = verifyToken(token);

  if (!payload) {
    return res.status(401).json({
      error: "Session expired. Please login again.",
    });
  }

  req.user = payload;
  next();
}

// --------------------
// DATABASE INITIALIZATION
// --------------------

async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS app_data (
      id INTEGER PRIMARY KEY,
      entries JSONB NOT NULL DEFAULT '[]',
      outs JSONB NOT NULL DEFAULT '[]',
      categories JSONB NOT NULL DEFAULT '[]',
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  // Future master data fields.
  // Existing stock data is preserved.
  await pool.query(`
    ALTER TABLE app_data
    ADD COLUMN IF NOT EXISTS products JSONB
    NOT NULL DEFAULT '[]'
  `);

  await pool.query(`
    ALTER TABLE app_data
    ADD COLUMN IF NOT EXISTS suppliers JSONB
    NOT NULL DEFAULT '[]'
  `);

  await pool.query(`
    ALTER TABLE app_data
    ADD COLUMN IF NOT EXISTS units JSONB
    NOT NULL DEFAULT '["PCS","Pair","Set","Box"]'
  `);

  await pool.query(`
    INSERT INTO app_data (id)
    VALUES (1)
    ON CONFLICT (id) DO NOTHING
  `);
}

// --------------------
// HEALTH CHECK
// --------------------

app.get("/api/health", async (req, res) => {
  try {
    await pool.query("SELECT NOW()");

    res.json({
      status: "ok",
      database: "connected",
    });
  } catch (error) {
    console.error("Health check failed:", error.message);

    res.status(500).json({
      status: "error",
      database: "disconnected",
    });
  }
});

// --------------------
// LOGIN
// --------------------

app.post("/api/login", (req, res) => {
  const { username, password } = req.body || {};

  if (
    !safeEqual(username || "", LOGIN_USERNAME) ||
    !safeEqual(password || "", LOGIN_PASSWORD)
  ) {
    return res.status(401).json({
      error: "Invalid username or password",
    });
  }

  const token = signToken({
    username: LOGIN_USERNAME,
    exp: Date.now() + 8 * 60 * 60 * 1000,
  });

  res.json({
    status: "ok",
    token,
    expiresIn: 8 * 60 * 60,
  });
});

// --------------------
// AUTH CHECK
// --------------------

app.get("/api/auth/check", requireAuth, (req, res) => {
  res.json({
    status: "ok",
    username: req.user.username,
  });
});

// --------------------
// GET SHARED DATA
// --------------------

app.get("/api/data", requireAuth, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        entries,
        outs,
        categories,
        products,
        suppliers,
        units
      FROM app_data
      WHERE id = 1
    `);

    res.json(result.rows[0]);
  } catch (error) {
    console.error("Data load failed:", error.message);

    res.status(500).json({
      error: "Could not load data",
    });
  }
});

// --------------------
// SAVE SHARED DATA
// --------------------

app.put("/api/data", requireAuth, async (req, res) => {
  try {
    const {
      entries,
      outs,
      categories,
      products,
      suppliers,
      units,
    } = req.body || {};

    if (
      !Array.isArray(entries) ||
      !Array.isArray(outs) ||
      !Array.isArray(categories) ||
      !Array.isArray(products) ||
      !Array.isArray(suppliers) ||
      !Array.isArray(units)
    ) {
      return res.status(400).json({
        error: "Invalid data",
      });
    }

    await pool.query(
      `UPDATE app_data
       SET entries = $1,
           outs = $2,
           categories = $3,
           products = $4,
           suppliers = $5,
           units = $6,
           updated_at = NOW()
       WHERE id = 1`,
      [
        JSON.stringify(entries),
        JSON.stringify(outs),
        JSON.stringify(categories),
        JSON.stringify(products),
        JSON.stringify(suppliers),
        JSON.stringify(units),
      ]
    );

    res.json({
      status: "saved",
    });
  } catch (error) {
    console.error("Data save failed:", error.message);

    res.status(500).json({
      error: "Could not save data",
    });
  }
});

// --------------------
// FRONTEND
// --------------------

const distPath = path.join(__dirname, "dist");

app.use(express.static(distPath));

app.get(/.*/, (req, res) => {
  res.sendFile(path.join(distPath, "index.html"));
});

// --------------------
// START SERVER
// --------------------

const PORT = process.env.PORT || 3000;

initDB()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  })
  .catch((error) => {
    console.error(
      "Database initialization failed:",
      error.message
    );

    process.exit(1);
  });