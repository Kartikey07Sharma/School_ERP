const crypto = require("node:crypto");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const env = require("../config/env");
const AppError = require("../utils/AppError");

const ROTATE_SCRIPT = `
local current = redis.call('HGET', KEYS[1], 'tokenHash')
if not current then return 0 end
if current == ARGV[1] then
  if redis.call('HGET', KEYS[1], 'csrfHash') ~= ARGV[6] then return -2 end
  redis.call('SADD', KEYS[3], current)
  redis.call('EXPIRE', KEYS[3], ARGV[4])
  redis.call('HSET', KEYS[1], 'tokenHash', ARGV[2], 'csrfHash', ARGV[3])
  redis.call('EXPIRE', KEYS[1], ARGV[4])
  redis.call('EXPIRE', KEYS[2], ARGV[4])
  return 1
end
if redis.call('SISMEMBER', KEYS[3], ARGV[1]) == 1 then
  redis.call('DEL', KEYS[1])
  redis.call('DEL', KEYS[3])
  redis.call('SREM', KEYS[2], ARGV[5])
  return -1
end
return 0
`;

const REVOKE_ALL_SCRIPT = `
local sessions = redis.call('SMEMBERS', KEYS[1])
for _, sid in ipairs(sessions) do
  redis.call('DEL', ARGV[1] .. sid)
  redis.call('DEL', ARGV[2] .. sid)
end
redis.call('DEL', KEYS[1])
return #sessions
`;

