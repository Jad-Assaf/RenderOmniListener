// listener.js  (ES-module style)

/* eslint-disable no-console */
import pg from "pg";
import WebSocket, { WebSocketServer } from "ws";

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }, // ← add this line
});

const wss = new WebSocketServer({ port: 8080 });

function broadcast(json) {
  const data = JSON.stringify(json);
  wss.clients.forEach((c) => {
    if (c.readyState === WebSocket.OPEN) c.send(data);
  });
}

(async () => {
  const client = await pool.connect();
  await client.query("LISTEN new_message");

  client.on("notification", (msg) => {
    try {
      const payload = JSON.parse(msg.payload ?? "{}");
      broadcast(payload);
    } catch (e) {
      console.error("Bad payload:", e);
    }
  });

  // ping every 10 min to keep the TCP session fresh
  setInterval(() => client.query("SELECT 1"), 600_000);
})();
