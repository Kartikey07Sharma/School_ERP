const test = require("node:test");
const assert = require("node:assert/strict");
const db = require("../src/repositories/attendance.repository");
const service = require("../src/services/attendance.service");

const schoolId = "00000000-0000-4000-8000-000000000001";
const studentId = "00000000-0000-4000-8000-000000000002";
const yearId = "00000000-0000-4000-8000-000000000003";
const gradeId = "00000000-0000-4000-8000-000000000004";
const sectionId = "00000000-0000-4000-8000-000000000005";
const actor = { id: "00000000-0000-4000-8000-000000000006", role: "SCHOOL_ADMIN", schoolId };
const input = { academicYearId: yearId, gradeId, sectionId, date: new Date("2026-11-10T00:00:00Z"), attendance: [{ studentId, status: "PRESENT" }] };

function stub(obj, key, fn, t) { const old = obj[key]; obj[key] = fn; t.after(() => { obj[key] = old; }); }

test("school roster is tenant and date scoped and returns only the historical active placement", async (t) => {
  stub(db.school, "findUnique", async ({ where }) => ({ id: where.id, institutionType: where.id === schoolId ? "SCHOOL" : "COLLEGE" }), t);
  stub(db.academicYear, "findFirst", async () => ({ id: yearId, startDate: new Date("2026-04-01T00:00:00Z"), endDate: new Date("2027-03-31T00:00:00Z") }), t);
  stub(db.section, "findFirst", async () => ({ id: sectionId }), t);
  stub(db.studentAcademicEnrollment, "findMany", async () => [{ id: "enrollment", studentId, rollNumber: "1", student: { id: studentId, firstName: "A" } }], t);
  stub(db.schoolStudentAttendance, "findMany", async () => [], t);
  const result = await service.schoolRoster({ ...input, attendance: undefined }, actor);
  assert.equal(result.length, 1);
  assert.equal(result[0].id, studentId);
  await assert.rejects(service.schoolRoster({ ...input, attendance: undefined }, { ...actor, schoolId: "other" }), { code: "INSTITUTION_TYPE_MISMATCH" });
});

test("school batch persists atomically and maps duplicate unique conflicts to correction guidance", async (t) => {
  stub(db.school, "findUnique", async () => ({ id: schoolId, institutionType: "SCHOOL" }), t);
  const activeRoster = [{ id: "enrollment", studentId, rollNumber: "1", student: { id: studentId, firstName: "A" } }];
  const oldTransaction = db.$transaction;
  let transactionOptions;
  const tx = { academicYear: { findFirst: async () => ({ id: yearId, startDate: new Date("2026-04-01T00:00:00Z"), endDate: new Date("2027-03-31T00:00:00Z") }) }, section: { findFirst: async () => ({ id: sectionId }) }, studentAcademicEnrollment: { findMany: async () => activeRoster }, schoolStudentAttendance: { findMany: async () => [], createMany: async () => ({ count: 1 }) } };
  db.$transaction = async (fn, options) => { transactionOptions = options; return fn({ ...tx, schoolStudentAttendance: { ...tx.schoolStudentAttendance, findMany: async () => [{ studentId, status: "PRESENT" }] } }); };
  t.after(() => { db.$transaction = oldTransaction; });
  const result = await service.markSchool(input, actor);
  assert.equal(result[0].status, "PRESENT");
  assert.equal(transactionOptions.isolationLevel, "Serializable");

  db.$transaction = async (fn) => fn({ ...tx, schoolStudentAttendance: { ...tx.schoolStudentAttendance, createMany: async () => { throw { code: "P2002" }; } } });
  await assert.rejects(service.markSchool(input, actor), { code: "ATTENDANCE_ALREADY_MARKED", statusCode: 409 });
});

test("school attendance rejects an empty roster before attempting a write", async (t) => {
  stub(db.school, "findUnique", async () => ({ id: schoolId, institutionType: "SCHOOL" }), t);
  const oldTransaction = db.$transaction;
  let writes = 0;
  db.$transaction = async (fn) => fn({ academicYear: { findFirst: async () => ({ id: yearId, startDate: new Date("2026-04-01T00:00:00Z"), endDate: new Date("2027-03-31T00:00:00Z") }) }, section: { findFirst: async () => ({ id: sectionId }) }, studentAcademicEnrollment: { findMany: async () => [] }, schoolStudentAttendance: { findMany: async () => [], createMany: async () => { writes += 1; } } });
  t.after(() => { db.$transaction = oldTransaction; });
  await assert.rejects(service.markSchool(input, actor), { code: "EMPTY_ROSTER" });
  assert.equal(writes, 0);
});

