# Phase 7 Attendance QA

## Results

- Full project suite: **144 tests, 140 passed, 0 failed, 4 skipped**.
- Attendance unit and validation subset: **21 passed, 0 failed**.
- Student attendance PostgreSQL integration: **1 passed**.
- Staff attendance PostgreSQL integration: **1 passed**.
- Prisma schema validation and client generation passed.
- Migration status reported 17 migrations and an up-to-date local database.
- `git diff --check` passed.
- Phase 4 and Phase 5 database integration tests were attempted but blocked at their real-auth setup because Redis was unavailable. Their assertions did not run.
- No separate Phase 6 database integration test exists; employee and teacher unit/regression tests in the full suite passed.

## Coverage and security notes

The attendance PostgreSQL tests exercised school daily uniqueness, cross-tenant foreign-key rejection and concurrent duplicate insertion, plus staff daily uniqueness, tenant integrity, timestamp constraints and correction audit persistence. Attendance unit tests cover school roster and batch behavior, duplicate mapping, tenant selection, stale correction conflict handling, college faculty and registered-roster authorization inside the marking transaction, staff eligibility including userless employees, punches, audit, self-service, and bounded reporting filters.

School and college batch writes validate the complete eligible roster inside serializable transactions. College marking checks active course registrations and faculty assignment within that transaction. College session creation checks offering and faculty assignment in the same serializable transaction as session insertion. School marks retain their academic placement and enrollment references. Correction uses an expected prior status and creates its audit record in the same transaction.

The full suite includes authentication/RBAC, academic structure, student/parent, employee, teacher assignment, and CSV upload regressions. Four database integration files are opt-in and therefore skipped by plain `npm test`.

## Migration drift

The local database is migration-current. `prisma migrate diff` reports six remaining **index-name-only** differences on pre-existing academic tables: class subjects (2), sections (1), student academic enrollments (2), and subjects (1). No attendance table or attendance constraint drift was reported. These legacy naming differences were left untouched.

## Limitations and blockers

- Phase 4 and 5 integration suites require Redis for their authentication path; Redis was unavailable, so those integrations remain unverified in this run.
- Attendance database integration covers school and staff tables; college registration/faculty/second-session behavior has unit/schema coverage but no dedicated PostgreSQL integration fixture yet.
- Phase 7 retains documented product limits: no institution calendar/timezone configuration, timetable integration, configurable thresholds, or leave approval workflow. Dates use UTC date semantics; punch timestamps require explicit offsets.
- Existing reports aggregate persisted marks and do not infer attendance on unrecorded days.

## Commands run

```powershell
npm test
npx prisma validate
npx prisma generate
npx prisma migrate status
$env:RUN_ATTENDANCE_DB_TESTS='1'; node --test tests/attendance.database.integration.test.js
$env:RUN_STAFF_ATTENDANCE_DB_TESTS='1'; node --test tests/staff-attendance.database.integration.test.js
node --test tests/attendance.service.test.js tests/attendance.validation.test.js tests/staff-attendance.service.test.js tests/staff-attendance.validation.test.js
$env:RUN_PHASE4_DB_TESTS='1'; node --test tests/phase4.database.integration.test.js
$env:RUN_PHASE5_DB_TESTS='1'; node --test tests/phase5.database.integration.test.js
npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script
git diff --check
```
