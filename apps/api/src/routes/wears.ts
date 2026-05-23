import { Hono } from "hono";
import { and, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { db, items, outfits, wears, wearItems } from "@wardrobe/db";
import { requireAuth, type AuthVariables } from "../middleware/auth.js";

export const wearsRoute = new Hono<{ Variables: AuthVariables }>();

// POST /wears — log a wear, bump wear_count + last_worn_at on items (and outfit if linked)
wearsRoute.post("/", requireAuth, async (c) => {
  const userId = c.get("userId");

  const body = await c.req
    .json<{
      outfitId?: string;
      itemIds: string[];
      wornOn?: string;
      note?: string;
      weatherTempC?: number;
    }>()
    .catch(() => null);

  if (!body || !Array.isArray(body.itemIds) || body.itemIds.length === 0) {
    return c.json({ error: "itemIds array is required", code: "INVALID_INPUT" }, 400);
  }

  const wornOn = body.wornOn ?? new Date().toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(wornOn)) {
    return c.json({ error: "wornOn must be YYYY-MM-DD", code: "INVALID_INPUT" }, 400);
  }

  // Verify all items belong to this user
  const itemRows = await db
    .select({ id: items.id })
    .from(items)
    .where(and(eq(items.userId, userId), inArray(items.id, body.itemIds)));

  if (itemRows.length !== body.itemIds.length) {
    return c.json({ error: "One or more items not found", code: "NOT_FOUND" }, 404);
  }

  // Verify outfitId belongs to user if provided
  if (body.outfitId) {
    const [outfit] = await db
      .select({ id: outfits.id })
      .from(outfits)
      .where(and(eq(outfits.id, body.outfitId), eq(outfits.userId, userId)))
      .limit(1);
    if (!outfit) {
      return c.json({ error: "Outfit not found", code: "NOT_FOUND" }, 404);
    }
  }

  const now = new Date();

  const [wear] = await db
    .insert(wears)
    .values({
      userId,
      outfitId: body.outfitId ?? null,
      wornOn,
      weatherTempC: body.weatherTempC != null ? String(body.weatherTempC) : null,
      note: body.note ?? null,
    })
    .returning();

  if (!wear) {
    return c.json({ error: "Failed to log wear", code: "SERVER_ERROR" }, 500);
  }

  await db.insert(wearItems).values(
    body.itemIds.map((itemId) => ({ wearId: wear.id, itemId })),
  );

  await db
    .update(items)
    .set({ wearCount: sql`${items.wearCount} + 1`, lastWornAt: now })
    .where(inArray(items.id, body.itemIds));

  if (body.outfitId) {
    await db
      .update(outfits)
      .set({ wearCount: sql`${outfits.wearCount} + 1`, lastWornAt: now })
      .where(eq(outfits.id, body.outfitId));
  }

  return c.json({ wear: { ...wear, itemIds: body.itemIds } }, 201);
});

// GET /wears — wear history; query params: from, to (YYYY-MM-DD)
wearsRoute.get("/", requireAuth, async (c) => {
  const userId = c.get("userId");
  const from = c.req.query("from");
  const to = c.req.query("to");

  const wearRows = await db
    .select()
    .from(wears)
    .where(
      and(
        eq(wears.userId, userId),
        from ? gte(wears.wornOn, from) : undefined,
        to ? lte(wears.wornOn, to) : undefined,
      ),
    )
    .orderBy(desc(wears.wornOn));

  if (wearRows.length === 0) return c.json({ wears: [] });

  const wearIds = wearRows.map((w) => w.id);
  const wearItemRows = await db
    .select({ wearId: wearItems.wearId, itemId: wearItems.itemId })
    .from(wearItems)
    .where(inArray(wearItems.wearId, wearIds));

  const itemsByWear = new Map<string, string[]>();
  for (const row of wearItemRows) {
    const arr = itemsByWear.get(row.wearId) ?? [];
    arr.push(row.itemId);
    itemsByWear.set(row.wearId, arr);
  }

  return c.json({
    wears: wearRows.map((w) => ({ ...w, itemIds: itemsByWear.get(w.id) ?? [] })),
  });
});
