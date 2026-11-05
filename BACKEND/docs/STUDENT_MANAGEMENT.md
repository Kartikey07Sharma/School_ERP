# Student Admission and Profile Management API

All endpoints use the `/api/v1/students` prefix and require the existing Bearer access token, except that the student self-profile route also requires a `STUDENT` role.

## Data model and admission rules

`Student` is a school-owned profile separate from the `User` login identity. It stores personal and contact details, one guardian's contact details, and an `ACTIVE`, `INACTIVE`, `GRADUATED`, `TRANSFERRED`, or `WITHDRAWN` status. `portalUserId` is an optional unique link to exactly one `STUDENT` User. The database enforces that the User and Student belong to the same institution, and prevents deleting a linked User. School deletion is restricted while students exist.

Migration `20261106090000_student_shared_portal_foundation` adds nullable profile/contact fields, makes legacy placement snapshots optional, adds `WITHDRAWN`, and enforces same-institution portal links. It preserves existing Student/User rows and does not convert or merge roles.

The legacy `className`, `section`, and `academicYear` snapshot fields remain readable and writable for compatibility with existing Phase 3 clients, but are optional for new profiles. Phase 4 academic enrollment and programme enrollment records remain authoritative for current placement. Profile fields also include city, state, postal code, blood group, and a separate guardian address. The project has no student-photo upload infrastructure, so no photo field or upload route is provided.

Admission number is a required string of at most 50 characters. It is trimmed identically during create and update, preserves leading zeroes, and is unique within a school through the database constraint on `(schoolId, admissionNumber)`. Reuse in a different school is allowed. A duplicate returns HTTP 409 with code `DUPLICATE_ADMISSION_NUMBER`.

Gender accepts exactly `Male`, `Female`, or `Other`. Dates use `YYYY-MM-DD`, must be real calendar dates, date of birth cannot be in the future, and admission date cannot precede date of birth. PATCH date changes are checked against the existing value of the other date so partial updates cannot leave an invalid date pair.

Optional `middleName`, `email`, `phone`, `guardianEmail`, `guardianAddress`, `city`, `state`, and `postalCode` accept `null` or an empty/whitespace-only string; empty strings are normalized to `null`. Emails must be valid and are stored lowercase. Phone numbers must contain 10–15 digits with an optional leading `+`. Blood group is one of `A+`, `A-`, `B+`, `B-`, `AB+`, `AB-`, `O+`, `O-`, or `UNKNOWN`.

School administrators always use the school in their authenticated identity; supplying `schoolId` is rejected, even when it matches their school. Super administrators must select an existing school: in the creation body for POST, or as `?schoolId=<uuid>` for list, detail, update, status, and deactivate operations. Repository reads and writes always include the resolved school ID. A record outside that school is returned as not found. The selected school is checked for every management operation; admission additionally requires an active school.

Only `SUPER_ADMIN` and `SCHOOL_ADMIN` receive student management permissions. Teachers currently have no permissions in the existing permission matrix. The authenticated shared `STUDENT` identity can use the self-service routes below. Lookup always uses the authenticated user's ID and institution; no self-service route accepts a student ID.

## Endpoints

| Method and path | Purpose | Roles |
| --- | --- | --- |
| `POST /` | Admit student | SUPER_ADMIN, SCHOOL_ADMIN |
| `GET /` | Search/list with pagination | SUPER_ADMIN, SCHOOL_ADMIN |
| `GET /me` | Read linked portal profile, including the one guardian contact | STUDENT |
| `PATCH /me` | Update explicitly allowed contact, address, and guardian fields | STUDENT |
| `GET /me/dashboard` | Read own student, guardian, institution, and current academic summary | STUDENT |
| `GET /me/academics` | Read institution-specific current academics and paged enrollment history | STUDENT |
| `GET /:id/portal-account` | Inspect the linked account's safe fields | SUPER_ADMIN, SCHOOL_ADMIN |
| `POST /:id/portal-account` | Create one shared student-parent account and link it atomically | SUPER_ADMIN, SCHOOL_ADMIN |
| `PUT /:id/portal-account` | Link an existing eligible STUDENT account by user ID | SUPER_ADMIN, SCHOOL_ADMIN |
| `PATCH /:id/portal-account/status` | Activate/deactivate portal login | SUPER_ADMIN, SCHOOL_ADMIN |
| `GET /:id` | Read profile | SUPER_ADMIN, SCHOOL_ADMIN |
| `PATCH /:id` | Update profile fields | SUPER_ADMIN, SCHOOL_ADMIN |
| `PATCH /:id/status` | Change status | SUPER_ADMIN, SCHOOL_ADMIN |
| `DELETE /:id` | Safely deactivate (sets INACTIVE) | SUPER_ADMIN, SCHOOL_ADMIN |

Authorization is implemented with `students:manage:any` / `students:manage:school` for writes and `students:read:any` / `students:read:school` for reads.

## Create example

```json
{
  "admissionNumber": "00127",
  "firstName": "Rahul",
  "middleName": null,
  "lastName": "Sharma",
  "dateOfBirth": "2015-05-21",
  "gender": "Male",
  "admissionDate": "2026-04-01",
  "className": "5",
  "section": "A",
  "academicYear": "2026-27",
  "email": null,
  "phone": null,
  "address": "12 Main Road",
  "guardianName": "A Sharma",
  "guardianRelationship": "Parent",
  "guardianPhone": "9876543210",
  "guardianEmail": "guardian@example.com"
}
```

