const test = require("node:test");
const assert = require("node:assert/strict");
const { createStudentService } = require("../src/services/student.service");
const { hasPermission } = require("../src/constants/permissions");

const schoolA = "school-a";
const schoolB = "school-b";
const admin = { id: "admin-a", role: "SCHOOL_ADMIN", schoolId: schoolA };
const superAdmin = { id: "root", role: "SUPER_ADMIN", schoolId: null };
const profile = (admissionNumber = "001") => ({
  admissionNumber,
  firstName: "A",
  lastName: "B",
  dateOfBirth: new Date("2015-01-01T00:00:00.000Z"),
  gender: "Male",
  admissionDate: new Date("2026-01-01T00:00:00.000Z"),
  className: "5",
  section: "A",
  academicYear: "2026-27",
  address: "Address",
  guardianName: "Guardian",
  guardianRelationship: "Parent",
  guardianPhone: "1234567890",
});

function setup({ records = [], schools = [schoolA, schoolB], studentOverrides = {} } = {}) {
  const studentsBySchoolAndNumber = new Map(records.map((item) => [`${item.schoolId}:${item.admissionNumber}`, item]));
  const byId = new Map(records.map((item) => [item.id, item]));
  const calls = [];
  const studentRepo = {
    createStudent: async (schoolId, data) => {
      calls.push(["createStudent", schoolId, data]);
      const key = `${schoolId}:${data.admissionNumber}`;
      if (studentsBySchoolAndNumber.has(key)) {
        const error = new Error("duplicate");
        error.code = "P2002";
        error.meta = { target: ["schoolId", "admissionNumber"] };
        throw error;
      }
      const student = { id: `student-${byId.size + 1}`, schoolId, ...data };
      studentsBySchoolAndNumber.set(key, student);
      byId.set(student.id, student);
      return student;
    },
    findStudentByAdmissionNumber: async (number, schoolId) => studentsBySchoolAndNumber.get(`${schoolId}:${number}`) || null,
    findStudentById: async (id, schoolId) => {
      calls.push(["findStudentById", id, schoolId]);
      const student = byId.get(id);
      return student?.schoolId === schoolId ? student : null;
    },
    updateStudent: async (id, schoolId, data) => {
      calls.push(["updateStudent", id, schoolId, data]);
      const student = byId.get(id);
      if (!student || student.schoolId !== schoolId) return null;
      Object.assign(student, data);
      return student;
    },
    updateStudentStatus: async (id, schoolId, status) => {
      const student = byId.get(id);
      if (!student || student.schoolId !== schoolId) return null;
      student.status = status;
      return student;
    },
    deactivateStudent: async (id, schoolId) => {
      const student = byId.get(id);
      if (!student || student.schoolId !== schoolId) return null;
      student.status = "INACTIVE";
      return student;
    },
    findStudentByPortalUserId: async (userId, schoolId) => {
      calls.push(["findStudentByPortalUserId", userId, schoolId]);
      return [...byId.values()].find((s) => s.portalUserId === userId && s.schoolId === schoolId) || null;
    },
    findStudents: async (schoolId, filters) => ({ schoolId, filters, records: [] }),
    ...studentOverrides,
  };
  const schoolRepo = {
    findSchoolById: async (id) => schools.includes(id) ? { id, status: "ACTIVE" } : null,
  };
  return { service: createStudentService({ students: studentRepo, schools: schoolRepo }), studentRepo, calls, byId };
}

test("valid student creation scopes to the admin school and preserves admission number", async () => {
  const { service, calls } = setup();
  const result = await service.createStudent(profile("00123"), admin);
  assert.equal(result.schoolId, schoolA);
  assert.equal(result.admissionNumber, "00123");
  assert.equal(calls[0][1], schoolA);
});

test("duplicate admission number conflicts within a school but can repeat across schools", async () => {
  const { service } = setup({ records: [{ id: "existing", schoolId: schoolA, admissionNumber: "001", ...profile() }] });
  await assert.rejects(service.createStudent(profile("001"), admin), { code: "DUPLICATE_ADMISSION_NUMBER" });
  const created = await service.createStudent({ ...profile("001"), schoolId: schoolB }, superAdmin);
  assert.equal(created.schoolId, schoolB);
});

test("super admin must select an existing school", async () => {
  const { service } = setup();
  await assert.rejects(service.createStudent(profile(), superAdmin), { code: "SCHOOL_REQUIRED" });
  await assert.rejects(service.createStudent({ ...profile(), schoolId: "missing" }, superAdmin), { code: "NOT_FOUND" });
});

