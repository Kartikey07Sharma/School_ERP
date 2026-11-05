const test = require("node:test");
const assert = require("node:assert/strict");
const prisma = require("../src/repositories/academic.repository");
const service = require("../src/services/academic.service");

test("school admins cannot override their authenticated school", async () => {
  await assert.rejects(service.list("years", { role: "SCHOOL_ADMIN", schoolId: "11111111-1111-4111-8111-111111111111" }, { schoolId: "22222222-2222-4222-8222-222222222222" }), { code: "SCHOOL_ID_FORBIDDEN" });
});

test("school structure endpoints reject college tenants based on database institution type", async (t) => {
  const original = prisma.school.findUnique;
  prisma.school.findUnique = async () => ({ id: "33333333-3333-4333-8333-333333333333", institutionType: "COLLEGE" });
  t.after(() => { prisma.school.findUnique = original; });
  await assert.rejects(service.list("grades", { role: "SCHOOL_ADMIN", schoolId: "33333333-3333-4333-8333-333333333333" }), { code: "SCHOOL_ONLY" });
});

test("common academic years remain available to a college", async (t) => {
  const originalSchool = prisma.school.findUnique;
  const originalFindMany = prisma.academicYear.findMany;
  prisma.school.findUnique = async () => ({ id: "33333333-3333-4333-8333-333333333333", institutionType: "COLLEGE" });
  prisma.academicYear.findMany = async () => [];
  t.after(() => { prisma.school.findUnique = originalSchool; prisma.academicYear.findMany = originalFindMany; });
  assert.deepEqual(await service.list("years", { role: "SCHOOL_ADMIN", schoolId: "33333333-3333-4333-8333-333333333333" }), []);
});

test("super admin must explicitly choose a target institution", async () => {
  await assert.rejects(service.list("grades", { role: "SUPER_ADMIN" }), { code: "SCHOOL_REQUIRED" });
});
