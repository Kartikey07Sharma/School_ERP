const env = require("./config/env");
const app = require("./app");
const prisma = require("./database/prisma");
const redis = require("./database/redis");
const { closeQueues } = require("./queues");
const PORT = env.PORT;
let server;
let shuttingDown = false;

/**
 * Start Server
 */
const startServer = async () => {
  try {
    await prisma.$connect();

    console.info("PostgreSQL connection ready");
    await redis.connectRedis();

    server = app.listen(PORT, () => {
      console.info(`HTTP server listening on port ${PORT}`);
    });
  } catch (error) {
    console.error("Application startup failed; check service configuration and availability");
    await shutdown(1);
  }
};

function closeHttpServer() {
  if (!server) return Promise.resolve();
  return new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
}

async function shutdown(exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.info("Shutting down application");
  const steps = [closeHttpServer, closeQueues, redis.closeRedis, () => prisma.$disconnect()];
  for (const close of steps) {
    try {
      await close();
    } catch {
      console.error("A service did not close cleanly");
      exitCode = 1;
    }
  }
  process.exitCode = exitCode;
}

process.once("SIGINT", () => void shutdown());
process.once("SIGTERM", () => void shutdown());
process.on("unhandledRejection", () => {
  console.error("Unhandled asynchronous error");
  void shutdown(1);
});
process.once("uncaughtException", () => {
  console.error("Uncaught application error");
  void shutdown(1);
});

void startServer();
