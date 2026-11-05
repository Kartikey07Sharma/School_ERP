const test = require("node:test");
const assert = require("node:assert/strict");
const {
  createStudentSchema,
  updateStudentSchema,
  studentQuerySchema,
} = require("../src/validations/student.validation");

const validStudent = () => ({
  admissionNumber: " 00127 ",
  firstName: "Rahul",
  middleName: " ",
  lastName: "Sharma",
  dateOfBirth: "2015-05-21",
  gender: "Male",
  admissionDate: "2026-04-01",
  className: "5",
  section: "A",
  academicYear: "2026-27",
  email: "  GUARDIAN@EXAMPLE.COM ",
  phone: " ",
  address: "12 Main Road",
  guardianName: "A Sharma",
  guardianRelationship: "Parent",
  guardianPhone: "9876543210",
  guardianEmail: "",
});

test("student creation validates and normalizes valid profile data", () => {
  const result = createStudentSchema.safeParse(validStudent());
  assert.equal(result.success, true);
  assert.equal(result.data.admissionNumber, "00127");
  assert.equal(result.data.gender, "Male");
  assert.equal(result.data.middleName, null);
  assert.equal(result.data.email, "guardian@example.com");
  assert.equal(result.data.phone, null);
  assert.equal(result.data.guardianEmail, null);
});

test("student creation rejects missing required fields and unsupported gender", () => {
  const missing = validStudent();
  delete missing.guardianPhone;
  assert.equal(createStudentSchema.safeParse(missing).success, false);
  assert.equal(createStudentSchema.safeParse({ ...validStudent(), gender: "Prefer not to say" }).success, false);
});

test("student dates require real dates and reject future birth dates", () => {
  assert.equal(createStudentSchema.safeParse({ ...validStudent(), dateOfBirth: "2015-02-30" }).success, false);
  const future = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  assert.equal(createStudentSchema.safeParse({ ...validStudent(), dateOfBirth: future }).success, false);
});

test("admission date cannot precede birth date", () => {
  assert.equal(createStudentSchema.safeParse({ ...validStudent(), admissionDate: "2014-01-01" }).success, false);
  assert.equal(updateStudentSchema.safeParse({ dateOfBirth: "2015-05-21", admissionDate: "2015-05-20" }).success, false);
});

test("PATCH requires a valid non-empty profile update and rejects internal fields", () => {
  assert.equal(updateStudentSchema.safeParse({}).success, false);
  for (const field of ["id", "schoolId", "portalUserId", "createdAt", "updatedAt", "password", "authVersion"]) {
    assert.equal(updateStudentSchema.safeParse({ [field]: "unexpected" }).success, false, field);
  }
});

test("invalid emails are rejected and admission number keeps leading zeros", () => {
  assert.equal(createStudentSchema.safeParse({ ...validStudent(), email: "not-an-email" }).success, false);
  const result = createStudentSchema.safeParse(validStudent());
  assert.equal(result.data.admissionNumber, "00127");
});

test("student list query validates bounded pagination and filters", () => {
  const result = studentQuerySchema.safeParse({ page: "2", limit: "10", status: "ACTIVE", search: "Rahul", className: "5", section: "A", academicYear: "2026-27" });
  assert.equal(result.success, true);
  assert.equal(result.data.page, 2);
  assert.equal(result.data.limit, 10);
  assert.equal(studentQuerySchema.safeParse({ limit: "101" }).success, false);
});
