import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { db, users } from "@wardrobe/db";
import { requireAuth, type AuthVariables } from "../middleware/auth.js";

// WMO Weather interpretation codes → readable condition
function codeToCondition(code: number): string {
  if (code === 0) return "clear";
  if (code <= 3) return "cloudy";
  if (code <= 48) return "foggy";
  if (code <= 55) return "drizzle";
  if (code <= 65) return "rainy";
  if (code <= 77) return "snowy";
  if (code <= 82) return "rainy";
  if (code <= 99) return "stormy";
  return "unknown";
}

export const weatherRoute = new Hono<{ Variables: AuthVariables }>();

// GET /weather — proxy Open-Meteo using the user's saved lat/lon (SPEC §11)
weatherRoute.get("/", requireAuth, async (c) => {
  const userId = c.get("userId");

  const [user] = await db
    .select({ lat: users.lat, lon: users.lon })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user?.lat || !user?.lon) {
    return c.json(
      { error: "No location saved. Set lat/lon via PATCH /auth/me.", code: "NO_LOCATION" },
      422,
    );
  }

  try {
    const url =
      `https://api.open-meteo.com/v1/forecast` +
      `?latitude=${user.lat}&longitude=${user.lon}` +
      `&current=temperature_2m,weather_code&forecast_days=1`;

    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) {
      return c.json({ error: "Weather service unavailable", code: "UPSTREAM_ERROR" }, 502);
    }

    const data = (await res.json()) as {
      current?: { temperature_2m?: number; weather_code?: number };
    };

    const tempC = data.current?.temperature_2m ?? null;
    const code = data.current?.weather_code ?? null;
    const condition = code !== null ? codeToCondition(code) : "unknown";

    return c.json({ tempC, condition });
  } catch {
    return c.json({ error: "Weather service unavailable", code: "UPSTREAM_ERROR" }, 502);
  }
});
