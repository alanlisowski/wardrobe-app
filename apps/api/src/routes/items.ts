import { Hono } from "hono";
import { db, items, itemCategory, itemPattern } from "@wardrobe/db";
import { and, count, desc, eq, ilike, or, sql } from "drizzle-orm";
import { MAX_WARDROBE_SIZE } from "@wardrobe/shared";
import { requireAuth, type AuthVariables } from "../middleware/auth.js";
import { uploadObject, deleteObject, keyFromUrl } from "../lib/storage.js";
import { catalogQueue } from "../lib/queue.js";

type ItemCategoryEnum = (typeof itemCategory.enumValues)[number];
type ItemPatternEnum = (typeof itemPattern.enumValues)[number];

function isCategory(s: string): s is ItemCategoryEnum {
  return (itemCategory.enumValues as readonly string[]).includes(s);
}

function isPattern(s: string): s is ItemPatternEnum {
  return (itemPattern.enumValues as readonly string[]).includes(s);
}

/** Columns returned to callers — embedding excluded (512-d, not useful over the wire). */
const itemFields = {
  id: items.id,
  userId: items.userId,
  originalImageUrl: items.originalImageUrl,
  cutoutImageUrl: items.cutoutImageUrl,
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
  wearCount: items.wearCount,
  lastWornAt: items.lastWornAt,
  procStatus: items.procStatus,
  procError: items.procError,
  createdAt: items.createdAt,
  updatedAt: items.updatedAt,
};

export const itemsRoute = new Hono<{ Variables: AuthVariables }>();

// POST /items — upload photo, create item row, enqueue cataloging job
itemsRoute.post("/", requireAuth, async (c) => {
  const userId = c.get("userId");

  const body = await c.req.parseBody();
  const file = body["photo"];

  if (!file || typeof file === "string") {
    return c.json(
      { error: "photo file is required (multipart field: photo)", code: "INVALID_INPUT" },
      400,
    );
  }

  // Enforce 150-item wardrobe cap (SPEC section 3 / section 8)
  const [countRow] = await db
    .select({ value: count() })
    .from(items)
    .where(eq(items.userId, userId));

  if ((countRow?.value ?? 0) >= MAX_WARDROBE_SIZE) {
    return c.json(
      {
        error: `Wardrobe is at the ${MAX_WARDROBE_SIZE}-item limit. Delete items to add more.`,
        code: "WARDROBE_FULL",
      },
      409,
    );
  }

  // Generate the item ID up-front so we can use it in the storage key
  const itemId = crypto.randomUUID();
  const contentType = file.type || "image/jpeg";
  const key = `items/${itemId}/original`;

  const buffer = Buffer.from(await file.arrayBuffer());

  let originalImageUrl: string;
  try {
    originalImageUrl = await uploadObject(key, buffer, contentType);
  } catch (err) {
    console.error("MinIO upload failed:", err);
    return c.json({ error: "Failed to store image", code: "STORAGE_ERROR" }, 500);
  }

  const [item] = await db
    .insert(items)
    .values({ id: itemId, userId, originalImageUrl, procStatus: "processing" })
    .returning({ id: items.id, procStatus: items.procStatus });

  if (!item) {
    return c.json({ error: "Failed to create item", code: "SERVER_ERROR" }, 500);
  }

  await catalogQueue.add("catalog-item", { itemId, userId });

  return c.json({ id: item.id, procStatus: item.procStatus }, 201);
});

// GET /items — list with optional filters: category, season, q (text search)
itemsRoute.get("/", requireAuth, async (c) => {
  const userId = c.get("userId");
  const categoryParam = c.req.query("category");
  const season = c.req.query("season");
  const q = c.req.query("q");

  const where = and(
    eq(items.userId, userId),
    categoryParam && isCategory(categoryParam)
      ? eq(items.category, categoryParam)
      : undefined,
    season
      ? sql`${items.seasons} @> ARRAY[${season}]::text[]`
      : undefined,
    q
      ? or(
          ilike(items.name, `%${q}%`),
          ilike(items.brand, `%${q}%`),
          ilike(items.subcategory, `%${q}%`),
          ilike(items.material, `%${q}%`),
        )
      : undefined,
  );

  const [rows, countResult] = await Promise.all([
    db.select(itemFields).from(items).where(where).orderBy(desc(items.createdAt)),
    db.select({ value: count() }).from(items).where(where),
  ]);

  return c.json({ items: rows, total: countResult[0]?.value ?? 0 });
});

