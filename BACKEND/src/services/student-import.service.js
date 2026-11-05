const AppError = require("../utils/AppError");
const { ROLE, hasPermission } = require("../constants/permissions");
const { createStudentSchema } = require("../validations/student.validation");
const csvConfig = require("../config/student-csv");
const { parseCsvBuffer } = require("../utils/csv-parser");

const REQUIRED_HEADERS = [
  "admissionNumber", "firstName", "lastName", "dateOfBirth", "gender", "admissionDate",
  "address", "guardianName", "guardianRelationship", "guardianPhone",
];
const OPTIONAL_HEADERS = ["middleName", "className", "section", "academicYear", "email", "phone", "guardianEmail", "guardianAddress", "city", "state", "postalCode", "bloodGroup"];
const ALL_HEADERS = [...REQUIRED_HEADERS, ...OPTIONAL_HEADERS];
const DB_LOOKUP_BATCH_SIZE = 500;
const INSERT_BATCH_SIZE = 250;

function normalizeHeader(value) {
  return value.replace(/^\uFEFF/, "").trim().replace(/\s+/g, "").toLowerCase();
}

function isAdmissionNumberConflict(error) {
  if (error?.code !== "P2002") return false;
  const target = error.meta?.target;
  if (typeof target === "string") return target === "students_schoolId_admissionNumber_key";
  return Array.isArray(target)
    && target.length === 2
    && new Set(target).size === 2
    && target.includes("schoolId")
    && target.includes("admissionNumber");
}