const USER_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  email: true,
  phone: true,
  role: true,
  status: true,
  schoolId: true,
  authVersion: true,
  createdAt: true,
  updatedAt: true,
};
const DUMMY_PASSWORD_HASH = bcrypt.hashSync("invalid-account-password", 12);

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function safeEqual(left, right) {
  if (typeof left !== "string" || typeof right !== "string") return false;
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function ensureRedis(redis) {
  if (!redis.isReady()) {
    throw new AppError("Authentication service is temporarily unavailable", 503, "AUTH_STATE_UNAVAILABLE");
  }
  return redis.client;
}

async function safeRedis(operation) {
  try {
    return await operation();
  } catch {
    throw new AppError("Authentication service is temporarily unavailable", 503, "AUTH_STATE_UNAVAILABLE");
  }
}

function refreshTokenParts(token) {
  if (typeof token !== "string") return null;
  const match = /^([A-Za-z0-9_-]{20,32})\.([A-Za-z0-9_-]{40,60})$/.exec(token);
  return match ? { sid: match[1] } : null;
}

function createAuthService({ db, redis, bcryptLib = bcrypt, jwtLib = jwt, settings = env } = {}) {
  const database = db || require("../database/prisma");
  const redisManager = redis || require("../database/redis");
  function issueAccessToken(userId, sessionId, authVersion) {
    return jwtLib.sign(
      { sub: userId, sid: sessionId, ver: authVersion },
      settings.JWT_ACCESS_SECRET,
      {
        algorithm: "HS256",
        expiresIn: settings.JWT_ACCESS_TTL_SECONDS,
        issuer: settings.JWT_ISSUER,
        audience: settings.JWT_AUDIENCE,
      },
    );
  }

  async function storeSession(client, user, sid, refreshToken, csrfToken) {
    const sessionKey = `auth:session:${sid}`;
    const sessionsKey = `auth:user-sessions:${user.id}`;
    const execResult = await safeRedis(() => client.multi()
      .hset(sessionKey, {
        userId: user.id,
        tokenHash: sha256(refreshToken),
        csrfHash: sha256(csrfToken),
        authVersion: String(user.authVersion),
      })
      .expire(sessionKey, settings.REFRESH_TOKEN_TTL_SECONDS)
      .del(`auth:refresh-used:${sid}`)
      .sadd(sessionsKey, sid)
      .expire(sessionsKey, settings.REFRESH_TOKEN_TTL_SECONDS)
      .exec());
    if (!execResult || execResult.some(([error]) => error)) {
      throw new AppError("Authentication service is temporarily unavailable", 503, "AUTH_STATE_UNAVAILABLE");
    }
  }

  async function login(email, password) {
    const client = ensureRedis(redisManager);
    const normalizedEmail = email.trim().toLowerCase();
    let user;
    try {
      user = await database.user.findFirst({
        where: { email: { equals: normalizedEmail, mode: "insensitive" } },
        select: { ...USER_SELECT, password: true },
      });
    } catch {
      throw new AppError("Authentication service is temporarily unavailable", 503, "AUTH_STATE_UNAVAILABLE");
    }
    const matches = await bcryptLib.compare(password, user?.password || DUMMY_PASSWORD_HASH);
    let activeSchool = true;
    if (user && user.role !== "SUPER_ADMIN" && !user.schoolId) activeSchool = false;
    if (user && user.role !== "SUPER_ADMIN" && user.schoolId) {
      try {
        const school = await database.school.findUnique({ where: { id: user.schoolId }, select: { status: true } });
        activeSchool = school?.status === "ACTIVE";
      } catch {
        throw new AppError("Authentication service is temporarily unavailable", 503, "AUTH_STATE_UNAVAILABLE");
      }
    }
    if (!user || !matches || user.status !== "ACTIVE" || !activeSchool) {
      throw new AppError("Invalid email or password", 401, "INVALID_CREDENTIALS");
    }

    const sid = crypto.randomBytes(16).toString("base64url");
    const refreshToken = `${sid}.${crypto.randomBytes(32).toString("base64url")}`;
    const csrfToken = crypto.randomBytes(32).toString("base64url");
    await storeSession(client, user, sid, refreshToken, csrfToken);
    return {
      accessToken: issueAccessToken(user.id, sid, user.authVersion),
      refreshToken,
      csrfToken,
      expiresIn: settings.JWT_ACCESS_TTL_SECONDS,
      user: toPublicUser(user),
    };
  }

  async function refresh(refreshToken, csrfToken) {
    const client = ensureRedis(redisManager);
    const parts = refreshTokenParts(refreshToken);
    if (!parts) throw new AppError("Invalid or expired refresh token", 401, "INVALID_REFRESH_TOKEN");
    const sessionKey = `auth:session:${parts.sid}`;
    const session = await safeRedis(() => client.hgetall(sessionKey));
    if (!session.userId) throw new AppError("Invalid or expired refresh token", 401, "INVALID_REFRESH_TOKEN");
    const sessionsKey = `auth:user-sessions:${session.userId}`;
    let user;
    try {
      user = await database.user.findUnique({ where: { id: session.userId }, select: USER_SELECT });
    } catch {
      throw new AppError("Authentication service is temporarily unavailable", 503, "AUTH_STATE_UNAVAILABLE");
    }
    let activeSchool = true;
    if (user && user.role !== "SUPER_ADMIN" && !user.schoolId) activeSchool = false;
    if (user && user.role !== "SUPER_ADMIN" && user.schoolId) {
      try {
        const school = await database.school.findUnique({ where: { id: user.schoolId }, select: { status: true } });
        activeSchool = school?.status === "ACTIVE";
      } catch {
        throw new AppError("Authentication service is temporarily unavailable", 503, "AUTH_STATE_UNAVAILABLE");
      }
    }
    if (!user || user.status !== "ACTIVE" || !activeSchool || String(user.authVersion) !== session.authVersion) {
      await safeRedis(() => client.eval(REVOKE_ALL_SCRIPT, 1, `auth:user-sessions:${session.userId}`, "auth:session:", "auth:refresh-used:"));
      throw new AppError("Invalid or expired refresh token", 401, "INVALID_REFRESH_TOKEN");
    }

    const nextToken = `${parts.sid}.${crypto.randomBytes(32).toString("base64url")}`;
    const nextCsrfToken = crypto.randomBytes(32).toString("base64url");
    const rotation = await safeRedis(() => client.eval(
      ROTATE_SCRIPT,
      3,
      sessionKey,
      sessionsKey,
      `auth:refresh-used:${parts.sid}`,
      sha256(refreshToken),
      sha256(nextToken),
      sha256(nextCsrfToken),
      settings.REFRESH_TOKEN_TTL_SECONDS,
      parts.sid,
      sha256(csrfToken || ""),
    ));
    if (rotation === -1) {
      throw new AppError("Refresh token replay detected; sign in again", 401, "REFRESH_REPLAY_DETECTED");
    }
    if (rotation === -2) throw new AppError("A valid CSRF token is required", 403, "CSRF_REJECTED");
    if (rotation !== 1) throw new AppError("Invalid or expired refresh token", 401, "INVALID_REFRESH_TOKEN");

    return {
      accessToken: issueAccessToken(user.id, parts.sid, user.authVersion),
      refreshToken: nextToken,
      csrfToken: nextCsrfToken,
      expiresIn: settings.JWT_ACCESS_TTL_SECONDS,
      user: toPublicUser(user),
    };
  }

  async function logout(userId, sessionId) {
    const client = ensureRedis(redisManager);
    const sessionKey = `auth:session:${sessionId}`;
    const session = await safeRedis(() => client.hgetall(sessionKey));
    if (session.userId === userId) {
      await safeRedis(() => client.multi()
        .del(sessionKey)
        .del(`auth:refresh-used:${sessionId}`)
        .srem(`auth:user-sessions:${userId}`, sessionId)
        .exec());
    }
  }

  async function changePassword(userId, currentPassword, newPassword) {
    const client = ensureRedis(redisManager);
    let user;
    try {
      user = await database.user.findUnique({
        where: { id: userId },
        select: { id: true, password: true, status: true },
      });
    } catch {
      throw new AppError("Authentication service is temporarily unavailable", 503, "AUTH_STATE_UNAVAILABLE");
    }
    if (!user || user.status !== "ACTIVE" || !(await bcryptLib.compare(currentPassword, user.password))) {
      throw new AppError("Current password is incorrect", 400, "INVALID_CURRENT_PASSWORD");
    }

    const hashedPassword = await bcryptLib.hash(newPassword, 12);
    try {
      await database.user.update({
        where: { id: userId },
        data: { password: hashedPassword, authVersion: { increment: 1 } },
      });
    } catch {
      throw new AppError("Unable to update password", 503, "AUTH_STATE_UNAVAILABLE");
    }

    await safeRedis(() => client.eval(REVOKE_ALL_SCRIPT, 1, `auth:user-sessions:${userId}`, "auth:session:", "auth:refresh-used:"));
    return { success: true };
  }

  return { login, refresh, logout, changePassword };
}

function toPublicUser(user) {
  const { password, authVersion, ...safeUser } = user;
  return safeUser;
}

let defaultService;
function getDefaultService() {
  if (!defaultService) defaultService = createAuthService();
  return defaultService;
}

module.exports = {
  createAuthService,
  toPublicUser,
  refreshTokenParts,
  ROTATE_SCRIPT,
  REVOKE_ALL_SCRIPT,
  login: (...args) => getDefaultService().login(...args),
  refresh: (...args) => getDefaultService().refresh(...args),
  logout: (...args) => getDefaultService().logout(...args),
  changePassword: (...args) => getDefaultService().changePassword(...args),
};