For a super administrator, include `"schoolId": "<school-uuid>"`. Dates must follow the rules above; emails are normalized to lowercase. Optional contact/name and legacy placement fields may be omitted, sent as `null`, or sent as blank strings (which normalize to `null`). Unexpected fields such as `id`, `portalUserId`, `status`, and timestamps are rejected.

## List/search example

`GET /?page=1&limit=20&search=001&status=ACTIVE&className=5&section=A&academicYear=2026-27`

For super administrators, add `schoolId=<school-uuid>`. Search matches admission number and first, middle, or last name. Page size is limited to 100. The response contains `total`, `page`, `pageSize`, `totalPages`, and `records`.

## Update and status examples

`PATCH /<student-id>` accepts any non-empty subset of the create profile fields. `schoolId`, `portalUserId`, status, and internal IDs cannot be changed there. `PATCH /<student-id>/status` accepts `{ "status": "GRADUATED" }`. `DELETE /<student-id>` marks the record `INACTIVE`; records are never physically deleted.

## Shared student-parent account

The student and parent/guardian use the same credentials and authenticated identity. The system cannot tell which person is using it and makes no role distinction between them. The portal account uses the existing `STUDENT` role and is linked through `Student.portalUserId`; guardian email is contact information only and is never used to find or merge a User. `PARENT` remains in the database enum and existing accounts are not converted, but the generic user-creation API no longer creates `STUDENT` or `PARENT` accounts. New portal accounts must be created or linked through these Student-scoped endpoints.

To create a shared account, use `POST /<student-id>/portal-account` with `{ "email": "family@example.com", "password": "at-least-12-characters" }` and optional phone. For a super administrator, select the institution with `?schoolId=<uuid>`. The account's display name is copied from the Student profile, the password is bcrypt-hashed, and account creation plus linking run in one database transaction. The response contains only safe User fields. If an email already belongs to a User, no automatic match or merge occurs; explicitly link the intended eligible account with `PUT /<student-id>/portal-account` and `{ "userId": "<user-uuid>" }`.

`GET /<student-id>/portal-account` returns `{ studentId, linked, user }` with no password or authentication data. `PATCH /<student-id>/portal-account/status` accepts `{ "status": "INACTIVE" }` or `{ "status": "ACTIVE" }`; both transitions increment `authVersion`, invalidating existing access and refresh sessions. An inactive account cannot log in or refresh. The shared account can log in through the unchanged `/auth/login`, `/auth/refresh`, `/auth/logout`, and `/auth/me` endpoints. `GET /students/me` derives the Student from the authenticated User ID and tenant; portal users cannot select a Student ID to read another profile.

## Student and guardian self-service

`GET /api/v1/students/me` returns the linked Student profile, contact/address information, institution summary, status, and guardian contact fields. The guardian is part of this same profile; there is no separate guardian endpoint or identity. The student and guardian share one login and password, and the server cannot distinguish which person is using it.

`PATCH /api/v1/students/me` accepts a non-empty subset of `email`, `phone`, `address`, `city`, `state`, `postalCode`, `guardianName`, `guardianRelationship`, `guardianPhone`, `guardianEmail`, and `guardianAddress`. For example:

```json
{
  "phone": "+919876543210",
  "guardianEmail": "family-contact@example.com",
  "guardianAddress": "12 Main Road"
}
```

Emails and phone numbers follow the student profile validation rules. Unknown fields, including student/institution IDs, admission number, status, account linkage, and academic placement fields, are rejected. Student contact email and guardian email are profile contact values: changing either does not change the shared User's login email or create a User account.

`GET /api/v1/students/me/dashboard` returns a `student`, `institution`, `guardian`, and `academicSummary` object. The summary is based on Phase 4 enrollment records and is `null` when there is no academic placement. School students receive academic year, grade, section, status, and mapped subjects. College students receive programme, department, batch, curriculum version, selected semester enrollment and status; course registrations are included when present.

`GET /api/v1/students/me/academics?page=1&limit=20` returns the institution type, current placement, and paginated history. College responses also contain paginated course registrations. Page defaults to 1, limit defaults to 20, and limit is capped at 100. Current placement prefers an enrollment in the institution's current academic year, then an active enrollment, then the most recent record. Historical records retain their actual status. The institution type and all Student/academic ownership filters come from database relationships, never request parameters. No attendance, fees, examinations, or other out-of-scope data is returned.

These routes require an active Bearer-authenticated `STUDENT` account linked to a Student in the same institution. A missing link returns 404; unauthenticated requests return 401; wrong-role requests return 403; invalid query or update fields return 400.

## Errors and portal account limitations

Validation errors return HTTP 400 and `VALIDATION_ERROR`; duplicate admission numbers return HTTP 409 and `DUPLICATE_ADMISSION_NUMBER`; an inactive admission school returns HTTP 409 and `SCHOOL_INACTIVE`; unauthenticated requests return 401 (`UNAUTHENTICATED` or the applicable invalid-session code); permission failures return 403 (`FORBIDDEN`); missing or cross-school profiles and unlinked `/me` requests return 404 (`NOT_FOUND`). Super administrator requests without a selected school return 400 `SCHOOL_REQUIRED`; school administrators supplying a school ID receive 400 `SCHOOL_ID_FORBIDDEN`. Other Prisma uniqueness errors are left to the generic conflict handling and are not labeled as admission-number conflicts.

Student admission remains separate from portal-account creation. Creating or updating guardian details never creates a User. A linked User must be active, have the `STUDENT` role, belong to the same institution, and not be linked to another Student. Account email remains globally unique under the existing User constraint.
