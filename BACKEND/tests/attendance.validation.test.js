const test = require("node:test");
const assert = require("node:assert/strict");
const v = require("../src/validations/attendance.validation");

const id = "a513c31a-6334-43de-8a26-d6e90164634e";

test("attendance dates are strict calendar dates and timezone independent", () => {
  const good = v.schoolRoster.safeParse({ academicYearId: id, gradeId: id, sectionId: id, date: "2026-11-10" });
  assert.equal(good.success, true);
  assert.equal(good.data.date.toISOString(), "2026-11-10T00:00:00.000Z");
  assert.equal(v.schoolRoster.safeParse({ academicYearId: id, gradeId: id, sectionId: id, date: "2026-02-30" }).success, false);
  assert.equal(v.schoolRoster.safeParse({ academicYearId: id, gradeId: id, sectionId: id, date: "11/10/2026" }).success, false);
});

test("school batch rejects repeated student IDs and invalid statuses", () => {
  const record = { studentId: id, status: "PRESENT" };
  const base = { academicYearId: id, gradeId: id, sectionId: id, date: "2026-11-10" };
  assert.equal(v.schoolMark.safeParse({ ...base, attendance: [record, record] }).success, false);
  assert.equal(v.schoolMark.safeParse({ ...base, attendance: [{ studentId: id, status: "EXCUSED" }] }).success, false);
});

test("college sessions support multiple same-day types and validate time range", () => {
  assert.equal(v.collegeSession.safeParse({ courseOfferingId: id, sessionDate: "2026-11-10", startTime: "09:00", endTime: "10:00", sessionType: "LAB" }).success, true);
  assert.equal(v.collegeSession.safeParse({ courseOfferingId: id, sessionDate: "2026-11-10", startTime: "10:00", endTime: "09:00" }).success, false);
});

test("correction requires a reason and report ranges are ordered", () => {
  assert.equal(v.correction.safeParse({ status: "ABSENT", reason: "Confirmed with class register" }).success, true);
  assert.equal(v.correction.safeParse({ status: "ABSENT", reason: "ok" }).success, false);
  assert.equal(v.query.safeParse({ from: "2026-11-11", to: "2026-11-10" }).success, false);
});
