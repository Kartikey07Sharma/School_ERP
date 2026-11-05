# Authentication and authorization (Phase 2)

## Token and session contract

- `POST /api/v1/auth/login` accepts `{ "email", "password" }`. Success returns `{ success, data: { accessToken, tokenType, expiresIn, csrfToken, user } }` and sets a `refreshToken` cookie.
- The access token is a short-lived HS256 JWT (10 minutes by default). Send it only as `Authorization: Bearer <accessToken>`.
- The refresh token is opaque, has 7-day default Redis-backed lifetime, and is delivered only in an `HttpOnly`, `SameSite=Strict` cookie scoped to `/api/v1/auth`. It is never returned in JSON or stored in Redis as plaintext.
- `POST /api/v1/auth/refresh` rotates the cookie token atomically and returns the next access token and CSRF token. Send the current `csrfToken` as `X-CSRF-Token`; the HTTP client must retain the cookie jar. Reuse of an old refresh token revokes that session and requires another login.
- `POST /api/v1/auth/logout` requires a Bearer access token and, while the refresh cookie is present, the matching `X-CSRF-Token`. It revokes that session and clears the cookie.
- `GET /api/v1/auth/me` returns the current active account without password/auth-version fields.
- `PATCH /api/v1/auth/change-password` accepts `{ "currentPassword", "newPassword" }`; new passwords require 12–72 UTF-8 bytes and must differ from the current password. A successful change bcrypt-hashes the new password, increments the database auth version, revokes the user's sessions, and invalidates the access token used for the request. The shared student-parent identity has one password.

Redis-backed login/refresh throttling and all session validation fail closed with `503` when Redis is unavailable. Existing non-auth health liveness is still separate. Authenticated requests check current user status, role, tenant, and auth version in PostgreSQL, so database unavailability also prevents access. Passwords are bcrypt-hashed with cost 12. Login failures use a generic message to avoid account enumeration.

## Role-permission matrix

| Role | School management | User access | User creation | User status/deactivation |
|---|---|---|---|---|
| `SUPER_ADMIN` | Create, list, read, update, and change status for schools | Any school | `SCHOOL_ADMIN`, `TEACHER`; shared `STUDENT` accounts only through the Student portal-account API | Any account except self |
| `SCHOOL_ADMIN` | None | Own school only | `TEACHER`; shared `STUDENT` accounts only through the Student portal-account API | Own school members only; cannot manage another school admin or self |
| `TEACHER` | None | `/auth/me` only | None | None |
| `STUDENT` | None | `/auth/me` only | None | None |
| `PARENT` | None | `/auth/me` only | None | None |

No HTTP endpoint can assign `SUPER_ADMIN`. Initial platform administration is bootstrapped with the one-time CLI command below. User `DELETE` is a soft deactivation (`INACTIVE`) and increments `authVersion`; it does not erase school records. Changing a school's status increments `authVersion` for its users in the same database transaction, so suspension followed by reactivation cannot revive old credentials. School administrators' user queries always derive tenant scope from their verified account. A client-supplied school ID is only honored for a super-admin; for a school administrator a mismatch is forbidden.

The `PARENT` and `STUDENT` enum values remain for backward compatibility and existing accounts continue to authenticate. Generic `POST /users` cannot create either role. One shared student-parent identity is created or explicitly linked through the Student management API and uses the `STUDENT` role; the authentication system does not distinguish which family member is using those credentials.

## Database migration and first administrator

Migration `20261010120000_auth_phase2` makes `users.schoolId` nullable, adds `authVersion`, and enforces that non-`SUPER_ADMIN` users still have a school. Existing school IDs and user records are retained. Existing `SUPER_ADMIN` records may keep their current school assignment; application authorization uses the role, not that legacy association. New bootstrap super-admins have `schoolId = NULL`. Back up and review the database, then apply the migration once as a release operation:

```powershell
Set-Location BACKEND
npx prisma migrate status
npx prisma migrate deploy
```

After setting `DATABASE_URL` and `JWT_ACCESS_SECRET`, create the first platform administrator. Use an interactive password prompt so it is not written into shell history:

```powershell
$env:SUPER_ADMIN_EMAIL = 'admin@example.edu'
$env:SUPER_ADMIN_FIRST_NAME = 'Platform Admin'
$securePassword = Read-Host 'Initial admin password' -AsSecureString
$passwordPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)
try {
  $env:SUPER_ADMIN_PASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($passwordPointer)
  npm run auth:create-super-admin
} finally {
  Remove-Item Env:SUPER_ADMIN_PASSWORD -ErrorAction SilentlyContinue
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($passwordPointer)
}
Remove-Item Env:SUPER_ADMIN_EMAIL, Env:SUPER_ADMIN_FIRST_NAME -ErrorAction SilentlyContinue
```

