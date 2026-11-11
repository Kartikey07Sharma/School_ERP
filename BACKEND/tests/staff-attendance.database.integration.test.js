// Run against a configured PostgreSQL database after migrations:
// $env:RUN_STAFF_ATTENDANCE_DB_TESTS='1'; node --test tests/staff-attendance.database.integration.test.js
const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const db = require("../src/database/prisma");
const enabled = process.env.RUN_STAFF_ATTENDANCE_DB_TESTS === "1";

test("staff attendance tenant foreign keys, unique daily rows, timestamps and audit", { skip: !enabled }, async () => {
  const tag = `SA${crypto.randomBytes(5).toString("hex").toUpperCase()}`;
  const schoolIds = [], userIds = [], designationIds = [], employeeIds = [];
  try {
    await db.$connect();
    async function fixture(n, institutionType) {
      const school = await db.school.create({ data: { name: `${tag} ${n}`, code: `${tag}-${n}`, email: `${tag.toLowerCase()}-${n}@example.test`, phone: `${Date.now()}${n}`.slice(-14), institutionType } });
      schoolIds.push(school.id);
      const user = await db.user.create({ data: { schoolId: school.id, firstName: "Attendance Admin", email: `${tag.toLowerCase()}-admin-${n}@example.test`, password: "test-only", role: "SCHOOL_ADMIN" } });
      userIds.push(user.id);
      const designation = await db.employeeDesignation.create({ data: { schoolId: school.id, name: `${tag} Designation ${n}`, code: `${tag}-D${n}`, category: "TEACHING" } });
      designationIds.push(designation.id);
      const employee = await db.employee.create({ data: { schoolId: school.id, employeeId: `${tag}-E${n}`, category: "TEACHING", firstName: "Test", lastName: `Employee${n}`, phone: "9876543210", joiningDate: new Date("2025-01-01T00:00:00Z"), designationId: designation.id } });
      employeeIds.push(employee.id);
      assert.equal(employee.userId, null, "employees without portal accounts must be eligible for attendance records");
      return { school, user, designation, employee };
    }
    const a = await fixture(1, "SCHOOL");
    const b = await fixture(2, "COLLEGE");
    const checkInAt = new Date("2026-11-10T03:30:00.000Z");
    const checkOutAt = new Date("2026-11-10T11:00:00.000Z");
    const data = { schoolId: a.school.id, employeeId: a.employee.id, attendanceDate: new Date("2026-11-10T00:00:00.000Z"), category: "TEACHING", departmentId: null, designationId: a.designation.id, status: "PRESENT", checkInAt, checkOutAt, checkInRecordedById: a.user.id, checkOutRecordedById: a.user.id, markedById: a.user.id };
    const mark = await db.staffAttendance.create({ data });
    assert.equal(mark.checkInAt.toISOString(), checkInAt.toISOString());
    await assert.rejects(db.staffAttendance.create({ data }), { code: "P2002" });
    const concurrent = await Promise.allSettled([1, 2].map(() => db.staffAttendance.create({ data: { ...data, id: crypto.randomUUID(), attendanceDate: new Date("2026-11-13T00:00:00Z"), checkInAt: null, checkOutAt: null, checkInRecordedById: null, checkOutRecordedById: null } })));
    assert.equal(concurrent.filter((result) => result.status === "fulfilled").length, 1);
    assert.equal(concurrent.filter((result) => result.status === "rejected" && result.reason.code === "P2002").length, 1);
    await assert.rejects(db.staffAttendance.create({ data: { ...data, employeeId: b.employee.id, attendanceDate: new Date("2026-11-11T00:00:00Z") } }), { code: "P2003" });
    await assert.rejects(db.staffAttendance.create({ data: { ...data, id: crypto.randomUUID(), attendanceDate: new Date("2026-11-12T00:00:00Z"), checkOutAt: new Date("2026-11-10T02:00:00Z") } }));
    const audit = await db.staffAttendanceCorrection.create({ data: { schoolId: a.school.id, attendanceId: mark.id, previousStatus: "PRESENT", newStatus: "LATE", changedFields: ["status"], reason: "Verified against the sign-in register", correctedById: a.user.id } });
    assert.deepEqual(audit.changedFields, ["status"]);
    assert.equal((await db.staffAttendanceCorrection.count({ where: { schoolId: a.school.id, attendanceId: mark.id } })), 1);
  } catch (error) {
    console.error("Staff attendance database integration failure", error);
    throw error;
  } finally {
    if (schoolIds.length) {
      await db.staffAttendanceCorrection.deleteMany({ where: { schoolId: { in: schoolIds } } });
      await db.staffAttendance.deleteMany({ where: { schoolId: { in: schoolIds } } });
      if (employeeIds.length) await db.employee.deleteMany({ where: { id: { in: employeeIds } } });
      if (designationIds.length) await db.employeeDesignation.deleteMany({ where: { id: { in: designationIds } } });
      if (userIds.length) await db.user.deleteMany({ where: { id: { in: userIds } } });
      await db.school.deleteMany({ where: { id: { in: schoolIds } } });
    }
    await db.$disconnect();
  }
});
