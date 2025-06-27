// keep one Postgres LISTEN connection and push each payload to WebSocket clients
import pg from "pg";
import WebSocket, { WebSocketServer } from "ws";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const wss = new WebSocketServer({ port: 8080 }); // Render will expose this

// fan-out helper
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
      console.error("Bad payload", e);
    }
  });

  // keep-alive every 10 min so Heroku/Render TCP idle killers ignore us
  setInterval(() => client.query("SELECT 1"), 600_000);
})();
