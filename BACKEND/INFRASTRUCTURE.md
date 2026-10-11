# Backend infrastructure

## Prerequisites

- Node.js 24 LTS and npm (the lockfile is `package-lock.json`).
- PostgreSQL reachable using the existing `DATABASE_URL` format.
- Redis 7 or compatible for future session and background-job features.
- Docker Desktop with Compose for container-based development.

If `.env` does not already exist, copy `.env.example` to `.env` and set `DATABASE_URL` and `JWT_ACCESS_SECRET` to environment-specific values. Preserve an existing `.env`. The example contains placeholders only. Never commit `.env`.

## Run locally

From `BACKEND` in PowerShell:

```powershell
if (!(Test-Path .env)) { Copy-Item .env.example .env }
# Edit .env and set DATABASE_URL and JWT_ACCESS_SECRET for this environment.
npm ci
npm run dev
```

To use Redis in local development, start a Redis service and set `REDIS_URL` (default `redis://127.0.0.1:6379`). PostgreSQL is required at startup. Existing non-authentication APIs can start when Redis is absent, but authentication, refresh, logout, and protected routes fail closed with `503` when Redis session state is unavailable. Do not use authenticated routes until the auth migration has been applied.

## Docker Compose

Compose runs the Node application and a Redis 7 service with AOF persistence in the named `redis-data` volume. PostgreSQL stays external so this setup cannot silently replace the existing database. On Windows, when PostgreSQL runs on the host, use `host.docker.internal` in the Docker `DATABASE_URL`; `localhost` inside the app container points to that container. Ensure the database accepts connections from Docker Desktop.

For example, set values only in the current PowerShell session. Set `JWT_ACCESS_SECRET` to a stable random secret of at least 32 characters and store it securely (do not regenerate it on every start):

```powershell
$env:DATABASE_URL = 'postgresql://USER:PASSWORD@host.docker.internal:5432/school_erp?schema=public'
$env:JWT_ACCESS_SECRET = '<your stable random secret>'
$env:AUTH_COOKIE_SECURE = 'false' # local HTTP only; use true behind HTTPS
docker compose up --build -d
docker compose ps
Invoke-RestMethod http://localhost:5000/health/live
Invoke-RestMethod http://localhost:5000/health/ready
docker compose logs -f app redis
docker compose down
```

The Compose `app` waits for Redis's `PING` health check, and has its own HTTP readiness check. Redis is not published on a host port. `docker compose down` stops containers and preserves the named volume. Do not use `docker compose down -v`; that removes Redis state. No PostgreSQL volume or container is defined.

## Health checks

- `GET /health/live` reports that the process can answer HTTP.
- `GET /health/ready` checks PostgreSQL with `SELECT 1`. PostgreSQL is required for readiness. The response reports only whether Redis is available; Redis is currently optional for core API traffic. It does not return URLs, credentials, raw errors, or stack traces.
- Compose also checks Redis directly with `redis-cli ping`.

## Migrations

Migrations are deliberately not run by application startup or Compose. Before applying a migration, review it, back up the target database, and coordinate a maintenance window as appropriate. From `BACKEND`, with `DATABASE_URL` set for the intended database:

```powershell
npx prisma migrate status
npx prisma migrate deploy
```

Use `migrate deploy` once as a controlled release step, not once per replica. Never point these commands at a production database until the migration and backup have been reviewed.

## BullMQ foundation and future workers

`src/queues/index.js` exports `createQueue`, `createWorker`, `closeQueues`, and shared retry/retention defaults. Queue names and job payload types should be introduced with the real feature that needs them. No business queue or worker is started by the API process. When a feature adds workers, start a dedicated Node process that registers its processors through `createWorker`, handles `SIGINT`/`SIGTERM`, and calls `closeQueues()` before exit. Use idempotent processors; retries can execute a job more than once. Do not put credentials, tokens, or sensitive student/parent data in job payloads or logs. Tune these settings through `QUEUE_ATTEMPTS`, `QUEUE_COMPLETED_RETENTION`, `QUEUE_FAILED_RETENTION`, and `QUEUE_WORKER_CONCURRENCY`.

The app's Redis client is a single lazy ioredis connection. Connection retries are bounded; an unavailable Redis service does not block non-authentication APIs, while session-dependent endpoints fail closed. BullMQ uses its own managed ioredis connections because queues/workers need independent blocking connections; these are created only when a queue or worker is explicitly requested and are closed through `closeQueues()`.

Authentication routes, session rotation, the role matrix, tenant rules, migration details, and Postman scenarios are documented in [AUTHENTICATION.md](AUTHENTICATION.md). The application requires `JWT_ACCESS_SECRET` at startup. Run the auth migration as a controlled one-time deployment step before using auth routes; use the CLI documented in `AUTHENTICATION.md` to bootstrap the first platform administrator.

## Shutdown and troubleshooting

`SIGINT` and `SIGTERM` stop accepting HTTP connections, close queues/workers, close Redis, and disconnect Prisma. Docker Compose sends a termination signal and `init: true` forwards signals to the Node process.

- Readiness fails: verify `DATABASE_URL`, PostgreSQL availability, credentials, firewall rules, and host name from the app's network context.
- Redis shows unavailable: check `REDIS_URL` locally or `docker compose ps` and Redis logs in Compose. Core endpoints can still run without Redis today.
- Docker cannot start because `DATABASE_URL` is missing: set it in PowerShell before Compose. For a host database under Docker Desktop, replace `localhost` with `host.docker.internal`.
- Port conflict: set `$env:APP_PORT` before Compose or change `PORT` for local Node.
- Prisma schema changes: review migration SQL and apply through the controlled migration procedure above; application startup never migrates automatically.
