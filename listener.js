// listener.js – keep one dedicated connection open
import pg from "pg";
import WebSocket from "ws"; // if you want to fan out directly

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const wsHub = new WebSocket.Server({ port: 8080 }); // expose if you need

const run = async () => {
  const client = await pool.connect();
  await client.query("LISTEN new_message");

  client.on("notification", (msg) => {
    const payload = JSON.parse(msg.payload ?? "{}");
    // relay to all connected WS clients
    wsHub.clients.forEach(
      (c) => c.readyState === 1 && c.send(JSON.stringify(payload))
    );
  });

  // keepalive to avoid TCP idle timeouts every 10 min
  setInterval(() => client.query("SELECT 1"), 10 * 60 * 1000);
};

run().catch((e) => {
  console.error("listener crashed", e);
  process.exit(1);
});
