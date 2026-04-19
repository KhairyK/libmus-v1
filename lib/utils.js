const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
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
  const ext = path.extname(filename || "").replace(".", "").toLowerCase();
  return ext;
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
  const base = sanitizeBaseName(originalName);
  return `${base}.flac`;
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
