import { Hono } from "hono";
import { setCookie, getCookie, deleteCookie } from "hono/cookie";
import bcrypt from "bcrypt";
import { db, users, sessions } from "@wardrobe/db";
import { eq } from "drizzle-orm";
import { requireAuth, type AuthVariables } from "../middleware/auth.js";

const SESSION_MS = 30 * 24 * 60 * 60 * 1000;

const COOKIE_OPTS = {
  httpOnly: true,
  sameSite: "Lax" as const,
  path: "/",
  maxAge: 30 * 24 * 60 * 60,
};

const userFields = {
  id: users.id,
  email: users.email,
  lat: users.lat,
  lon: users.lon,
  createdAt: users.createdAt,
};

// Drizzle maps Postgres `numeric` columns to strings; coerce to JS numbers
// so the API contract (`lat: number | null`) stays consistent.
function toUser(row: {
  id: string;
  email: string;
  lat: string | null;
  lon: string | null;
  createdAt: Date;
}) {
  return {
    id: row.id,
    email: row.email,
    lat: row.lat != null ? parseFloat(row.lat) : null,
    lon: row.lon != null ? parseFloat(row.lon) : null,
    createdAt: row.createdAt,
  };
}

export const auth = new Hono<{ Variables: AuthVariables }>();

auth.post("/signup", async (c) => {
  const body = await c
    .req
    .json<{ email?: string; password?: string }>()
    .catch(() => null);

  if (!body?.email || !body.password) {
    return c.json(
      { error: "email and password are required", code: "INVALID_INPUT" },
      400,
    );
  }

  const { email, password } = body;

  if (password.length < 8) {
    return c.json(
      {
        error: "password must be at least 8 characters",
        code: "INVALID_INPUT",
      },
      400,
    );
  }

  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email.toLowerCase()))
    .limit(1);

  if (existing) {
    return c.json({ error: "email already in use", code: "EMAIL_TAKEN" }, 409);
  }

  const passwordHash = await bcrypt.hash(password, 12);

  const [rawUser] = await db
    .insert(users)
    .values({ email: email.toLowerCase(), passwordHash })
    .returning(userFields);

  if (!rawUser) {
    return c.json({ error: "failed to create user", code: "SERVER_ERROR" }, 500);
  }

  const token = crypto.randomUUID();
  await db.insert(sessions).values({
    userId: rawUser.id,
    token,
    expiresAt: new Date(Date.now() + SESSION_MS),
  });

  setCookie(c, "session", token, COOKIE_OPTS);
  return c.json({ user: toUser(rawUser), token }, 201);
});

auth.post("/login", async (c) => {
  const body = await c
    .req
    .json<{ email?: string; password?: string }>()
    .catch(() => null);

  if (!body?.email || !body.password) {
    return c.json(
      { error: "email and password are required", code: "INVALID_INPUT" },
      400,
    );
  }

  const { email, password } = body;

  const [row] = await db
    .select()
    .from(users)
    .where(eq(users.email, email.toLowerCase()))
    .limit(1);

  if (!row || !(await bcrypt.compare(password, row.passwordHash))) {
    return c.json(
      { error: "invalid email or password", code: "INVALID_CREDENTIALS" },
      401,
    );
  }

  const token = crypto.randomUUID();
  await db.insert(sessions).values({
    userId: row.id,
    token,
    expiresAt: new Date(Date.now() + SESSION_MS),
  });

  setCookie(c, "session", token, COOKIE_OPTS);

  return c.json({ user: toUser(row), token });
});

auth.post("/logout", async (c) => {
  const token = getCookie(c, "session");
  if (token) await db.delete(sessions).where(eq(sessions.token, token));
  deleteCookie(c, "session", { path: "/" });
  return c.json({ ok: true });
});

auth.get("/me", requireAuth, async (c) => {
  const [row] = await db
    .select(userFields)
    .from(users)
    .where(eq(users.id, c.get("userId")))
    .limit(1);

  if (!row) return c.json({ error: "not found", code: "NOT_FOUND" }, 404);
  return c.json({ user: toUser(row) });
});

auth.patch("/me", requireAuth, async (c) => {
  const body = await c
    .req
    .json<{ lat?: number; lon?: number }>()
    .catch(() => null);

  if (!body) {
    return c.json({ error: "invalid JSON", code: "INVALID_INPUT" }, 400);
  }

  const updates: { lat?: string; lon?: string } = {};
  if (body.lat != null) updates.lat = String(body.lat);
  if (body.lon != null) updates.lon = String(body.lon);

  const [rawUpdated] = await db
    .update(users)
    .set(updates)
    .where(eq(users.id, c.get("userId")))
    .returning(userFields);

  if (!rawUpdated) return c.json({ error: "not found", code: "NOT_FOUND" }, 404);
  return c.json({ user: toUser(rawUpdated) });
});
