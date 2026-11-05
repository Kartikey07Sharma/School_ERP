process.env.DATABASE_URL ||= "postgresql://test:test@127.0.0.1:5432/test";
process.env.JWT_ACCESS_SECRET ||= "test-only-jwt-secret-with-at-least-32-characters";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createAuthService, toPublicUser } = require("../src/services/auth.service");
const { createRequireAuth, authorizePermission } = require("../src/middlewares/auth.middleware");
const { createAuthRateLimiter } = require("../src/middlewares/authRateLimit.middleware");
const { tokenResponse, COOKIE_NAME, COOKIE_OPTIONS } = require("../src/controllers/auth.controller");
const { createUserService } = require("../src/services/user.service");
const { scopeWhere } = require("../src/repositories/user.repository");
const schoolService = require("../src/services/school.service");
const { hasPermission, PERMISSIONS } = require("../src/constants/permissions");
const { loginSchema, changePasswordSchema } = require("../src/validations/auth.validation");
const { createUserSchema } = require("../src/validations/user.validation");
const { ROTATE_SCRIPT, REVOKE_ALL_SCRIPT } = require("../src/services/auth.service");

const settings = {
  JWT_ACCESS_SECRET: "test-only-jwt-secret-with-at-least-32-characters",
  JWT_ACCESS_TTL_SECONDS: 600,
  JWT_ISSUER: "test-issuer",
  JWT_AUDIENCE: "test-audience",
  REFRESH_TOKEN_TTL_SECONDS: 3600,
  AUTH_LOGIN_RATE_LIMIT: 10,
  AUTH_REFRESH_RATE_LIMIT: 30,
  AUTH_RATE_LIMIT_WINDOW_SECONDS: 900,
};

const baseUser = () => ({
  id: "user-1",
  firstName: "Sam",
  lastName: "School",
  email: "sam@example.test",
  phone: null,
  role: "SCHOOL_ADMIN",
  status: "ACTIVE",
  schoolId: "school-1",
  authVersion: 0,
  password: "stored-hash",
});

function fakeRedis() {
  const hashes = new Map();
  const sets = new Map();
  const values = new Map();
  const client = {
    hashes,
    sets,
    values,
    hgetall: async (key) => ({ ...(hashes.get(key) || {}) }),
    del: async (key) => Number(hashes.delete(key) || values.delete(key)),
    srem: async (key, value) => {
      const set = sets.get(key) || new Set();
      const removed = set.delete(value);
      sets.set(key, set);
      return Number(removed);
    },
    eval: async (script, keyCount, ...args) => {
      if (script === ROTATE_SCRIPT) {
        const [sessionKey, sessionsKey, usedKey, expectedHash, nextHash, csrfHash, , sid, expectedCsrfHash] = args;
        const session = hashes.get(sessionKey);
        if (!session?.tokenHash) return 0;
        if (session.tokenHash === expectedHash) {
          if (session.csrfHash !== expectedCsrfHash) return -2;
          const used = sets.get(usedKey) || new Set(); used.add(session.tokenHash); sets.set(usedKey, used);
          session.tokenHash = nextHash;
          session.csrfHash = csrfHash;
          return 1;
        }
        if (sets.get(usedKey)?.has(expectedHash)) {
          hashes.delete(sessionKey);
          sets.delete(usedKey);
          await client.srem(sessionsKey, sid);
          return -1;
        }
        return 0;
      }
      if (script === REVOKE_ALL_SCRIPT) {
        const [userSessionsKey, prefix, usedPrefix] = args;
        for (const sid of sets.get(userSessionsKey) || []) {
          hashes.delete(`${prefix}${sid}`);
          sets.delete(`${usedPrefix}${sid}`);
        }
        sets.delete(userSessionsKey);
        return 1;
      }
      return values.get(args[0]) || 1;
    },
    multi() {
      const commands = [];
      const pipeline = {};
      for (const method of ["hset", "expire", "sadd", "srem", "del"]) {
        pipeline[method] = (...args) => { commands.push([method, args]); return pipeline; };
      }
      pipeline.exec = async () => {
        for (const [method, args] of commands) {
          if (method === "hset") hashes.set(args[0], { ...(hashes.get(args[0]) || {}), ...args[1] });
          if (method === "sadd") {
            const set = sets.get(args[0]) || new Set(); set.add(args[1]); sets.set(args[0], set);
          }
          if (method === "srem") await client.srem(args[0], args[1]);
          if (method === "del") { hashes.delete(args[0]); sets.delete(args[0]); values.delete(args[0]); }
        }
        return commands.map(() => [null, 1]);
      };
      return pipeline;
    },
  };
  return { client, isReady: () => true };
}

