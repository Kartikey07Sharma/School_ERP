const AppError = require("../utils/AppError");

const errorMiddleware = (err, req, res, next) => {
  let safeError = err;
  if (err?.code === "P2002" || err?.code === "23505") {
    safeError = new AppError("A record with those details already exists", 409, "CONFLICT");
  } else if (err?.code === "P2025") {
    safeError = new AppError("Record not found", 404, "NOT_FOUND");
  } else if (err?.code === "P2003") {
    safeError = new AppError("Related record does not exist or is still in use", 409, "CONSTRAINT_CONFLICT");
  } else if (["P1001", "P1002", "P2024", "ECONNREFUSED", "ECONNRESET", "ETIMEDOUT", "EHOSTUNREACH", "NR_CLOSED"].includes(err?.code)) {
    safeError = new AppError("A required service is temporarily unavailable", 503, "SERVICE_UNAVAILABLE");
  } else if (err?.name === "ZodError") {
    safeError = new AppError("Request validation failed", 400, "VALIDATION_ERROR");
  } else if (!(err instanceof AppError)) {
    safeError = new AppError("An unexpected error occurred", 500, "INTERNAL_ERROR");
  }

  if (safeError.statusCode >= 500) {
    console.error(JSON.stringify({ event: "request_failed", errorType: err?.name || "Error", method: req.method }));
  }
  return res.status(safeError.statusCode).json({
    success: false,
    error: { code: safeError.code, message: safeError.message },
  });
};

module.exports = errorMiddleware;
