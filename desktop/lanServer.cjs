const http = require("node:http");
const os = require("node:os");
const crypto = require("node:crypto");
const dgram = require("node:dgram");
const lanAuth = require("./lanAuth.cjs");

const DEFAULT_PORT = 9847;

function isVirtualAdapter(name) {
  const n = String(name || "").toLowerCase();
  return (
    n.includes("vethernet") ||
    n.includes("vmware") ||
    n.includes("virtualbox") ||
    n.includes("vbox") ||
    n.includes("hyper-v") ||
    n.includes("hyperv") ||
    n.includes("wsl") ||
    n.includes("docker") ||
    n.includes("npcap") ||
    n.includes("loopback") ||
    n.startsWith("tap") ||
    n.startsWith("tun") ||
    n.includes("zerotier") ||
    n.includes("tailscale") ||
    n.includes("bluetooth")
  );
}

function isPrivateRange(addr) {
  return (
    addr.startsWith("192.168.") ||
    addr.startsWith("10.") ||
    /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(addr)
  );
}

function listLanCandidates() {
  const nets = os.networkInterfaces();
  const list = [];
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (net.family !== "IPv4" || net.internal) continue;
      list.push({
        name,
        address: net.address,
        virtual: isVirtualAdapter(name),
        privateRange: isPrivateRange(net.address),
      });
    }
  }
  list.sort((a, b) => {
    if (a.virtual !== b.virtual) return a.virtual ? 1 : -1;
    if (a.privateRange !== b.privateRange) return a.privateRange ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  return list;
}

/** Physical adapters on private LAN ranges (Wi-Fi / Ethernet). */
function listPhysicalLanAddresses() {
  const physical = listLanCandidates().filter((c) => !c.virtual);
  const lan = physical.filter((c) => c.privateRange);
  return lan.length > 0 ? lan : physical;
}

function getLanIpv4() {
  const candidates = listLanCandidates();
  const real = candidates.find((c) => !c.virtual && c.privateRange);
  if (real) return real.address;
  const priv = candidates.find((c) => c.privateRange);
  if (priv) return priv.address;
  const any = candidates.find((c) => !c.virtual);
  if (any) return any.address;
  return candidates[0]?.address ?? "127.0.0.1";
}

function etagForBody(body) {
  const h = crypto.createHash("sha256").update(body, "utf8").digest("hex");
  return `"${h.slice(0, 32)}"`;
}

function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () =>
      resolve(Buffer.concat(chunks).toString("utf8")),
    );
    req.on("error", reject);
  });
}

/**
 * @param {object} options
 * @param {import('electron').App} options.app
 * @param {typeof import('./vaultPaths.cjs')} options.vaultPaths
 * @param {number} [options.port]
 * @param {() => void} [options.onVaultWritten]
 */