test("school admin cannot supply schoolId", async () => {
  const { service } = setup();
  await assert.rejects(service.createStudent({ ...profile(), schoolId: schoolA }, admin), { code: "SCHOOL_ID_FORBIDDEN" });
  await assert.rejects(service.getStudents({ schoolId: schoolA, page: 1, limit: 20 }, admin), { code: "SCHOOL_ID_FORBIDDEN" });
});

test("teacher, student, parent and unauthenticated actors cannot manage students", async () => {
  const { service } = setup();
  for (const actor of [null, { role: "TEACHER", schoolId: schoolA }, { role: "STUDENT", schoolId: schoolA }, { role: "PARENT", schoolId: schoolA }]) {
    await assert.rejects(service.createStudent(profile(), actor), { code: actor ? "FORBIDDEN" : "UNAUTHENTICATED" });
  }
  for (const role of ["TEACHER", "STUDENT", "PARENT"]) {
    assert.equal(hasPermission(role, "students:read:any"), false);
    assert.equal(hasPermission(role, "students:read:school"), false);
    assert.equal(hasPermission(role, "students:manage:any"), false);
    assert.equal(hasPermission(role, "students:manage:school"), false);
  }
});

test("cross-school read and update return not found", async () => {
  const student = { id: "student-b", schoolId: schoolB, ...profile() };
  const { service, calls } = setup({ records: [student] });
  await assert.rejects(service.getStudentById(student.id, undefined, admin), { code: "NOT_FOUND" });
  await assert.rejects(service.updateStudent(student.id, { firstName: "Changed" }, undefined, admin), { code: "NOT_FOUND" });
  assert.ok(calls.filter((call) => call[0] === "findStudentById").every((call) => call[2] === schoolA));
});

test("super admin reads require an explicit school and list stays school-scoped", async () => {
  const { service } = setup();
  await assert.rejects(service.getStudents({ page: 1, limit: 20 }, superAdmin), { code: "SCHOOL_REQUIRED" });
  await assert.rejects(service.getStudentById("s-1", undefined, superAdmin), { code: "SCHOOL_REQUIRED" });
  await assert.rejects(service.updateStudent("s-1", { firstName: "A" }, undefined, superAdmin), { code: "SCHOOL_REQUIRED" });
  await assert.rejects(service.changeStudentStatus("s-1", "ACTIVE", undefined, superAdmin), { code: "SCHOOL_REQUIRED" });
  await assert.rejects(service.deleteStudent("s-1", undefined, superAdmin), { code: "SCHOOL_REQUIRED" });
  const result = await service.getStudents({ schoolId: schoolB, page: 2, limit: 5, search: "A", status: "ACTIVE" }, superAdmin);
  assert.equal(result.schoolId, schoolB);
  assert.equal(result.filters.page, 2);
});

test("unexpected unique conflicts are not mislabeled as admission-number conflicts", async () => {
  const { service } = setup({ studentOverrides: { createStudent: async () => { const e = new Error("other unique"); e.code = "P2002"; e.meta = { target: ["portalUserId"] }; throw e; } } });
  await assert.rejects(service.createStudent(profile(), admin), (error) => error.code === "P2002");
});

test("database admission-number uniqueness races return the admission conflict", async () => {
  const { service } = setup({ studentOverrides: {
    createStudent: async () => { const e = new Error("race"); e.code = "P2002"; e.meta = { target: ["schoolId", "admissionNumber"] }; throw e; },
  } });
  await assert.rejects(service.createStudent(profile(), admin), { code: "DUPLICATE_ADMISSION_NUMBER", statusCode: 409 });
});

test("student /me uses authenticated ID and school, and returns 404 when unlinked", async () => {
  const linked = { id: "student-a", schoolId: schoolA, portalUserId: "student-user", ...profile() };
  const { service, calls } = setup({ records: [linked] });
  assert.equal(await service.getStudentByPortalUser({ id: "student-user", role: "STUDENT", schoolId: schoolA }), linked);
  assert.deepEqual(calls[0], ["findStudentByPortalUserId", "student-user", schoolA]);
  await assert.rejects(service.getStudentByPortalUser({ id: "no-link", role: "STUDENT", schoolId: schoolA }), { code: "NOT_FOUND" });
  await assert.rejects(service.getStudentByPortalUser({ id: "parent", role: "PARENT", schoolId: schoolA }), { code: "FORBIDDEN" });
});

