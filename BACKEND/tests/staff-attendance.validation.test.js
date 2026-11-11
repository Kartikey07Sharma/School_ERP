const test = require("node:test");
const assert = require("node:assert/strict");
const v = require("../src/validations/staff-attendance.validation");
const id = "a513c31a-6334-43de-8a26-d6e90164634e";

test("staff attendance validates real date and timezone-qualified timestamps", () => {
  assert.equal(v.mark.safeParse({ attendanceDate: "2026-11-10", attendance: [{ employeeId: id, status: "PRESENT", checkInAt: "2026-11-10T09:00:00+05:30" }] }).success, true);
  assert.equal(v.mark.safeParse({ attendanceDate: "2026-02-30", attendance: [{ employeeId: id, status: "PRESENT" }] }).success, false);
  assert.equal(v.mark.safeParse({ attendanceDate: "2026-11-10", attendance: [{ employeeId: id, status: "PRESENT", checkInAt: "2026-11-10T09:00:00" }] }).success, false);
});

test("batch validation rejects duplicate employee IDs and invalid punch combinations", () => {
  const entry = { employeeId: id, status: "PRESENT" };
  assert.equal(v.mark.safeParse({ attendanceDate: "2026-11-10", attendance: [entry, entry] }).success, false);
  assert.equal(v.mark.safeParse({ attendanceDate: "2026-11-10", attendance: [{ employeeId: id, status: "ABSENT", checkInAt: "2026-11-10T09:00:00Z" }] }).success, false);
  assert.equal(v.mark.safeParse({ attendanceDate: "2026-11-10", attendance: [{ employeeId: id, status: "PRESENT", checkInAt: "2026-11-10T10:00:00Z", checkOutAt: "2026-11-10T09:00:00Z" }] }).success, false);
});

test("correction requires a reason and at least one timestamp or status change", () => {
  assert.equal(v.correction.safeParse({ reason: "Verified against the register", status: "LATE" }).success, true);
  assert.equal(v.correction.safeParse({ reason: "Too short" }).success, false);
  assert.equal(v.correction.safeParse({ reason: "Verified against the register" }).success, false);
});

test("roster and report queries are bounded and date ranges are ordered", () => {
  assert.equal(v.roster.safeParse({ date: "2026-11-10", page: 1, limit: 100 }).success, true);
  assert.equal(v.query.safeParse({ from: "2026-11-11", to: "2026-11-10" }).success, false);
  assert.equal(v.query.safeParse({ month: "2026-13" }).success, false);
});
