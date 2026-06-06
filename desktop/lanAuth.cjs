const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const PAIRING_FILE = "lan-pairing.json";
const CODE_LENGTH = 6;
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // No 0/O/1/I to avoid confusion

/**
 * Generate a random pairing code for the user to type on their phone.
 */
function generatePairingCode() {
  let code = "";
  for (let i = 0; i < CODE_LENGTH; i++) {
    const idx = crypto.randomInt(CODE_CHARS.length);
    code += CODE_CHARS[idx];
  }
  return code;
}

/**
 * Derive a bearer token from a pairing code using HMAC-SHA256.
 * The same code always produces the same token, so the phone can derive
 * the token locally after the user enters the code.
 */
function deriveTokenFromCode(code) {
  return crypto
    .createHmac("sha256", "pms-lan-pairing-v1")
    .update(code.toUpperCase().trim())
    .digest("hex");
}

/**
 * Load the persisted pairing token from disk.
 */
function loadPairingToken(app) {
  const file = path.join(app.getPath("userData"), PAIRING_FILE);
  if (!fs.existsSync(file)) return null;
  try {
    const obj = JSON.parse(fs.readFileSync(file, "utf8"));
    return obj.token || null;
  } catch {
    return null;
  }
}

/**
 * Save the pairing token to disk.
 */
function savePairingToken(app, token) {
  const file = path.join(app.getPath("userData"), PAIRING_FILE);
  const dir = path.dirname(file);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(file, JSON.stringify({ token, savedAt: new Date().toISOString() }), "utf8");
}

/**
 * Delete the pairing token from disk.
 */
function deletePairingToken(app) {
  const file = path.join(app.getPath("userData"), PAIRING_FILE);
  if (fs.existsSync(file)) fs.unlinkSync(file);
}

/**
 * Validate an incoming request's Authorization header against the stored token.
 * Returns true if valid.
 */
function validateBearerToken(req, storedToken) {
  if (!storedToken) return false;
  const auth = req.headers["authorization"] || "";
  if (!auth.startsWith("Bearer ")) return false;
  const incoming = auth.slice(7).trim();
  if (!incoming) return false;
  // Constant-time comparison to prevent timing attacks.
  return crypto.timingSafeEqual(
    Buffer.from(incoming, "utf8"),
    Buffer.from(storedToken, "utf8"),
  );
}

module.exports = {
  generatePairingCode,
  deriveTokenFromCode,
  loadPairingToken,
  savePairingToken,
  deletePairingToken,
  validateBearerToken,
};
