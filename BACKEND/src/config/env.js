require("dotenv").config();

const { z } = require("zod");

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(5000),
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(10).default(0),
  DATABASE_URL: z.string().url().refine(
    (value) => value.startsWith("postgres://") || value.startsWith("postgresql://"),
    "Must be a PostgreSQL connection URL",
  ),
  REDIS_URL: z.string().url().refine(
    (value) => value.startsWith("redis://") || value.startsWith("rediss://"),
    "Must be a Redis connection URL",
  ).default("redis://127.0.0.1:6379"),
  REDIS_CONNECT_TIMEOUT_MS: z.coerce.number().int().min(250).max(30000).default(3000),
  JWT_ACCESS_SECRET: z.string().min(32, "JWT_ACCESS_SECRET must contain at least 32 characters"),
  JWT_ACCESS_TTL_SECONDS: z.coerce.number().int().min(60).max(3600).default(600),
  JWT_ISSUER: z.string().min(1).default("school-erp-api"),
  JWT_AUDIENCE: z.string().min(1).default("school-erp-client"),
  REFRESH_TOKEN_TTL_SECONDS: z.coerce.number().int().min(3600).max(2592000).default(604800),
  AUTH_COOKIE_SECURE: z.enum(["true", "false"]).default(
    process.env.NODE_ENV === "production" ? "true" : "false",
  ).transform((value) => value === "true"),
  AUTH_LOGIN_RATE_LIMIT: z.coerce.number().int().min(1).max(100).default(10),
  AUTH_REFRESH_RATE_LIMIT: z.coerce.number().int().min(1).max(100).default(30),
  AUTH_RATE_LIMIT_WINDOW_SECONDS: z.coerce.number().int().min(60).max(86400).default(900),
  QUEUE_ATTEMPTS: z.coerce.number().int().min(1).max(20).default(3),
  QUEUE_COMPLETED_RETENTION: z.coerce.number().int().min(0).max(10000).default(1000),
  QUEUE_FAILED_RETENTION: z.coerce.number().int().min(0).max(10000).default(5000),
  QUEUE_WORKER_CONCURRENCY: z.coerce.number().int().min(1).max(100).default(5),
});

const result = envSchema.safeParse(process.env);
if (!result.success) {
  const fields = result.error.issues.map((issue) => issue.path.join(".")).join(", ");
  throw new Error(`Invalid environment configuration. Check required or invalid settings: ${fields}`);
}

module.exports = Object.freeze(result.data);
