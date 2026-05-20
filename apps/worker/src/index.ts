import { Worker } from "bullmq";
import IORedis from "ioredis";

const connection = new IORedis(
  process.env.REDIS_URL ?? "redis://localhost:6379",
  { maxRetriesPerRequest: null },
);

/** Queue name for the item-cataloging pipeline. */
export const CATALOG_QUEUE = "catalog-item";

const worker = new Worker(
  CATALOG_QUEUE,
  async (job) => {
    console.log(`processing job ${job.id}`, job.data);
    // TODO: cataloging pipeline — see SPEC section 9:
    //   1. call the ML service POST /process (bg removal + colors + CLIP)
    //   2. call Claude vision for structured tags
    //   3. write results to the items row, set proc_status = 'ready'
  },
  { connection },
);

worker.on("ready", () =>
  console.log(`worker listening on queue "${CATALOG_QUEUE}"`),
);
worker.on("failed", (job, err) =>
  console.error(`job ${job?.id} failed:`, err),
);
