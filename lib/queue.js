const IORedis = require("ioredis");
const { Queue } = require("bullmq");

if (!process.env.REDIS_URL) {
  throw new Error("REDIS_URL is required");
}

const connection = new IORedis(process.env.REDIS_URL, {
  maxRetriesPerRequest: null
});

const queue = new Queue("audio-jobs", {
  connection
});

module.exports = {
  connection,
  queue
};