test("service deletion is a soft deactivation", async () => {
  const student = { id: "student-a", schoolId: schoolA, status: "ACTIVE", ...profile() };
  const { service, byId } = setup({ records: [student] });
  await service.deleteStudent(student.id, undefined, admin);
  assert.equal(byId.get(student.id).status, "INACTIVE");
  assert.equal(byId.has(student.id), true);
});

test("shared portal account creation hashes the password and returns only safe user fields", async () => {
  const studentId = "11111111-1111-4111-8111-111111111111";
  let captured;
  const scoped = createStudentService({
    students: { createPortalAccountAndLink: async (id, schoolId, data) => { captured = { id, schoolId, data }; return { state: "LINKED", user: { id: "user-1", role: "STUDENT", schoolId, email: data.email, status: "ACTIVE" } }; } },
    schools: { findSchoolById: async (id) => ({ id, status: "ACTIVE" }) },
    bcryptLib: { hash: async (password, rounds) => { assert.equal(rounds, 12); return `bcrypt:${password}`; } },
  });
  const account = await scoped.createPortalAccount(studentId, { email: " FAMILY@example.test ", password: "a-very-long-password" }, undefined, admin);
  assert.equal(captured.id, studentId);
  assert.equal(captured.schoolId, schoolA);
  assert.equal(captured.data.email, "family@example.test");
  assert.equal(captured.data.password, "bcrypt:a-very-long-password");
  assert.equal(account.role, "STUDENT");
  assert.equal(Object.hasOwn(account, "password"), false);
});

test("portal account linking rejects cross-tenant, non-student and already-linked user outcomes", async () => {
  const studentId = "22222222-2222-4222-8222-222222222222";
  const userId = "33333333-3333-4333-8333-333333333333";
  let state = "USER_NOT_FOUND";
  const service = createStudentService({
    students: { linkPortalUser: async (id, schoolId, requestedUserId) => { assert.equal(id, studentId); assert.equal(schoolId, schoolA); assert.equal(requestedUserId, userId); return { state }; } },
    schools: { findSchoolById: async (id) => ({ id, status: "ACTIVE" }) },
  });
  await assert.rejects(service.linkPortalAccount(studentId, userId, undefined, admin), { code: "NOT_FOUND" });
  state = "USER_INELIGIBLE";
  await assert.rejects(service.linkPortalAccount(studentId, userId, undefined, admin), { code: "USER_INELIGIBLE" });
  state = "USER_ALREADY_LINKED";
  await assert.rejects(service.linkPortalAccount(studentId, userId, undefined, admin), { code: "USER_ALREADY_LINKED" });
});

test("portal account status changes remain scoped to the authenticated institution", async () => {
  const studentId = "44444444-4444-4444-8444-444444444444";
  const calls = [];
  const service = createStudentService({
    students: { updatePortalAccountStatus: async (...args) => { calls.push(args); return { state: "UPDATED", user: { id: "user-1", role: "STUDENT", status: args[2], schoolId: args[1] } }; } },
    schools: { findSchoolById: async (id) => ({ id, status: "ACTIVE" }) },
  });
  assert.equal((await service.changePortalAccountStatus(studentId, "INACTIVE", undefined, admin)).status, "INACTIVE");
  assert.equal((await service.changePortalAccountStatus(studentId, "ACTIVE", undefined, admin)).status, "ACTIVE");
  assert.deepEqual(calls.map((call) => call.slice(0, 3)), [[studentId, schoolA, "INACTIVE"], [studentId, schoolA, "ACTIVE"]]);
  await assert.rejects(service.changePortalAccountStatus(studentId, "INACTIVE", undefined, { role: "TEACHER", schoolId: schoolA }), { code: "FORBIDDEN" });
});

const portalActor = { id: "portal-user", role: "STUDENT", schoolId: schoolA };
const portalProfile = (institutionType = "SCHOOL") => ({
  id: "student-owned", schoolId: schoolA, portalUserId: portalActor.id, firstName: "Rahul", middleName: null, lastName: "Sharma",
  admissionNumber: "A001", status: "ACTIVE", guardianName: "Amit", guardianRelationship: "Father", guardianPhone: "9876543210", guardianEmail: "guardian@example.test",
  school: { id: schoolA, name: "A Institution", institutionType },
});

