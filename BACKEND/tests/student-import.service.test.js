const test = require("node:test");
const assert = require("node:assert/strict");
const { createStudentImportService, REQUIRED_HEADERS } = require("../src/services/student-import.service");

const schoolA = "school-a";
const schoolB = "school-b";
const admin = { id: "admin-a", role: "SCHOOL_ADMIN", schoolId: schoolA };
const superAdmin = { id: "root", role: "SUPER_ADMIN", schoolId: null };
const headers = [...REQUIRED_HEADERS.slice(0, 5), "middleName", ...REQUIRED_HEADERS.slice(5, 9), "email", "phone", ...REQUIRED_HEADERS.slice(9), "guardianEmail"];
const validRow = (admissionNumber = "0001", extra = {}) => ({
  admissionNumber,
  firstName: "Asha",
  middleName: "",
  lastName: "Sharma",
  dateOfBirth: "2010-05-12",
  gender: "Female",
  admissionDate: "2026-04-01",
  className: "10",
  section: "A",
  academicYear: "2026-27",
  email: "",
  phone: "",
  address: "Dehradun, Uttarakhand",
  guardianName: "Ramesh Sharma",
  guardianRelationship: "Father",
  guardianPhone: "9876501234",
  guardianEmail: "",
  ...extra,
});
const csvOf = (rows, headerRow = headers) => [headerRow.join(","), ...rows.map((row) => headerRow.map((header) => {
  const canonical = headers.find((name) => name.toLowerCase() === header.trim().replace(/\s+/g, "").toLowerCase());
  return quote(row[canonical || header] ?? "");
}).join(","))].join("\n");
function quote(value) { return /[",\r\n]/.test(String(value)) ? `"${String(value).replace(/"/g, '""')}"` : String(value); }

function setup({ existing = [], schools = [schoolA, schoolB], maxRows = 5000, maxFileSizeBytes = 5 * 1024 * 1024 } = {}) {
  const stored = new Map(existing.map((record) => [`${record.schoolId}:${record.admissionNumber}`, record]));
  const calls = [];
  const repo = {
    findExistingAdmissionNumbers: async (schoolId, admissionNumbers) => {
      calls.push(["findExistingAdmissionNumbers", schoolId, admissionNumbers]);
      return new Set(admissionNumbers.filter((number) => stored.has(`${schoolId}:${number}`)));
    },
    createManyStudents: async (schoolId, students) => {
      calls.push(["createManyStudents", schoolId, students]);
      for (const student of students) {
        if (stored.has(`${schoolId}:${student.admissionNumber}`)) {
          const error = new Error("unique conflict");
          error.code = "P2002";
          error.meta = { target: ["schoolId", "admissionNumber"] };
          throw error;
        }
      }
      for (const student of students) stored.set(`${schoolId}:${student.admissionNumber}`, { ...student, schoolId, status: "ACTIVE" });
      return { count: students.length };
    },
  };
  const schoolRepo = { findSchoolById: async (id) => schools.includes(id) ? { id, status: "ACTIVE" } : null };
  const service = createStudentImportService({ students: repo, schools: schoolRepo, maxRows, maxFileSizeBytes });
  return { service, calls, stored };
}

function bufferFor(rows, headerRow = headers) { return Buffer.from(csvOf(rows, headerRow), "utf8"); }

test("preview validates headers case-insensitively and tolerates surrounding/internal header whitespace", async () => {
  const spacedHeaders = headers.map((header) => `  ${header.replace(/[A-Z]/g, (letter) => ` ${letter.toUpperCase()}`)} `);
  const { service } = setup();
  const result = await service.preview(bufferFor([validRow()], spacedHeaders), admin);
  assert.equal(result.summary.validRows, 1);
  assert.equal(result.rows[0].status, "VALID");
});

test("preview rejects missing, duplicate, empty, unexpected and internal headers", async () => {
  const { service } = setup();
  const row = validRow();
  await assert.rejects(service.preview(bufferFor([row], headers.slice(1)), admin), { code: "INVALID_CSV_HEADERS" });
  await assert.rejects(service.preview(bufferFor([row], [...headers, "FIRSTNAME"]), admin), { code: "INVALID_CSV_HEADERS" });
  await assert.rejects(service.preview(bufferFor([row], [...headers, ""]), admin), { code: "INVALID_CSV_HEADERS" });
  await assert.rejects(service.preview(bufferFor([row], [...headers, "unrelated"]), admin), { code: "INVALID_CSV_HEADERS" });
  await assert.rejects(service.preview(bufferFor([row], [...headers, "schoolId"]), admin), { code: "INVALID_CSV_HEADERS" });
  await assert.rejects(service.preview(bufferFor([row], [...headers, "id"]), admin), { code: "INVALID_CSV_HEADERS" });
  await assert.rejects(service.preview(bufferFor([row], [...headers, "portalUserId"]), admin), { code: "INVALID_CSV_HEADERS" });
});

test("preview reports row validation errors, preserves leading zeros, and returns no full student data", async () => {
  const { service, calls } = setup();
  const result = await service.preview(bufferFor([
    validRow("000101", { email: "bad-email", gender: "unknown", dateOfBirth: "2035-01-01" }),
    validRow("000102"),
  ]), admin);
  assert.equal(result.summary.totalRows, 2);
  assert.equal(result.summary.validRows, 1);
  assert.equal(result.summary.invalidRows, 1);
  assert.equal(result.rows[0].rowNumber, 2);
  assert.equal(result.rows[0].admissionNumber, "000101");
  assert.equal(result.rows[0].status, "INVALID");
  assert.equal(result.rows[0].errors.length >= 3, true);
  assert.equal(Object.hasOwn(result.rows[0], "address"), false);
  assert.equal(calls.some(([name]) => name === "createManyStudents"), false);
});

test("CSV rows reuse Part 1 validation for required fields, dates, email and phone lengths", async () => {
  const { service } = setup();
  const result = await service.preview(bufferFor([
    validRow(" "),
    validRow("0002", { firstName: "", guardianName: "", guardianPhone: "" }),
    validRow("0003", { dateOfBirth: "2010/05/12", email: "bad-email" }),
    validRow("0004", { dateOfBirth: "2010-02-30", guardianPhone: "x".repeat(31), phone: "x".repeat(31) }),
    validRow("0005", { dateOfBirth: "2011-01-01", admissionDate: "2010-01-01" }),
  ]), admin);
  assert.equal(result.summary.invalidRows, 5);
  assert.ok(result.rows[1].errors.some((error) => error.field === "guardianPhone"));
  assert.ok(result.rows[2].errors.some((error) => error.field === "email"));
  assert.ok(result.rows[3].errors.some((error) => error.field === "phone"));
  assert.ok(result.rows[4].errors.some((error) => error.field === "admissionDate"));
});

test("CSV rows with the wrong number of columns are reported and skipped", async () => {
  const { service } = setup();
  const good = validRow();
  const malformedColumns = csvOf([good]).replace("0001,Asha", "0001,EXTRA,Asha");
  const result = await service.preview(Buffer.from(malformedColumns, "utf8"), admin);
  assert.equal(result.summary.invalidRows, 1);
  assert.ok(result.rows[0].errors.some((error) => error.field === "_row"));
});

test("preview marks all normalized in-file duplicates and database conflicts", async () => {
  const { service } = setup({ existing: [{ schoolId: schoolA, admissionNumber: "009" }, { schoolId: schoolB, admissionNumber: "008" }] });
  const result = await service.preview(bufferFor([
    validRow(" 001 "),
    validRow("001"),
    validRow("009"),
    validRow("008"),
  ]), admin);
  assert.deepEqual(result.rows.slice(0, 2).map((row) => row.status), ["DUPLICATE", "DUPLICATE"]);
  assert.equal(result.rows[2].status, "DUPLICATE");
  assert.equal(result.rows[3].status, "VALID", "other school's admission number does not conflict");
  assert.equal(result.summary.duplicateRows, 3);
  assert.equal(result.summary.readyToImport, 1);
});

test("preview enforces tenant school selection, active school, size, row limits and multipart fields", async () => {
  const { service } = setup({ schools: [schoolA], maxRows: 1, maxFileSizeBytes: 25 });
  const data = bufferFor([validRow(), validRow("0002")]);
  await assert.rejects(service.preview(bufferFor([validRow()]), { ...admin, schoolId: schoolA }, schoolA), { code: "SCHOOL_ID_FORBIDDEN" });
  await assert.rejects(service.preview(bufferFor([validRow()]), superAdmin), { code: "SCHOOL_REQUIRED" });
  await assert.rejects(service.preview(bufferFor([validRow()]), superAdmin, schoolB), { code: "NOT_FOUND" });
  await assert.rejects(service.preview(data, admin), { code: "FILE_TOO_LARGE" });
  const { service: rowLimited } = setup({ maxRows: 1 });
  await assert.rejects(rowLimited.preview(bufferFor([validRow(), validRow("0002")]), admin), { code: "CSV_ROW_LIMIT_EXCEEDED" });
  await assert.rejects(rowLimited.preview(bufferFor([validRow()]), admin, undefined, { schoolId: schoolA }), { code: "SCHOOL_ID_FORBIDDEN" });
  await assert.rejects(rowLimited.preview(bufferFor([validRow()]), superAdmin, schoolA, { schoolId: schoolA }), { code: "SCHOOL_ID_FORBIDDEN" });
  await assert.rejects(rowLimited.preview(bufferFor([validRow()]), admin, undefined, { extra: "not allowed" }), { code: "INVALID_UPLOAD_FIELDS" });
});

test("preview rejects malformed, empty, invalid-encoding and header-only CSV files", async () => {
  const { service } = setup();
  await assert.rejects(service.preview(Buffer.alloc(0), admin), { code: "INVALID_CSV" });
  await assert.rejects(service.preview(Buffer.from('a,b\n"unfinished,b', "utf8"), admin), { code: "INVALID_CSV" });
  await assert.rejects(service.preview(Buffer.from([0xc3, 0x28]), admin), { code: "INVALID_CSV" });
  await assert.rejects(service.preview(Buffer.from(headers.join(","), "utf8"), admin), { code: "CSV_ROWS_REQUIRED" });
});

test("teachers, students, parents and unauthenticated actors cannot preview or import", async () => {
  const { service } = setup();
  const buffer = bufferFor([validRow()]);
  for (const actor of [null, { role: "TEACHER", schoolId: schoolA }, { role: "STUDENT", schoolId: schoolA }, { role: "PARENT", schoolId: schoolA }]) {
    const expectedCode = actor ? "FORBIDDEN" : "UNAUTHENTICATED";
    await assert.rejects(service.preview(buffer, actor), { code: expectedCode });
    await assert.rejects(service.importStudents(buffer, actor), { code: expectedCode });
  }
});

test("import partially succeeds, counts every row once, and assigns only the selected school", async () => {
  const { service, calls, stored } = setup({ existing: [{ schoolId: schoolA, admissionNumber: "0003" }] });
  const result = await service.importStudents(bufferFor([
    validRow("0001"),
    validRow("0002", { guardianPhone: "" }),
    validRow("0003"),
    validRow("0004"),
    validRow("0004"),
    validRow("0005"),
  ]), admin);
  assert.deepEqual(result.summary, {
    totalRows: 6,
    importedRows: 2,
    skippedRows: 4,
    invalidRows: 1,
    duplicateRows: 3,
    databaseErrorRows: 0,
    databaseFailure: false,
  });
  assert.equal(result.summary.importedRows + result.summary.skippedRows, result.summary.totalRows);
  assert.deepEqual(result.results.map((row) => row.status), ["IMPORTED", "SKIPPED", "SKIPPED", "SKIPPED", "SKIPPED", "IMPORTED"]);
  assert.equal([...stored.values()].filter((student) => student.schoolId === schoolA && student.status === "ACTIVE").length, 2);
  assert.ok(calls.filter(([name]) => name === "createManyStudents").every(([, schoolId]) => schoolId === schoolA));
  const insertedRecords = calls.filter(([name]) => name === "createManyStudents").flatMap(([, , records]) => records);
  assert.ok(insertedRecords.every((student) => student.middleName === null && student.email === null && student.phone === null && student.guardianEmail === null));
  assert.ok(insertedRecords.every((student) => !Object.hasOwn(student, "portalUserId") && !Object.hasOwn(student, "password")));
});

test("all-invalid and all-duplicate imports do not insert or overwrite records", async () => {
  const existing = { schoolId: schoolA, admissionNumber: "0001", firstName: "Original" };
  const { service, calls, stored } = setup({ existing: [existing] });
  const invalid = await service.importStudents(bufferFor([validRow("0002", { firstName: "" })]), admin);
  const duplicate = await service.importStudents(bufferFor([validRow("0001")]), admin);
  assert.equal(invalid.summary.importedRows, 0);
  assert.equal(duplicate.summary.importedRows, 0);
  assert.equal(calls.some(([name]) => name === "createManyStudents"), false);
  assert.equal(stored.get(`${schoolA}:0001`).firstName, "Original");
});

test("database uniqueness race is isolated to affected row with truthful results", async () => {
  // Replace the service repository by creating a focused fake with a race injected at insert time.
  const raced = new Set();
  const repo = {
    findExistingAdmissionNumbers: async () => new Set(),
    createManyStudents: async (schoolId, students) => {
      if (students.some((student) => student.admissionNumber === "0002") && !raced.has("0002")) {
        raced.add("0002");
        const error = new Error("unique race"); error.code = "P2002"; error.meta = { target: ["schoolId", "admissionNumber"] }; throw error;
      }
      if (students.some((student) => student.admissionNumber === "0002")) {
        const error = new Error("unique race"); error.code = "P2002"; error.meta = { target: ["schoolId", "admissionNumber"] }; throw error;
      }
      return { count: students.length };
    },
  };
  const { createStudentImportService } = require("../src/services/student-import.service");
  const racedService = createStudentImportService({ students: repo, schools: { findSchoolById: async (id) => ({ id, status: "ACTIVE" }) } });
  const result = await racedService.importStudents(bufferFor([validRow("0001"), validRow("0002"), validRow("0003")]), admin);
  assert.equal(result.summary.importedRows, 2);
  assert.equal(result.summary.duplicateRows, 1);
  assert.equal(result.results[1].status, "SKIPPED");
  assert.match(result.results[1].errors[0].message, /another request/);
});

test("super admin imports only into the explicitly selected school", async () => {
  const { service, calls } = setup();
  const result = await service.importStudents(bufferFor([validRow("0099")]), superAdmin, schoolB);
  assert.equal(result.summary.importedRows, 1);
  assert.equal(calls.find(([name]) => name === "createManyStudents")[1], schoolB);
});

test("unexpected database failures are reported without student data in logs", async () => {
  const { createStudentImportService } = require("../src/services/student-import.service");
  const errors = [];
  const priorError = console.error;
  console.error = (message) => errors.push(String(message));
  try {
    const service = createStudentImportService({
      students: {
        findExistingAdmissionNumbers: async () => new Set(),
        createManyStudents: async () => { const error = new Error("private details"); error.code = "P1001"; throw error; },
      },
      schools: { findSchoolById: async (id) => ({ id, status: "ACTIVE" }) },
    });
    const result = await service.importStudents(bufferFor([validRow("private-admission")]), admin);
    assert.equal(result.summary.importedRows, 0);
    assert.equal(result.summary.skippedRows, 1);
    assert.equal(result.summary.databaseErrorRows, 1);
    assert.equal(result.results[0].errors.some((error) => error.message.includes("private details")), false);
    assert.equal(errors.length, 1);
    assert.equal(errors[0].includes("private-admission"), false);
  } finally {
    console.error = priorError;
  }
});
