const express = require("express");
const cookieParser = require("cookie-parser");
const env = require("./config/env");

const schoolRoutes = require("./routes/school.routes");
const userRoutes = require("./routes/user.routes");
const authRoutes = require("./routes/auth.routes");
const studentRoutes = require("./routes/student.routes");
const academicRoutes = require("./routes/academic.routes");
const collegeRoutes = require("./routes/college.routes");
const employeeRoutes = require("./routes/employee.routes");
const schoolTeacherAssignmentRoutes = require("./routes/school-teacher-assignment.routes");

const errorMiddleware = require(
  "./middlewares/error.middleware"
);
const prisma = require("./database/prisma");
const redis = require("./database/redis");

const app = express();

if (env.TRUST_PROXY_HOPS > 0) app.set("trust proxy", env.TRUST_PROXY_HOPS);

/**
 * Parse JSON Request Body
 */
app.use(express.json());
app.use(cookieParser());

// Liveness is intentionally independent of backing services.
app.get("/health/live", (req, res) => {
  res.status(200).json({ success: true, status: "alive" });
});

// PostgreSQL is required for API requests. Redis is optional until a feature
// explicitly depends on it, so its state is reported without making the API
// unready or exposing connection details.
app.get("/health/ready", async (req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.status(200).json({
      success: true,
      status: "ready",
      dependencies: { postgres: "available", redis: redis.isReady() ? "available" : "unavailable" },
    });
  } catch {
    res.status(503).json({
      success: false,
      status: "not_ready",
      dependencies: { postgres: "unavailable", redis: redis.isReady() ? "available" : "unavailable" },
    });
  }
});

/**
 * School Routes
 */
app.use(
  "/api/v1/auth",
  authRoutes
);

app.use(
  "/api/v1/schools",
  schoolRoutes
);

/**
 * User Routes
 */
app.use(
  "/api/v1/users",
  userRoutes
);

app.use(
  "/api/v1/students",
  studentRoutes
);

app.use("/api/v1", academicRoutes);
app.use("/api/v1", collegeRoutes);
app.use("/api/v1/employees", employeeRoutes);
app.use("/api/v1/school/teacher-assignments", schoolTeacherAssignmentRoutes);

/**
 * Global Error Handler
 */
app.use(errorMiddleware);

module.exports = app;
