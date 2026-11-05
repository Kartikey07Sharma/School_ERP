const test = require("node:test");
const assert = require("node:assert/strict");
const { schemas } = require("../src/validations/academic.validation");

test("academic years accept valid date ranges and reject invalid calendar dates", () => {
  assert.equal(schemas.years.safeParse({ name: "2026-2027", startDate: "2026-04-01", endDate: "2027-03-31" }).success, true);
  assert.equal(schemas.years.safeParse({ name: "bad", startDate: "2026-02-30", endDate: "2027-03-31" }).success, false);
});

test("academic payloads reject client supplied unrelated fields", () => {
  assert.equal(schemas.subjects.safeParse({ name: "Math", code: "MATH", schoolId: "f5357ee3-ae51-40ca-9f6f-33c111000000", institutionType: "SCHOOL" }).success, false);
});

test("school class API payload cannot introduce pre-primary or arbitrary levels", () => {
  assert.equal(schemas.sections.safeParse({ gradeId: "f5357ee3-ae51-40ca-9f6f-33c111000000", academicYearId: "f5357ee3-ae51-40ca-9f6f-33c111000001", name: "A", code: "A", level: "NURSERY" }).success, false);
});
