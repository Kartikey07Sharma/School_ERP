// Run against a configured PostgreSQL database after migrations:
// $env:RUN_ATTENDANCE_DB_TESTS='1'; node --test tests/attendance.database.integration.test.js
const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const db = require("../src/database/prisma");

const enabled = process.env.RUN_ATTENDANCE_DB_TESTS === "1";
test("attendance database tenant foreign keys and daily uniqueness", { skip: !enabled }, async () => {
  const tag = `AT${crypto.randomBytes(5).toString("hex").toUpperCase()}`;
  const schools = [];
  const users = [];
  const students = [];
  const years = [];
  const grades = [];
  const sections = [];
  const enrollments = [];
  try {
    await db.$connect();
    async function makeSchool(n) {
      const row = await db.school.create({ data: { name: `${tag} ${n}`, code: `${tag}-${n}`, email: `${tag.toLowerCase()}-${n}@example.test`, phone: `${Date.now()}${n}`.slice(-14), institutionType: "SCHOOL" } });
      schools.push(row.id);
      return row.id;
    }
    async function makeStudent(schoolId, n) {
      const row = await db.student.create({ data: { schoolId, admissionNumber: `${tag}-${n}`, firstName: "Test", lastName: `${n}`, dateOfBirth: new Date("2012-01-01T00:00:00Z"), gender: "Other", admissionDate: new Date("2026-04-01T00:00:00Z"), address: "Test", guardianName: "Guardian", guardianRelationship: "Parent", guardianPhone: "9876543210" } });
      students.push(row.id);
      return row.id;
    }
    const schoolA = await makeSchool(1);
    const schoolB = await makeSchool(2);
    const admin = await db.user.create({ data: { schoolId: schoolA, firstName: "Attendance", email: `${tag.toLowerCase()}-admin@example.test`, password: "test-only", role: "SCHOOL_ADMIN" } });
    users.push(admin.id);
    const studentA = await makeStudent(schoolA, 1);
    const studentB = await makeStudent(schoolB, 2);
    const year = await db.academicYear.create({ data: { schoolId: schoolA, name: `${tag} Year`, startDate: new Date("2026-04-01T00:00:00Z"), endDate: new Date("2027-03-31T00:00:00Z") } });
    years.push(year.id);
    const grade = await db.grade.create({ data: { schoolId: schoolA, code: tag, name: "Class 1", sequence: 1 } });
    grades.push(grade.id);
    const section = await db.section.create({ data: { schoolId: schoolA, gradeId: grade.id, academicYearId: year.id, name: "A", code: tag } });
    sections.push(section.id);
    const enrollment = await db.studentAcademicEnrollment.create({ data: { schoolId: schoolA, studentId: studentA, academicYearId: year.id, gradeId: grade.id, sectionId: section.id, enrollmentDate: new Date("2026-04-01T00:00:00Z") } });
    enrollments.push(enrollment.id);
    const data = { schoolId: schoolA, academicYearId: year.id, studentId: studentA, enrollmentId: enrollment.id, gradeId: grade.id, sectionId: section.id, attendanceDate: new Date("2026-11-10T00:00:00Z"), status: "PRESENT", markedById: admin.id };
    await db.schoolStudentAttendance.create({ data });
    await assert.rejects(db.schoolStudentAttendance.create({ data }), { code: "P2002" });
    await assert.rejects(db.schoolStudentAttendance.create({ data: { ...data, id: crypto.randomUUID(), studentId: studentB, attendanceDate: new Date("2026-11-11T00:00:00Z") } }), { code: "P2003" });
    const attempts = await Promise.allSettled([1, 2].map(() => db.schoolStudentAttendance.create({ data: { ...data, id: crypto.randomUUID(), attendanceDate: new Date("2026-11-12T00:00:00Z") } })));
    assert.equal(attempts.filter((x) => x.status === "fulfilled").length, 1);
    assert.equal(attempts.filter((x) => x.status === "rejected" && x.reason.code === "P2002").length, 1);
  } finally {
    if (schools.length) {
      await db.schoolStudentAttendance.deleteMany({ where: { schoolId: { in: schools } } });
      if (enrollments.length) await db.studentAcademicEnrollment.deleteMany({ where: { id: { in: enrollments } } });
      if (sections.length) await db.section.deleteMany({ where: { id: { in: sections } } });
      if (grades.length) await db.grade.deleteMany({ where: { id: { in: grades } } });
      if (years.length) await db.academicYear.deleteMany({ where: { id: { in: years } } });
      if (students.length) await db.student.deleteMany({ where: { id: { in: students } } });
      if (users.length) await db.user.deleteMany({ where: { id: { in: users } } });
      await db.school.deleteMany({ where: { id: { in: schools } } });
    }
    await db.$disconnect();
  }
});
