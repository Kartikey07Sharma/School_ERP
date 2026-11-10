# Employee Management API — Phase 6 Part 1

Base URL: `http://localhost:5000/api/v1`. Requests require the existing bearer token. `SCHOOL_ADMIN` operates within its authenticated institution. `SUPER_ADMIN` supplies `schoolId` as a query parameter. The API uses the existing permission system: `employees:read:*` for reads and `employees:manage:*` for writes. `TEACHER`, `STUDENT`, and `PARENT` have no employee permissions.

## Data model

An employee is an employment/personnel record, not a login. Creating an employee never creates a User, sets a password, or grants a role. Employees require an institution scoped employee ID, category (`TEACHING` or `NON_TEACHING`), name, phone, joining date, and a configured designation. Department is optional. Contact, address, emergency contact, birth date, and relieving date are supported. Employee statuses are `ACTIVE`, `INACTIVE`, `ON_LEAVE`, `TERMINATED`, and `RESIGNED`.

Employee departments are separate from the college academic `Department` used by programmes. Departments and designations are institution scoped, have unique names and codes within that institution, and can be deactivated. A designation may optionally restrict its category. TeacherProfile is a one-to-one extension for a teaching employee with qualifications, specialization, experience years, and status. Part 2 will define structured class/subject assignments.

## Endpoints

| Method | Route | Purpose |
|---|---|---|
| GET, POST | `/employees` | Paginated employee list and create |
| GET, PATCH | `/employees/:id` | Read/update an employee |
| GET, POST, PATCH | `/employees/departments` and `/employees/departments/:id` | List/create/update employee departments |
| GET, POST, PATCH | `/employees/designations` and `/employees/designations/:id` | List/create/update designations |
| GET, POST, PATCH | `/employees/:id/teacher-profile` | Read/create/update teacher profile |
| PUT, DELETE | `/employees/:id/user-account` | Link an eligible existing account / unlink it |

List supports `page`, `limit` (maximum 100), `search`, `category`, `status`, `departmentId`, `designationId`; user `schoolId` is permitted only for super admins. Unknown and cross-tenant employee/lookup/user IDs return 404. Invalid data returns 400; uniqueness conflicts return 409. Responses use the existing `{success,data}` envelope and errors use `{success:false,error:{code,message}}`.

Create example:

```json
{"employeeId":"EMP-001","category":"TEACHING","firstName":"Asha","lastName":"Rao","phone":"9876543210","joiningDate":"2026-06-01","designationId":"<designation-id>"}
```

Create a teacher profile with `POST /employees/<employee-id>/teacher-profile`:

```json
{"qualifications":"M.Sc Mathematics, B.Ed","specialization":"Algebra","experienceYears":6}
```

Linkage accepts an existing same institution active `TEACHER` account for teaching employees or `SCHOOL_ADMIN` account for non-teaching employees. The current role model has no general staff role, so other role assignments are not supported. The unique account link prevents one account from being assigned to multiple employees. Unlinking removes only the employee relationship; it leaves the User and credentials intact. Passwords and tokens are never returned.

## Tenant and integrity rules

All employee, department, designation, and account lookups are scoped by the resolved institution. Composite foreign keys prevent attaching related rows from another institution, including department, designation, and User. Database uniqueness protects employee IDs per institution and account linkage. Records use restrictive foreign keys to preserve history. No employee endpoint changes User status or role. Employee status and User status remain separate.

## Teacher academic assignments (Part 2)

School teaching assignments use the existing academic year, Class 1–12, section, subject, and class-subject mapping. Only active teaching employees with an active TeacherProfile may be assigned. The linked section must belong to the selected class and year, and the subject must have an active mapping to the class. Assignment records can be updated and deactivated; inactive rows remain as history. See [TEACHER_ASSIGNMENTS.md](TEACHER_ASSIGNMENTS.md) for routes, examples, filters, and college behavior.

## Limitations

The existing project has no general staff login role; employee linkage therefore accepts only compatible existing roles. No attendance, payroll, salary, leave approval, file upload/photo storage, or frontend is included. Employment records use the existing institution model, including schools and colleges. The college academic Department and FacultyCourseAssignment models remain unchanged.
