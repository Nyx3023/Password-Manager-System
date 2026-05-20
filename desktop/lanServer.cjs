const http = require("node:http");
const os = require("node:os");
const crypto = require("node:crypto");

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
  let pairingCode = null;
  let pairingExpires = 0;
  let lastSyncAt = null;

  const PAIRING_TTL_MS = 10 * 60 * 1000;

  function generatePairingCode() {
    pairingCode = String(Math.floor(100000 + Math.random() * 900000));
    pairingExpires = Date.now() + PAIRING_TTL_MS;
    return pairingCode;
  }

  function validateToken(req) {
    if (!pairingCode || Date.now() >= pairingExpires) {
      return { ok: false, reason: "Pairing code expired. Start the LAN server again on the PC." };
    }
    const token =
      req.headers["x-sync-token"] ||
      (req.headers.authorization && String(req.headers.authorization).replace(/^Bearer\s+/i, ""));
    if (!token || String(token).trim() !== pairingCode) {
      return { ok: false, reason: "Invalid pairing code." };
    }
    return { ok: true };
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
    return {
      running: !!server,
      port,
      address: `${ip}:${port}`,
      addresses,
      pairingCode: server && Date.now() < pairingExpires ? pairingCode : null,
      lastSyncAt,
    };
  }

  function sendJson(res, code, obj) {
    res.writeHead(code, { "Content-Type": "application/json" });
    res.end(JSON.stringify(obj));
  }

  async function handleRequest(req, res) {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Sync-Token, Authorization, If-Match");
    res.setHeader("Access-Control-Allow-Methods", "GET, PUT, OPTIONS");

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    const pathname = (req.url || "").split("?")[0];

    if (pathname === "/api/status" && req.method === "GET") {
      sendJson(res, 200, status());
      return;
    }

    if (pathname === "/api/vault" && req.method === "GET") {
      const auth = validateToken(req);
      if (!auth.ok) {
        sendJson(res, 401, { error: auth.reason });
        return;
      }
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

    if (pathname === "/api/vault" && req.method === "PUT") {
      const auth = validateToken(req);
      if (!auth.ok) {
        sendJson(res, 401, { error: auth.reason });
        return;
      }
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

      generatePairingCode();
      const s = http.createServer(createRequestHandler());

      const fail = (err) => {
        try {
          s.close();
        } catch {
          /* ignore */
        }
        server = null;
        pairingCode = null;
        pairingExpires = 0;
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

  function stop() {
    return new Promise((resolve) => {
      if (!server) {
        pairingCode = null;
        pairingExpires = 0;
        resolve(status());
        return;
      }

      const s = server;
      server = null;
      pairingCode = null;
      pairingExpires = 0;

      s.close(() => resolve(status()));
    });
  }

  function newPairingCode() {
    if (!server) return status();
    generatePairingCode();
    return status();
  }

  return {
    start,
    stop,
    status,
    newPairingCode,
    generatePairingCode,
    DEFAULT_PORT,
  };
}

module.exports = {
  createLanServer,
  getLanIpv4,
  listLanCandidates,
  DEFAULT_PORT,
};
