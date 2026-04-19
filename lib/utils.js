const fs = require("fs");
const path = require("path");

const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, "data");
const INPUT_DIR = path.join(DATA_DIR, "uploads");
const OUTPUT_DIR = path.join(DATA_DIR, "outputs");

function ensureDirs() {
  fs.mkdirSync(INPUT_DIR, { recursive: true });
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

function safeUnlink(filePath) {
  return fs.promises.unlink(filePath).catch(() => {});
}

function getExt(filename) {
  return path.extname(filename || "").replace(".", "").toLowerCase();
}

function sanitizeBaseName(filename) {
  const base = path.basename(filename || "audio", path.extname(filename || ""));
  const cleaned = base
    .replace(/[^\w.\- ]+/g, "_")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^[_\.]+|[_\.]+$/g, "");

  return cleaned || "audio";
}

function buildOutputFileName(originalName) {
  return `${sanitizeBaseName(originalName)}.flac`;
}

function buildLockKey(outputFileName) {
  return `audio-lock:${outputFileName}`;
}

module.exports = {
  INPUT_DIR,
  OUTPUT_DIR,
  ensureDirs,
  safeUnlink,
  getExt,
  buildOutputFileName,
  buildLockKey
};
