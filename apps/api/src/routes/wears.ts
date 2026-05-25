import { Hono } from "hono";
import { and, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { db, items, outfits, wears, wearItems } from "@wardrobe/db";
import { requireAuth, type AuthVariables } from "../middleware/auth.js";
import { objectUrl } from "../lib/storage.js";

// Helper: hydrate item details for an array of wear IDs
async function hydrateWearItems(wearIds: string[]) {
  if (wearIds.length === 0) return new Map<string, ReturnType<typeof buildWearItemShape>[]>();

  const wearItemRows = await db
    .select({ wearId: wearItems.wearId, itemId: wearItems.itemId })
    .from(wearItems)
    .where(inArray(wearItems.wearId, wearIds));

  const allItemIds = [...new Set(wearItemRows.map((r) => r.itemId))];
  const itemRows = allItemIds.length > 0
    ? await db
        .select({
          id: items.id,
          name: items.name,
          category: items.category,
          cutoutImageUrl: items.cutoutImageUrl,
          originalImageUrl: items.originalImageUrl,
          wearCount: items.wearCount,
        })
        .from(items)
        .where(inArray(items.id, allItemIds))
    : [];

  const itemById = new Map(itemRows.map((r) => [r.id, r]));
  const byWear = new Map<string, ReturnType<typeof buildWearItemShape>[]>();

  for (const row of wearItemRows) {
    const item = itemById.get(row.itemId);
    if (!item) continue;
    const arr = byWear.get(row.wearId) ?? [];
    arr.push(buildWearItemShape(item));
    byWear.set(row.wearId, arr);
  }

  return byWear;
}

function buildWearItemShape(item: {
  id: string;
  name: string | null;
  category: string | null;
  cutoutImageUrl: string | null;
  originalImageUrl: string;
  wearCount: number;
}) {
  return {
    id: item.id,
    name: item.name,
    category: item.category,
    cutoutImageUrl: item.cutoutImageUrl ? objectUrl(item.cutoutImageUrl) : null,
    originalImageUrl: objectUrl(item.originalImageUrl),
    wearCount: item.wearCount,
  };
}

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

  const byWear = await hydrateWearItems(wearRows.map((w) => w.id));

  return c.json({
    wears: wearRows.map((w) => ({ ...w, items: byWear.get(w.id) ?? [] })),
  });
});

// GET /wears/:id — single wear with hydrated items
wearsRoute.get("/:id", requireAuth, async (c) => {
  const userId = c.get("userId");
  const { id } = c.req.param();

  const [wear] = await db
    .select()
    .from(wears)
    .where(and(eq(wears.id, id), eq(wears.userId, userId)))
    .limit(1);

  if (!wear) {
    return c.json({ error: "Wear not found", code: "NOT_FOUND" }, 404);
  }

  const byWear = await hydrateWearItems([wear.id]);
  return c.json({ wear: { ...wear, items: byWear.get(wear.id) ?? [] } });
});

// DELETE /wears/:id — remove a wear and fix item stats
wearsRoute.delete("/:id", requireAuth, async (c) => {
  const userId = c.get("userId");
  const { id } = c.req.param();

  // Verify ownership
  const [wear] = await db
    .select()
    .from(wears)
    .where(eq(wears.id, id))
    .limit(1);

  if (!wear) {
    return c.json({ error: "Wear not found", code: "NOT_FOUND" }, 404);
  }
  if (wear.userId !== userId) {
    return c.json({ error: "Forbidden", code: "FORBIDDEN" }, 403);
  }

  // Collect affected item IDs before the cascade removes wear_items
  const wearItemRows = await db
    .select({ itemId: wearItems.itemId })
    .from(wearItems)
    .where(eq(wearItems.wearId, id));

  const affectedItemIds = wearItemRows.map((r) => r.itemId);

  // Delete the wear; FK cascade removes wear_items rows automatically
  await db.delete(wears).where(eq(wears.id, id));

  if (affectedItemIds.length > 0) {
    // Decrement wear_count (floor at 0)
    await db
      .update(items)
      .set({ wearCount: sql`GREATEST(0, ${items.wearCount} - 1)` })
      .where(inArray(items.id, affectedItemIds));

    // Recompute last_worn_at for each affected item from remaining wears
    for (const itemId of affectedItemIds) {
      const [mostRecent] = await db
        .select({ createdAt: wears.createdAt })
        .from(wears)
        .innerJoin(wearItems, eq(wearItems.wearId, wears.id))
        .where(eq(wearItems.itemId, itemId))
        .orderBy(desc(wears.wornOn), desc(wears.createdAt))
        .limit(1);

      await db
        .update(items)
        .set({ lastWornAt: mostRecent?.createdAt ?? null })
        .where(eq(items.id, itemId));
    }
  }

  return c.body(null, 204);
});
