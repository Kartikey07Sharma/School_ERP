const test = require("node:test");
const assert = require("node:assert/strict");
const db = require("../src/repositories/staff-attendance.repository");
const service = require("../src/services/staff-attendance.service");
const schoolId = "00000000-0000-4000-8000-000000000001";
const employeeId = "00000000-0000-4000-8000-000000000002";
const actor = { id: "00000000-0000-4000-8000-000000000003", role: "SCHOOL_ADMIN", schoolId };
const attendanceDate = new Date("2026-11-10T00:00:00Z");
const employee = { id: employeeId, employeeId: "EMP-01", category: "NON_TEACHING", status: "ACTIVE", joiningDate: new Date("2025-01-01T00:00:00Z"), relievingDate: null, departmentId: null, designationId: "designation" };
const input = { attendanceDate, attendance: [{ employeeId, status: "PRESENT" }] };
function stub(target, key, fn, t) { const old = target[key]; target[key] = fn; t.after(() => { target[key] = old; }); }

test("employment eligibility permits userless active staff and limits ON_LEAVE to LEAVE", () => {
  assert.doesNotThrow(() => service.validateEmployment(employee, attendanceDate, "PRESENT"));
  assert.doesNotThrow(() => service.validateEmployment({ ...employee, status: "ON_LEAVE" }, attendanceDate, "LEAVE"));
  assert.throws(() => service.validateEmployment({ ...employee, status: "ON_LEAVE" }, attendanceDate, "PRESENT"), { code: "EMPLOYEE_ON_LEAVE" });
  for (const status of ["INACTIVE", "RESIGNED", "TERMINATED"]) assert.throws(() => service.validateEmployment({ ...employee, status }, attendanceDate, "PRESENT"), { code: "EMPLOYEE_NOT_ELIGIBLE" });
  assert.throws(() => service.validateEmployment({ ...employee, relievingDate: new Date("2026-11-09T00:00:00Z") }, attendanceDate, "PRESENT"), { code: "EMPLOYEE_NOT_ELIGIBLE" });
});

test("staff batch writes one transaction with historical classification snapshots", async (t) => {
  stub(db.school, "findUnique", async () => ({ id: schoolId }), t);
  const previous = db.$transaction;
  let options;
  let rows;
  db.$transaction = async (fn, opts) => { options = opts; return fn({ employee: { findMany: async () => [employee] }, staffAttendance: { createMany: async ({ data }) => { rows = data; return { count: data.length }; }, findMany: async () => rows } }); };
  t.after(() => { db.$transaction = previous; });
  const result = await service.mark(input, actor);
  assert.equal(result.length, 1);
  assert.equal(rows[0].category, "NON_TEACHING");
  assert.equal(rows[0].departmentId, null);
  assert.equal(rows[0].markedById, actor.id);
  assert.equal(options.isolationLevel, "Serializable");
});

test("staff batch rejects cross-tenant IDs, duplicate conflict and partial timestamps", async (t) => {
  stub(db.school, "findUnique", async () => ({ id: schoolId }), t);
  const previous = db.$transaction;
  db.$transaction = async (fn) => fn({ employee: { findMany: async () => [] }, staffAttendance: { createMany: async () => { throw { code: "P2002" }; } } });
  await assert.rejects(service.mark(input, actor), { code: "INVALID_EMPLOYEE" });
  db.$transaction = async (fn) => fn({ employee: { findMany: async () => [employee] }, staffAttendance: { createMany: async () => { throw { code: "P2002" }; } } });
  t.after(() => { db.$transaction = previous; });
  await assert.rejects(service.mark(input, actor), { code: "ATTENDANCE_ALREADY_MARKED", statusCode: 409 });
  assert.throws(() => service.validateTimes("PRESENT", null, new Date()), { code: "CHECK_IN_REQUIRED" });
  assert.throws(() => service.validateTimes("PRESENT", new Date("2026-11-10T10:00:00Z"), new Date("2026-11-10T09:00:00Z")), { code: "INVALID_ATTENDANCE_TIMES" });
});

