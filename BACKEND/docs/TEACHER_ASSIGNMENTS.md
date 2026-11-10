# Teacher Academic Assignments — Phase 6 Part 2

Base URL: `http://localhost:5000/api/v1`. Existing bearer authentication and tenant resolution apply. `SCHOOL_ADMIN` manages assignments within its authenticated institution; `SUPER_ADMIN` must select a target with `schoolId`. School assignment management uses existing `academics:manage:*` permissions. Teacher, student, and parent accounts cannot manage assignments.

## School teacher assignments

School assignments reuse `TeacherProfile`, `AcademicYear`, `Grade`, `Section`, `Subject`, and `ClassSubject`. No teacher login is needed. The TeacherProfile must be active and related to an active `TEACHING` Employee. The year, class, section, subject, and active class-subject mapping must belong to the target school; the section must match the selected class and year. Grades are restricted to Classes 1–12.

| Method | Route | Purpose |
|---|---|---|
| POST | `/school/teacher-assignments` | Create an assignment |
| GET | `/school/teacher-assignments` | Paginated list and filters |
| GET | `/school/teacher-assignments/:id` | Read assignment details |
| PATCH | `/school/teacher-assignments/:id` | Change teacher, year, class, section, or subject |
| PATCH | `/school/teacher-assignments/:id/status` | Activate or deactivate |

Create request:

```json
{"teacherProfileId":"<teacher-profile-id>","academicYearId":"<academic-year-id>","gradeId":"<class-id>","sectionId":"<section-id>","subjectId":"<subject-id>"}
```

Collection filters: `teacherProfileId`, `employeeId`, `academicYearId`, `gradeId`, `sectionId`, `subjectId`, `status`, and `search` (employee name or ID). Pagination uses `page` and `limit` (maximum 100). Sorting is allowlisted with `sortBy=createdAt|updatedAt|employeeId|lastName|academicYearId` and `sortOrder=asc|desc`. Super admins also supply `schoolId`.

Active duplicates for the same teacher profile, year, class, section, and subject return 409. Database partial uniqueness protects concurrent creates while permitting inactive history. Status values are `ACTIVE` and `INACTIVE`; deactivation does not delete the assignment. Errors use the common `{success:false,error:{code,message}}` envelope; cross-tenant resources return 404 and institution type mismatch returns 403 `SCHOOL_ONLY`.

## College faculty assignments

The existing `FacultyCourseAssignment` model and offering routes are reused; no duplicate faculty assignment model was added. Each new active faculty assignment requires an active same-college `TEACHER` User linked to an active teaching Employee and active TeacherProfile. The employee-to-user link remains optional for ordinary employee records, but is necessary to use the legacy college route, which identifies faculty by User.

| Method | Route | Purpose |
|---|---|---|
| POST | `/course-offerings/:offeringId/faculty` | Assign linked faculty to an offering |
| GET | `/course-offerings/:offeringId/faculty` | List offering assignments |
| GET | `/faculty-assignments/:id` | Read assignment and safe faculty/course context |
| PATCH | `/faculty-assignments/:id` | Change the linked faculty member or course offering |
| PATCH | `/faculty-assignments/:id/status` | Activate or deactivate, preserving history |

The existing create payload remains `{"userId":"<linked-teacher-user-id>"}`. List filters include `userId`, `employeeId`, `departmentId`, `programmeId`, `curriculumVersionId`, `programmeTermId`, `courseId`, `academicYearId`, `courseOfferingId`, `status`, and `search`. Academic year, term, course, curriculum, programme, and department are derived from the course offering's existing relations. `batchId` is rejected for faculty assignment filters: the schema has no offering-to-batch relationship, and matching a curriculum alone could return assignments for the wrong batch. Supporting this accurately would require an explicit offering/batch relationship.

College-only requests resolve institution type from the persisted institution record; school-only routes reject college tenants and the college API rejects school tenants. All queries remain tenant scoped. Assignment detail responses use safe nested User selects and never include passwords, tokens, or auth metadata.

## Database relationships

`SchoolTeacherAssignment` has restrictive composite foreign keys to the same institution's TeacherProfile, AcademicYear, Grade, Section, and Subject. The section foreign key also binds its Grade and AcademicYear. The database retains historical rows and a partial unique index prevents duplicate active tuples. College continues to use the existing `FacultyCourseAssignment` foreign keys to `User` and `CourseOffering`; the service enforces linked employee/profile eligibility without rewriting historical records.