function testAuthService({ user = baseUser(), ready = true } = {}) {
  const redis = fakeRedis();
  redis.isReady = () => ready;
  const db = {
    user: {
      findUnique: async () => user,
      findFirst: async () => user,
      update: async ({ data }) => { Object.assign(user, data.password ? { password: data.password } : {}); user.authVersion += data.authVersion.increment; return user; },
    },
    school: { findUnique: async () => ({ status: "ACTIVE" }) },
  };
  const service = createAuthService({
    db,
    redis,
    settings,
    bcryptLib: { compare: async () => true, hash: async () => "new-hash" },
    jwtLib: { sign: (claims) => `signed:${claims.sub}:${claims.sid}:${claims.ver}` },
  });
  return { service, redis, user };
}

test("login issues a short-lived bearer token, opaque refresh cookie value, and safe user", async () => {
  const { service } = testAuthService();
  const result = await service.login("SAM@example.test", "correct-password");
  assert.equal(result.expiresIn, 600);
  assert.match(result.refreshToken, /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
  assert.equal(result.user.email, "sam@example.test");
  assert.equal("password" in result.user, false);
  assert.equal("authVersion" in result.user, false);
});

test("inactive accounts cannot log in", async () => {
  const user = baseUser(); user.status = "INACTIVE";
  const { service } = testAuthService({ user });
  await assert.rejects(service.login(user.email, "password"), { code: "INVALID_CREDENTIALS", statusCode: 401 });
});

test("incorrect passwords are rejected", async () => {
  const redis = fakeRedis();
  const user = baseUser();
  const service = createAuthService({
    db: { user: { findUnique: async () => user, findFirst: async () => user }, school: { findUnique: async () => ({ status: "ACTIVE" }) } },
    redis,
    settings,
    bcryptLib: { compare: async () => false },
    jwtLib: { sign: () => "unused" },
  });
  await assert.rejects(service.login(user.email, "wrong-password"), { code: "INVALID_CREDENTIALS", statusCode: 401 });
});

test("refresh rotates atomically and reuse of the old token is detected", async () => {
  const { service } = testAuthService();
  const login = await service.login("sam@example.test", "password");
  await assert.rejects(service.refresh(login.refreshToken, "wrong-csrf"), { code: "CSRF_REJECTED", statusCode: 403 });
  const rotated = await service.refresh(login.refreshToken, login.csrfToken);
  assert.notEqual(rotated.refreshToken, login.refreshToken);
  const rotatedAgain = await service.refresh(rotated.refreshToken, rotated.csrfToken);
  await assert.rejects(service.refresh(login.refreshToken, login.csrfToken), {
    code: "REFRESH_REPLAY_DETECTED",
    statusCode: 401,
  });
  await assert.rejects(service.refresh(rotatedAgain.refreshToken, rotatedAgain.csrfToken), { code: "INVALID_REFRESH_TOKEN" });
});

test("logout revokes the Redis session", async () => {
  const { service, redis } = testAuthService();
  const login = await service.login("sam@example.test", "password");
  const sid = login.refreshToken.split(".")[0];
  await service.logout("user-1", sid);
  assert.deepEqual(await redis.client.hgetall(`auth:session:${sid}`), {});
});

test("Redis unavailable fails login closed", async () => {
  const { service } = testAuthService({ ready: false });
  await assert.rejects(service.login("sam@example.test", "password"), {
    code: "AUTH_STATE_UNAVAILABLE",
    statusCode: 503,
  });
});

test("change-password increments auth version and clears every user's session", async () => {
  const { service, redis, user } = testAuthService();
  await service.login(user.email, "current");
  await service.changePassword(user.id, "current", "a-new-long-password");
  assert.equal(user.authVersion, 1);
  assert.equal(redis.client.sets.has(`auth:user-sessions:${user.id}`), false);
});

test("authentication middleware rejects deactivated and cross-version tokens", async () => {
  const redis = fakeRedis();
  redis.client.hashes.set("auth:session:sid-12345678901234567890", { userId: "user-1", csrfToken: "csrf" });
  const handler = createRequireAuth({
    tokenVerifier: () => ({ sub: "user-1", sid: "sid-12345678901234567890", ver: 0 }),
    db: { user: { findUnique: async () => ({ ...baseUser(), status: "INACTIVE" }) } },
    redisModule: redis,
    settings,
  });
  let nextError;
  await handler({ get: (name) => name === "authorization" ? "Bearer token" : undefined }, {}, (error) => { nextError = error; });
  assert.equal(nextError.code, "SESSION_REVOKED");
});

test("authentication middleware rejects a stale auth version", async () => {
  const redis = fakeRedis();
  redis.client.hashes.set("auth:session:sid-12345678901234567890", { userId: "user-1", csrfHash: "csrf" });
  const handler = createRequireAuth({
    tokenVerifier: () => ({ sub: "user-1", sid: "sid-12345678901234567890", ver: 0 }),
    db: {
      user: { findUnique: async () => ({ ...baseUser(), authVersion: 1 }) },
      school: { findUnique: async () => ({ status: "ACTIVE" }) },
    },
    redisModule: redis,
    settings,
  });
  let nextError;
  await handler({ get: (name) => name === "authorization" ? "Bearer token" : undefined }, {}, (error) => { nextError = error; });
  assert.equal(nextError.code, "SESSION_REVOKED");
});

test("role permission matrix excludes school-wide and platform actions from members", () => {
  assert.equal(hasPermission("SUPER_ADMIN", "schools:manage"), true);
  assert.equal(hasPermission("SCHOOL_ADMIN", "users:read:school"), true);
  assert.equal(hasPermission("SCHOOL_ADMIN", "schools:manage"), false);
  for (const role of ["TEACHER", "STUDENT", "PARENT"]) assert.deepEqual(PERMISSIONS[role], []);
});

test("route permission middleware applies the documented role matrix", () => {
  const guard = authorizePermission("schools:manage");
  let denied;
  guard({ user: { role: "SCHOOL_ADMIN" } }, {}, (error) => { denied = error; });
  assert.equal(denied.code, "FORBIDDEN");
  let allowed = false;
  guard({ user: { role: "SUPER_ADMIN" } }, {}, (error) => { allowed = !error; });
  assert.equal(allowed, true);
});

test("school administrators cannot create accounts in another tenant or assign platform roles", async () => {
  const calls = [];
  const service = createUserService({
    users: { createUser: async (data) => { calls.push(data); return data; } },
    schools: { findSchoolById: async (id) => ({ id }) },
    bcryptLib: { hash: async () => "hash" },
  });
  const actor = { id: "admin", role: "SCHOOL_ADMIN", schoolId: "school-a" };
  const input = { firstName: "A User", email: "a@example.test", password: "long-enough-password", role: "TEACHER", schoolId: "school-b" };
  await assert.rejects(service.createUser(input, actor), { code: "TENANT_FORBIDDEN", statusCode: 403 });
  await assert.rejects(service.createUser({ ...input, role: "SUPER_ADMIN", schoolId: "school-a" }, actor), { code: "ROLE_ASSIGNMENT_FORBIDDEN" });
  assert.equal(calls.length, 0);
});

test("school-scoped user reads pass the authenticated actor to the repository", async () => {
  const calls = [];
  const service = createUserService({
    users: {
      findUserById: async (id, actor) => { calls.push({ id, actor }); return null; },
      findUsersBySchool: async (schoolId, actor) => { calls.push({ schoolId, actor }); return []; },
      findUsersBySchool: async (schoolId, actor) => { calls.push({ schoolId, actor }); return []; },
    },
    schools: { findSchoolById: async (id) => ({ id }) },
  });
  const actor = { id: "admin", role: "SCHOOL_ADMIN", schoolId: "school-a" };
  await assert.rejects(service.getUserById("user-from-b", actor), { statusCode: 404 });
  await assert.rejects(service.getUsersBySchool("school-b", actor), { code: "TENANT_FORBIDDEN", statusCode: 403 });
  await service.getUsersBySchool("school-a", actor);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].actor.schoolId, "school-a");
  assert.equal(calls[1].schoolId, "school-a");
});