function createLanServer({ app, vaultPaths, port = DEFAULT_PORT, onVaultWritten }) {
  let server = null;
  let lastSyncAt = null;

  // Pairing state.
  let activePairingCode = null;
  let pairingTimeout = null;
  let udpSocket = null;
  let udpInterval = null;
  const UDP_PORT = 9846;
  const PAIRING_TIMEOUT_MS = 120_000; // 2 minutes

  /** Load the stored pairing token (persisted across restarts). */
  function getStoredToken() {
    return lanAuth.loadPairingToken(app);
  }

  function status() {
    const ip = getLanIpv4();
    const addresses = listPhysicalLanAddresses().map((c) => ({
      label: c.name,
      address: `${c.address}:${port}`,
      ip: c.address,
      virtual: false,
      privateRange: c.privateRange,
    }));
    const raw = vaultPaths.loadVault(app);
    const vaultEtag =
      raw && vaultPaths.isValidVaultEnvelope(raw) ? etagForBody(raw) : null;
    return {
      running: !!server,
      port,
      address: `${ip}:${port}`,
      addresses,
      vaultEtag,
      lastSyncAt,
      paired: !!getStoredToken(),
      pairingActive: !!activePairingCode,
    };
  }

  function sendJson(res, code, obj) {
    res.writeHead(code, { "Content-Type": "application/json" });
    res.end(JSON.stringify(obj));
  }

  /** Return 401 if the request is not authenticated. Returns true if OK. */
  function requireAuth(req, res) {
    const storedToken = getStoredToken();
    if (!storedToken) {
      sendJson(res, 401, { error: "No device is paired. Start pairing on the desktop app." });
      return false;
    }
    if (!lanAuth.validateBearerToken(req, storedToken)) {
      sendJson(res, 401, { error: "Unauthorized. Re-pair your device." });
      return false;
    }
    return true;
  }

  async function handleRequest(req, res) {
    // Security: no wildcard CORS. Only allow explicit CORS for OPTIONS preflight.
    // The phone uses a native HTTP client, not a browser, so CORS is not needed.
    // This blocks browser-based CSRF attacks entirely.
    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    const pathname = (req.url || "").split("?")[0];

    // === Pairing endpoint (unauthenticated, but code-protected) ===
    if (pathname === "/api/pair" && req.method === "POST") {
      if (!activePairingCode) {
        sendJson(res, 403, { error: "Pairing is not active. Start pairing on the desktop app." });
        return;
      }
      let body;
      try {
        body = await readRequestBody(req);
      } catch {
        sendJson(res, 400, { error: "Bad request." });
        return;
      }
      let code;
      try {
        code = (JSON.parse(body)).code;
      } catch {
        sendJson(res, 400, { error: "Invalid JSON." });
        return;
      }
      if (typeof code !== "string" || code.toUpperCase().trim() !== activePairingCode) {
        sendJson(res, 403, { error: "Incorrect pairing code." });
        return;
      }
      // Pairing successful — derive and store the token.
      const token = lanAuth.deriveTokenFromCode(activePairingCode);
      lanAuth.savePairingToken(app, token);
      // Stop pairing mode.
      stopPairing();
      sendJson(res, 200, { ok: true, token });
      return;
    }

    // === Status endpoint (authenticated) ===
    if (pathname === "/api/status" && req.method === "GET") {
      if (!requireAuth(req, res)) return;
      sendJson(res, 200, status());
      return;
    }

    // === Vault GET (authenticated) ===
    if (pathname === "/api/vault" && req.method === "GET") {
      if (!requireAuth(req, res)) return;
      const raw = vaultPaths.loadVault(app);
      if (!raw || !vaultPaths.isValidVaultEnvelope(raw)) {
        sendJson(res, 404, { error: "No vault on this PC." });
        return;
      }
      const etag = etagForBody(raw);
      res.writeHead(200, {
        "Content-Type": "application/json",
        ETag: etag,
      });
      res.end(raw);
      return;
    }

    // === Vault PUT (authenticated) ===
    if (pathname === "/api/vault" && req.method === "PUT") {
      if (!requireAuth(req, res)) return;
      let body;
      try {
        body = await readRequestBody(req);
      } catch {
        sendJson(res, 400, { error: "Bad request body." });
        return;
      }
      if (!body || !vaultPaths.isValidVaultEnvelope(body)) {
        sendJson(res, 400, { error: "Not a valid encrypted vault file." });
        return;
      }

      const current = vaultPaths.loadVault(app);
      const ifMatch = req.headers["if-match"];
      if (ifMatch && current) {
        const curEtag = etagForBody(current);
        if (ifMatch !== curEtag) {
          sendJson(res, 409, {
            error: "Vault on PC changed since you last read it. Pull first or force push.",
            serverEtag: curEtag,
          });
          return;
        }
      }

      try {
        vaultPaths.saveVault(app, body);
      } catch (e) {
        sendJson(res, 500, { error: e.message || "Save failed." });
        return;
      }

      lastSyncAt = new Date().toISOString();
      const newEtag = etagForBody(body);
      if (typeof onVaultWritten === "function") {
        try {
          onVaultWritten({ etag: newEtag });
        } catch {
          /* ignore */
        }
      }
      sendJson(res, 200, { ok: true, etag: newEtag, lastSyncAt });
      return;
    }

    res.writeHead(404);
    res.end();
  }

  function createRequestHandler() {
    return (req, res) => {
      void handleRequest(req, res).catch(() => {
        if (!res.headersSent) {
          res.writeHead(500);
          res.end();
        }
      });
    };
  }

  function start() {
    if (server?.listening) return Promise.resolve(status());

    return new Promise((resolve) => {
      if (server) {
        try {
          server.close();
        } catch {
          /* ignore */
        }
        server = null;
      }

      const s = http.createServer(createRequestHandler());

      const fail = (err) => {
        try {
          s.close();
        } catch {
          /* ignore */
        }
        server = null;
        const st = status();
        st.running = false;
        st.error =
          err && err.code === "EADDRINUSE"
            ? `Port ${port} is already in use. Click Stop LAN server, close other Password Manager windows, or restart the app.`
            : err && err.message
              ? err.message
              : "Could not start LAN server.";
        resolve(st);
      };

      s.once("error", fail);
      s.listen(port, "0.0.0.0", () => {
        s.removeListener("error", fail);
        server = s;
        resolve(status());
      });
    });
  }

  // === Pairing mode (controls UDP beacon) ===

  function startPairing() {
    // Generate a new code each time.
    activePairingCode = lanAuth.generatePairingCode();

    // Auto-stop after timeout.
    if (pairingTimeout) clearTimeout(pairingTimeout);
    pairingTimeout = setTimeout(() => stopPairing(), PAIRING_TIMEOUT_MS);

    // Start UDP beacon only during pairing.
    startUdpBeacon();

    return activePairingCode;
  }

  function stopPairing() {
    activePairingCode = null;
    if (pairingTimeout) {
      clearTimeout(pairingTimeout);
      pairingTimeout = null;
    }
    stopUdpBeacon();
  }

  function getPairingCode() {
    return activePairingCode;
  }

  function unpair() {
    lanAuth.deletePairingToken(app);
    stopPairing();
  }

  function startUdpBeacon() {
    if (udpSocket) {
      stopUdpBeacon();
    }
    udpSocket = dgram.createSocket("udp4");
    udpSocket.on("error", (err) => {
      console.error("UDP socket error:", err);
      stopUdpBeacon();
    });
    udpSocket.bind(0, () => {
      try {
        udpSocket.setBroadcast(true);
      } catch (err) {
        console.error("Failed to set UDP broadcast flag:", err);
      }
      sendBeacon();
      udpInterval = setInterval(sendBeacon, 5000);
    });
  }

  function sendBeacon() {
    if (!udpSocket || !activePairingCode) return;
    try {
      const message = JSON.stringify({
        type: "pms-discovery",
        port: port,
        // Include pairing code in beacon so phone can auto-pair.
        code: activePairingCode,
      });
      const bytes = Buffer.from(message);
      udpSocket.send(bytes, 0, bytes.length, UDP_PORT, "255.255.255.255", (err) => {
        if (err) {
          console.error("UDP broadcast failed:", err);
        }
      });
    } catch (e) {
      console.error("UDP beacon error:", e);
    }
  }

  function stopUdpBeacon() {
    if (udpInterval) {
      clearInterval(udpInterval);
      udpInterval = null;
    }
    if (udpSocket) {
      try {
        udpSocket.close();
      } catch {
        /* ignore */
      }
      udpSocket = null;
    }
  }

  function stop() {
    return new Promise((resolve) => {
      stopPairing();
      if (!server) {
        resolve(status());
        return;
      }

      const s = server;
      server = null;

      s.close(() => resolve(status()));
    });
  }

  return {
    start,
    stop,
    status,
    startPairing,
    stopPairing,
    getPairingCode,
    unpair,
    DEFAULT_PORT,
  };
}

module.exports = {
  createLanServer,
  getLanIpv4,
  listLanCandidates,
  DEFAULT_PORT,
};
