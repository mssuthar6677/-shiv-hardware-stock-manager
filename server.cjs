require("dotenv").config({ override: true });
const express = require("express");
const cors = require("cors");
const { Pool } = require("pg");
const path = require("path");

const app = express();

app.use(cors());
app.use(express.json());
console.log(
  "DATABASE_URL:",
  process.env.DATABASE_URL
    ? "starts with " + process.env.DATABASE_URL.slice(0, 13)
    : "MISSING"
);
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL
    ? { rejectUnauthorized: false }
    : false,
});

// Create storage table automatically
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

  await pool.query(`
    INSERT INTO app_data (id)
    VALUES (1)
    ON CONFLICT (id) DO NOTHING
  `);
}

// Check database connection
app.get("/api/health", async (req, res) => {
  try {
    await pool.query("SELECT NOW()");
    res.json({ status: "ok", database: "connected" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ status: "error" });
  }
});

// Get shared stock data
app.get("/api/data", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT entries, outs, categories FROM app_data WHERE id = 1"
    );

    res.json(result.rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Could not load data" });
  }
});

// Save shared stock data
app.put("/api/data", async (req, res) => {
  try {
    const { entries, outs, categories } = req.body;

    if (
      !Array.isArray(entries) ||
      !Array.isArray(outs) ||
      !Array.isArray(categories)
    ) {
      return res.status(400).json({ error: "Invalid data" });
    }

    await pool.query(
      `UPDATE app_data
       SET entries = $1,
           outs = $2,
           categories = $3,
           updated_at = NOW()
       WHERE id = 1`,
      [
        JSON.stringify(entries),
        JSON.stringify(outs),
        JSON.stringify(categories),
      ]
    );

    res.json({ status: "saved" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Could not save data" });
  }
});

// Serve the built React app
const distPath = path.join(__dirname, "dist");
app.use(express.static(distPath));

app.get(/.*/, (req, res) => {
  res.sendFile(path.join(distPath, "index.html"));
});

const PORT = process.env.PORT || 3000;

initDB()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  })
  .catch((error) => {
    console.error("Database initialization failed:", error);
    process.exit(1);
  });