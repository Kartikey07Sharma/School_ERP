# Academic Structure API (Part 1)

Base URL: `http://localhost:5000/api/v1`. Send `Authorization: Bearer <access-token>` for all routes. School admins operate only on their authenticated institution. Super admins must pass `schoolId` in the query string for reads and may pass it in the query or create body. Academic years are shared by school and college institutions; school periods, Classes 1–12, sections, school subjects, mappings and school placements require `institutionType = SCHOOL` and return `403 SCHOOL_ONLY` for colleges.

## Routes

| Method | URL | Purpose |
| --- | --- | --- |
| GET/POST | `/academic-years` | List or create years |
| GET | `/academic-years/current` | Current year, or `data: null` |
| GET/PATCH | `/academic-years/:id` | Read/update year |
| PATCH | `/academic-years/:id/set-current` | Set current year transactionally |
| GET/POST | `/academic-years/:academicYearId/periods` | List/create terms and periods |
| GET/PATCH | `/academic-periods/:id` | Read/update period |
| GET | `/classes` | List configured grades |
| POST | `/classes/initialize` | Idempotently create Classes 1–12 |
| GET/PATCH | `/classes/:id` | Read/update grade description |
| GET/POST | `/sections` | List/create sections; filter with `academicYearId`, `gradeId`, `status` |
| GET/PATCH | `/sections/:id` | Read/update section |
| GET/POST | `/subjects` | List/create subjects; filters `search`, `status`, `subjectType`, `page`, `limit` |
| GET/PATCH | `/subjects/:id` | Read/update subject |
| GET/POST | `/classes/:gradeId/subjects` | List/assign mappings |
| GET | `/subjects/:subjectId/classes` | List classes using a subject |
| PATCH | `/classes/:gradeId/subjects/:subjectId` | Update mapping configuration |
| DELETE | `/classes/:gradeId/subjects/:mappingId` | Safely deactivate a mapping |
| GET/POST | `/students/:studentId/academic-enrollments` | List/create year placements |
| GET | `/academic-enrollments` | Filter placements by year, class, section, student or status |
| GET/PATCH | `/academic-enrollments/:id` | Read/update limited enrollment details |
| GET | `/students/:studentId/academic-history` | Chronological academic record |
| POST | `/academic-enrollments/:id/transfers` | Move an active placement within the year and retain history |

Create year example:

```json
{"name":"2026-2027","startDate":"2026-04-01","endDate":"2027-03-31"}
```

Create a period:

```json
{"name":"Term 1","code":"T1","sequence":1,"periodType":"TERM","startDate":"2026-04-01","endDate":"2026-09-30"}
```

Initialize grades with `POST /classes/initialize`; create a section with `{"gradeId":"<class-id>","academicYearId":"<year-id>","name":"A","code":"A"}`; create a subject with `{"name":"Mathematics","code":"MATH","subjectType":"CORE"}`; assign it using `POST /classes/<class-id>/subjects` with `{"subjectId":"<subject-id>","isMandatory":true}`. Enroll a student using `POST /students/<student-id>/academic-enrollments` with `{"academicYearId":"<year-id>","gradeId":"<class-id>","sectionId":"<section-id>","enrollmentDate":"2026-04-01"}`.

Successful responses use `{ "success": true, "data": ... }`. Errors use the existing `{ "success": false, "error": { "code": ..., "message": ... } }` shape. Validation failures return 400, unknown or cross-tenant IDs return 404, institution mismatch returns 403, and uniqueness conflicts map to 409.

For manual tenant checks, create the same year/subject code under two separate schools, authenticate as School A, then request School B IDs: they should return 404. Authenticate against a college account and call `POST /classes/initialize`: expect 403. For a super admin, explicitly pass `?schoolId=<school-id>`; college targets remain forbidden.

Existing student `className`, `section`, and `academicYear` values remain unchanged and are not backfilled because string-to-ID matching is not reliable. Use new enrollment endpoints for normalized history. The current project has no Postman collection, so this document is the manual API guide.

Transfer an active placement by sending `{"gradeId":"<new-class-id>","sectionId":"<new-section-id>","transferDate":"2026-09-01","rollNumber":"5B-01"}` to `/academic-enrollments/<active-enrollment-id>/transfers`. The previous row becomes `WITHDRAWN` with its leaving date, and the new row becomes `ACTIVE`. A partial unique database index permits only one active placement per student and academic year while retaining older rows.

## Scope notes

This implementation establishes the normalized year, period, grade, section, subject, mapping, and enrollment data model. Promotion is performed as a new enrollment in the next year; prior enrollment rows are retained. No automatic promotion, college structure, attendance, timetable, examinations, or fees are implemented.
