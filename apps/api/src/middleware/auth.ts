import { createMiddleware } from "hono/factory";
import { getCookie } from "hono/cookie";
import { db, sessions } from "@wardrobe/db";
import { eq, and, gt } from "drizzle-orm";

export type AuthVariables = {
  userId: string;
};

export const requireAuth = createMiddleware<{ Variables: AuthVariables }>(
  async (c, next) => {
    const token = getCookie(c, "session");
    if (!token)
      return c.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, 401);

    const [session] = await db
      .select({ userId: sessions.userId })
      .from(sessions)
      .where(and(eq(sessions.token, token), gt(sessions.expiresAt, new Date())))
      .limit(1);

    if (!session)
      return c.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, 401);

    c.set("userId", session.userId);
    await next();
  },
);
