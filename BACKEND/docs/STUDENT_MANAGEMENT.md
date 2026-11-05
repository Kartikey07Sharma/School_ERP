# Student Admission and Profile Management API

All endpoints use the `/api/v1/students` prefix and require the existing Bearer access token, except that the student self-profile route also requires a `STUDENT` role.

## Data model and admission rules

`Student` is a school-owned profile separate from the `User` login identity. It stores admission and personal details, class/section/year, contact information, guardian details, and an `ACTIVE`, `INACTIVE`, `GRADUATED`, or `TRANSFERRED` status. `portalUserId` is an optional unique link to one `User`; the associated SQL foreign key uses `ON DELETE SET NULL`. School deletion is restricted while students exist.

Admission number is a required string of at most 50 characters. It is trimmed identically during create and update, preserves leading zeroes, and is unique within a school through the database constraint on `(schoolId, admissionNumber)`. Reuse in a different school is allowed. A duplicate returns HTTP 409 with code `DUPLICATE_ADMISSION_NUMBER`.

Gender accepts exactly `Male`, `Female`, or `Other`. Dates use `YYYY-MM-DD`, must be real calendar dates, date of birth cannot be in the future, and admission date cannot precede date of birth. PATCH date changes are checked against the existing value of the other date so partial updates cannot leave an invalid date pair.

Optional `middleName`, `email`, `phone`, and `guardianEmail` accept `null` or an empty/whitespace-only string; empty strings are normalized to `null`. Emails must be valid and are stored lowercase. Non-empty optional phone values are trimmed and limited to 30 characters.

School administrators always use the school in their authenticated identity; supplying `schoolId` is rejected, even when it matches their school. Super administrators must select an existing school: in the creation body for POST, or as `?schoolId=<uuid>` for list, detail, update, status, and deactivate operations. Repository reads and writes always include the resolved school ID. A record outside that school is returned as not found. The selected school is checked for every management operation; admission additionally requires an active school.

Only `SUPER_ADMIN` and `SCHOOL_ADMIN` receive student management permissions. Teachers currently have no permissions in the existing permission matrix. Students and parents cannot use management routes, and PARENT has no portal endpoint in this phase. The authenticated `STUDENT` user can call `GET /api/v1/students/me`; lookup uses that user's ID and school ID and returns only the linked Student profile, or 404 if none is linked. There is no student ID parameter on this route.

## Endpoints

| Method and path | Purpose | Roles |
| --- | --- | --- |
| `POST /` | Admit student | SUPER_ADMIN, SCHOOL_ADMIN |
| `GET /` | Search/list with pagination | SUPER_ADMIN, SCHOOL_ADMIN |
| `GET /me` | Read linked portal profile | STUDENT |
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

For a super administrator, include `"schoolId": "<school-uuid>"`. Dates must follow the rules above; emails are normalized to lowercase. Optional contact/name fields may be omitted, sent as `null`, or sent as blank strings (which normalize to `null`). Unexpected fields such as `id`, `portalUserId`, `status`, and timestamps are rejected.

## List/search example

`GET /?page=1&limit=20&search=001&status=ACTIVE&className=5&section=A&academicYear=2026-27`

For super administrators, add `schoolId=<school-uuid>`. Search matches admission number and first, middle, or last name. Page size is limited to 100. The response contains `total`, `page`, `pageSize`, `totalPages`, and `records`.

## Update and status examples

`PATCH /<student-id>` accepts any non-empty subset of the create profile fields. `schoolId`, `portalUserId`, status, and internal IDs cannot be changed there. `PATCH /<student-id>/status` accepts `{ "status": "GRADUATED" }`. `DELETE /<student-id>` marks the record `INACTIVE`; records are never physically deleted.

## Errors and portal account limitations

Validation errors return HTTP 400 and `VALIDATION_ERROR`; duplicate admission numbers return HTTP 409 and `DUPLICATE_ADMISSION_NUMBER`; an inactive admission school returns HTTP 409 and `SCHOOL_INACTIVE`; unauthenticated requests return 401 (`UNAUTHENTICATED` or the applicable invalid-session code); permission failures return 403 (`FORBIDDEN`); missing or cross-school profiles and unlinked `/me` requests return 404 (`NOT_FOUND`). Super administrator requests without a selected school return 400 `SCHOOL_REQUIRED`; school administrators supplying a school ID receive 400 `SCHOOL_ID_FORBIDDEN`. Other Prisma uniqueness errors are left to the generic conflict handling and are not labeled as admission-number conflicts.

The optional one-to-one portal relationship and `/me` read path are present. Account creation, invitation, and linking are deferred because the project has no controlled linking/invitation flow. Admission does not create a login or infer one from guardian contact details. Any future administrator-authorized linking operation must verify the User is active, has the `STUDENT` role, belongs to the same school, and is not already linked to another Student; it must also respect global User email uniqueness and must not create a default password.
