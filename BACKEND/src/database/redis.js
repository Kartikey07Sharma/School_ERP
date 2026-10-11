const Redis = require("ioredis");
const env = require("../config/env");

const redis = new Redis(env.REDIS_URL, {
  lazyConnect: true,
  connectTimeout: env.REDIS_CONNECT_TIMEOUT_MS,
  maxRetriesPerRequest: 1,
  retryStrategy(attempt) {
    return attempt <= 3 ? Math.min(attempt * 500, 1500) : null;
  },
});

redis.on("error", () => {
  // Keep credentials and internal connection details out of logs.
  console.error("Redis connection error");
});

redis.on("ready", () => console.info("Redis connection ready"));
redis.on("close", () => console.warn("Redis connection closed"));

async function connectRedis() {
  if (redis.status === "ready") return true;
  try {
    await redis.connect();
    return true;
  } catch {
    console.warn("Redis unavailable; optional Redis-backed features are disabled");
    return false;
  }
}

function isReady() {
  return redis.status === "ready";
}

async function closeRedis() {
  if (redis.status === "end") return;
  if (redis.status === "wait") {
    redis.disconnect();
    return;
  }
  await redis.quit();
}

module.exports = { client: redis, connectRedis, isReady, closeRedis };
