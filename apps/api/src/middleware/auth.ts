import { createMiddleware } from "hono/factory";
import { db, sessions } from "@wardrobe/db";
import { eq, and, gt } from "drizzle-orm";

export type AuthVariables = {
  userId: string;
};

export const requireAuth = createMiddleware<{ Variables: AuthVariables }>(
  async (c, next) => {
    const authHeader = c.req.header("Authorization");
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
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
