import { Hono } from "hono";
import { and, desc, eq, inArray } from "drizzle-orm";
import Anthropic from "@anthropic-ai/sdk";
import { db, items, outfits, outfitItems, users } from "@wardrobe/db";
import type { OutfitCandidate, ScoreBreakdown, ScoredOutfit } from "@wardrobe/outfit-engine";
import { scoreOutfit, suggestOutfits } from "@wardrobe/outfit-engine";
import type { ItemColor, Occasion, OutfitSlot, Season } from "@wardrobe/shared";
import { requireAuth, type AuthVariables } from "../middleware/auth.js";
import { objectUrl } from "../lib/storage.js";
import { env } from "../env.js";

const anthropic = new Anthropic({ apiKey: env.anthropicApiKey });

const VALID_OCCASIONS: readonly Occasion[] = ["casual", "smart", "formal", "sporty"];
const VALID_SLOTS: readonly OutfitSlot[] = [
  "top", "bottom", "dress", "outerwear", "footwear", "accessory",
];

function isOccasion(s: string): s is Occasion {
  return (VALID_OCCASIONS as readonly string[]).includes(s);
}
function isSlot(s: string): s is OutfitSlot {
  return (VALID_SLOTS as readonly string[]).includes(s);
}

// ── Shared item fields (including embedding for engine use) ──────────────────

const engineItemFields = {
  id: items.id,
  name: items.name,
  category: items.category,
  subcategory: items.subcategory,
  brand: items.brand,
  colors: items.colors,
  formality: items.formality,
  warmth: items.warmth,
  seasons: items.seasons,
  styleGenres: items.styleGenres,
  pattern: items.pattern,
  material: items.material,
  cutoutImageUrl: items.cutoutImageUrl,
  wearCount: items.wearCount,
  lastWornAt: items.lastWornAt,
  embedding: items.embedding,
};

type EngineItemRow = Pick<
  typeof items.$inferSelect,
  | "id" | "name" | "category" | "subcategory" | "brand" | "colors"
  | "formality" | "warmth" | "seasons" | "styleGenres" | "pattern"
  | "material" | "cutoutImageUrl" | "wearCount" | "lastWornAt" | "embedding"
>;

function rowToEngineItem(row: EngineItemRow) {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    subcategory: row.subcategory,
    brand: row.brand,
    colors: (row.colors as ItemColor[] | null) ?? [],
    formality: row.formality,
    warmth: row.warmth,
    seasons: (row.seasons as Season[] | null) ?? [],
    styleGenres: row.styleGenres ?? [],
    pattern: row.pattern,
    material: row.material,
    cutoutImageUrl: row.cutoutImageUrl,
    wearCount: row.wearCount,
    lastWornAt: row.lastWornAt ? (row.lastWornAt as Date).toISOString() : null,
    embedding: (row.embedding as number[] | null) ?? [],
  };
}

async function loadCloset(userId: string) {
  const rows = await db
    .select(engineItemFields)
    .from(items)
    .where(and(eq(items.userId, userId), eq(items.procStatus, "ready")));

  // Engine requires embeddings for style coherence; drop items missing them.
  return rows
    .filter((r) => r.embedding !== null)
    .map(rowToEngineItem);
}

// ── Weather (optional, graceful fallback) ───────────────────────────────────

async function fetchTempC(lat: string, lon: string): Promise<number | null> {
  try {
    const url =
      `https://api.open-meteo.com/v1/forecast` +
      `?latitude=${lat}&longitude=${lon}&current=temperature_2m&forecast_days=1`;
    const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
    if (!res.ok) return null;
    const data = (await res.json()) as { current?: { temperature_2m?: number } };
    return data.current?.temperature_2m ?? null;
  } catch {
    return null;
  }
}

// ── Critique via Claude Haiku ───────────────────────────────────────────────

async function generateCritique(
  candidate: OutfitCandidate,
  breakdown: ScoreBreakdown,
  score: number,
): Promise<string> {
  if (!env.anthropicApiKey) return "Set ANTHROPIC_API_KEY to enable critiques.";

  const itemList = candidate.items
    .map(({ item, slot }) => `${slot}: ${item.name ?? "unnamed item"}`)
    .join(", ");

  const prompt =
    `You are a friendly, concise fashion critic. A user assembled this outfit:\n` +
    `${itemList}\n\n` +
    `The compatibility engine scored it ${score.toFixed(0)}/100:\n` +
    `- Color harmony: ${(breakdown.color * 100).toFixed(0)}/100\n` +
    `- Style coherence: ${(breakdown.coherence * 100).toFixed(0)}/100\n` +
    `- Formality consistency: ${(breakdown.formality * 100).toFixed(0)}/100\n` +
    `- Pattern balance: ${(breakdown.pattern * 100).toFixed(0)}/100\n` +
    `- Novelty: ${(breakdown.novelty * 100).toFixed(0)}/100\n\n` +
    `In 2–3 sentences, narrate what works and what doesn't. Name the specific items. ` +
    `Translate the scores into plain English — do not echo the numbers back.`;

  try {
    const message = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 220,
      messages: [{ role: "user", content: prompt }],
    });
    const block = message.content[0];
    return block?.type === "text" ? block.text : "Unable to generate critique.";
  } catch {
    return "Unable to generate critique at this time.";
  }
}

