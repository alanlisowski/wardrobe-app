/** Centralised environment access for the API. */
export const env = {
  port: Number(process.env.API_PORT ?? 3001),
  databaseUrl:
    process.env.DATABASE_URL ??
    "postgres://wardrobe:changeme@localhost:5432/wardrobe",
  redisUrl: process.env.REDIS_URL ?? "redis://localhost:6379",
  sessionSecret: process.env.SESSION_SECRET ?? "dev-secret",
  mlServiceUrl: process.env.ML_SERVICE_URL ?? "http://localhost:8000",
  s3Endpoint: process.env.S3_ENDPOINT ?? "http://localhost:9000",
  // Public base URL embedded in image URLs stored in the DB.
  // Set this to your LAN/public address so phones can resolve images.
  // Falls back to s3Endpoint when unset (works for local dev on the same machine).
  s3PublicUrl: process.env.MINIO_PUBLIC_URL ?? process.env.S3_ENDPOINT ?? "http://localhost:9000",
  s3AccessKey: process.env.S3_ACCESS_KEY ?? "wardrobe",
  s3SecretKey: process.env.S3_SECRET_KEY ?? "changeme123",
  s3Bucket: process.env.S3_BUCKET ?? "wardrobe",
};
