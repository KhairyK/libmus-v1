const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const { Worker } = require("bullmq");
const { connection } = require("./lib/queue");
const { OUTPUT_DIR, safeUnlink, buildLockKey, ensureDirs } = require("./lib/utils");

ensureDirs();

function runFfmpeg({ inputPath, outputPath, loudnorm }) {
  return new Promise((resolve, reject) => {
    const args = [
      "-y",
      "-i",
      inputPath,
      "-vn",
      "-map_metadata",
      "0"
    ];

    if (loudnorm) {
      args.push("-af", "loudnorm=I=-16:TP=-1.5:LRA=11");
    }

    args.push(
      "-c:a",
      "flac",
      "-compression_level",
      "12",
      outputPath
    );

    const child = spawn("ffmpeg", args, {
      stdio: ["ignore", "ignore", "pipe"]
    });

    let stderr = "";

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", (err) => {
      reject(err);
    });

    child.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`ffmpeg exited with code ${code}. ${stderr}`));
      }
    });
  });
}

const worker = new Worker(
  "audio-jobs",
  async (job) => {
    const {
      inputPath,
      outputPath,
      outputFileName,
      loudnorm
    } = job.data;

    const lockKey = buildLockKey(outputFileName);

    try {
      await job.updateProgress(10);

      if (!fs.existsSync(inputPath)) {
        throw new Error("Input file not found");
      }

      if (fs.existsSync(outputPath)) {
        throw new Error("Output file already exists");
      }

      await runFfmpeg({
        inputPath,
        outputPath,
        loudnorm: !!loudnorm
      });

      await job.updateProgress(100);

      return {
        outputFileName,
        outputPath: path.basename(outputPath),
        status: "completed"
      };
    } finally {
      await safeUnlink(inputPath);
      await connection.del(lockKey);
    }
  },
  {
    connection,
    concurrency: Number(process.env.WORKER_CONCURRENCY || 1)
  }
);

worker.on("completed", (job) => {
  console.log(`Job completed: ${job.id}`);
});

worker.on("failed", (job, err) => {
  console.error(`Job failed: ${job?.id}`, err?.message || err);
});
