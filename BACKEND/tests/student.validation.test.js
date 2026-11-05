const test = require("node:test");
const assert = require("node:assert/strict");
const {
  createStudentSchema,
  updateStudentSchema,
  studentQuerySchema,
  createPortalAccountSchema,
  linkPortalAccountSchema,
  portalAccountStatusSchema,
  changeStudentStatusSchema,
  updateMyStudentProfileSchema,
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

test("Phase 4 placement snapshots are optional and profile contact fields validate", () => {
  const input = validStudent();
  delete input.className;
  delete input.section;
  delete input.academicYear;
  input.guardianAddress = "Separate guardian address";
  input.city = "Pune";
  input.state = "Maharashtra";
  input.postalCode = "411001";
  input.bloodGroup = "O+";
  const parsed = createStudentSchema.safeParse(input);
  assert.equal(parsed.success, true);
  assert.equal(parsed.data.guardianAddress, "Separate guardian address");
  assert.equal(createStudentSchema.safeParse({ ...validStudent(), guardianPhone: "call me" }).success, false);
  assert.equal(createStudentSchema.safeParse({ ...validStudent(), bloodGroup: "X+" }).success, false);
});

test("shared portal account schemas reject roles, school IDs and weak credentials", () => {
  assert.equal(createPortalAccountSchema.safeParse({ email: " FAMILY@example.com ", password: "this-is-a-long-password", phone: "+919876543210" }).success, true);
  assert.equal(createPortalAccountSchema.safeParse({ email: "family@example.com", password: "short" }).success, false);
  assert.equal(createPortalAccountSchema.safeParse({ email: "family@example.com", password: "this-is-a-long-password", role: "PARENT" }).success, false);
  assert.equal(linkPortalAccountSchema.safeParse({ userId: "not-a-uuid" }).success, false);
  assert.equal(portalAccountStatusSchema.safeParse({ status: "SUSPENDED" }).success, false);
  assert.equal(changeStudentStatusSchema.safeParse({ status: "WITHDRAWN" }).success, true);
});

test("portal self-profile accepts contact and guardian fields but rejects identity and academic fields", () => {
  assert.equal(updateMyStudentProfileSchema.safeParse({ phone: "+919876543210", guardianEmail: "guardian@example.test", guardianAddress: "Home" }).success, true);
  assert.equal(updateMyStudentProfileSchema.safeParse({ email: "not-an-email" }).success, false);
  assert.equal(updateMyStudentProfileSchema.safeParse({ phone: "bad phone" }).success, false);
  assert.equal(updateMyStudentProfileSchema.safeParse({}).success, false);
  for (const field of ["id", "schoolId", "admissionNumber", "portalUserId", "status", "gradeId", "sectionId", "programmeId", "academicYearId", "role"]) {
    assert.equal(updateMyStudentProfileSchema.safeParse({ [field]: "unexpected" }).success, false, field);
  }
});

test("portal academic history query is bounded and paginated", () => {
  const { portalAcademicQuerySchema } = require("../src/validations/student.validation");
  assert.deepEqual(portalAcademicQuerySchema.parse({ page: "2", limit: "25" }), { page: 2, limit: 25 });
  assert.equal(portalAcademicQuerySchema.safeParse({ page: "0" }).success, false);
  assert.equal(portalAcademicQuerySchema.safeParse({ limit: "101" }).success, false);
});
