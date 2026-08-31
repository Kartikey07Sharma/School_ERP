const express = require("express");

const schoolRoutes = require("./routes/school.routes");
const userRoutes = require("./routes/user.routes");

const errorMiddleware = require(
  "./middlewares/error.middleware"
);

const app = express();

/**
 * Parse JSON Request Body
 */
app.use(express.json());

/**
 * School Routes
 */
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

/**
 * Global Error Handler
 */
app.use(errorMiddleware);

module.exports = app;