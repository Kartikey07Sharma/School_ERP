# Staff and Employee Attendance

Staff attendance is a separate workflow and separate set of tables from student attendance. It uses the existing `Employee` model and supports both SCHOOL and COLLEGE institutions, including teaching and non-teaching staff. Employees do not need a linked `User` account to be rostered or marked.

## Eligibility and statuses

New marks are accepted for employees with employment status `ACTIVE`. An employee with status `ON_LEAVE` may be marked only `LEAVE`. `INACTIVE`, `RESIGNED`, and `TERMINATED` employees cannot receive new marks. The attendance date must be on or after `joiningDate`, on or before `relievingDate` when set, and cannot be in the future. A disabled login does not change employment or attendance eligibility. Employment status and attendance status remain separate.

`PRESENT` and `LATE` count as attended. `ABSENT` counts as not attended. `LEAVE` is shown separately and excluded from the percentage denominator. Percentages are based on recorded employee marks in the requested period. The module does not infer missed working days or holidays; the current project has no institution calendar or holiday model.

## Daily records and punch timestamps

`StaffAttendance` stores one employee mark per institution and date, using a database unique constraint. It snapshots category, department ID, and designation ID at mark time so historical reports retain the placement context. Employee and snapshot relationships are institution-scoped with composite foreign keys.

Check-in and check-out are optional. They are stored as timezone-aware instants and accepted as ISO 8601 timestamps with an explicit offset, for example `2026-11-10T09:00:00+05:30`. Check-out requires check-in and cannot precede it. An existing punch cannot be silently replaced; administrators must use correction. No institution timezone configuration exists, so attendance dates are explicit `YYYY-MM-DD` values interpreted as UTC dates by the API. The institution-local working-day boundary cannot be inferred yet.

## Authorization and tenant scope

Existing `employees:read:*` and `employees:manage:*` permissions are reused. SCHOOL_ADMIN can view, mark, correct, and report for the authenticated institution. SUPER_ADMIN must provide an explicit `schoolId`; institution users cannot supply one. Employees and teachers with a linked, authenticated user account can use `/me` endpoints to read their own records. Self-service never accepts an employee ID and cannot mark or correct attendance. Users without a linked Employee receive 404 for self-service.

## Corrections and audit

Correction is administrator-only and requires a reason. It stores changed field names, previous/new status, previous/new punch instants, correcting user, and timestamp in `StaffAttendanceCorrection`, in the same transaction as the change. Audit rows are available from `GET /:attendanceId/audit`. Attendance and audit history are retained when the employee's employment status changes.

## API

All routes are under `/api/v1/attendance/staff` and return the existing `{ "success": true, "data": ... }` response shape.

- `GET /roster?date=2026-11-10&category=TEACHING&employeeStatus=ACTIVE&departmentId=...`
- `POST /mark`
- `GET /` (date/range/month and attendance filters, paginated)
- `GET /:employeeId` (employee history; admin only)
- `PATCH /:attendanceId/check-in`
- `PATCH /:attendanceId/check-out`
- `PATCH /:attendanceId/correct`
- `GET /:attendanceId/audit`
- `GET /summary` and `GET /report`
- `GET /me` and `GET /me/summary` (linked employee only)

Batch mark example:

```json
{
  "attendanceDate": "2026-11-10",
  "attendance": [
    { "employeeId": "uuid", "status": "PRESENT", "checkInAt": "2026-11-10T09:00:00+05:30" },
    { "employeeId": "uuid", "status": "LEAVE", "remarks": "Leave recorded" }
  ]
}
```

Only SUPER_ADMIN includes `schoolId` in the request. A late check-out is recorded with `PATCH /:attendanceId/check-out` and `{ "checkOutAt": "2026-11-10T17:00:00+05:30" }`. Correction example:

```json
{
  "status": "LATE",
  "checkInAt": "2026-11-10T09:20:00+05:30",
  "reason": "Verified against the signed entry register"
}
```

Date filters accept `date`, `month=YYYY-MM`, or `from` and `to`. The summary includes status totals, overall and per-employee percentages, teaching/non-teaching breakdown, department breakdown, and—on a single date—eligible and unmarked employee counts. `LEAVE` is excluded from each percentage denominator.

## Migration and testing

The additive migration is `20261110110000_staff_attendance`. Apply with `npx prisma migrate deploy`, then run `npx prisma generate`. Run unit/validation tests with `npm test`. PostgreSQL integrity tests are opt-in:

```powershell
$env:RUN_STAFF_ATTENDANCE_DB_TESTS='1'
node --test tests/staff-attendance.database.integration.test.js
```

## Known limitations

- No holiday, institution calendar, or working-day policy exists, so percentage calculations use recorded marks rather than expected workdays.
- There is no configurable late threshold; administrators select `LATE` when marking.
- Institution timezone settings do not exist. The date is client-selected as `YYYY-MM-DD`, while punch timestamps require an explicit offset.
- The module does not implement leave approval or management; `LEAVE` is only an attendance status.
