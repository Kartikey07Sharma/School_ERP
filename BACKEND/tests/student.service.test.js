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
