import { Worker } from "bullmq";
import { db, items } from "@wardrobe/db";
import { eq } from "drizzle-orm";
import { env } from "./env.js";
import { runCatalog, type CatalogJobData } from "./catalog.js";

/**
 * Parse a redis:// URL into plain ConnectionOptions.
 *
 * BullMQ must receive a plain options object — NOT a pre-built IORedis instance.
 * When you hand BullMQ an IORedis instance it calls .duplicate() for the internal
 * blocking client, and that duplicate inherits whatever retryStrategy the parent
 * has. Passing plain options lets BullMQ create its own client with full
 * lifecycle control.
 */
function parseRedisUrl(rawUrl: string) {
  const u = new URL(rawUrl);
  return {
    host: u.hostname,
    port: Number(u.port) || 6379,
    ...(u.password ? { password: decodeURIComponent(u.password) } : {}),
    ...(u.pathname.length > 1 ? { db: Number(u.pathname.slice(1)) || 0 } : {}),
    maxRetriesPerRequest: null as null,
  };
}

/** Queue name for the item-cataloging pipeline. */
export const CATALOG_QUEUE = "catalog-item";

const worker = new Worker<CatalogJobData>(
  CATALOG_QUEUE,
  async (job) => {
    console.log(`processing job ${job.id}`, job.data);
    try {
      await runCatalog(job.data);
      console.log(`job ${job.id} ready (item ${job.data.itemId})`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(
        `job ${job.id} failed (item ${job.data.itemId}):`,
        err,
      );
      // SPEC §9: an item must never get stuck on "processing".
      // Mark it as failed even when BullMQ would otherwise retry.
      await db
        .update(items)
        .set({
          procStatus: "failed",
          procError: message.slice(0, 1000),
          updatedAt: new Date(),
        })
        .where(eq(items.id, job.data.itemId))
        .catch((dbErr) =>
          console.error(
            `failed to mark item ${job.data.itemId} as failed:`,
            dbErr,
          ),
        );
      throw err;
    }
  },
  { connection: parseRedisUrl(env.redisUrl) },
);

worker.on("failed", (job, err) =>
  console.error(`job ${job?.id} failed:`, err),
);
worker.on("error", (err) => console.error("worker error:", err));

/**
 * Log the startup line exactly once.
 *
 * Why not worker.on("ready"): BullMQ's Worker re-emits "ready" every time its
 * *blocking* ioredis client reconnects (worker.js:129). The blocking client is
 * proactively disconnected every drainDelay + 1 seconds (~6s) when idle, to
 * guard against stuck blocking commands (worker.js:429-431). ioredis then
 * auto-reconnects and fires "ready" again — so worker.on("ready") prints on a
 * timer, not on actual startup.
 *
 * waitUntilReady() resolves once, after the initial blocking-client connect,
 * which is the moment we actually care about.
 */
worker
  .waitUntilReady()
  .then(() =>
    console.log(`worker listening on queue "${CATALOG_QUEUE}"`),
  )
  .catch((err) => console.error("worker failed to initialise:", err));