// ── Wire format helpers ─────────────────────────────────────────────────────

function serializeScoredOutfit(o: ScoredOutfit) {
  return {
    score: o.score,
    breakdown: o.breakdown,
    items: o.items.map(({ item, slot }) => ({
      slot,
      item: {
        id: item.id,
        name: item.name,
        category: item.category,
        colors: item.colors,
        // DB stores bare object keys; expand to a full public URL the same way
        // GET /items does via its toResponse() helper.
        cutoutImageUrl: item.cutoutImageUrl ? objectUrl(item.cutoutImageUrl) : null,
        wearCount: item.wearCount,
        lastWornAt: item.lastWornAt,
      },
    })),
  };
}

// ── Route definitions ───────────────────────────────────────────────────────

export const outfitsRoute = new Hono<{ Variables: AuthVariables }>();

// POST /outfits/suggest — run engine, return 3–5 ranked outfits (SPEC §11)
outfitsRoute.post("/suggest", requireAuth, async (c) => {
  const userId = c.get("userId");

  const body: { occasion?: string; useWeather?: boolean } = await c.req
    .json<{ occasion?: string; useWeather?: boolean }>()
    .catch(() => ({}));

  const occasion: Occasion =
    body.occasion && isOccasion(body.occasion) ? body.occasion : "casual";

  let temperatureC: number | null = null;
  if (body.useWeather === true) {
    const [user] = await db
      .select({ lat: users.lat, lon: users.lon })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    if (user?.lat && user?.lon) {
      temperatureC = await fetchTempC(user.lat, user.lon);
    }
  }

  const closet = await loadCloset(userId);
  if (closet.length === 0) {
    return c.json({ outfits: [] });
  }

  const suggestions = suggestOutfits(closet, { temperatureC, occasion, now: new Date() });
  return c.json({ outfits: suggestions.map(serializeScoredOutfit) });
});

// POST /outfits/score — score a manual outfit + Haiku critique (no persistence)
outfitsRoute.post("/score", requireAuth, async (c) => {
  const userId = c.get("userId");

  const body = await c.req
    .json<{ items: { itemId: string; slot: string }[] }>()
    .catch(() => null);

  if (!body || !Array.isArray(body.items) || body.items.length === 0) {
    return c.json({ error: "items array is required", code: "INVALID_INPUT" }, 400);
  }

  for (const entry of body.items) {
    if (!entry.slot || !isSlot(entry.slot)) {
      return c.json({ error: `Invalid slot: ${entry.slot}`, code: "INVALID_INPUT" }, 400);
    }
  }

  const itemIds = body.items.map((e) => e.itemId);
  const rows = await db
    .select(engineItemFields)
    .from(items)
    .where(and(eq(items.userId, userId), inArray(items.id, itemIds)));

  const rowById = new Map(rows.map((r) => [r.id, r]));

  const candidateItems: OutfitCandidate["items"] = [];
  for (const entry of body.items) {
    const row = rowById.get(entry.itemId);
    if (!row) {
      return c.json({ error: `Item not found: ${entry.itemId}`, code: "NOT_FOUND" }, 404);
    }
    candidateItems.push({ slot: entry.slot as OutfitSlot, item: rowToEngineItem(row) });
  }

  const candidate: OutfitCandidate = { items: candidateItems };
  const scored = scoreOutfit(candidate, { temperatureC: null, occasion: "casual", now: new Date() });
  const critique = await generateCritique(candidate, scored.breakdown, scored.score);

  return c.json({ score: scored.score, breakdown: scored.breakdown, critique });
});