test("broken School update service is now exported", () => {
  assert.equal(typeof schoolService.updateSchool, "function");
});

test("repository scope derives school filters from the authenticated actor", () => {
  assert.deepEqual(scopeWhere({ id: "admin", role: "SCHOOL_ADMIN", schoolId: "school-a" }), { schoolId: "school-a" });
  assert.deepEqual(scopeWhere({ id: "root", role: "SUPER_ADMIN", schoolId: null }), {});
  assert.deepEqual(scopeWhere({ id: "invalid", role: "TEACHER", schoolId: null }), { schoolId: "__no_tenant__" });
});

test("public user serialization never exposes password hashes", () => {
  const safe = toPublicUser(baseUser());
  assert.equal("password" in safe, false);
  assert.equal("authVersion" in safe, false);
});

test("refresh credentials are delivered only through the HttpOnly cookie", () => {
  const res = {
    cookie(name, value, options) { this.cookieValue = { name, value, options }; return this; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
  tokenResponse(res, {
    accessToken: "access-token",
    refreshToken: "opaque-refresh-token",
    csrfToken: "csrf-token",
    expiresIn: 600,
    user: { id: "user-1", role: "TEACHER" },
  });
  assert.equal(res.cookieValue.name, COOKIE_NAME);
  assert.equal(res.cookieValue.value, "opaque-refresh-token");
  assert.equal(res.cookieValue.options.httpOnly, true);
  assert.equal(res.cookieValue.options.sameSite, "strict");
  assert.equal(res.statusCode, 200);
  assert.equal(JSON.stringify(res.body).includes("opaque-refresh-token"), false);
  assert.equal(COOKIE_OPTIONS.path, "/api/v1/auth");
});

test("authentication schemas reject malformed login and weak or overlong passwords", () => {
  assert.equal(loginSchema.safeParse({ email: "bad", password: "" }).success, false);
  assert.equal(changePasswordSchema.safeParse({ currentPassword: "x", newPassword: "short" }).success, false);
  assert.equal(createUserSchema.safeParse({
    firstName: "Alex", email: "alex@example.test", password: "a-long-enough-password", role: "SUPER_ADMIN", schoolId: "a",
  }).success, false);
});

test("rate limit middleware fails closed when Redis is unavailable", async () => {
  const limiter = createAuthRateLimiter({ redisModule: { isReady: () => false }, settings, kind: "login" });
  let nextError;
  await limiter({ ip: "127.0.0.1", body: { email: "x@example.test" } }, {}, (error) => { nextError = error; });
  assert.equal(nextError.code, "AUTH_STATE_UNAVAILABLE");
});

test("rate limit middleware rejects a denied Redis decision", async () => {
  const limiter = createAuthRateLimiter({
    redisModule: { isReady: () => true, client: { eval: async () => 0 } },
    settings,
    kind: "login",
  });
  let nextError;
  await limiter({ ip: "127.0.0.1", body: { email: "x@example.test" } }, {}, (error) => { nextError = error; });
  assert.equal(nextError.code, "RATE_LIMITED");
  assert.equal(nextError.statusCode, 429);
});


test("user mutation methods preserve tenant authorization", async (t) => {
  const actor = {
    id: "admin-a",
    role: "SCHOOL_ADMIN",
    schoolId: "school-a",
  };

  const target = {
    id: "member-a",
    role: "TEACHER",
    schoolId: "school-a",
  };

  const calls = [];

  const service = createUserService({
    users: {
      findUserById: async (id, authenticatedActor) => {
        calls.push({ method: "findUserById", id, authenticatedActor });
        return target;
      },
      updateUser: async (...args) => {
        calls.push({ method: "updateUser", args });
        return target;
      },
      changeUserStatus: async (...args) => {
        calls.push({ method: "changeUserStatus", args });
        return target;
      },
      deleteUser: async (...args) => {
        calls.push({ method: "deleteUser", args });
        return target;
      },
    },
  });

  await t.test("updateUser passes actor and whitelists profile fields", async () => {
    calls.length = 0;

    await service.updateUser("member-a", {
      firstName: "Updated",
      lastName: "Teacher",
      email: "  TEACHER@EXAMPLE.TEST ",
      phone: "1234567890",
      role: "SUPER_ADMIN",
      schoolId: "school-b",
      status: "INACTIVE",
    }, actor);

    const mutation = calls.find((call) => call.method === "updateUser");

    assert.ok(mutation, "updateUser should be called");
    assert.equal(mutation.args[0], "member-a");
    assert.deepEqual(mutation.args[1], {
      firstName: "Updated",
      lastName: "Teacher",
      email: "teacher@example.test",
      phone: "1234567890",
    });
    assert.equal(mutation.args[2], actor);
  });

  await t.test("changeUserStatus passes actor to repository", async () => {
    calls.length = 0;

    await service.changeUserStatus("member-a", "INACTIVE", actor);

    const mutation = calls.find(
      (call) => call.method === "changeUserStatus"
    );

    assert.ok(mutation, "changeUserStatus should be called");
    assert.equal(mutation.args[0], "member-a");
    assert.equal(mutation.args[1], "INACTIVE");
    assert.equal(mutation.args[2], actor);
  });

  await t.test("deleteUser passes actor to repository", async () => {
    calls.length = 0;

    await service.deleteUser("member-a", actor);

    const mutation = calls.find((call) => call.method === "deleteUser");

    assert.ok(mutation, "deleteUser should be called");
    assert.equal(mutation.args[0], "member-a");
    assert.equal(mutation.args[1], actor);
  });
});

test("school administrators cannot mutate users outside their tenant", async () => {
  const actor = {
    id: "admin-a",
    role: "SCHOOL_ADMIN",
    schoolId: "school-a",
  };

  let mutationCalls = 0;

  const service = createUserService({
    users: {
      findUserById: async () => null,
      updateUser: async () => { mutationCalls++; },
      changeUserStatus: async () => { mutationCalls++; },
      deleteUser: async () => { mutationCalls++; },
    },
  });

  await assert.rejects(
    service.updateUser("member-from-school-b", { firstName: "Changed" }, actor),
    { statusCode: 404 }
  );

  await assert.rejects(
    service.changeUserStatus("member-from-school-b", "INACTIVE", actor),
    { statusCode: 404 }
  );

  await assert.rejects(
    service.deleteUser("member-from-school-b", actor),
    { statusCode: 404 }
  );

  assert.equal(mutationCalls, 0, "No mutation should run for an inaccessible user");
});
