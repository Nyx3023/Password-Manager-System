const path = require("node:path");
const fs = require("node:fs");

const VAULT_FILE = "vault.enc.json";
const VAULT_BACKUP_FILE = "vault.enc.json.bak";
const VAULT_TEMP_FILE = "vault.enc.json.tmp";
const PREFS_FILE = "app.prefs.json";

/** Allowlisted file names that may be read/written via IPC. */
const SAFE_FILES = new Set([
  VAULT_FILE,
  VAULT_BACKUP_FILE,
  VAULT_TEMP_FILE,
  PREFS_FILE,
  "lan-pairing.json",
  "ipc-session.token",
  "mpin-device.json",
  "unlock-attempts.json",
]);

/**
 * Validate a filename from the renderer. Rejects path traversal,
 * hidden files, and anything not on the allowlist.
 * Throws on invalid input.
 */
function sanitizeFileName(name) {
  if (typeof name !== "string" || !name) {
    throw new Error("Invalid file name.");
  }
  if (name.includes("..") || name.includes("/") || name.includes("\\") || name.includes("\0")) {
    throw new Error("Invalid file name: path traversal detected.");
  }
  if (name.startsWith(".")) {
    throw new Error("Invalid file name: hidden files not allowed.");
  }
  if (!SAFE_FILES.has(name)) {
    throw new Error(`Invalid file name: "${name}" is not allowed.`);
  }
  return name;
}

function getDataDir(app) {
  return app.getPath("userData");
}

function filePath(app, name) {
  return path.join(getDataDir(app), name);
}

function ensureDataDir(app) {
  const dir = getDataDir(app);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

function readText(app, name) {
  const full = filePath(app, name);
  if (!fs.existsSync(full)) return null;
  return fs.readFileSync(full, "utf8");
}

function writeText(app, name, content) {
  ensureDataDir(app);
  fs.writeFileSync(filePath(app, name), content, "utf8");
}

function deleteFile(app, name) {
  const full = filePath(app, name);
  if (fs.existsSync(full)) {
    fs.unlinkSync(full);
  }
}

function isValidVaultEnvelope(raw) {
  try {
    const obj = JSON.parse(raw);
    return (
      obj.kdf === "argon2id" &&
      obj.cipher === "aes-256-gcm" &&
      typeof obj.ciphertext === "string" &&
      typeof obj.iv === "string" &&
      (obj.version === 1 || obj.version === 2)
    );
  } catch {
    return false;
  }
}

function loadVault(app) {
  const primary = readText(app, VAULT_FILE);
  if (primary && isValidVaultEnvelope(primary)) return primary;

  const backup = readText(app, VAULT_BACKUP_FILE);
  if (backup && isValidVaultEnvelope(backup)) {
    writeText(app, VAULT_FILE, backup);
    return backup;
  }

  const temp = readText(app, VAULT_TEMP_FILE);
  if (temp && isValidVaultEnvelope(temp)) {
    writeText(app, VAULT_FILE, temp);
    deleteFile(app, VAULT_TEMP_FILE);
    return temp;
  }

  return primary;
}

function saveVault(app, content) {
  if (!isValidVaultEnvelope(content)) {
    throw new Error("Invalid vault envelope");
  }
  const current = readText(app, VAULT_FILE);
  if (current && isValidVaultEnvelope(current)) {
    writeText(app, VAULT_BACKUP_FILE, current);
  }
  writeText(app, VAULT_TEMP_FILE, content);
  writeText(app, VAULT_FILE, content);
  deleteFile(app, VAULT_TEMP_FILE);
}

module.exports = {
  VAULT_FILE,
  VAULT_BACKUP_FILE,
  VAULT_TEMP_FILE,
  PREFS_FILE,
  getDataDir,
  ensureDataDir,
  filePath,
  readText,
  writeText,
  deleteFile,
  loadVault,
  saveVault,
  isValidVaultEnvelope,
  sanitizeFileName,
};
