# Student CSV Import

Student CSV Import admits many students in one request while reusing the Part 1 Student validation and tenant rules. It provides a dry-run preview and a separate partial-success import. It does not create portal accounts, passwords, or admission numbers.

## CSV template

Required columns:

`admissionNumber,firstName,lastName,dateOfBirth,gender,admissionDate,address,guardianName,guardianRelationship,guardianPhone`

Optional columns:

`middleName,className,section,academicYear,email,phone,guardianEmail,guardianAddress,city,state,postalCode,bloodGroup`

`className`, `section`, and `academicYear` are accepted as optional legacy snapshots. Phase 4 enrollment records remain authoritative for current placement.

Columns may be in any order. Optional columns may be omitted. Header comparison ignores capitalization and whitespace, so `First Name` matches `firstName`. Unrecognized names, duplicate normalized names, missing required columns, and empty headers reject the entire file. Internal fields such as `schoolId`, `id`, `portalUserId`, and `status` are not permitted.

```csv
admissionNumber,firstName,middleName,lastName,dateOfBirth,gender,admissionDate,className,section,academicYear,email,phone,address,guardianName,guardianRelationship,guardianPhone,guardianEmail
000101,Rahul,,Sharma,2010-05-12,Male,2026-04-01,10,A,2026-27,rahul@example.com,9876543210,"Dehradun, Uttarakhand",Ramesh Sharma,Father,9876501234,ramesh@example.com
000102,Priya,,Verma,2011-08-20,Female,2026-04-01,9,B,2026-27,priya@example.com,9876543211,Dehradun,Suresh Verma,Father,9876501235,suresh@example.com
000103,Aman,Kumar,Singh,2010-02-15,Male,2026-04-01,10,A,2026-27,,,,Anil Singh,Father,9876501236,
```

CSV parsing supports quoted commas, escaped quotes, CRLF/LF newlines, and quoted multiline fields. Blank physical lines are ignored. Header-only files are rejected. The first data record normally reports row 2; for a multiline record, the reported row is the physical line where that record starts.

## Upload restrictions and validation

Uploads use in-memory storage and are not written to disk. The file field must be named `file`; extension must be `.csv` (case-insensitive), and MIME type must be `text/csv`, `application/csv`, or `application/vnd.ms-excel`. The parser also checks UTF-8 validity and CSV quoting/structure. XLS/XLSX and other formats are unsupported.

Default maximums are 5 MB and 5,000 data rows. They can be changed with positive integer environment values `STUDENT_CSV_MAX_FILE_SIZE_MB` (accepted range 1–50) and `STUDENT_CSV_MAX_ROWS` (accepted range 1–20,000). Missing or out-of-range values use the defaults.

Rows reuse the Part 1 Student create schema: required fields, exactly `Male`, `Female`, or `Other` (case-sensitive), valid `YYYY-MM-DD` dates, no future date of birth, admission date on/after birth date, email validation and lowercase normalization, optional blank values to `null`, and the 50-character trimmed string admission number. Leading zeroes are preserved. Invalid rows are never inserted.

## Authentication and school context

Both endpoints require a Bearer access token and the existing `students:manage` permission. Only `SCHOOL_ADMIN` and `SUPER_ADMIN` have that permission. Teachers, Students, and Parents are forbidden.

- `SCHOOL_ADMIN`: the school is derived from the authenticated user. Supplying `schoolId` in the query or multipart body is rejected.
- `SUPER_ADMIN`: must select an existing school with `?schoolId=<uuid>`. The multipart body may contain only the `file`; school selection is not accepted from the body or CSV.
- The selected school must be active, matching the admission rules in Part 1.

Every existing-number lookup and bulk insert uses this resolved school ID. Matching admission numbers in other schools do not conflict. Existing students, including inactive ones, still reserve their admission numbers.

## Endpoints

### Preview (dry run)

`POST /api/v1/students/import/preview`

### Import

