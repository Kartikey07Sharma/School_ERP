const jwt = require("jsonwebtoken");
const env = require("../config/env");
const AppError = require("../utils/AppError");
const { hasPermission } = require("../constants/permissions");

function createRequireAuth({ tokenVerifier = jwt.verify, db, redisModule: suppliedRedis, settings = env } = {}) {
  const database = db;
  return async function requireAuth(req, res, next) {
    try {
      const activeRedis = suppliedRedis || require("../database/redis");
      const activeDb = database || require("../database/prisma");
      const header = req.get("authorization") || "";
      const match = /^Bearer ([A-Za-z0-9_.-]+)$/.exec(header);
      if (!match) throw new AppError("Authentication required", 401, "UNAUTHENTICATED");
      if (!activeRedis.isReady()) {
        throw new AppError("Authentication service is temporarily unavailable", 503, "AUTH_STATE_UNAVAILABLE");
      }

      let claims;
      try {
        claims = tokenVerifier(match[1], settings.JWT_ACCESS_SECRET, {
          algorithms: ["HS256"],
          issuer: settings.JWT_ISSUER,
          audience: settings.JWT_AUDIENCE,
        });
      } catch {
        throw new AppError("Invalid or expired access token", 401, "INVALID_ACCESS_TOKEN");
      }

      if (!claims || typeof claims.sub !== "string" || typeof claims.sid !== "string" || !Number.isInteger(claims.ver)) {
        throw new AppError("Invalid or expired access token", 401, "INVALID_ACCESS_TOKEN");
      }

      const client = activeRedis.client;
      let session;
      try {
        session = await client.hgetall(`auth:session:${claims.sid}`);
      } catch {
        throw new AppError("Authentication service is temporarily unavailable", 503, "AUTH_STATE_UNAVAILABLE");
      }
      if (!session.userId || session.userId !== claims.sub) {
        throw new AppError("Session is no longer valid", 401, "SESSION_REVOKED");
      }

      let user;
      try {
        user = await activeDb.user.findUnique({
          where: { id: claims.sub },
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            role: true,
            status: true,
            schoolId: true,
            authVersion: true,
          },
        });
      } catch {
        throw new AppError("Authentication service is temporarily unavailable", 503, "AUTH_STATE_UNAVAILABLE");
      }
      if (!user || user.status !== "ACTIVE" || user.authVersion !== claims.ver) {
        try {
          await client.del(`auth:session:${claims.sid}`);
          await client.del(`auth:refresh-used:${claims.sid}`);
          if (user) await client.srem(`auth:user-sessions:${user.id}`, claims.sid);
        } catch {
          throw new AppError("Authentication service is temporarily unavailable", 503, "AUTH_STATE_UNAVAILABLE");
        }
        throw new AppError("Session is no longer valid", 401, "SESSION_REVOKED");
      }

      if (user.role !== "SUPER_ADMIN" && user.schoolId) {
        let school;
        try {
          school = await activeDb.school.findUnique({ where: { id: user.schoolId }, select: { status: true } });
        } catch {
          throw new AppError("Authentication service is temporarily unavailable", 503, "AUTH_STATE_UNAVAILABLE");
        }
        if (!school || school.status !== "ACTIVE") {
          throw new AppError("Session is no longer valid", 401, "SESSION_REVOKED");
        }
      }
      if (user.role !== "SUPER_ADMIN" && !user.schoolId) {
        throw new AppError("Session is no longer valid", 401, "SESSION_REVOKED");
      }

      const { authVersion, ...publicUser } = user;
      req.auth = {
        userId: user.id,
        sessionId: claims.sid,
        csrfHash: session.csrfHash,
        authVersion,
      };
      req.user = publicUser;
      return next();
    } catch (error) {
      return next(error);
    }
  };
}

const requireAuth = createRequireAuth();

function authorize(...roles) {
  return (req, res, next) => {
    if (!req.user) return next(new AppError("Authentication required", 401, "UNAUTHENTICATED"));
    if (!roles.includes(req.user.role)) return next(new AppError("You do not have permission to perform this action", 403, "FORBIDDEN"));
    return next();
  };
}

function authorizePermission(...permissions) {
  return (req, res, next) => {
    if (!req.user) return next(new AppError("Authentication required", 401, "UNAUTHENTICATED"));
    if (!permissions.some((permission) => hasPermission(req.user.role, permission))) {
      return next(new AppError("You do not have permission to perform this action", 403, "FORBIDDEN"));
    }
    return next();
  };
}

module.exports = { requireAuth, createRequireAuth, authorize, authorizePermission };
