const test = require("node:test");
const assert = require("node:assert/strict");
const { parseCsvBuffer } = require("../src/utils/csv-parser");

test("CSV parser handles quoted commas, escaped quotes, multiline fields, CRLF and BOM", () => {
  const csv = '\uFEFFname,address,note\r\n"A Student","12 Main Road, Dehradun","said ""hello""\r\nnext line"\r\n';
  const records = parseCsvBuffer(Buffer.from(csv, "utf8"));
  assert.deepEqual(records, [
    { rowNumber: 1, values: ["name", "address", "note"] },
    { rowNumber: 2, values: ["A Student", "12 Main Road, Dehradun", 'said "hello"\nnext line'] },
  ]);
});

test("CSV parser rejects empty, malformed and invalid UTF-8 content", () => {
  assert.throws(() => parseCsvBuffer(Buffer.alloc(0)), { code: "INVALID_CSV" });
  assert.throws(() => parseCsvBuffer(Buffer.from('a,b\n"unclosed,b', "utf8")), { code: "INVALID_CSV" });
  assert.throws(() => parseCsvBuffer(Buffer.from('a,b\nx"y,z', "utf8")), { code: "INVALID_CSV" });
  assert.throws(() => parseCsvBuffer(Buffer.from([0xc3, 0x28])), { code: "INVALID_CSV" });
});

test("CSV parser skips blank lines and preserves starting physical row numbers", () => {
  const records = parseCsvBuffer(Buffer.from("a,b\n\nx,y\n", "utf8"));
  assert.deepEqual(records.map((record) => record.rowNumber), [1, 3]);
});
