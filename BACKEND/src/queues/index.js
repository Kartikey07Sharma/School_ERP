const { Queue, Worker } = require("bullmq");
const Redis = require("ioredis");
const env = require("../config/env");

const queues = new Set();
const workers = new Set();

const defaultJobOptions = Object.freeze({
  attempts: env.QUEUE_ATTEMPTS,
  backoff: { type: "exponential", delay: 1000 },
  removeOnComplete: env.QUEUE_COMPLETED_RETENTION,
  removeOnFail: env.QUEUE_FAILED_RETENTION,
});

function queueConnection() {
  return new Redis(env.REDIS_URL, {
    lazyConnect: true,
    maxRetriesPerRequest: null,
    retryStrategy(attempt) {
      return attempt <= 5 ? Math.min(attempt * 500, 2500) : null;
    },
  });
}

// Queue names and job payload contracts belong to the feature that adds a job.
// This factory keeps infrastructure reusable without inventing business jobs.
function createQueue(name, options = {}) {
  if (!name || typeof name !== "string") throw new TypeError("A queue name is required");
  const queue = new Queue(name, {
    ...options,
    connection: options.connection || queueConnection(),
    defaultJobOptions: { ...defaultJobOptions, ...options.defaultJobOptions },
  });
  queues.add(queue);
  return queue;
}

function createWorker(name, processor, options = {}) {
  if (!name || typeof name !== "string") throw new TypeError("A queue name is required");
  if (typeof processor !== "function") throw new TypeError("A worker processor is required");
  const worker = new Worker(name, processor, {
    ...options,
    concurrency: options.concurrency || env.QUEUE_WORKER_CONCURRENCY,
    connection: options.connection || queueConnection(),
  });
  worker.on("failed", (job) => {
    console.error(JSON.stringify({
      event: "queue_job_failed",
      queue: name,
      hasJobId: Boolean(job?.id),
    }));
  });
  workers.add(worker);
  return worker;
}

async function closeQueues() {
  const results = await Promise.allSettled([
    ...Array.from(workers, (worker) => worker.close()),
    ...Array.from(queues, (queue) => queue.close()),
  ]);
  workers.clear();
  queues.clear();
  const failure = results.find((result) => result.status === "rejected");
  if (failure) throw failure.reason;
}

module.exports = { createQueue, createWorker, closeQueues, defaultJobOptions };