test("tenant selection requires super administrators to name a matching institution and rejects member overrides", async (t) => {
  stub(db.school, "findUnique", async ({ where }) => ({ id: where.id, institutionType: "SCHOOL" }), t);
  assert.equal(await service.tenant({ role: "SUPER_ADMIN" }, "SCHOOL", schoolId), schoolId);
  await assert.rejects(service.tenant({ role: "SUPER_ADMIN" }, "SCHOOL"), { code: "SCHOOL_REQUIRED" });
  await assert.rejects(service.tenant(actor, "SCHOOL", schoolId), { code: "SCHOOL_ID_FORBIDDEN" });
});

test("a stale attendance correction is rejected without creating an audit row", async (t) => {
  stub(db.school, "findUnique", async () => ({ id: schoolId, institutionType: "SCHOOL" }), t);
  stub(db.schoolStudentAttendance, "findFirst", async () => ({ id: "attendance", schoolId, status: "ABSENT" }), t);
  const oldTransaction = db.$transaction;
  let audits = 0;
  db.$transaction = async (fn) => fn({
    schoolStudentAttendance: { updateMany: async ({ where }) => { assert.equal(where.status, "ABSENT"); return { count: 0 }; } },
    studentAttendanceCorrection: { create: async () => { audits += 1; } },
  });
  t.after(() => { db.$transaction = oldTransaction; });
  await assert.rejects(service.correct("school", "attendance", { status: "PRESENT", reason: "Verified", }, actor), { code: "CONCURRENT_WRITE", statusCode: 409 });
  assert.equal(audits, 0);
});

test("college marking checks faculty and active registration roster inside a serializable transaction", async (t) => {
  const collegeId = "00000000-0000-4000-8000-000000000011";
  const teacher = { id: "00000000-0000-4000-8000-000000000012", role: "TEACHER", schoolId: collegeId };
  const collegeStudentId = "00000000-0000-4000-8000-000000000013";
  const sessionId = "00000000-0000-4000-8000-000000000014";
  stub(db.school, "findUnique", async () => ({ id: collegeId, institutionType: "COLLEGE" }), t);
  let writes = 0;
  let authorized = true;
  let isolation;
  const offering = { id: "offering", academicYear: { startDate: new Date("2026-04-01T00:00:00Z"), endDate: new Date("2027-03-31T00:00:00Z") } };
  const session = { id: sessionId, schoolId: collegeId, courseOfferingId: offering.id, sessionDate: new Date("2026-11-10T00:00:00Z"), status: "CONDUCTED", courseOffering: offering };
  const registration = { id: "registration", semesterEnrollment: { programmeEnrollment: { student: { id: collegeStudentId, firstName: "College" }, batch: { name: "2026" }, programme: { name: "BA", department: { name: "Arts" } } }, programmeTerm: { name: "Semester 1" } } };
  const tx = {
    collegeAttendanceSession: { findFirst: async () => session },
    courseOffering: { findFirst: async () => offering },
    facultyCourseAssignment: { findFirst: async () => authorized ? { id: "assignment" } : null },
    studentCourseRegistration: { findMany: async () => [registration] },
    collegeStudentAttendance: {
      findMany: async ({ select }) => select ? [] : [{ studentId: collegeStudentId, status: "PRESENT" }],
      createMany: async ({ data }) => { writes += data.length; return { count: data.length }; },
    },
  };
  const oldTransaction = db.$transaction;
  db.$transaction = async (fn, options) => { isolation = options.isolationLevel; return fn(tx); };
  t.after(() => { db.$transaction = oldTransaction; });
  const result = await service.markCollege(teacher, sessionId, { attendance: [{ studentId: collegeStudentId, status: "PRESENT" }] });
  assert.equal(result[0].status, "PRESENT");
  assert.equal(writes, 1);
  assert.equal(isolation, "Serializable");

  authorized = false;
  writes = 0;
  await assert.rejects(service.markCollege(teacher, sessionId, { attendance: [{ studentId: collegeStudentId, status: "PRESENT" }] }), { code: "FORBIDDEN" });
  assert.equal(writes, 0);
});
