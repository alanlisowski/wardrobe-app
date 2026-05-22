import { db, items } from "@wardrobe/db";
import { eq } from "drizzle-orm";
import { downloadObject, keyFromUrl, uploadObject } from "./storage.js";
import { callMlProcess } from "./ml.js";
import { tagItem } from "./vision.js";

export interface CatalogJobData {
  itemId: string;
  userId: string;
}

/** Hard ceiling for the entire cataloging pipeline: ML (60s) + vision (30s) + overhead. */
const CATALOG_TIMEOUT_MS = 90_000;

/**
 * The full cataloging pipeline for one item (SPEC §9):
 *   1. fetch the original photo from MinIO
 *   2. ML /process → cutout PNG, dominant colors, CLIP embedding
 *   3. upload the cutout back to MinIO
 *   4. Claude vision → structured tags
 *   5. persist everything; flip proc_status to "ready"
 *
 * Throws on any failure. The caller is responsible for marking the row
 * as "failed" so an item never gets stuck on "processing".
 */
export async function runCatalog(data: CatalogJobData): Promise<void> {
  let timeoutHandle: ReturnType<typeof setTimeout>;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutHandle = setTimeout(
      () => reject(new Error(`cataloging timed out after ${CATALOG_TIMEOUT_MS / 1000}s`)),
      CATALOG_TIMEOUT_MS,
    );
  });

  try {
    await Promise.race([runCatalogInner(data), timeoutPromise]);
  } finally {
    clearTimeout(timeoutHandle!);
  }
}

async function runCatalogInner(data: CatalogJobData): Promise<void> {
  const { itemId } = data;

  const [row] = await db
    .select({
      id: items.id,
      originalImageUrl: items.originalImageUrl,
    })
    .from(items)
    .where(eq(items.id, itemId))
    .limit(1);

  if (!row) throw new Error(`item ${itemId} not found`);

  const originalKey = keyFromUrl(row.originalImageUrl);
  const originalBuf = await downloadObject(originalKey);

  const ml = await callMlProcess(originalBuf, "item.jpg", "image/jpeg");

  const cutoutBuf = Buffer.from(ml.cutoutPngBase64, "base64");
  const cutoutUrl = await uploadObject(
    `items/${itemId}/cutout.png`,
    cutoutBuf,
    "image/png",
  );

  const tags = await tagItem(ml.cutoutPngBase64);

  await db
    .update(items)
    .set({
      cutoutImageUrl: cutoutUrl,
      colors: ml.colors,
      embedding: ml.embedding,
      name: tags.name,
      category: tags.category,
      subcategory: tags.subcategory,
      brand: tags.brand,
      formality: tags.formality,
      warmth: tags.warmth,
      seasons: tags.seasons,
      styleGenres: tags.styleGenres,
      pattern: tags.pattern,
      material: tags.material,
      procStatus: "ready",
      procError: null,
      updatedAt: new Date(),
    })
    .where(eq(items.id, itemId));
}
