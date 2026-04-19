const fs = require("fs");
const { spawn } = require("child_process");
const { Worker } = require("bullmq");
const { connection } = require("./queue");
const { ensureDirs, safeUnlink, buildLockKey } = require("./utils");

ensureDirs();

function runFfmpeg({ inputPath, outputPath, loudnorm }) {
  return new Promise((resolve, reject) => {
    const args = [
      "-y",
      "-i", inputPath,
      "-vn",
      "-map_metadata", "0"
    ];

    if (loudnorm) {
      args.push("-af", "loudnorm=I=-16:TP=-1.5:LRA=11");
    }

    args.push(
      "-c:a", "flac",
      "-compression_level", "12",
      outputPath
    );

    const ff = spawn("ffmpeg", args, { stdio: ["ignore", "ignore", "pipe"] });

    let stderr = "";
    ff.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    ff.on("error", reject);
    ff.on("close", (code) => {
      if (code === 0) return resolve();
      reject(new Error(`ffmpeg failed with code ${code}\n${stderr}`));
    });
  });
}

const worker = new Worker(
  "audio-jobs",
  async (job) => {
    const { inputPath, outputPath, outputFileName, loudnorm } = job.data;
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
        status: "done",
        outputFileName
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
  console.log("Completed:", job.id);
});

worker.on("failed", (job, err) => {
  console.error("Failed:", job?.id, err?.message || err);
}); 
