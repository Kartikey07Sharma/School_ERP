# College Academic Structure API (Phase 4 Part 2)

Base URL: `http://localhost:5000/api/v1`. Authenticate using the existing bearer token. A college administrator is an existing `SCHOOL_ADMIN` user linked to a `COLLEGE` institution; no new role or auth system is introduced. Super admins pass `schoolId` in query parameters for reads and may provide it in create bodies. The server always resolves institution type from the persisted School record. Errors use the existing `success/error` envelope; invalid data returns 400, unsupported institution type returns 403, tenant-scoped missing records return 404, and conflicts return 409.

## Endpoint reference

| Resource | Endpoints | Notes |
|---|---|---|
| Departments | `GET/POST /departments`, `GET/PATCH /departments/:id`, `PATCH /departments/:id/status` | Search by name/code; paginated. Codes unique per college. |
| Programmes | `GET/POST /programmes`, `GET/PATCH /programmes/:id`, `PATCH /programmes/:id/status` | Requires department, degree type, duration, term mode and semester configuration. |
| Curriculum versions | `GET/POST /programmes/:programmeId/curricula`, `GET/PATCH /curricula/:id`, `PATCH /curricula/:id/status` | Version keeps its own structure. Used versions restrict edits. |
| Programme terms | `GET/POST /curricula/:curriculumId/terms`, `POST /curricula/:curriculumId/generate-terms`, `GET/PATCH /programme-terms/:id` | Semester numbers run 1..N; year-wise programmes use year terms. Generation is idempotent. |
| Courses | `GET/POST /courses`, `GET/PATCH /courses/:id`, `PATCH /courses/:id/status` | Credits/contact hours configurable; paginated search. |
| Curriculum mapping | `GET/POST /programme-terms/:termId/courses`, `PATCH/DELETE /curriculum-courses/:id` | Delete deactivates mapping. |
| Batches | `GET/POST /batches`, `GET/PATCH /batches/:id`, `PATCH /batches/:id/status` | Admission year and academic year are distinct. |
| Programme enrolments | `GET/POST /students/:studentId/programme-enrollments`, `GET /programme-enrollments`, `GET/PATCH /programme-enrollments/:id` | Student profile is reused; no portal account is created. |
| Semester enrolments | `GET/POST /programme-enrollments/:enrollmentId/semester-enrollments`, `GET/PATCH /semester-enrollments/:id` | Ties a planned term to an operating academic year. |
| Course offerings | `GET/POST /course-offerings`, `GET/PATCH /course-offerings/:id`, `PATCH /course-offerings/:id/status` | Offer a mapped course for a specific term and academic year. |
| Course registrations | `GET/POST /course-offerings/:offeringId/registrations`, `GET /students/:studentId/course-registrations`, `PATCH /course-registrations/:id` | Validates student term, offering term/year, capacity and duplicate registration. |
| Faculty assignments | `GET/POST /course-offerings/:offeringId/faculty`, `PATCH /faculty-assignments/:id/status` | Assigned user must be a same-college `TEACHER`. |

All collection routes accept `page` and `limit` (maximum 100); entity-specific filters include `status`, `search`, `programmeId`, `departmentId`, `curriculumVersionId`, `programmeTermId`, `academicYearId`, `batchId`, and `studentId` where applicable. Super-admin queries include `schoolId`.

## End-to-end B.Tech example

1. Create department: `POST /departments` with `{"name":"Computer Science and Engineering","code":"CSE"}`.
2. Create programme: `POST /programmes` with `{"name":"B.Tech Computer Science and Engineering","code":"BTECH-CSE","degreeType":"UNDERGRADUATE","durationYears":4,"semestersPerYear":2,"totalSemesters":8,"termMode":"SEMESTER","departmentId":"<department-id>"}`.
3. Create curriculum: `POST /programmes/<programme-id>/curricula` with `{"name":"Curriculum 2026","versionCode":"2026","effectiveFrom":"2026-06-01","durationYears":4,"semestersPerYear":2,"totalSemesters":8,"termMode":"SEMESTER"}`.
4. Generate terms: `POST /curricula/<curriculum-id>/generate-terms`. It returns Semesters 1–8 mapped to Years 1–4 in pairs. Repeating the call preserves existing term configuration.
5. Create courses using `POST /courses`, for example `{"name":"Data Structures","code":"CS201","courseType":"CORE","credits":4,"lectureHours":3,"tutorialHours":1,"practicalHours":0}`.
6. Map a course: `POST /programme-terms/<term-id>/courses` with `{"courseId":"<course-id>","isMandatory":true,"credits":4,"displayOrder":1}`.
7. Create cohort: `POST /batches` with `{"name":"B.Tech CSE 2026–2030","code":"CSE-2026","admissionYear":2026,"expectedGraduationYear":2030,"startDate":"2026-06-01","endDate":"2030-05-31","programmeId":"<programme-id>","curriculumVersionId":"<curriculum-id>"}`.
8. Create a student programme enrolment: `POST /students/<student-id>/programme-enrollments` with `{"programmeId":"<programme-id>","curriculumVersionId":"<curriculum-id>","batchId":"<batch-id>","registrationNumber":"CSE26-0001","admissionDate":"2026-06-01","expectedCompletionDate":"2030-05-31"}`.
9. Create the common academic year using `POST /academic-years` (shared by schools and colleges), for example `{"name":"2026-2027","startDate":"2026-06-01","endDate":"2027-05-31"}`.
10. Enrol in Semester 1 with `POST /programme-enrollments/<enrollment-id>/semester-enrollments` and `{"programmeTermId":"<semester-1-id>","academicYearId":"<academic-year-id>","enrollmentDate":"2026-06-01"}`.
11. Create `POST /course-offerings` with `{"code":"CS201-2026-S1-A","capacity":60,"curriculumCourseId":"<mapping-id>","programmeTermId":"<semester-1-id>","academicYearId":"<academic-year-id>"}`.
12. Register using `POST /course-offerings/<offering-id>/registrations` with `{"studentSemesterEnrollmentId":"<semester-enrollment-id>","registrationDate":"2026-06-01"}`.
13. Assign a same-college teacher with `POST /course-offerings/<offering-id>/faculty` and `{"userId":"<teacher-user-id>"}`.

For another valid structure, configure BCA with `durationYears: 3`, `semestersPerYear: 2`, and `totalSemesters: 6`, or use `termMode: "YEAR"` and omit semester counts for year-wise progression. Durations are configuration, not hardcoded by degree name.

## Separation and authorization checks

- As a school admin, `GET /departments` should return 403 `COLLEGE_ONLY`.
- As a college admin, `GET /classes` and `POST /classes/initialize` should return 403 `SCHOOL_ONLY`.
- As College A, fetch an ID belonging to College B; the result should be 404.
- Send a different `schoolId` as a school/college admin; it should return 400 `SCHOOL_ID_FORBIDDEN`.
- A super admin must select a target `schoolId`; selecting a SCHOOL for a college route or a COLLEGE for a school class route should return 403.

The existing project has no Postman collection. These steps can be transferred into the current Postman environment using its bearer token variable without adding a conflicting environment.

## Migration rollout

The Part 2 migration is ordered after `20261105090000_academic_structure` and references its `academic_years` and `students` tables. The school placement history constraint migration is `20261105100000_allow_school_enrollment_transfers`. Once PostgreSQL is available, first inspect with `npx prisma migrate status`, then apply pending migrations in order with `npx prisma migrate deploy`, regenerate with `npx prisma generate`, and run `npm test`. Do not use `migrate reset` or `db push` for this rollout.
