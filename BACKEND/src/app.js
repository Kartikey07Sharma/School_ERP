const express = require("express");

const schoolRoutes = require("./routes/school.routes");

const errorMiddleware = require(
  "./middlewares/error.middleware"
);

const app = express();

app.use(express.json());

app.use(
  "/api/v1/schools",
  schoolRoutes
);

app.use(errorMiddleware);

module.exports = app;