const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const http = require("node:http");
const errorMiddleware = require("../src/middlewares/error.middleware");
const { createStudentCsvUploadMiddleware } = require("../src/middlewares/student-csv-upload.middleware");

async function withUploadServer(maxFileSizeBytes, run) {
  const app = express();
  app.post("/upload", createStudentCsvUploadMiddleware({ maxFileSizeBytes }), (req, res) => {
    res.status(200).json({ length: req.file.buffer.length, hasPath: Boolean(req.file.path) });
  });
  app.use(errorMiddleware);
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  try { await run(server.address().port); }
  finally { await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); }
}

function multipartRequest(port, { filename = "students.csv", mime = "text/csv", file = "a,b\n1,2", fieldName = "file", extraFields = [] } = {}) {
  const boundary = "----StudentCsvTestBoundary";
  const parts = [];
  if (filename !== null) {
    parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${fieldName}"; filename="${filename}"\r\nContent-Type: ${mime}\r\n\r\n`));
    parts.push(Buffer.isBuffer(file) ? file : Buffer.from(file));
    parts.push(Buffer.from("\r\n"));
  }
  for (const [name, value] of extraFields) {
    parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`));
  }
  parts.push(Buffer.from(`--${boundary}--\r\n`));
  const body = Buffer.concat(parts);
  return new Promise((resolve, reject) => {
    const request = http.request({ hostname: "127.0.0.1", port, path: "/upload", method: "POST", headers: {
      "content-type": `multipart/form-data; boundary=${boundary}`,
      "content-length": body.length,
    } }, (response) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => resolve({ status: response.statusCode, body: JSON.parse(Buffer.concat(chunks).toString("utf8")) }));
    });
    request.on("error", reject);
    request.end(body);
  });
}

test("CSV upload accepts .csv with supported MIME and keeps file in memory", async () => {
  await withUploadServer(1024, async (port) => {
    const response = await multipartRequest(port);
    assert.equal(response.status, 200);
    assert.equal(response.body.length, 7);
    assert.equal(response.body.hasPath, false);
  });
});

test("CSV upload rejects missing file, wrong field, extension and MIME", async () => {
  await withUploadServer(1024, async (port) => {
    assert.equal((await multipartRequest(port, { filename: null })).status, 400);
    assert.equal((await multipartRequest(port, { fieldName: "upload" })).status, 400);
    const wrongExtension = await multipartRequest(port, { filename: "students.xlsx", mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    assert.equal(wrongExtension.status, 415);
    const wrongMime = await multipartRequest(port, { mime: "application/octet-stream" });
    assert.equal(wrongMime.status, 415);
  });
});

test("CSV upload rejects oversized files and unsupported spreadsheet content types", async () => {
  await withUploadServer(8, async (port) => {
    const oversized = await multipartRequest(port, { file: "a,b\n123456789,2" });
    assert.equal(oversized.status, 413);
    const xls = await multipartRequest(port, { filename: "students.xls", mime: "application/vnd.ms-excel" });
    assert.equal(xls.status, 415);
  });
});

test("CSV upload accepts uppercase CSV extension with Excel CSV MIME", async () => {
  await withUploadServer(1024, async (port) => {
    const response = await multipartRequest(port, { filename: "STUDENTS.CSV", mime: "application/vnd.ms-excel" });
    assert.equal(response.status, 200);
  });
});