test("portal dashboard resolves the Student from the authenticated user and returns scoped profile data", async () => {
  const { service } = setup({ studentOverrides: {
    findPortalProfile: async (userId, tenantId) => userId === portalActor.id && tenantId === schoolA ? portalProfile() : null,
    findSchoolAcademicData: async () => ({ current: null, records: [], total: 0, page: 1, pageSize: 10, totalPages: 0 }),
  } });
  const dashboard = await service.getMyStudentDashboard(portalActor);
  assert.equal(dashboard.student.id, "student-owned");
  assert.equal(dashboard.student.fullName, "Rahul Sharma");
  assert.equal(dashboard.institution.institutionType, "SCHOOL");
  assert.equal(dashboard.guardian.name, "Amit");
  assert.equal(dashboard.academicSummary.current, null);
  await assert.rejects(service.getMyStudentDashboard({ ...portalActor, role: "PARENT" }), { code: "FORBIDDEN" });
});

test("school portal academics prefer authoritative enrolment data over profile snapshots", async () => {
  const placement = {
    id: "enrollment-1", status: "ACTIVE", rollNumber: "05", enrollmentDate: new Date("2026-04-01"), leavingDate: null,
    academicYear: { id: "year-1", name: "2026–27", isCurrent: true },
    grade: { id: "grade-5", name: "Class 5", code: "CLASS_5", sequence: 5, subjectMappings: [{ isMandatory: true, subject: { id: "subject-1", name: "Math", code: "MATH" } }] },
    section: { id: "section-a", name: "A", code: "A", status: "ACTIVE" },
  };
  const { service } = setup({ studentOverrides: {
    findPortalProfile: async () => ({ ...portalProfile(), className: "Legacy Class 9", section: "Z", academicYear: "Legacy", school: { ...portalProfile().school, institutionType: "SCHOOL" } }),
    findSchoolAcademicData: async (_studentId, _schoolId, page, limit) => ({ current: placement, records: [placement], total: 1, page, pageSize: limit, totalPages: 1 }),
  } });
  const result = await service.getMyStudentAcademicInformation(portalActor, { page: 1, limit: 10 });
  assert.equal(result.current.grade.name, "Class 5");
  assert.equal(result.current.academicYear.name, "2026–27");
  assert.equal(result.current.subjects[0].name, "Math");
});

test("college portal academics expose configured programme, current term and registered courses", async () => {
  const current = {
    id: "programme-enrollment", status: "ACTIVE", registrationNumber: "REG-1", admissionDate: new Date("2026-06-01"),
    programme: { id: "programme-1", name: "Bachelor of Arts", durationYears: 3, totalSemesters: 6, termMode: "SEMESTER", department: { id: "dept-1", name: "Arts" } },
    curriculumVersion: { id: "curriculum-1", versionCode: "2026", termMode: "SEMESTER" },
    batch: { id: "batch-1", admissionYear: 2026 },
    semesterEnrollments: [{ id: "semester-1", status: "ACTIVE", academicYear: { name: "2026–27", isCurrent: true }, programmeTerm: { name: "Term 1", sequence: 1, semesterNumber: 1 } }],
  };
  const { service } = setup({ studentOverrides: {
    findPortalProfile: async () => ({ ...portalProfile("COLLEGE"), school: { ...portalProfile("COLLEGE").school, institutionType: "COLLEGE" } }),
    findCollegeAcademicData: async (_studentId, _schoolId, page, limit) => ({ current, records: [current], total: 1, page, pageSize: limit, totalPages: 1 }),
    findCollegeCourseRegistrations: async () => ({ records: [{ course: { name: "History", credits: 3 } }], total: 1, page: 1, pageSize: 10, totalPages: 1 }),
  } });
  const result = await service.getMyStudentAcademicInformation(portalActor, { page: 1, limit: 10 });
  assert.equal(result.current.programme.name, "Bachelor of Arts");
  assert.equal(result.current.currentSemesterEnrollment.programmeTerm.semesterNumber, 1);
  assert.equal(result.courseRegistrations.records[0].course.name, "History");
  assert.equal(result.current.programme.totalSemesters, 6);
});

test("portal profile updates use only the linked Student and leave account identity management separate", async () => {
  let call;
  const { service } = setup({ studentOverrides: {
    findPortalProfile: async (userId, tenantId) => userId === portalActor.id && tenantId === schoolA ? portalProfile() : null,
    updatePortalProfile: async (...args) => { call = args; return { ...portalProfile(), guardianEmail: args[2].guardianEmail }; },
  } });
  const updated = await service.updateMyStudentProfile({ guardianEmail: "new-guardian@example.test" }, portalActor);
  assert.equal(call[0], portalActor.id);
  assert.equal(call[1], schoolA);
  assert.deepEqual(call[2], { guardianEmail: "new-guardian@example.test" });
  assert.equal(updated.guardianEmail, "new-guardian@example.test");
});