// POST /outfits — persist an outfit (score computed server-side)
outfitsRoute.post("/", requireAuth, async (c) => {
  const userId = c.get("userId");

  const body = await c.req
    .json<{ items: { itemId: string; slot: string }[]; name?: string; source?: string }>()
    .catch(() => null);

  if (!body || !Array.isArray(body.items) || body.items.length === 0) {
    return c.json({ error: "items array is required", code: "INVALID_INPUT" }, 400);
  }

  for (const entry of body.items) {
    if (!entry.slot || !isSlot(entry.slot)) {
      return c.json({ error: `Invalid slot: ${entry.slot}`, code: "INVALID_INPUT" }, 400);
    }
  }

  const source = body.source === "ai_suggested" ? "ai_suggested" : "user_created";
  const itemIds = body.items.map((e) => e.itemId);

  const rows = await db
    .select(engineItemFields)
    .from(items)
    .where(and(eq(items.userId, userId), inArray(items.id, itemIds)));

  const rowById = new Map(rows.map((r) => [r.id, r]));
  for (const entry of body.items) {
    if (!rowById.has(entry.itemId)) {
      return c.json({ error: `Item not found: ${entry.itemId}`, code: "NOT_FOUND" }, 404);
    }
  }

  const candidateItems: OutfitCandidate["items"] = body.items.map((entry) => ({
    slot: entry.slot as OutfitSlot,
    item: rowToEngineItem(rowById.get(entry.itemId)!),
  }));

  const scored = scoreOutfit(
    { items: candidateItems },
    { temperatureC: null, occasion: "casual", now: new Date() },
  );

  const [outfit] = await db
    .insert(outfits)
    .values({
      userId,
      name: body.name ?? null,
      source,
      score: scored.score.toFixed(2),
      scoreBreakdown: scored.breakdown,
    })
    .returning();

  if (!outfit) {
    return c.json({ error: "Failed to create outfit", code: "SERVER_ERROR" }, 500);
  }

  await db.insert(outfitItems).values(
    body.items.map((entry) => ({
      outfitId: outfit.id,
      itemId: entry.itemId,
      slot: entry.slot,
    })),
  );

  return c.json({ outfit: { ...outfit, items: body.items } }, 201);
});

// GET /outfits — list saved outfits for the user
outfitsRoute.get("/", requireAuth, async (c) => {
  const userId = c.get("userId");

  const rows = await db
    .select()
    .from(outfits)
    .where(eq(outfits.userId, userId))
    .orderBy(desc(outfits.createdAt));

  if (rows.length === 0) return c.json({ outfits: [] });

  const outfitIds = rows.map((r) => r.id);
  const outfitItemRows = await db
    .select({
      outfitId: outfitItems.outfitId,
      itemId: outfitItems.itemId,
      slot: outfitItems.slot,
    })
    .from(outfitItems)
    .where(inArray(outfitItems.outfitId, outfitIds));

  // Hydrate item details for each outfit slot
  const allItemIds = [...new Set(outfitItemRows.map((r) => r.itemId))];
  const itemRows = allItemIds.length > 0
    ? await db
        .select({
          id: items.id,
          name: items.name,
          category: items.category,
          colors: items.colors,
          cutoutImageUrl: items.cutoutImageUrl,
          wearCount: items.wearCount,
          lastWornAt: items.lastWornAt,
        })
        .from(items)
        .where(inArray(items.id, allItemIds))
    : [];

  const itemById = new Map(itemRows.map((r) => [r.id, r]));

  type HydratedSlot = { slot: string; item: { id: string; name: string | null; category: string | null; colors: unknown; cutoutImageUrl: string | null; wearCount: number; lastWornAt: string | null } };
  const itemsByOutfit = new Map<string, HydratedSlot[]>();
  for (const row of outfitItemRows) {
    const item = itemById.get(row.itemId);
    if (!item) continue;
    const arr = itemsByOutfit.get(row.outfitId) ?? [];
    arr.push({
      slot: row.slot,
      item: {
        id: item.id,
        name: item.name,
        category: item.category,
        colors: item.colors,
        cutoutImageUrl: item.cutoutImageUrl ? objectUrl(item.cutoutImageUrl) : null,
        wearCount: item.wearCount,
        lastWornAt: item.lastWornAt ? (item.lastWornAt as Date).toISOString() : null,
      },
    });
    itemsByOutfit.set(row.outfitId, arr);
  }

  return c.json({
    outfits: rows.map((o) => ({ ...o, items: itemsByOutfit.get(o.id) ?? [] })),
  });
});

// GET /outfits/:id — one outfit with items
outfitsRoute.get("/:id", requireAuth, async (c) => {
  const userId = c.get("userId");
  const outfitId = c.req.param("id");

  const [outfit] = await db
    .select()
    .from(outfits)
    .where(and(eq(outfits.id, outfitId), eq(outfits.userId, userId)))
    .limit(1);

  if (!outfit) return c.json({ error: "Outfit not found", code: "NOT_FOUND" }, 404);

  const outfitItemsList = await db
    .select({ itemId: outfitItems.itemId, slot: outfitItems.slot })
    .from(outfitItems)
    .where(eq(outfitItems.outfitId, outfit.id));

  return c.json({ outfit: { ...outfit, items: outfitItemsList } });
});

// DELETE /outfits/:id
outfitsRoute.delete("/:id", requireAuth, async (c) => {
  const userId = c.get("userId");
  const outfitId = c.req.param("id");

  const [outfit] = await db
    .select({ id: outfits.id })
    .from(outfits)
    .where(and(eq(outfits.id, outfitId), eq(outfits.userId, userId)))
    .limit(1);

  if (!outfit) return c.json({ error: "Outfit not found", code: "NOT_FOUND" }, 404);

  await db.delete(outfits).where(eq(outfits.id, outfit.id));
  return c.body(null, 204);
});
