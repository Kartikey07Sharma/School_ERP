const crypto = require("node:crypto");
const env = require("../config/env");
const AppError = require("../utils/AppError");

const RATE_SCRIPT = `
local first = redis.call('INCR', KEYS[1])
if first == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end
local second = redis.call('INCR', KEYS[2])
if second == 1 then redis.call('EXPIRE', KEYS[2], ARGV[1]) end
if first > tonumber(ARGV[2]) or second > tonumber(ARGV[3]) then return 0 end
return 1
`;

function createAuthRateLimiter({ redisModule: suppliedRedis, settings = env, kind = "login" } = {}) {
  const maxIp = kind === "refresh" ? settings.AUTH_REFRESH_RATE_LIMIT : settings.AUTH_LOGIN_RATE_LIMIT;
  const maxIdentity = kind === "refresh" ? settings.AUTH_REFRESH_RATE_LIMIT : Math.max(3, Math.floor(settings.AUTH_LOGIN_RATE_LIMIT / 2));

  return async (req, res, next) => {
    try {
      const redisModule = suppliedRedis || require("../database/redis");
      if (!redisModule.isReady()) {
        throw new AppError("Authentication service is temporarily unavailable", 503, "AUTH_STATE_UNAVAILABLE");
      }
      const ipHash = crypto.createHash("sha256").update(req.ip || "unknown").digest("hex");
      const identity = kind === "refresh"
        ? String(req.cookies?.refreshToken || "missing")
        : String(req.body?.email || "missing").trim().toLowerCase();
      const identityHash = crypto.createHash("sha256").update(identity).digest("hex");
      const allowed = await redisModule.client.eval(
        RATE_SCRIPT,
        2,
        `auth:ratelimit:${kind}:ip:${ipHash}`,
        `auth:ratelimit:${kind}:identity:${identityHash}`,
        settings.AUTH_RATE_LIMIT_WINDOW_SECONDS,
        maxIp,
        maxIdentity,
      );
      if (!allowed) {
        res.set?.("Retry-After", String(settings.AUTH_RATE_LIMIT_WINDOW_SECONDS));
        throw new AppError("Too many authentication attempts; try again later", 429, "RATE_LIMITED");
      }
      return next();
    } catch (error) {
      if (error instanceof AppError) return next(error);
      return next(new AppError("Authentication service is temporarily unavailable", 503, "AUTH_STATE_UNAVAILABLE"));
    }
  };
}

module.exports = { createAuthRateLimiter };
