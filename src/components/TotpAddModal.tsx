import { useEffect, useRef, useState } from "react";
import jsQR from "jsqr";
import { Modal } from "./Modal";
import { TotpDisplay } from "./TotpDisplay";
import { parseOtpauthUri } from "@/shared/totp";
import type { Person, VaultEntry } from "@/shared/types";

interface TotpAddModalProps {
  open: boolean;
  people: Person[];
  onClose: () => void;
  onSave: (
    data: Omit<VaultEntry, "id" | "createdAt" | "updatedAt">,
  ) => Promise<void>;
  onMessage?: (msg: string) => void;
}

type Mode = "select" | "scan" | "manual";

export function TotpAddModal({
  open,
  people,
  onClose,
  onSave,
  onMessage,
}: TotpAddModalProps) {
  const [mode, setMode] = useState<Mode>("select");
  const [accountName, setAccountName] = useState("");
  const [issuer, setIssuer] = useState("");
  const [secretKey, setSecretKey] = useState("");
  const [personId, setPersonId] = useState(people[0]?.id || "");
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Reset state on open/close
  useEffect(() => {
    if (!open) {
      stopCamera();
      setMode("select");
      setAccountName("");
      setIssuer("");
      setSecretKey("");
      setCameraError(null);
    }
  }, [open]);

  const stopCamera = () => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  };

  const handleDetectedUri = (rawUri: string) => {
    const parsed = parseOtpauthUri(rawUri);
    if (!parsed) {
      setCameraError("QR code is not a valid TOTP authenticator URI.");
      return;
    }
    stopCamera();
    setAccountName(parsed.name || "");
    setIssuer(parsed.issuer || "");
    setSecretKey(parsed.secret || "");
    setMode("manual");
    onMessage?.("QR Code scanned successfully!");
  };

  // Camera scan loop
  const startCamera = async () => {
    setCameraError(null);
    stopCamera();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        scanVideoFrame();
      }
    } catch (err) {
      setCameraError(
        "Could not access camera. Please allow camera access or enter the setup key manually.",
      );
    }
  };

  const scanVideoFrame = () => {
    if (!videoRef.current || !canvasRef.current || mode !== "scan") return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (video.readyState === video.HAVE_ENOUGH_DATA) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(imageData.data, imageData.width, imageData.height, {
          inversionAttempts: "dontInvert",
        });
        if (code && code.data) {
          handleDetectedUri(code.data);
          return;
        }
      }
    }
    animFrameRef.current = requestAnimationFrame(scanVideoFrame);
  };

  // Handle QR screenshot / image file
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(img, 0, 0);
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const code = jsQR(imageData.data, imageData.width, imageData.height);
          if (code && code.data) {
            handleDetectedUri(code.data);
          } else {
            setCameraError("No QR code found in selected image.");
          }
        }
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanSecret = secretKey.replace(/\s/g, "").toUpperCase();
    if (!cleanSecret) return;
    setSaving(true);
    try {
      const title = issuer
        ? accountName
          ? `${issuer} (${accountName})`
          : issuer
        : accountName || "2FA Account";

      await onSave({
        title,
        personId: personId || people[0]?.id || "",
        categoryId: "authenticator",
        subcategoryId: "totp",
        username: accountName,
        password: "",
        url: "",
        notes: "Authenticator 2FA code",
        totpSeed: cleanSecret,
      });
      onClose();
      onMessage?.(`Saved 2FA for ${title}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title={
        mode === "scan"
          ? "Scan QR Code"
          : mode === "manual"
            ? "Enter Setup Key"
            : "Add Authenticator"
      }
      open={open}
      onClose={() => {
        stopCamera();
        onClose();
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
        {mode === "select" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            <p style={{ color: "#aaa", fontSize: "0.875rem", margin: 0 }}>
              Similar to Google Authenticator, choose how you want to add your 2FA account:
            </p>

            <button
              type="button"
              className="primary"
              style={{ padding: "0.9rem 1rem", fontSize: "0.95rem", textAlign: "left" }}
              onClick={() => {
                setMode("scan");
                void startCamera();
              }}
            >
              📷 <strong>Scan a QR code</strong>
              <div style={{ fontSize: "0.75rem", opacity: 0.8, marginTop: "0.2rem" }}>
                Use camera to scan QR code from screen or paper
              </div>
            </button>

            <button
              type="button"
              className="ghost"
              style={{ padding: "0.9rem 1rem", fontSize: "0.95rem", textAlign: "left" }}
              onClick={() => setMode("manual")}
            >
              ⌨️ <strong>Enter a setup key</strong>
              <div style={{ fontSize: "0.75rem", opacity: 0.8, marginTop: "0.2rem" }}>
                Type in the Base32 security key provided by the service
              </div>
            </button>
          </div>
        )}

        {mode === "scan" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", alignItems: "center" }}>
            <div
              style={{
                width: "100%",
                maxWidth: "320px",
                aspectRatio: "1",
                background: "#111",
                borderRadius: "8px",
                overflow: "hidden",
                position: "relative",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                border: "2px solid var(--accent, #10B981)",
              }}
            >
              <video
                ref={videoRef}
                playsInline
                muted
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
              />
              <canvas ref={canvasRef} style={{ display: "none" }} />
              <div
                style={{
                  position: "absolute",
                  inset: "20px",
                  border: "2px dashed rgba(255,255,255,0.4)",
                  borderRadius: "6px",
                  pointerEvents: "none",
                }}
              />
            </div>

            {cameraError && (
              <p style={{ color: "var(--danger, #ef4444)", fontSize: "0.85rem", margin: 0, textAlign: "center" }}>
                {cameraError}
              </p>
            )}

            <div style={{ display: "flex", gap: "0.5rem", width: "100%", justifyContent: "space-between" }}>
              <button
                type="button"
                className="ghost small"
                onClick={() => fileInputRef.current?.click()}
              >
                Upload QR Image
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                style={{ display: "none" }}
                onChange={handleFileChange}
              />

              <button
                type="button"
                className="ghost small"
                onClick={() => {
                  stopCamera();
                  setMode("manual");
                }}
              >
                Enter Key Manually
              </button>
            </div>
          </div>
        )}

        {mode === "manual" && (
          <form onSubmit={handleSave} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            <label>
              <span className="label-text">Account Name</span>
              <input
                type="text"
                placeholder="e.g. john@example.com"
                value={accountName}
                onChange={(e) => setAccountName(e.target.value)}
                autoFocus
              />
            </label>

            <label>
              <span className="label-text">Service / Issuer</span>
              <input
                type="text"
                placeholder="e.g. Google, GitHub, Discord"
                value={issuer}
                onChange={(e) => setIssuer(e.target.value)}
              />
            </label>

            <label>
              <span className="label-text">Your Key (Base32 secret)</span>
              <input
                type="text"
                required
                placeholder="e.g. JBSWY3DPEHPK3PXP"
                value={secretKey}
                onChange={(e) => setSecretKey(e.target.value.toUpperCase())}
                style={{ fontFamily: "monospace", letterSpacing: "0.05em" }}
              />
            </label>

            {secretKey && (
              <div style={{ marginTop: "0.25rem" }}>
                <TotpDisplay secret={secretKey.replace(/\s/g, "").toUpperCase()} label="Live Code Preview" />
              </div>
            )}

            {people.length > 1 && (
              <label>
                <span className="label-text">Assign to Person</span>
                <select value={personId} onChange={(e) => setPersonId(e.target.value)}>
                  {people.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
            )}

            <div style={{ display: "flex", gap: "0.75rem", justifyContent: "flex-end", marginTop: "0.5rem" }}>
              <button
                type="button"
                className="ghost"
                onClick={() => setMode("select")}
              >
                Back
              </button>
              <button
                type="submit"
                className="primary"
                disabled={saving || !secretKey.trim()}
              >
                {saving ? "Saving..." : "Save 2FA"}
              </button>
            </div>
          </form>
        )}
      </div>
    </Modal>
  );
}
