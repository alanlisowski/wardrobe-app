import { Queue } from "bullmq";
import IORedis from "ioredis";
import { env } from "../env.js";

const connection = new IORedis(env.redisUrl, { maxRetriesPerRequest: null });

export const CATALOG_QUEUE = "catalog-item";

export interface CatalogJobData {
  itemId: string;
  userId: string;
}

export const catalogQueue = new Queue<CatalogJobData>(CATALOG_QUEUE, { connection });
