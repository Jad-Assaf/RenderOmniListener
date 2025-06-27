/* Keep one Postgres LISTEN connection and broadcast every NOTIFY payload
   to all connected WebSocket clients. Runs 24 × 7 on a Render Background
   Worker (or Web Service). */

import pg from "pg";
import WebSocket, { WebSocketServer } from "ws";

/* ── 1. Postgres pool (TLS without CA verification) ──────────────── */
const rawUrl = process.env.DATABASE_URL;
if (!rawUrl) {
  console.error("DATABASE_URL env var is missing");
  process.exit(1);
}

/* node-postgres honours sslmode in the query-string; override
      “require” so it won’t look for a trusted CA. */
const connStr = rawUrl.includes("sslmode=require")
  ? rawUrl.replace("sslmode=require", "sslmode=no-verify")
  : `${rawUrl}${rawUrl.includes("?") ? "&" : "?"}sslmode=no-verify`;

const pool = new pg.Pool({ connectionString: connStr });

/* ── 2. WebSocket hub on port 8080 ───────────────────────────────── */
const wss = new WebSocketServer({ port: 8080 });

function broadcast(json) {
  const data = JSON.stringify(json);
  for (const c of wss.clients) {
    if (c.readyState === WebSocket.OPEN) c.send(data);
  }
}

/* ── 3. Listen to Postgres channel and relay ─────────────────────── */
(async () => {
  const client = await pool.connect();
  await client.query("LISTEN new_message");

  client.on("notification", (msg) => {
    try {
      const payload = JSON.parse(msg.payload ?? "{}");
      broadcast(payload);
    } catch (err) {
      console.error("Bad payload:", err);
    }
  });

  /* keep TCP session alive */
  setInterval(() => {
    client
      .query("SELECT 1")
      .catch((err) => console.error("keep-alive failed:", err));
  }, 600_000);
})().catch((err) => {
  console.error("Listener crashed:", err);
  process.exit(1);
});
