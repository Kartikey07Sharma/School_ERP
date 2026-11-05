const multer = require("multer");
const path = require("node:path");
const AppError = require("../utils/AppError");
const csvConfig = require("../config/student-csv");

const CSV_MIME_TYPES = new Set(["text/csv", "application/csv", "application/vnd.ms-excel"]);

function createStudentCsvUploadMiddleware({ maxFileSizeBytes = csvConfig.maxFileSizeBytes } = {}) {
  const receiveFile = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: maxFileSizeBytes, files: 1, fields: 10, parts: 11 },
    fileFilter(req, file, callback) {
      const extension = path.extname(file.originalname || "").toLowerCase();
      if (extension !== ".csv") {
        return callback(new AppError("Only .csv files are supported", 415, "UNSUPPORTED_FILE_TYPE"));
      }
      if (!CSV_MIME_TYPES.has(String(file.mimetype || "").toLowerCase())) {
        return callback(new AppError("The uploaded file must have a supported CSV MIME type", 415, "UNSUPPORTED_FILE_TYPE"));
      }
      return callback(null, true);
    },
  }).single("file");

  return (req, res, next) => {
    receiveFile(req, res, (error) => {
      if (error) {
        if (error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE") {
          return next(new AppError("CSV file exceeds the configured size limit", 413, "FILE_TOO_LARGE"));
        }
        if (error instanceof multer.MulterError) {
          return next(new AppError("Invalid CSV upload request", 400, "INVALID_UPLOAD"));
        }
        return next(error);
      }
      if (!req.file) return next(new AppError("A CSV file is required in the 'file' field", 400, "FILE_REQUIRED"));
      return next();
    });
  };
}

module.exports = { createStudentCsvUploadMiddleware, studentCsvUpload: createStudentCsvUploadMiddleware() };
