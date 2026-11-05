const test = require("node:test");
const assert = require("node:assert/strict");
const prisma = require("../src/repositories/college.repository");
const service = require("../src/services/college.service");

test("college service rejects school institutions using the persisted institution type", async (t) => {
  const old = prisma.school.findUnique;
  prisma.school.findUnique = async () => ({ id: "00000000-0000-4000-8000-000000000001", institutionType: "SCHOOL" });
  t.after(() => { prisma.school.findUnique = old; });
  await assert.rejects(service.list("departments", { role: "SCHOOL_ADMIN", schoolId: "00000000-0000-4000-8000-000000000001" }), { code: "COLLEGE_ONLY" });
});

test("college routes require an explicit target for super admins", async () => {
  await assert.rejects(service.list("departments", { role: "SUPER_ADMIN" }), { code: "SCHOOL_REQUIRED" });
});

test("cross-college identifiers are hidden as not found", async (t) => {
  const oldSchool = prisma.school.findUnique;
  const oldFind = prisma.department.findFirst;
  prisma.school.findUnique = async () => ({ id: "00000000-0000-4000-8000-000000000002", institutionType: "COLLEGE" });
  prisma.department.findFirst = async () => null;
  t.after(() => { prisma.school.findUnique = oldSchool; prisma.department.findFirst = oldFind; });
  await assert.rejects(service.get("departments", "00000000-0000-4000-8000-000000000099", { role: "SCHOOL_ADMIN", schoolId: "00000000-0000-4000-8000-000000000002" }), { code: "NOT_FOUND" });
});

test("an explicitly supplied ACTIVE status cannot bypass duplicate programme enrolment checks", async (t) => {
  const originals = {
    school: prisma.school.findUnique, student: prisma.student.findFirst, programme: prisma.programme.findFirst,
    curriculum: prisma.curriculumVersion.findFirst, batch: prisma.collegeBatch.findFirst,
    enrollment: prisma.studentProgrammeEnrollment.findFirst,
  };
  prisma.school.findUnique = async () => ({ id: "00000000-0000-4000-8000-000000000002", institutionType: "COLLEGE" });
  prisma.student.findFirst = async () => ({ id: "00000000-0000-4000-8000-000000000010" });
  prisma.programme.findFirst = async () => ({ id: "00000000-0000-4000-8000-000000000011" });
  prisma.curriculumVersion.findFirst = async () => ({ id: "00000000-0000-4000-8000-000000000012", programmeId: "00000000-0000-4000-8000-000000000011" });
  prisma.collegeBatch.findFirst = async () => ({ id: "00000000-0000-4000-8000-000000000013", programmeId: "00000000-0000-4000-8000-000000000011", curriculumVersionId: "00000000-0000-4000-8000-000000000012" });
  prisma.studentProgrammeEnrollment.findFirst = async () => ({ id: "existing-enrollment" });
  t.after(() => {
    prisma.school.findUnique = originals.school; prisma.student.findFirst = originals.student; prisma.programme.findFirst = originals.programme;
    prisma.curriculumVersion.findFirst = originals.curriculum; prisma.collegeBatch.findFirst = originals.batch;
    prisma.studentProgrammeEnrollment.findFirst = originals.enrollment;
  });
  await assert.rejects(service.create("programmeEnrollments", {
    studentId: "00000000-0000-4000-8000-000000000010", programmeId: "00000000-0000-4000-8000-000000000011", curriculumVersionId: "00000000-0000-4000-8000-000000000012", batchId: "00000000-0000-4000-8000-000000000013",
    admissionDate: new Date("2026-06-01"), expectedCompletionDate: new Date("2030-05-31"), status: "ACTIVE",
  }, { role: "SCHOOL_ADMIN", schoolId: "00000000-0000-4000-8000-000000000002" }), { code: "DUPLICATE_ENROLMENT" });
});

test("semester generation creates eight ordered B.Tech semesters and is idempotent", async (t) => {
  const oldSchool = prisma.school.findUnique;
  const oldCurriculumFind = prisma.curriculumVersion.findFirst;
  const oldUpsert = prisma.programmeTerm.upsert;
  const oldTermsFind = prisma.programmeTerm.findMany;
  const oldTransaction = prisma.$transaction;
  const upserts = new Map();
  prisma.school.findUnique = async () => ({ id: "00000000-0000-4000-8000-000000000002", institutionType: "COLLEGE" });
  prisma.curriculumVersion.findFirst = async () => ({ id: "00000000-0000-4000-8000-000000000012", schoolId: "00000000-0000-4000-8000-000000000002", termMode: "SEMESTER", durationYears: 4, semestersPerYear: 2, totalSemesters: 8 });
  prisma.programmeTerm.upsert = async (query) => { upserts.set(query.where.curriculumVersionId_sequence.sequence, query.create); return query.create; };
  prisma.$transaction = async (ops) => Promise.all(ops);
  prisma.programmeTerm.findMany = async () => [...upserts.values()];
  t.after(() => { prisma.school.findUnique = oldSchool; prisma.curriculumVersion.findFirst = oldCurriculumFind; prisma.programmeTerm.upsert = oldUpsert; prisma.programmeTerm.findMany = oldTermsFind; prisma.$transaction = oldTransaction; });
  const rows = await service.generateTerms("00000000-0000-4000-8000-000000000012", { role: "SCHOOL_ADMIN", schoolId: "00000000-0000-4000-8000-000000000002" });
  await service.generateTerms("00000000-0000-4000-8000-000000000012", { role: "SCHOOL_ADMIN", schoolId: "00000000-0000-4000-8000-000000000002" });
  assert.equal(upserts.size, 8);
  assert.equal(rows.length, 8);
  assert.deepEqual(rows.map((x) => x.sequence), [1, 2, 3, 4, 5, 6, 7, 8]);
  assert.deepEqual(rows.map((x) => x.academicYearNumber), [1, 1, 2, 2, 3, 3, 4, 4]);
  assert.deepEqual(rows.map((x) => x.semesterNumber), [1, 2, 3, 4, 5, 6, 7, 8]);
});
