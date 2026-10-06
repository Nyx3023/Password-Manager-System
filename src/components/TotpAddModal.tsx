import { useEffect, useRef, useState } from "react";
import jsQR from "jsqr";
import { Modal } from "./Modal";
import { TotpDisplay } from "./TotpDisplay";
import {
  parseOtpauthUri,
  parseGoogleAuthMigrationUri,
  isGoogleAuthMigrationUri,
  type TotpAccount,
} from "@/shared/totp";
import type { Person, VaultEntry } from "@/shared/types";

interface TotpAddModalProps {
  open: boolean;
  people: Person[];
  onClose: () => void;
  onSave: (
    data: Omit<VaultEntry, "id" | "createdAt" | "updatedAt">,
  ) => Promise<void>;
  onImportTotp?: (accounts: TotpAccount[], personId: string) => Promise<number>;
  onMessage?: (msg: string) => void;
}

type Mode = "scan" | "image" | "manual";

interface TrackingBox {
  left: number; // percentage
  top: number;
  width: number;
  height: number;
  locked: boolean;
}

export function TotpAddModal({
  open,
  people,
  onClose,
  onSave,
  onImportTotp,
  onMessage,
}: TotpAddModalProps) {
  const [mode, setMode] = useState<Mode>("scan");
  const [accountName, setAccountName] = useState("");
  const [issuer, setIssuer] = useState("");
  const [secretKey, setSecretKey] = useState("");
  const [personId, setPersonId] = useState(people[0]?.id || "");
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Camera & Tracking state
  const [trackingBox, setTrackingBox] = useState<TrackingBox | null>(null);
  const [hasTorch, setHasTorch] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [facingMode, setFacingMode] = useState<"environment" | "user">("environment");

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const scanningRef = useRef<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Reset state on open/close
  useEffect(() => {
    if (!open) {
      stopCamera();
      setMode("scan");
      setAccountName("");
      setIssuer("");
      setSecretKey("");
      setCameraError(null);
      setTrackingBox(null);
      setTorchOn(false);
    } else {
      setMode("scan");
      void startCamera();
    }
  }, [open]);

  // Handle clipboard paste (e.g. user took a screenshot of QR code)
  useEffect(() => {
    if (!open) return;

    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.startsWith("image/")) {
          const file = items[i].getAsFile();
          if (file) {
            processImageFile(file);
            break;
          }
        }
      }
    };

    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, [open]);

  const stopCamera = () => {
    scanningRef.current = false;
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setTorchOn(false);
    setTrackingBox(null);
  };

  const toggleTorch = async () => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (track && "applyConstraints" in track) {
      try {
        const nextTorch = !torchOn;
        await (track as any).applyConstraints({
          advanced: [{ torch: nextTorch }],
        });
        setTorchOn(nextTorch);
      } catch (_) {
        // Torch not available on some devices
      }
    }
  };

  const flipCamera = async () => {
    const nextFacing = facingMode === "environment" ? "user" : "environment";
    setFacingMode(nextFacing);
    await startCamera(nextFacing);
  };

  const handleDetectedUri = async (rawUri: string) => {
    // 1. Google Authenticator migration export QR code
    if (isGoogleAuthMigrationUri(rawUri)) {
      const accounts = parseGoogleAuthMigrationUri(rawUri);
      if (accounts.length === 0) {
        setCameraError("Google Authenticator QR code could not be parsed.");
        scanningRef.current = true;
        setTrackingBox(null);
        return;
      }
      stopCamera();
      if (accounts.length === 1) {
        setAccountName(accounts[0].name || "");
        setIssuer(accounts[0].issuer || "");
        setSecretKey(accounts[0].secret || "");
        setMode("manual");
        onMessage?.(`Decoded ${accounts[0].issuer || accounts[0].name || "Google Authenticator"} account`);
      } else if (onImportTotp) {
        try {
          const count = await onImportTotp(accounts, personId);
          onMessage?.(`Imported ${count} accounts from Google Authenticator export`);
          onClose();
        } catch {
          setCameraError("Failed to import accounts from QR code.");
        }
      } else {
        setAccountName(accounts[0].name || "");
        setIssuer(accounts[0].issuer || "");
        setSecretKey(accounts[0].secret || "");
        setMode("manual");
      }
      return;
    }

    // 2. Standard otpauth://totp/ URI
    const parsed = parseOtpauthUri(rawUri);
    if (!parsed || !parsed.secret) {
      setCameraError("Invalid 2FA QR Code. Standard otpauth:// expected.");
      scanningRef.current = true;
      setTrackingBox(null);
      return;
    }

    stopCamera();
    setAccountName(parsed.name || "");
    setIssuer(parsed.issuer || "");
    setSecretKey(parsed.secret || "");
    setMode("manual");
    onMessage?.("QR Code scanned successfully!");
  };

  // Start Camera with hardware BarcodeDetector or fallback jsQR
  const startCamera = async (currentFacing = facingMode) => {
    setCameraError(null);
    setTrackingBox(null);
    stopCamera();

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: currentFacing,
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      });
      streamRef.current = stream;

      // Check torch capability
      const track = stream.getVideoTracks()[0];
      const caps = (track as any)?.getCapabilities?.();
      setHasTorch(Boolean(caps?.torch));

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        scanningRef.current = true;
        scanLoop();
      }
    } catch (err) {
      setCameraError(
        "Could not access camera. You can upload a QR image or enter the key manually.",
      );
    }
  };

  const scanLoop = async () => {
    if (!scanningRef.current || !videoRef.current) return;
    const video = videoRef.current;

    if (video.readyState >= 2 && video.videoWidth > 0) {
      // 1. Prefer native hardware-accelerated BarcodeDetector
      if (typeof window !== "undefined" && "BarcodeDetector" in window) {
        try {
          const detector = new (window as any).BarcodeDetector({
            formats: ["qr_code"],
          });
          const barcodes = await detector.detect(video);
          if (barcodes.length > 0 && scanningRef.current) {
            const barcode = barcodes[0];
            const box = barcode.boundingBox;
            if (box) {
              const vw = video.videoWidth;
              const vh = video.videoHeight;
              setTrackingBox({
                left: Math.max(0, (box.x / vw) * 100),
                top: Math.max(0, (box.y / vh) * 100),
                width: Math.min(100, (box.width / vw) * 100),
                height: Math.min(100, (box.height / vh) * 100),
                locked: true,
              });
            }
            scanningRef.current = false;
            // Google-style lock-on delay before navigating
            setTimeout(() => {
              handleDetectedUri(barcode.rawValue);
            }, 380);
            return;
          }
        } catch (_) {
          // Fall back to jsQR below if BarcodeDetector fails
        }
      }

      // 2. Fallback: CPU jsQR
      if (canvasRef.current && scanningRef.current) {
        const canvas = canvasRef.current;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (ctx) {
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const code = jsQR(imageData.data, imageData.width, imageData.height, {
            inversionAttempts: "dontInvert",
          });

          if (code && code.data && scanningRef.current) {
            if (code.location) {
              const loc = code.location;
              const minX = Math.min(
                loc.topLeftCorner.x,
                loc.bottomLeftCorner.x,
              );
              const maxX = Math.max(
                loc.topRightCorner.x,
                loc.bottomRightCorner.x,
              );
              const minY = Math.min(
                loc.topLeftCorner.y,
                loc.topRightCorner.y,
              );
              const maxY = Math.max(
                loc.bottomLeftCorner.y,
                loc.bottomRightCorner.y,
              );
              const vw = canvas.width;
              const vh = canvas.height;
              setTrackingBox({
                left: Math.max(0, (minX / vw) * 100),
                top: Math.max(0, (minY / vh) * 100),
                width: Math.min(100, ((maxX - minX) / vw) * 100),
                height: Math.min(100, ((maxY - minY) / vh) * 100),
                locked: true,
              });
            }
            scanningRef.current = false;
            setTimeout(() => {
              handleDetectedUri(code.data);
            }, 380);
            return;
          }
        }
      }
    }

    if (scanningRef.current) {
      animFrameRef.current = requestAnimationFrame(scanLoop);
    }
  };

  // Process image file with jsQR
  const processImageFile = (file: File) => {
    setCameraError(null);
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
            setCameraError("No valid QR code found in selected image.");
          }
        }
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processImageFile(file);
    }
  };

  const handlePasteFromClipboard = async () => {
    try {
      if (!navigator.clipboard?.read) {
        setCameraError("Clipboard read not supported. Press Ctrl+V to paste.");
        return;
      }
      const clipboardItems = await navigator.clipboard.read();
      for (const item of clipboardItems) {
        const imageType = item.types.find((t) => t.startsWith("image/"));
        if (imageType) {
          const blob = await item.getType(imageType);
          processImageFile(new File([blob], "clipboard.png", { type: imageType }));
          return;
        }
      }
      setCameraError("No image found on clipboard. Copy an image and click Paste.");
    } catch {
      setCameraError("Could not access clipboard. Please press Ctrl+V to paste.");
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanSecret = secretKey.replace(/\s/g, "").toUpperCase();
    if (!cleanSecret) return;
    setSaving(true);
    try {
      await onSave({
        title: issuer.trim() || accountName.trim() || "2FA Account",
        username: accountName.trim(),
        password: "",
        url: "",
        notes: "Imported via 2FA setup",
        personId: personId || people[0]?.id || "",
        categoryId: "authenticator",
        subcategoryId: "totp",
        totpSeed: cleanSecret,
      });
      onClose();
    } catch (err: unknown) {
      setCameraError(err instanceof Error ? err.message : "Failed to save entry.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title={
        mode === "scan"
          ? "Scan QR Code"
          : mode === "image"
            ? "Upload / Paste QR Image"
            : "Enter Setup Key"
      }
      open={open}
      onClose={() => {
        stopCamera();
        onClose();
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
        {/* Top 3-Way Mode Switcher (Visible on both Desktop and Mobile) */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr 1fr",
            gap: "6px",
            background: "rgba(255, 255, 255, 0.05)",
            padding: "4px",
            borderRadius: "10px",
          }}
        >
          <button
            type="button"
            className={`ghost small${mode === "scan" ? " active" : ""}`}
            style={{
              padding: "6px 8px",
              fontSize: "0.78rem",
              fontWeight: 600,
              background: mode === "scan" ? "var(--accent, #ff4438)" : "transparent",
              color: mode === "scan" ? "#fff" : "#aaa",
              borderColor: "transparent",
              borderRadius: "6px",
            }}
            onClick={() => {
              setMode("scan");
              void startCamera();
            }}
          >
            📷 Camera QR
          </button>

          <button
            type="button"
            className={`ghost small${mode === "image" ? " active" : ""}`}
            style={{
              padding: "6px 8px",
              fontSize: "0.78rem",
              fontWeight: 600,
              background: mode === "image" ? "var(--accent, #ff4438)" : "transparent",
              color: mode === "image" ? "#fff" : "#aaa",
              borderColor: "transparent",
              borderRadius: "6px",
            }}
            onClick={() => {
              stopCamera();
              setMode("image");
            }}
          >
            📁 Image QR
          </button>

          <button
            type="button"
            className={`ghost small${mode === "manual" ? " active" : ""}`}
            style={{
              padding: "6px 8px",
              fontSize: "0.78rem",
              fontWeight: 600,
              background: mode === "manual" ? "var(--accent, #ff4438)" : "transparent",
              color: mode === "manual" ? "#fff" : "#aaa",
              borderColor: "transparent",
              borderRadius: "6px",
            }}
            onClick={() => {
              stopCamera();
              setMode("manual");
            }}
          >
            ⌨️ Secret Key
          </button>
        </div>

        {/* 1. Camera View with Google-Style Animated Reticle */}
        {mode === "scan" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", alignItems: "center" }}>
            <div
              style={{
                width: "100%",
                maxWidth: "340px",
                aspectRatio: "1",
                background: "#0a0a0a",
                borderRadius: "16px",
                overflow: "hidden",
                position: "relative",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                boxShadow: "0 8px 32px rgba(0,0,0,0.6)",
                border: "1px solid rgba(255,255,255,0.1)",
              }}
            >
              <video
                ref={videoRef}
                playsInline
                muted
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
              />
              <canvas ref={canvasRef} style={{ display: "none" }} />

              {/* Default Viewfinder Reticle */}
              {!trackingBox?.locked && (
                <div
                  style={{
                    position: "absolute",
                    inset: "15%",
                    borderRadius: "14px",
                    border: "2px solid rgba(255, 255, 255, 0.25)",
                    pointerEvents: "none",
                    boxShadow: "0 0 0 9999px rgba(0, 0, 0, 0.45)",
                  }}
                >
                  {/* Glowing 4 Corner Brackets */}
                  <div style={{ position: "absolute", top: -2, left: -2, width: 22, height: 22, borderTop: "4px solid #10b981", borderLeft: "4px solid #10b981", borderTopLeftRadius: "10px" }} />
                  <div style={{ position: "absolute", top: -2, right: -2, width: 22, height: 22, borderTop: "4px solid #10b981", borderRight: "4px solid #10b981", borderTopRightRadius: "10px" }} />
                  <div style={{ position: "absolute", bottom: -2, left: -2, width: 22, height: 22, borderBottom: "4px solid #10b981", borderLeft: "4px solid #10b981", borderBottomLeftRadius: "10px" }} />
                  <div style={{ position: "absolute", bottom: -2, right: -2, width: 22, height: 22, borderBottom: "4px solid #10b981", borderRight: "4px solid #10b981", borderBottomRightRadius: "10px" }} />

                  {/* Animated Laser Scanning Beam */}
                  <div
                    style={{
                      position: "absolute",
                      left: 0,
                      right: 0,
                      height: "2px",
                      background: "linear-gradient(90deg, transparent, #10b981, transparent)",
                      boxShadow: "0 0 8px #10b981",
                      animation: "totpLaserSweep 2s ease-in-out infinite",
                    }}
                  />
                </div>
              )}

              {/* Google-Style Tracking Reticle (snaps to detected QR) */}
              {trackingBox?.locked && (
                <div
                  style={{
                    position: "absolute",
                    left: `${trackingBox.left}%`,
                    top: `${trackingBox.top}%`,
                    width: `${trackingBox.width}%`,
                    height: `${trackingBox.height}%`,
                    borderRadius: "10px",
                    border: "2px solid #10b981",
                    boxShadow: "0 0 16px rgba(16, 185, 129, 0.8)",
                    transform: "scale(1.05)",
                    transition: "all 0.2s cubic-bezier(0.16, 1, 0.3, 1)",
                    pointerEvents: "none",
                    zIndex: 10,
                  }}
                >
                  <div style={{ position: "absolute", top: -3, left: -3, width: 14, height: 14, borderTop: "3px solid #10b981", borderLeft: "3px solid #10b981" }} />
                  <div style={{ position: "absolute", top: -3, right: -3, width: 14, height: 14, borderTop: "3px solid #10b981", borderRight: "3px solid #10b981" }} />
                  <div style={{ position: "absolute", bottom: -3, left: -3, width: 14, height: 14, borderBottom: "3px solid #10b981", borderLeft: "3px solid #10b981" }} />
                  <div style={{ position: "absolute", bottom: -3, right: -3, width: 14, height: 14, borderBottom: "3px solid #10b981", borderRight: "3px solid #10b981" }} />

                  {/* Lock-on badge */}
                  <div
                    style={{
                      position: "absolute",
                      top: "-28px",
                      left: "50%",
                      transform: "translateX(-50%)",
                      background: "#10b981",
                      color: "#000",
                      fontSize: "0.7rem",
                      fontWeight: 700,
                      padding: "2px 8px",
                      borderRadius: "12px",
                      whiteSpace: "nowrap",
                      boxShadow: "0 2px 8px rgba(0,0,0,0.5)",
                    }}
                  >
                    ✓ QR DETECTED
                  </div>
                </div>
              )}

              {/* Camera Controls Floating Bar */}
              <div
                style={{
                  position: "absolute",
                  bottom: "12px",
                  display: "flex",
                  gap: "0.75rem",
                  background: "rgba(0,0,0,0.65)",
                  backdropFilter: "blur(8px)",
                  padding: "6px 14px",
                  borderRadius: "24px",
                  border: "1px solid rgba(255,255,255,0.15)",
                }}
              >
                {hasTorch && (
                  <button
                    type="button"
                    style={{
                      background: torchOn ? "#10b981" : "transparent",
                      color: torchOn ? "#000" : "#fff",
                      border: "none",
                      padding: "4px 8px",
                      borderRadius: "16px",
                      fontSize: "0.8rem",
                      cursor: "pointer",
                    }}
                    onClick={toggleTorch}
                  >
                    {torchOn ? "🔦 Torch On" : "🔦 Torch"}
                  </button>
                )}
                <button
                  type="button"
                  style={{
                    background: "transparent",
                    color: "#fff",
                    border: "none",
                    padding: "4px 8px",
                    borderRadius: "16px",
                    fontSize: "0.8rem",
                    cursor: "pointer",
                  }}
                  onClick={flipCamera}
                >
                  🔄 Flip
                </button>
              </div>
            </div>

            {cameraError && (
              <p style={{ color: "var(--danger, #ef4444)", fontSize: "0.85rem", margin: 0, textAlign: "center" }}>
                {cameraError}
              </p>
            )}

            <div style={{ display: "flex", gap: "0.5rem", width: "100%", justifyContent: "center" }}>
              <button
                type="button"
                className="ghost small"
                onClick={() => {
                  stopCamera();
                  setMode("image");
                }}
              >
                Upload / Paste QR Image instead
              </button>
            </div>
          </div>
        )}

        {/* 2. Image Upload & Screenshot Paste Mode */}
        {mode === "image" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            <div
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const file = e.dataTransfer.files?.[0];
                if (file) processImageFile(file);
              }}
              style={{
                border: "2px dashed rgba(255, 255, 255, 0.2)",
                borderRadius: "14px",
                padding: "2.5rem 1.5rem",
                textAlign: "center",
                cursor: "pointer",
                background: "rgba(255, 255, 255, 0.02)",
                transition: "all 0.2s ease",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "8px",
              }}
            >
              <span style={{ fontSize: "2rem" }}>🖼️</span>
              <strong style={{ fontSize: "0.95rem", color: "#fff" }}>
                Click to browse or drop QR image here
              </strong>
              <p style={{ fontSize: "0.78rem", color: "#888", margin: 0 }}>
                Supports PNG, JPG, or Google Authenticator export QR screenshots
              </p>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              style={{ display: "none" }}
              onChange={handleFileChange}
            />

            <div style={{ display: "flex", gap: "8px", justifyContent: "center" }}>
              <button
                type="button"
                className="primary small"
                onClick={handlePasteFromClipboard}
                style={{ display: "flex", alignItems: "center", gap: "6px" }}
              >
                <span>📋</span> Paste QR from Clipboard (Ctrl+V)
              </button>
            </div>

            {cameraError && (
              <p style={{ color: "var(--danger, #ef4444)", fontSize: "0.85rem", margin: 0, textAlign: "center" }}>
                {cameraError}
              </p>
            )}
          </div>
        )}

        {/* 3. Manual Setup Key Input Form */}
        {mode === "manual" && (
          <form onSubmit={handleSave} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            <label>
              <span className="label-text">Account Name (e.g. Username)</span>
              <input
                type="text"
                placeholder="e.g. iamsarammorrison"
                value={accountName}
                onChange={(e) => setAccountName(e.target.value)}
                autoFocus
              />
            </label>

            <label>
              <span className="label-text">Service / Issuer</span>
              <input
                type="text"
                placeholder="e.g. Instagram, Google, GitHub"
                value={issuer}
                onChange={(e) => setIssuer(e.target.value)}
              />
            </label>

            <label>
              <span className="label-text">Setup Key (Base32 secret)</span>
              <input
                type="text"
                required
                placeholder="e.g. JBSWY3DPEHPK3PXP"
                value={secretKey}
                onChange={(e) =>
                  setSecretKey(e.target.value.replace(/\s/g, "").toUpperCase())
                }
                style={{ fontFamily: "monospace", letterSpacing: "0.05em" }}
              />
            </label>

            {secretKey && (
              <div style={{ marginTop: "0.25rem" }}>
                <TotpDisplay
                  secret={secretKey.replace(/\s/g, "").toUpperCase()}
                  label="Live Code Preview"
                />
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

            {cameraError && (
              <p style={{ color: "var(--danger, #ef4444)", fontSize: "0.85rem", margin: 0 }}>
                {cameraError}
              </p>
            )}

            <div style={{ display: "flex", gap: "0.75rem", justifyContent: "flex-end", marginTop: "0.5rem" }}>
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

      <style>{`
        @keyframes totpLaserSweep {
          0% { top: 12%; opacity: 0.4; }
          50% { top: 88%; opacity: 1; }
          100% { top: 12%; opacity: 0.4; }
        }
      `}</style>
    </Modal>
  );
}
