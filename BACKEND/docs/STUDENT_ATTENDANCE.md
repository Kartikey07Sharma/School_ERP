# Student Attendance

This module has separate school and college workflows. It uses the existing institution, student, enrollment, teacher assignment, course offering, registration, and faculty assignment models. Attendance dates are accepted as `YYYY-MM-DD` and stored as PostgreSQL `DATE`; they do not depend on the server timezone.

## Workflows and status meanings

School attendance is one record per student and school day, attached to the student's academic year, grade, section, and enrollment valid on that date. It is not subject attendance. College attendance is one record per student for one particular course offering session; multiple sessions of the same offering on a date are supported.

`PRESENT` means attended; `LATE` means attended late; `ABSENT` means not attended; `LEAVE` means an approved or recorded leave. Summary percentages exclude LEAVE from the denominator; PRESENT and LATE count as attended and ABSENT as not attended. The summary includes overall counts and per-student percentages across the selected persisted attendance records. Since batch marking requires one status for every roster member, each conducted school day or college session has a complete mark set. It does not infer unrecorded school days or cancelled college sessions.

## Authorization and tenant scope

Requests use the existing bearer JWT. Ordinary users are scoped to `req.user.schoolId`; a client supplied `schoolId` is rejected for institution users. SUPER_ADMIN must supply an explicit `schoolId`, and institution type and all resource relationships are checked against it. A TEACHER can read or mark school attendance only for an active school teacher assignment, and college sessions only for an active faculty assignment to that course offering. SCHOOL_ADMIN can view attendance and correct records in the institution. Students and parents have no attendance permissions.

Composite foreign keys scope students, enrollments, academic year, placement, course offering, registration, session, and acting users to the same institution where those models expose suitable composite keys. Database unique constraints prevent duplicate daily school attendance and duplicate student attendance within a college session. Batch writes run in serializable transactions. Duplicate writes return HTTP 409 and never overwrite an existing mark.

Corrections are a separate administrator-only operation. It updates the current status and appends previous status, new status, reason, correcting user, and timestamp to `student_attendance_corrections`. Attendance is not deleted by correction.

## Models

- `SchoolStudentAttendance`: daily school marks with the historical enrollment and placement.
- `CollegeAttendanceSession`: a conducted class meeting for a course offering, with optional times and session type.
- `CollegeStudentAttendance`: session mark linked to the offering's registration.
- `StudentAttendanceCorrection`: append-only correction history shared by both workflows.

## API

All endpoints are under `/api/v1/attendance` and return `{ "success": true, "data": ... }` on success. Errors use the project's standard error format.

### School

- `GET /school/roster?academicYearId=...&gradeId=...&sectionId=...&date=2026-11-10`
- `POST /school/mark`
- `GET /school` (date, placement, student filters and pagination)
- `GET /school/students/:studentId`
- `GET /school/summary` and `GET /school/report`
- `PATCH /school/:attendanceId/correct`

Mark request (must include exactly one entry for every active student in the roster):

```json
{
  "academicYearId": "uuid",
  "gradeId": "uuid",
  "sectionId": "uuid",
  "date": "2026-11-10",
  "attendance": [
    { "studentId": "uuid", "status": "PRESENT" },
    { "studentId": "uuid", "status": "ABSENT", "remarks": "Not present" }
  ]
}
```

Correction body is `{ "status": "PRESENT", "reason": "Verified against the register" }`.

### College

- `POST /college/sessions`
- `GET /college/sessions` and `GET /college/sessions/:sessionId`
- `GET /college/sessions/:sessionId/roster`
- `POST /college/sessions/:sessionId/mark`
- `GET /college` and `GET /college/students/:studentId`
- `GET /college/summary` and `GET /college/report`
- `PATCH /college/:attendanceId/correct`

Session request:

```json
{
  "courseOfferingId": "uuid",
  "sessionDate": "2026-11-10",
  "startTime": "09:00",
  "endTime": "10:00",
  "sessionType": "THEORY",
  "sessionNumber": 1
}
```

Mark request is `{ "attendance": [{ "studentId": "uuid", "status": "PRESENT" }] }` and must include every active registration in the session roster. The server resolves the matching registration; the client cannot supply an unrelated offering or registration.

List filters accept `from`, `to`, `studentId`, and, as applicable, `academicYearId`, `gradeId`, `sectionId`, `courseOfferingId`, and `sessionId`. Pagination uses `page` and `limit` (maximum 100).

## Migration and tests

Apply the additive migration with the normal deployment migration process (`npx prisma migrate deploy`), then generate the client (`npx prisma generate`). Do not reset the database. Run the normal suite with `npm test`. Database integration checks depend on a configured PostgreSQL database and are not executed automatically by this module's unit tests.

## Known limitations

- The existing academic schema has no timetable, institution timezone, or college semester/course relation that provides a full historical effective-date ledger. Session dates are checked against the offering academic year; registrations are checked for active status and date eligibility.
- The report endpoints summarize persisted marks in the selected filter range. They do not calculate rates over unrecorded school days or provide configurable low-attendance thresholds.
- There is no endpoint to cancel an already created session; cancelled sessions are excluded from college attendance marking when their status is changed through an authorized data operation.