function createStudentImportService({ students: suppliedStudents, schools: suppliedSchools, maxRows = csvConfig.maxRows, maxFileSizeBytes = csvConfig.maxFileSizeBytes } = {}) {
  const students = () => suppliedStudents || require("../repositories/student.repository");
  const schools = () => suppliedSchools || require("../repositories/school.repository");

  function requireManager(actor) {
    if (!actor) throw new AppError("Authentication required", 401, "UNAUTHENTICATED");
    const allowed = actor.role === ROLE.SUPER_ADMIN
      ? hasPermission(actor.role, "students:manage:any")
      : actor.role === ROLE.SCHOOL_ADMIN && hasPermission(actor.role, "students:manage:school");
    if (!allowed) throw new AppError("You do not have permission to import students", 403, "FORBIDDEN");
  }

  function resolveSchoolId(actor, requestedSchoolId, formFields) {
    if (Object.keys(formFields || {}).length > 0) {
      if (Object.hasOwn(formFields, "schoolId")) throw new AppError("School selection must not be supplied in the multipart body", 400, "SCHOOL_ID_FORBIDDEN");
      throw new AppError("Only the CSV file may be supplied in the multipart body", 400, "INVALID_UPLOAD_FIELDS");
    }
    if (actor.role === ROLE.SUPER_ADMIN) {
      if (!requestedSchoolId) throw new AppError("schoolId is required for platform administrators", 400, "SCHOOL_REQUIRED");
      return requestedSchoolId;
    }
    if (!actor.schoolId) throw new AppError("Your account is not assigned to a school", 403, "TENANT_REQUIRED");
    if (requestedSchoolId !== undefined) throw new AppError("School administrators cannot supply schoolId", 400, "SCHOOL_ID_FORBIDDEN");
    return actor.schoolId;
  }

  async function resolveActiveSchool(schoolId) {
    const school = await schools().findSchoolById(schoolId);
    if (!school) throw new AppError("School not found", 404, "NOT_FOUND");
    if (school.status !== "ACTIVE") throw new AppError("Students cannot be imported into an inactive school", 409, "SCHOOL_INACTIVE");
  }

  function validateHeaders(record) {
    if (!record || record.values.length === 0) throw new AppError("CSV header row is missing", 400, "INVALID_CSV_HEADERS");
    const seen = new Set();
    const duplicates = [];
    const unknown = [];
    const empty = [];
    const columnMap = new Map();
    const canonical = new Map(ALL_HEADERS.map((name) => [name.toLowerCase(), name]));

    record.values.forEach((rawHeader, index) => {
      const normalized = normalizeHeader(rawHeader);
      if (!normalized) {
        empty.push(index + 1);
        return;
      }
      if (seen.has(normalized)) duplicates.push(rawHeader.trim());
      seen.add(normalized);
      const field = canonical.get(normalized);
      if (!field) unknown.push(rawHeader.trim());
      else columnMap.set(field, index);
    });

    const missing = REQUIRED_HEADERS.filter((header) => !columnMap.has(header));
    const issues = [];
    if (empty.length) issues.push(`empty header column(s): ${empty.join(", ")}`);
    if (duplicates.length) issues.push(`duplicate header(s): ${[...new Set(duplicates)].join(", ")}`);
    if (unknown.length) issues.push(`unsupported header(s): ${[...new Set(unknown)].join(", ")}`);
    if (missing.length) issues.push(`missing required header(s): ${missing.join(", ")}`);
    if (issues.length) throw new AppError(`Invalid CSV headers: ${issues.join("; ")}`, 400, "INVALID_CSV_HEADERS");
    return columnMap;
  }

  function toCandidate(record, columnMap, headerCount) {
    const rawAdmission = record.values[columnMap.get("admissionNumber")] ?? "";
    const result = {
      rowNumber: record.rowNumber,
      admissionNumber: rawAdmission,
      validationErrors: [],
      duplicateErrors: [],
      student: null,
    };
    if (record.values.length !== headerCount) {
      result.validationErrors.push({ field: "_row", message: `Expected ${headerCount} columns but found ${record.values.length}` });
    }
    const input = Object.fromEntries(ALL_HEADERS.map((header) => {
      const index = columnMap.get(header);
      return [header, index === undefined ? "" : (record.values[index] ?? "")];
    }));
    const parsed = createStudentSchema.safeParse(input);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const field = issue.path.length ? issue.path.map(String).join(".") : "_row";
        if (!result.validationErrors.some((existing) => existing.field === field && existing.message === issue.message)) {
          result.validationErrors.push({ field, message: issue.message });
        }
      }
    } else {
      result.student = parsed.data;
    }
    return result;
  }

  async function prepare(fileBuffer, actor, requestedSchoolId, formFields) {
    requireManager(actor);
    const schoolId = resolveSchoolId(actor, requestedSchoolId, formFields);
    await resolveActiveSchool(schoolId);
    if (!Buffer.isBuffer(fileBuffer) || fileBuffer.length === 0) throw new AppError("CSV file is empty", 400, "INVALID_CSV");
    if (fileBuffer.length > maxFileSizeBytes) throw new AppError("CSV file exceeds the configured size limit", 413, "FILE_TOO_LARGE");

    const records = parseCsvBuffer(fileBuffer);
    if (records.length < 2) throw new AppError("CSV must contain a header and at least one data row", 400, "CSV_ROWS_REQUIRED");
    const headerRecord = records[0];
    const columnMap = validateHeaders(headerRecord);
    const dataRecords = records.slice(1);
    if (dataRecords.length > maxRows) throw new AppError(`CSV exceeds the maximum of ${maxRows} data rows`, 400, "CSV_ROW_LIMIT_EXCEEDED");

    const candidates = dataRecords.map((record) => toCandidate(record, columnMap, headerRecord.values.length));
    const admissionGroups = new Map();
    for (const candidate of candidates) {
      if (typeof candidate.admissionNumber !== "string") continue;
      const normalized = candidate.admissionNumber.trim();
      if (!normalized || normalized.length > 50) continue;
      candidate.normalizedAdmissionNumber = normalized;
      const group = admissionGroups.get(normalized) || [];
      group.push(candidate);
      admissionGroups.set(normalized, group);
    }

    for (const [admissionNumber, group] of admissionGroups) {
      if (group.length > 1) {
        for (const candidate of group) candidate.duplicateErrors.push({
          field: "admissionNumber",
          message: `Admission number ${admissionNumber} appears more than once in this CSV`,
        });
      }
    }

    const admissionNumbers = [...admissionGroups.keys()];
    const existingNumbers = new Set();
    for (let offset = 0; offset < admissionNumbers.length; offset += DB_LOOKUP_BATCH_SIZE) {
      const batch = admissionNumbers.slice(offset, offset + DB_LOOKUP_BATCH_SIZE);
      const found = await students().findExistingAdmissionNumbers(schoolId, batch);
      for (const admissionNumber of found) existingNumbers.add(admissionNumber);
    }
    for (const candidate of candidates) {
      if (candidate.normalizedAdmissionNumber && existingNumbers.has(candidate.normalizedAdmissionNumber)) {
        candidate.duplicateErrors.push({
          field: "admissionNumber",
          message: "Admission number already exists in this school",
        });
      }
    }
    return { schoolId, candidates };
  }

  function presentRow(candidate, status) {
    return {
      rowNumber: candidate.rowNumber,
      admissionNumber: candidate.admissionNumber,
      status,
      errors: [...candidate.validationErrors, ...candidate.duplicateErrors, ...(candidate.databaseErrors || [])],
    };
  }

  async function preview(fileBuffer, actor, requestedSchoolId, formFields) {
    const { candidates } = await prepare(fileBuffer, actor, requestedSchoolId, formFields);
    const readyRows = candidates.filter((candidate) => !candidate.validationErrors.length && !candidate.duplicateErrors.length).length;
    const invalidRows = candidates.filter((candidate) => candidate.validationErrors.length > 0).length;
    const duplicateRows = candidates.filter((candidate) => candidate.duplicateErrors.length > 0).length;
    return {
      summary: {
        totalRows: candidates.length,
        validRows: readyRows,
        invalidRows,
        duplicateRows,
        readyToImport: readyRows,
      },
      rows: candidates.map((candidate) => {
        const status = candidate.validationErrors.length ? "INVALID" : candidate.duplicateErrors.length ? "DUPLICATE" : "VALID";
        return presentRow(candidate, status);
      }),
    };
  }

  async function importStudents(fileBuffer, actor, requestedSchoolId, formFields) {
    const { schoolId, candidates } = await prepare(fileBuffer, actor, requestedSchoolId, formFields);
    const eligible = candidates.filter((candidate) => !candidate.validationErrors.length && !candidate.duplicateErrors.length);
    const markDatabaseFailure = (candidate) => {
      candidate.databaseErrors = candidate.databaseErrors || [];
      candidate.databaseErrors.push({ field: "_row", message: "The row could not be imported because of a database error" });
    };

    async function insertWithConflictIsolation(batch) {
      try {
        const result = await students().createManyStudents(schoolId, batch.map((candidate) => candidate.student));
        if (result.count !== batch.length) throw new Error("Bulk insert did not insert the complete batch");
        for (const candidate of batch) candidate.imported = true;
        return true;
      } catch (error) {
        if (!isAdmissionNumberConflict(error)) {
          for (const candidate of batch) markDatabaseFailure(candidate);
          console.error(JSON.stringify({ event: "student_csv_import_batch_failed", errorType: error?.name || "Error", errorCode: error?.code || "UNKNOWN", rowCount: batch.length }));
          return false;
        }
        if (batch.length === 1) {
          batch[0].duplicateErrors.push({ field: "admissionNumber", message: "Admission number was created by another request during import" });
          return true;
        }
        const middle = Math.floor(batch.length / 2);
        const firstHalfSucceeded = await insertWithConflictIsolation(batch.slice(0, middle));
        if (!firstHalfSucceeded) {
          for (const candidate of batch.slice(middle)) markDatabaseFailure(candidate);
          return false;
        }
        return insertWithConflictIsolation(batch.slice(middle));
      }
    }

    let databaseFailure = false;
    for (let offset = 0; offset < eligible.length; offset += INSERT_BATCH_SIZE) {
      const batch = eligible.slice(offset, offset + INSERT_BATCH_SIZE);
      if (!await insertWithConflictIsolation(batch)) {
        databaseFailure = true;
        for (const candidate of eligible.slice(offset + batch.length)) markDatabaseFailure(candidate);
        break;
      }
    }

    const importedRows = candidates.filter((candidate) => candidate.imported).length;
    const skippedRows = candidates.length - importedRows;
    const invalidRows = candidates.filter((candidate) => candidate.validationErrors.length > 0).length;
    const duplicateRows = candidates.filter((candidate) => candidate.duplicateErrors.length > 0).length;
    const databaseErrorRows = candidates.filter((candidate) => candidate.databaseErrors?.length > 0).length;
    return {
      summary: {
        totalRows: candidates.length,
        importedRows,
        skippedRows,
        invalidRows,
        duplicateRows,
        databaseErrorRows,
        databaseFailure,
      },
      results: candidates.map((candidate) => presentRow(candidate, candidate.imported ? "IMPORTED" : "SKIPPED")),
    };
  }

  return { preview, importStudents, prepare };
}

module.exports = {
  ...createStudentImportService(),
  createStudentImportService,
  REQUIRED_HEADERS,
  OPTIONAL_HEADERS,
  normalizeHeader,
};
