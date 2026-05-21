/** Centralised environment access for the worker. */
export const env = {
  redisUrl: process.env.REDIS_URL ?? "redis://localhost:6379",
  mlServiceUrl: process.env.ML_SERVICE_URL ?? "http://localhost:8000",
  anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? "",
  anthropicModel: process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6",
  s3Endpoint: process.env.S3_ENDPOINT ?? "http://localhost:9000",
  s3AccessKey: process.env.S3_ACCESS_KEY ?? "wardrobe",
  s3SecretKey: process.env.S3_SECRET_KEY ?? "changeme123",
  s3Bucket: process.env.S3_BUCKET ?? "wardrobe",
};
