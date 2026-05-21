import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { env } from "./env.js";
import { ensureBucket } from "./lib/storage.js";
import { health } from "./routes/health.js";
import { auth } from "./routes/auth.js";
import { itemsRoute } from "./routes/items.js";

const app = new Hono();

app.get("/", (c) => c.json({ name: "wardrobe-api", status: "ok" }));
app.route("/health", health);
app.route("/auth", auth);
app.route("/items", itemsRoute);

// TODO: mount the remaining routes — see SPEC section 11:
//   /outfits  suggest, score, create, list, delete
//   /wears    log a wear, history
//   /weather  proxy Open-Meteo

ensureBucket().catch((err) => console.error("Storage init failed:", err));

serve({ fetch: app.fetch, port: env.port }, (info) => {
  console.log(`wardrobe-api listening on http://localhost:${info.port}`);
});
