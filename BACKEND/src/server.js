require("dotenv").config();

const app = require("./app");
const prisma = require("./database/prisma");

const PORT = process.env.PORT || 5000;

/**
 * Start Server
 */
const startServer = async () => {
  try {
    await prisma.$connect();

    console.log(" Database Connected Successfully");

    const server = app.listen(PORT, () => {
      console.log(
        ` Server running on http://localhost:${PORT}`
      );
    });

    /**
     * Unhandled Promise Rejection
     */
    process.on("unhandledRejection", (err) => {
      console.error(
        " Unhandled Rejection:",
        err.message
      );

      server.close(() => {
        process.exit(1);
      });
    });

    /**
     * Graceful Shutdown
     */
    process.on("SIGINT", async () => {
      console.log(
        "\n Shutting down server..."
      );

      await prisma.$disconnect();

      server.close(() => {
        console.log(
          " Server closed successfully"
        );
        process.exit(0);
      });
    });

  } catch (error) {
    console.error(
      " Failed to start server:",
      error.message
    );

    process.exit(1);
  }
};

startServer();

/**
 * Uncaught Exception
 */
process.on("uncaughtException", (err) => {
  console.error(
    " Uncaught Exception:",
    err.message
  );

  process.exit(1);
});