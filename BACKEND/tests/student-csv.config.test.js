const test = require("node:test");
const assert = require("node:assert/strict");

test("CSV limits use defaults for missing or invalid values and accept safe positive values", () => {
  const configPath = require.resolve("../src/config/student-csv");
  const originalSize = process.env.STUDENT_CSV_MAX_FILE_SIZE_MB;
  const originalRows = process.env.STUDENT_CSV_MAX_ROWS;
  const restore = (name, value) => value === undefined ? delete process.env[name] : process.env[name] = value;
  try {
    process.env.STUDENT_CSV_MAX_FILE_SIZE_MB = "-1";
    process.env.STUDENT_CSV_MAX_ROWS = "not-a-number";
    delete require.cache[configPath];
    let config = require(configPath);
    assert.equal(config.maxFileSizeMb, 5);
    assert.equal(config.maxRows, 5000);

    process.env.STUDENT_CSV_MAX_FILE_SIZE_MB = "2";
    process.env.STUDENT_CSV_MAX_ROWS = "100";
    delete require.cache[configPath];
    config = require(configPath);
    assert.equal(config.maxFileSizeMb, 2);
    assert.equal(config.maxRows, 100);
  } finally {
    restore("STUDENT_CSV_MAX_FILE_SIZE_MB", originalSize);
    restore("STUDENT_CSV_MAX_ROWS", originalRows);
    delete require.cache[configPath];
  }
});
