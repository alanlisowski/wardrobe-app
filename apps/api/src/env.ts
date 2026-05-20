/** Centralised environment access for the API. */
export const env = {
  port: Number(process.env.API_PORT ?? 3001),
  databaseUrl:
    process.env.DATABASE_URL ??
    "postgres://wardrobe:changeme@localhost:5432/wardrobe",
  redisUrl: process.env.REDIS_URL ?? "redis://localhost:6379",
  sessionSecret: process.env.SESSION_SECRET ?? "dev-secret",
  mlServiceUrl: process.env.ML_SERVICE_URL ?? "http://localhost:8000",
};