// GET /items/:id — full item; clients poll this for procStatus
itemsRoute.get("/:id", requireAuth, async (c) => {
  const userId = c.get("userId");
  const itemId = c.req.param("id");

  const [item] = await db
    .select(itemFields)
    .from(items)
    .where(and(eq(items.id, itemId), eq(items.userId, userId)))
    .limit(1);

  if (!item) return c.json({ error: "Item not found", code: "NOT_FOUND" }, 404);
  return c.json({ item });
});

// PATCH /items/:id — user corrects AI tags
itemsRoute.patch("/:id", requireAuth, async (c) => {
  const userId = c.get("userId");
  const itemId = c.req.param("id");

  const body = await c
    .req
    .json<{
      name?: string;
      category?: string;
      subcategory?: string;
      brand?: string;
      colors?: Array<{ hex: string; proportion: number }>;
      formality?: number;
      warmth?: number;
      seasons?: string[];
      styleGenres?: string[];
      pattern?: string;
      material?: string;
    }>()
    .catch(() => null);

  if (!body) return c.json({ error: "Invalid JSON", code: "INVALID_INPUT" }, 400);

  if (body.category !== undefined && !isCategory(body.category)) {
    return c.json({ error: "Invalid category", code: "INVALID_INPUT" }, 400);
  }
  if (body.pattern !== undefined && !isPattern(body.pattern)) {
    return c.json({ error: "Invalid pattern", code: "INVALID_INPUT" }, 400);
  }
  if (body.formality !== undefined && (body.formality < 1 || body.formality > 5)) {
    return c.json({ error: "formality must be 1–5", code: "INVALID_INPUT" }, 400);
  }
  if (body.warmth !== undefined && (body.warmth < 1 || body.warmth > 5)) {
    return c.json({ error: "warmth must be 1–5", code: "INVALID_INPUT" }, 400);
  }

  // Build the update set dynamically
  const set: {
    name?: string | null;
    category?: ItemCategoryEnum | null;
    subcategory?: string | null;
    brand?: string | null;
    colors?: unknown;
    formality?: number | null;
    warmth?: number | null;
    seasons?: string[] | null;
    styleGenres?: string[] | null;
    pattern?: ItemPatternEnum | null;
    material?: string | null;
    updatedAt: Date;
  } = { updatedAt: new Date() };

  if (body.name !== undefined) set.name = body.name;
  if (body.category !== undefined) set.category = body.category as ItemCategoryEnum;
  if (body.subcategory !== undefined) set.subcategory = body.subcategory;
  if (body.brand !== undefined) set.brand = body.brand;
  if (body.colors !== undefined) set.colors = body.colors;
  if (body.formality !== undefined) set.formality = body.formality;
  if (body.warmth !== undefined) set.warmth = body.warmth;
  if (body.seasons !== undefined) set.seasons = body.seasons;
  if (body.styleGenres !== undefined) set.styleGenres = body.styleGenres;
  if (body.pattern !== undefined) set.pattern = body.pattern as ItemPatternEnum;
  if (body.material !== undefined) set.material = body.material;

  const [item] = await db
    .update(items)
    .set(set)
    .where(and(eq(items.id, itemId), eq(items.userId, userId)))
    .returning(itemFields);

  if (!item) return c.json({ error: "Item not found", code: "NOT_FOUND" }, 404);
  return c.json({ item });
});

// DELETE /items/:id — remove item and its stored images
itemsRoute.delete("/:id", requireAuth, async (c) => {
  const userId = c.get("userId");
  const itemId = c.req.param("id");

  const [item] = await db
    .select({
      id: items.id,
      originalImageUrl: items.originalImageUrl,
      cutoutImageUrl: items.cutoutImageUrl,
    })
    .from(items)
    .where(and(eq(items.id, itemId), eq(items.userId, userId)))
    .limit(1);

  if (!item) return c.json({ error: "Item not found", code: "NOT_FOUND" }, 404);

  // Delete storage objects; silently ignore missing-object errors
  await Promise.all([
    deleteObject(keyFromUrl(item.originalImageUrl)).catch(() => {}),
    item.cutoutImageUrl
      ? deleteObject(keyFromUrl(item.cutoutImageUrl)).catch(() => {})
      : Promise.resolve(),
  ]);

  await db.delete(items).where(eq(items.id, item.id));

  return c.body(null, 204);
});