`POST /api/v1/students/import`

Both use `multipart/form-data` with one required file field named `file`. A super administrator includes `schoolId` in the query string.

```sh
curl -X POST 'https://erp.example.test/api/v1/students/import/preview?schoolId=<school-uuid>' \
  -H 'Authorization: Bearer <access-token>' \
  -F 'file=@students.csv;type=text/csv'
```

For a school administrator, omit `schoolId`:

```sh
curl -X POST 'https://erp.example.test/api/v1/students/import' \
  -H 'Authorization: Bearer <access-token>' \
  -F 'file=@students.csv;type=text/csv'
```

## Duplicate policy and partial success

All rows sharing a normalized admission number in the uploaded CSV are marked duplicate and skipped; the importer does not select a winner. Existing admission numbers are fetched in school-scoped batches before import. Both checks use the trimmed string, so leading zeroes remain significant (`001` differs from `1`). Invalid rows can also carry duplicate errors; the preview `invalidRows` and `duplicateRows` counts may overlap.

Preview inserts, updates, and deletes nothing. It returns `totalRows`, `validRows`, `invalidRows`, `duplicateRows`, and `readyToImport`. A row is valid/ready only when it has no validation or duplicate errors. Results contain only the CSV row number, original admission number, status, and errors; they do not echo addresses or guardian details.

Import inserts eligible records in batches of 250 using Prisma `createMany`. Invalid, in-file duplicate, and existing-school duplicate rows are skipped. A database admission-number race is isolated by splitting the failed batch until the conflicting row is identified; other rows can still be inserted. An unexpected database failure marks the affected and not-yet-attempted rows with a generic database error and stops further batches. Existing records are never updated. The database composite unique constraint remains authoritative. When a batch has an unexpected database failure, the API returns HTTP 207 with `success: false`, a `STUDENT_IMPORT_DATABASE_FAILURE` error, and the complete row report, so earlier committed batches are visible without claiming full success.

The import response includes `totalRows`, `importedRows`, `skippedRows`, `invalidRows`, `duplicateRows`, `databaseErrorRows`, and `databaseFailure`. `invalidRows` counts rows with validation/row-shape errors; `duplicateRows` counts distinct rows with duplicate errors; `databaseErrorRows` is separate. These categories may overlap, while `importedRows + skippedRows` always equals `totalRows`. Each result is `IMPORTED` or `SKIPPED` with row-level errors.

## Example response

```json
{
  "success": true,
  "message": "Student import completed",
  "data": {
    "summary": {
      "totalRows": 2,
      "importedRows": 1,
      "skippedRows": 1,
      "invalidRows": 0,
      "duplicateRows": 1,
      "databaseErrorRows": 0,
      "databaseFailure": false
    },
    "results": [
      { "rowNumber": 2, "admissionNumber": "000101", "status": "IMPORTED", "errors": [] },
      { "rowNumber": 3, "admissionNumber": "000101", "status": "SKIPPED", "errors": [{ "field": "admissionNumber", "message": "Admission number 000101 appears more than once in this CSV" }] }
    ]
  }
}
```

## Errors

- `400`: `INVALID_CSV`, `INVALID_CSV_HEADERS`, `CSV_ROWS_REQUIRED`, `CSV_ROW_LIMIT_EXCEEDED`, `INVALID_UPLOAD`, or missing/forbidden school selection.
- `401`: authentication required or invalid session.
- `403`: role or permission forbidden.
- `404`: selected school not found.
- `409`: selected school inactive.
- `207`: import report includes database failures; inspect per-row results and `databaseFailure`.
- `413`: file exceeds configured size limit.
- `415`: unsupported extension or MIME type.

No uploaded content or personal student data is logged. Only safe error metadata (error type/code and affected batch size) is logged for unexpected insert failures. Preview data is not persisted. This phase does not create portal accounts and does not support XLS/XLSX, resumable jobs, asynchronous imports, or downloadable error reports.
