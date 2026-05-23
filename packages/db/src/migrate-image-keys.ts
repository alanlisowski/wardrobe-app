/**
 * One-time migration: normalize image URL columns to bare object keys.
 *
 * Before: rows stored full URLs like http://192.168.1.15:9000/wardrobe/items/<id>/original
 *         or http://localhost:9000/wardrobe/items/<id>/cutout.png
 * After:  rows store plain keys like items/<id>/original
 *
 * The regex strips everything up to and including the bucket segment:
 *   https?://<host>/<bucket>/  →  (key)
 */
import { client, db } from "./index.js";
import { sql } from "drizzle-orm";

const result = await db.execute(sql`
  UPDATE items
  SET
    original_image_url = regexp_replace(original_image_url, '^https?://[^/]+/[^/]+/', ''),
    cutout_image_url = CASE
      WHEN cutout_image_url IS NOT NULL
      THEN regexp_replace(cutout_image_url, '^https?://[^/]+/[^/]+/', '')
      ELSE NULL
    END
  WHERE original_image_url LIKE 'http%'
     OR cutout_image_url   LIKE 'http%'
`);

console.log("Migrated image URL columns to bare object keys.", result);
await client.end();
