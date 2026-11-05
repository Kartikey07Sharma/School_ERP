const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");

const repositoryPath = require.resolve("../src/repositories/student.repository");
const prismaRequest = "../database/prisma";

async function withMockPrisma(run) {
  const calls = [];
  const fakePrisma = {
    student: {
      create: async (args) => { calls.push(["create", args]); return args.data; },
      findFirst: async (args) => { calls.push(["findFirst", args]); return null; },
      findUnique: async (args) => { calls.push(["findUnique", args]); return null; },
      count: async (args) => { calls.push(["count", args]); return 42; },
      findMany: async (args) => { calls.push(["findMany", args]); return []; },
      createMany: async (args) => { calls.push(["createMany", args]); return { count: args.data.length }; },
      updateMany: async (args) => { calls.push(["updateMany", args]); return { count: 1 }; },
    },
    $transaction: async (operations) => Promise.all(operations),
  };
  const originalLoad = Module._load;
  delete require.cache[repositoryPath];
  Module._load = function (request, parent, isMain) {
    if (request === prismaRequest && parent?.filename === repositoryPath) return fakePrisma;
    return originalLoad.call(this, request, parent, isMain);
  };
  try { await run(require(repositoryPath), calls); }
  finally { Module._load = originalLoad; delete require.cache[repositoryPath]; }
}

test("repository create forces schoolId and excludes internal fields", async () => {
  await withMockPrisma(async (repository, calls) => {
    await repository.createStudent("school-a", { admissionNumber: "001", schoolId: "school-b", portalUserId: "u", status: "GRADUATED", firstName: "A" });
    assert.deepEqual(calls[0][1].data, { admissionNumber: "001", firstName: "A", schoolId: "school-a" });
  });
});

test("repository search, filters, pagination and count include school scope", async () => {
  await withMockPrisma(async (repository, calls) => {
    const result = await repository.findStudents("school-a", { page: 3, limit: 10, search: "001", status: "ACTIVE", className: "5", section: "A", academicYear: "2026-27" });
    const countWhere = calls.find(([name]) => name === "count")[1].where;
    const listArgs = calls.find(([name]) => name === "findMany")[1];
    assert.equal(countWhere.schoolId, "school-a");
    assert.equal(countWhere.className, "5");
    assert.equal(countWhere.OR.length, 4);
    assert.equal(listArgs.skip, 20);
    assert.equal(listArgs.take, 10);
    assert.equal(result.total, 42);
    assert.equal(result.totalPages, 5);
  });
});

test("repository update and soft deactivate always include schoolId", async () => {
  await withMockPrisma(async (repository, calls) => {
    await repository.updateStudent("s-1", "school-a", { firstName: "Updated", schoolId: "school-b", portalUserId: "other" });
    await repository.updateStudentStatus("s-1", "school-a", "GRADUATED");
    await repository.deactivateStudent("s-1", "school-a");
    const updates = calls.filter(([name]) => name === "updateMany").map(([, args]) => args);
    assert.deepEqual(updates[0].where, { id: "s-1", schoolId: "school-a" });
    assert.deepEqual(updates[0].data, { firstName: "Updated" });
    assert.deepEqual(updates[1].where, { id: "s-1", schoolId: "school-a" });
    assert.deepEqual(updates[1].data, { status: "GRADUATED" });
    assert.deepEqual(updates[2].where, { id: "s-1", schoolId: "school-a" });
    assert.deepEqual(updates[2].data, { status: "INACTIVE" });
  });
});

test("portal lookup is scoped by authenticated user and school", async () => {
  await withMockPrisma(async (repository, calls) => {
    await repository.findStudentByPortalUserId("user-a", "school-a");
    assert.deepEqual(calls[0][1].where, { portalUserId: "user-a", schoolId: "school-a" });
  });
});

test("bulk duplicate lookup batches admission numbers and is school-scoped", async () => {
  await withMockPrisma(async (repository, calls) => {
    await repository.findExistingAdmissionNumbers("school-a", Array.from({ length: 501 }, (_, index) => `00${index}`));
    const reads = calls.filter(([name]) => name === "findMany");
    assert.equal(reads.length, 2);
    assert.equal(reads[0][1].where.schoolId, "school-a");
    assert.equal(reads[0][1].where.admissionNumber.in.length, 500);
    assert.equal(reads[1][1].where.admissionNumber.in.length, 1);
  });
});

test("bulk insert forces the selected school onto every row", async () => {
  await withMockPrisma(async (repository, calls) => {
    await repository.createManyStudents("school-a", [
      { admissionNumber: "001", schoolId: "school-b", firstName: "A" },
      { admissionNumber: "002", firstName: "B" },
    ]);
    assert.deepEqual(calls[0][1].data, [
      { admissionNumber: "001", schoolId: "school-a", firstName: "A" },
      { admissionNumber: "002", schoolId: "school-a", firstName: "B" },
    ]);
  });
});
