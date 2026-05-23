import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { env } from "./env.js";
import { ensureBucket } from "./lib/storage.js";
import { health } from "./routes/health.js";
import { auth } from "./routes/auth.js";
import { itemsRoute } from "./routes/items.js";
import { outfitsRoute } from "./routes/outfits.js";
import { wearsRoute } from "./routes/wears.js";
import { weatherRoute } from "./routes/weather.js";

const app = new Hono();

app.get("/", (c) => c.json({ name: "wardrobe-api", status: "ok" }));
app.route("/health", health);
app.route("/auth", auth);
app.route("/items", itemsRoute);
app.route("/outfits", outfitsRoute);
app.route("/wears", wearsRoute);
app.route("/weather", weatherRoute);

ensureBucket().catch((err) => console.error("Storage init failed:", err));

serve({ fetch: app.fetch, port: env.port }, (info) => {
  console.log(`wardrobe-api listening on http://localhost:${info.port}`);
});
