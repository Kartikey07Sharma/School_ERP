const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");

const controllerPath = require.resolve("../src/controllers/student-import.controller");
const serviceRequest = "../services/student-import.service";

async function withMockService(service, run) {
  const originalLoad = Module._load;
  delete require.cache[controllerPath];
  Module._load = function (request, parent, isMain) {
    if (request === serviceRequest && parent?.filename === controllerPath) return service;
    return originalLoad.call(this, request, parent, isMain);
  };
  try { await run(require(controllerPath)); }
  finally { Module._load = originalLoad; delete require.cache[controllerPath]; }
}

function responseRecorder() {
  return {
    statusCode: null,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return this; },
  };
}

test("preview controller forwards the uploaded buffer and responds with the existing success shape", async () => {
  let args;
  await withMockService({ preview: async (...values) => { args = values; return { summary: { totalRows: 1 } }; } }, async (controller) => {
    const req = { file: { buffer: Buffer.from("csv") }, user: { id: "u" }, validatedImportQuery: { schoolId: "school-a" }, body: {} };
    const res = responseRecorder();
    await controller.preview(req, res, (error) => { throw error; });
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.success, true);
    assert.deepEqual(args, [req.file.buffer, req.user, "school-a", {}]);
  });
});

test("import controller avoids claiming success after database errors", async () => {
  await withMockService({ importStudents: async () => ({ summary: { databaseFailure: true, importedRows: 0 }, results: [] }) }, async (controller) => {
    const res = responseRecorder();
    await controller.importStudents({ file: { buffer: Buffer.from("csv") }, user: {}, validatedImportQuery: {}, body: {} }, res, (error) => { throw error; });
    assert.equal(res.statusCode, 207);
    assert.equal(res.body.success, false);
    assert.equal(res.body.error.code, "STUDENT_IMPORT_DATABASE_FAILURE");
    assert.equal(res.body.data.summary.databaseFailure, true);
  });
});
