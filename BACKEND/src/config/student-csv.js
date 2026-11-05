function positiveIntegerOrDefault(rawValue, fallback, maximum) {
  if (rawValue === undefined || rawValue === "") return fallback;
  const value = Number(rawValue);
  if (!Number.isSafeInteger(value) || value < 1 || value > maximum) return fallback;
  return value;
}

const maxFileSizeMb = positiveIntegerOrDefault(process.env.STUDENT_CSV_MAX_FILE_SIZE_MB, 5, 50);
const maxRows = positiveIntegerOrDefault(process.env.STUDENT_CSV_MAX_ROWS, 5000, 20000);

module.exports = Object.freeze({
  maxFileSizeMb,
  maxFileSizeBytes: maxFileSizeMb * 1024 * 1024,
  maxRows,
});