test("tenant selection follows employee module rules", async (t) => {
  stub(db.school, "findUnique", async ({ where }) => ({ id: where.id }), t);
  assert.equal(await service.tenant(actor), schoolId);
  assert.equal(await service.tenant({ role: "SUPER_ADMIN" }, schoolId), schoolId);
  await assert.rejects(service.tenant({ role: "SUPER_ADMIN" }), { code: "SCHOOL_REQUIRED" });
  await assert.rejects(service.tenant(actor, schoolId), { code: "SCHOOL_ID_FORBIDDEN" });
  await assert.rejects(service.tenant({ role: "TEACHER", schoolId }), { code: "FORBIDDEN" });
});

test("attendance correction preserves old values and appends a separate audit row", async (t) => {
  stub(db.school, "findUnique", async () => ({ id: schoolId }), t);
  const row = { id: "attendance", schoolId, status: "PRESENT", checkInAt: new Date("2026-11-10T03:00:00Z"), checkOutAt: null };
  stub(db.staffAttendance, "findFirst", async () => row, t);
  const audit = { id: "audit", changedFields: ["status"] };
  const previous = db.$transaction;
  let auditData;
  db.$transaction = async (fn) => fn({ staffAttendance: { updateMany: async () => ({ count: 1 }), findFirst: async () => ({ ...row, status: "LATE" }) }, staffAttendanceCorrection: { create: async ({ data }) => { auditData = data; return audit; } } });
  t.after(() => { db.$transaction = previous; });
  const result = await service.correct("attendance", { status: "LATE", reason: "Verified against the entry log" }, actor);
  assert.equal(result.attendance.status, "LATE");
  assert.deepEqual(auditData.changedFields, ["status"]);
  assert.equal(auditData.previousStatus, "PRESENT");
  assert.equal(auditData.newStatus, "LATE");
  assert.equal(auditData.correctedById, actor.id);
});

test("staff self-service derives the employee from the linked account and hides unlinked accounts", async (t) => {
  const previous = db.employee.findFirst;
  db.employee.findFirst = async ({ where }) => where.userId === actor.id ? { id: employeeId } : null;
  const oldAttendance = db.staffAttendance.findMany;
  const oldCount = db.staffAttendance.count;
  db.staffAttendance.findMany = async ({ where }) => { assert.equal(where.employeeId, employeeId); return []; };
  db.staffAttendance.count = async () => 0;
  t.after(() => { db.employee.findFirst = previous; db.staffAttendance.findMany = oldAttendance; db.staffAttendance.count = oldCount; });
  assert.equal((await service.me({ page: 1, limit: 20 }, actor)).total, 0);
  await assert.rejects(service.me({ page: 1, limit: 20 }, { ...actor, id: "unlinked" }), { code: "EMPLOYEE_NOT_FOUND" });
});

test("check-in and check-out are one-time operations and enforce timestamp order", async (t) => {
  stub(db.school, "findUnique", async () => ({ id: schoolId }), t);
  let row = { id: "attendance", schoolId, status: "PRESENT", checkInAt: null, checkOutAt: null };
  stub(db.staffAttendance, "findFirst", async () => row, t);
  const oldUpdate = db.staffAttendance.updateMany;
  db.staffAttendance.updateMany = async ({ where, data }) => {
    if (data.checkInAt) row = { ...row, checkInAt: data.checkInAt };
    if (data.checkOutAt) row = { ...row, checkOutAt: data.checkOutAt };
    return { count: 1 };
  };
  t.after(() => { db.staffAttendance.updateMany = oldUpdate; });
  const checkInAt = new Date(Date.now() - 120_000);
  await service.checkIn("attendance", { checkInAt }, actor);
  await assert.rejects(service.checkIn("attendance", { checkInAt }, actor), { code: "CHECK_IN_ALREADY_RECORDED" });
  await assert.rejects(service.checkOut("attendance", { checkOutAt: new Date(Date.now() - 180_000) }, actor), { code: "INVALID_ATTENDANCE_TIMES" });
  await service.checkOut("attendance", { checkOutAt: new Date(Date.now() - 60_000) }, actor);
  await assert.rejects(service.checkOut("attendance", { checkOutAt: new Date() }, actor), { code: "CHECK_OUT_ALREADY_RECORDED" });
});