The bootstrap command refuses to create another platform administrator if one already exists. It prints no password or email. Do not expose the bootstrap variables to logs or CI output.

## Environment settings

`JWT_ACCESS_SECRET` is required and must be at least 32 characters. Generate a unique random secret for each environment and store it in a secret manager. Other settings are optional and validated by `src/config/env.js`:

- `JWT_ACCESS_TTL_SECONDS` (default 600), `JWT_ISSUER`, `JWT_AUDIENCE`.
- `REFRESH_TOKEN_TTL_SECONDS` (default 604800).
- `AUTH_COOKIE_SECURE` (set `true` behind HTTPS; use `false` only for local HTTP development).
- `AUTH_LOGIN_RATE_LIMIT`, `AUTH_REFRESH_RATE_LIMIT`, `AUTH_RATE_LIMIT_WINDOW_SECONDS`.
- `TRUST_PROXY_HOPS` (default 0; set only to the exact number of trusted reverse-proxy hops).
- Existing `DATABASE_URL`, `REDIS_URL`, and `REDIS_CONNECT_TIMEOUT_MS` remain in use.

For Compose, set `DATABASE_URL` and `JWT_ACCESS_SECRET` in the PowerShell environment or backend `.env`; Compose passes them to the app and does not build in credentials. For local Postman testing over plain HTTP, use `AUTH_COOKIE_SECURE=false`. Production must use HTTPS and `AUTH_COOKIE_SECURE=true`.

## Postman collection setup and scenarios

Set collection base URL to `http://localhost:5000` for local testing (HTTPS in production). Configure Postman to retain cookies for that host. Add collection auth type **Bearer Token** with value `{{accessToken}}`. On successful login, a Post-response script can save the JSON values:

```javascript
const body = pm.response.json();
if (pm.response.code === 200) {
  pm.environment.set("accessToken", body.data.accessToken);
  pm.environment.set("csrfToken", body.data.csrfToken);
}
```

The refresh cookie is `HttpOnly`, so read it from Postman's cookie jar; never expect it in the JSON response. For refresh, logout, or other cookie-bearing auth mutations, send `X-CSRF-Token: {{csrfToken}}`. After refresh, run the same script to replace both environment variables. The Postman cookie jar receives the rotated refresh cookie automatically.

Positive scenarios:

1. Log in as an active account; expect `200`, a bearer token and CSRF token in JSON, a `Set-Cookie` refresh token with `HttpOnly`, and no `password` property.
2. Call `/api/v1/auth/me`; expect the active account and role without password/hash/authVersion.
3. Refresh with the cookie jar and current CSRF header; expect a new access token and a rotated cookie. The previous cookie value must not work again.
4. Change password with the current password and a strong, different new password; expect `200`; the old access token and refresh session then fail and login with the new password succeeds. A wrong current password or reusing the current password is rejected.
5. Log out; expect `200`, a cleared cookie, and rejection of the revoked access token.
6. As `SCHOOL_ADMIN`, list/create/read only users in the attached school. As `SUPER_ADMIN`, school-management routes and cross-school administration are allowed.

Negative scenarios:

1. Wrong password, unknown email, or inactive account: expect the same generic `401` login error.
2. Missing, malformed, expired, or revoked bearer token: expect `401`; authenticated requests while Redis is down: expect `503`.
3. Missing/bad CSRF header on refresh or cookie-bearing logout: expect `403`.
4. Replay a saved pre-rotation refresh cookie: expect `401` with `REFRESH_REPLAY_DETECTED`; that session must then require login.
5. Exceed login/refresh Redis rate limits: expect `429`; with Redis unavailable those endpoints return `503`, never bypass the limit.
6. A school admin requests another school's user, supplies a different `schoolId`, tries to assign `SUPER_ADMIN`, or manages another admin: expect `403` (a target outside their school may return scoped `404`).
7. A teacher/student/parent calls a user or school administration endpoint: expect `403`.
8. Change or status-deactivate an account with active tokens, then call `/me`: expect `401` because the database status/auth version is checked each time.
9. Submit invalid email, missing login password, weak change password, or a user-create `SUPER_ADMIN`, `STUDENT`, or `PARENT` role: expect `400` validation error. Shared student accounts are created through the Student API.

## Safe HTTP errors

Responses use `{ "success": false, "error": { "code", "message" } }`. Validation failures use `400`, invalid credentials/session use `401`, permission/CSRF failures use `403`, missing scoped records use `404`, duplicate keys use `409`, rate limits use `429`, dependency unavailability uses `503`, and unexpected internal errors use a generic `500`. Raw database errors, JWT secrets, passwords, tokens, and stack traces are not returned.
