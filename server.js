const fs = require("fs");
const path = require("path");
const express = require("express");
const multer = require("multer");
const { queue, connection } = require("./lib/queue");
const {
  INPUT_DIR,
  OUTPUT_DIR,
  ensureDirs,
  safeUnlink,
  getExt,
  buildOutputFileName,
  buildLockKey
} = require("./lib/utils");

require("./worker");

ensureDirs();

const app = express();

const allowedExts = new Set(["mp3", "wav", "ogg", "m4a", "flac"]);

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, INPUT_DIR),
  filename: (req, file, cb) => {
    const stamp = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const ext = getExt(file.originalname) || "bin";
    cb(null, `${stamp}.${ext}`);
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: Number(process.env.MAX_UPLOAD_BYTES || 50 * 1024 * 1024)
  }
});

app.get("/", (req, res) => {
  res.json({
    status: "ok",
    service: "audio flac queue",
    mode: "railway"
  });
});

app.post("/api/jobs", upload.single("musicFile"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        status: "error",
        message: "No file uploaded"
      });
    }

    const originalName = req.file.originalname;
    const ext = getExt(originalName);

    if (!allowedExts.has(ext)) {
      await safeUnlink(req.file.path);
      return res.status(400).json({
        status: "error",
        message: "Invalid audio format. Allowed: MP3, WAV, OGG, M4A, FLAC"
      });
    }

    const outputFileName = buildOutputFileName(originalName);
    const outputPath = path.join(OUTPUT_DIR, outputFileName);
    const lockKey = buildLockKey(outputFileName);

    if (fs.existsSync(outputPath)) {
      await safeUnlink(req.file.path);
      return res.status(409).json({
        status: "error",
        message: "File already exists. Please rename your file."
      });
    }

    const lock = await connection.set(lockKey, "1", "NX", "EX", 24 * 60 * 60);
    if (!lock) {
      await safeUnlink(req.file.path);
      return res.status(409).json({
        status: "error",
        message: "File is already being processed or already exists."
      });
    }

    const existingJob = await queue.getJob(outputFileName);
    if (existingJob) {
      await connection.del(lockKey);
      await safeUnlink(req.file.path);
      return res.status(409).json({
        status: "error",
        message: "Job with this filename already exists."
      });
    }

    const job = await queue.add(
      "convert-to-flac",
      {
        inputPath: req.file.path,
        outputPath,
        outputFileName,
        originalName,
        loudnorm: String(process.env.ENABLE_LOUDNORM || "true") !== "false"
      },
      {
        jobId: outputFileName,
        removeOnComplete: false,
        removeOnFail: false,
        attempts: 2
      }
    );

    return res.status(202).json({
      status: "queued",
      jobId: job.id,
      fileName: outputFileName,
      originalName,
      statusUrl: `/api/jobs/${encodeURIComponent(job.id)}`,
      downloadUrl: `/api/jobs/${encodeURIComponent(job.id)}/download`
    });
  } catch (err) {
    return res.status(500).json({
      status: "error",
      message: err.message || "Internal server error"
    });
  }
});

app.get("/api/jobs/:jobId", async (req, res) => {
  try {
    const { jobId } = req.params;
    const job = await queue.getJob(jobId);

    if (!job) {
      return res.status(404).json({
        status: "error",
        message: "Job not found"
      });
    }

    const state = await job.getState();

    return res.json({
      jobId: job.id,
      state,
      progress: job.progress,
      data: job.data,
      returnvalue: job.returnvalue || null,
      failedReason: job.failedReason || null,
      timestamps: {
        createdAt: job.timestamp,
        processedOn: job.processedOn || null,
        finishedOn: job.finishedOn || null
      }
    });
  } catch (err) {
    return res.status(500).json({
      status: "error",
      message: err.message || "Internal server error"
    });
  }
});

app.get("/api/jobs/:jobId/download", async (req, res) => {
  try {
    const { jobId } = req.params;
    const outputPath = path.join(OUTPUT_DIR, jobId);

    if (!fs.existsSync(outputPath)) {
      return res.status(404).json({
        status: "error",
        message: "Output file not ready yet"
      });
    }

    return res.download(outputPath, jobId);
  } catch (err) {
    return res.status(500).json({
      status: "error",
      message: err.message || "Internal server error"
    });
  }
});

app.use((req, res) => {
  res.status(404).json({
    status: "error",
    message: "Not found"
  });
});

const port = Number(process.env.PORT || 3000);
app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});
