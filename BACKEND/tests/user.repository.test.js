const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");

const repositoryPath = require.resolve("../src/repositories/user.repository");
const prismaRequest = "../database/prisma";

async function withMockPrisma(run) {
  const calls = [];
  const fakePrisma = {
    user: {
      update: async (args) => {
        calls.push(args);
        return { id: args.where.id };
      },
    },
  };

  const originalLoad = Module._load;
  delete require.cache[repositoryPath];

  Module._load = function (request, parent, isMain) {
    if (
      request === prismaRequest &&
      parent &&
      parent.filename === repositoryPath
    ) {
      return fakePrisma;
    }

    return originalLoad.call(this, request, parent, isMain);
  };

  try {
    const repository = require(repositoryPath);
    await run(repository, calls);
  } finally {
    Module._load = originalLoad;
    delete require.cache[repositoryPath];
  }
}

test("repository mutation queries enforce tenant scope", async (t) => {
  await t.test("school admin update includes schoolId", async () => {
    await withMockPrisma(async (repository, calls) => {
      await repository.updateUser(
        "user-1",
        { firstName: "Updated" },
        { role: "SCHOOL_ADMIN", schoolId: "school-a" }
      );

      assert.deepEqual(calls[0].where, {
        id: "user-1",
        schoolId: "school-a",
      });
    });
  });

  await t.test("status change scopes tenant and increments authVersion", async () => {
    await withMockPrisma(async (repository, calls) => {
      await repository.changeUserStatus(
        "user-1",
        "INACTIVE",
        { role: "SCHOOL_ADMIN", schoolId: "school-a" }
      );

      assert.deepEqual(calls[0].where, {
        id: "user-1",
        schoolId: "school-a",
      });
      assert.deepEqual(calls[0].data, {
        status: "INACTIVE",
        authVersion: { increment: 1 },
      });
    });
  });

  await t.test("delete is a scoped soft delete", async () => {
    await withMockPrisma(async (repository, calls) => {
      await repository.deleteUser(
        "user-1",
        { role: "SCHOOL_ADMIN", schoolId: "school-a" }
      );

      assert.deepEqual(calls[0].where, {
        id: "user-1",
        schoolId: "school-a",
      });
      assert.deepEqual(calls[0].data, {
        status: "INACTIVE",
        authVersion: { increment: 1 },
      });
    });
  });

  await t.test("super admin is not restricted to one school", async () => {
    await withMockPrisma(async (repository, calls) => {
      await repository.updateUser(
        "user-1",
        { firstName: "Updated" },
        { role: "SUPER_ADMIN", schoolId: null }
      );

      assert.deepEqual(calls[0].where, { id: "user-1" });
    });
  });

  await t.test("missing schoolId uses a non-tenant sentinel", async () => {
    await withMockPrisma(async (repository, calls) => {
      await repository.updateUser(
        "user-1",
        { firstName: "Updated" },
        { role: "SCHOOL_ADMIN", schoolId: null }
      );

      assert.deepEqual(calls[0].where, {
        id: "user-1",
        schoolId: "__no_tenant__",
      });
    });
  });
});
