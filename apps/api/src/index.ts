import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { env } from "./env.js";
import { health } from "./routes/health.js";
import { auth } from "./routes/auth.js";

const app = new Hono();

app.get("/", (c) => c.json({ name: "wardrobe-api", status: "ok" }));
app.route("/health", health);
app.route("/auth", auth);

// TODO: mount the remaining routes — see SPEC section 11:
//   /items    upload + cataloging, list, get, patch, delete
//   /outfits  suggest, score, create, list, delete
//   /wears    log a wear, history
//   /weather  proxy Open-Meteo

serve({ fetch: app.fetch, port: env.port }, (info) => {
  console.log(`wardrobe-api listening on http://localhost:${info.port}`);
});
