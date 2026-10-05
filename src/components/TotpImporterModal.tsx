import { useState, useId, useRef, useEffect, useCallback } from "react";
import jsQR from "jsqr";
import { Modal } from "./Modal";
import type { Person } from "@/shared/types";
import {
  parseGoogleAuthMigrationUri,
  isGoogleAuthMigrationUri,
  parseAegisJson,
  parse2FasJson,
  parseOtpauthUri,
  type TotpAccount,
} from "@/shared/totp";
import { isDesktopApp } from "@/shared/platform";

interface TotpImporterModalProps {
  open?: boolean;
  people: Person[];
  onImport: (accounts: TotpAccount[], personId: string) => Promise<number>;
  onClose: () => void;
  onMessage?: (msg: string) => void;
}

type ImportTab = "camera" | "image" | "text";

export function TotpImporterModal({
  open = true,
  people,
  onImport,
  onClose,
  onMessage,
}: TotpImporterModalProps) {
  const isDesktop = isDesktopApp();
  const [tab, setTab] = useState<ImportTab>(isDesktop ? "image" : "camera");
  const [input, setInput] = useState("");
  const [selectedPersonId, setSelectedPersonId] = useState(people[0]?.id || "");
  const [parsedAccounts, setParsedAccounts] = useState<TotpAccount[]>([]);
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());
  const [sourceType, setSourceType] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const inputId = useId();

  // Camera state
  const [hasTorch, setHasTorch] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [facingMode, setFacingMode] = useState<"environment" | "user">("environment");
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const scanningRef = useRef<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Stop camera helper
  const stopCamera = useCallback(() => {
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
  }, []);

  // Process decoded string (from QR or manual text)
  const processDecodedString = useCallback(
    (raw: string) => {
      setError(null);
      const trimmed = raw.trim();
      if (!trimmed) {
        setError("No data provided.");
        return false;
      }

      // 1. Google Authenticator migration export URI
      if (isGoogleAuthMigrationUri(trimmed)) {
        const accounts = parseGoogleAuthMigrationUri(trimmed);
        if (accounts.length > 0) {
          setParsedAccounts(accounts);
          setSelectedIndices(new Set(accounts.map((_, i) => i)));
          setSourceType("Google Authenticator");
          stopCamera();
          return true;
        }
      }

      // 2. JSON exports (Aegis or 2FAS)
      if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
        const aegis = parseAegisJson(trimmed);
        if (aegis.length > 0) {
          setParsedAccounts(aegis);
          setSelectedIndices(new Set(aegis.map((_, i) => i)));
          setSourceType("Aegis Authenticator");
          stopCamera();
          return true;
        }

        const twoFas = parse2FasJson(trimmed);
        if (twoFas.length > 0) {
          setParsedAccounts(twoFas);
          setSelectedIndices(new Set(twoFas.map((_, i) => i)));
          setSourceType("2FAS Authenticator");
          stopCamera();
          return true;
        }
      }

      // 3. Multi-line standard otpauth:// URIs
      const lines = trimmed.split(/\r?\n/).filter((l) => l.trim().startsWith("otpauth://"));
      if (lines.length > 0) {
        const accounts: TotpAccount[] = [];
        for (const line of lines) {
          const acc = parseOtpauthUri(line);
          if (acc) accounts.push(acc);
        }
        if (accounts.length > 0) {
          setParsedAccounts(accounts);
          setSelectedIndices(new Set(accounts.map((_, i) => i)));
          setSourceType("Standard 2FA (TOTP)");
          stopCamera();
          return true;
        }
      }

      // 4. Single otpauth:// URI
      const single = parseOtpauthUri(trimmed);
      if (single) {
        setParsedAccounts([single]);
        setSelectedIndices(new Set([0]));
        setSourceType("Standard 2FA (TOTP)");
        stopCamera();
        return true;
      }

      setError(
        "Could not recognize 2FA format. Supported: Google Authenticator export QR code, Aegis JSON, 2FAS JSON, or otpauth:// links.",
      );
      return false;
    },
    [stopCamera],
  );

  // Decode image element via BarcodeDetector / jsQR
  const decodeImageElement = useCallback(
    async (img: HTMLImageElement): Promise<boolean> => {
      // 1. Try hardware BarcodeDetector if available
      if (typeof window !== "undefined" && "BarcodeDetector" in window) {
        try {
          const detector = new (window as any).BarcodeDetector({
            formats: ["qr_code"],
          });
          const barcodes = await detector.detect(img);
          if (barcodes.length > 0 && barcodes[0].rawValue) {
            return processDecodedString(barcodes[0].rawValue);
          }
        } catch (_) {}
      }

      // 2. Fallback: CPU jsQR via offscreen canvas
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth || img.width;
      canvas.height = img.naturalHeight || img.height;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) return false;

      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const code = jsQR(imageData.data, imageData.width, imageData.height, {
        inversionAttempts: "attemptBoth",
      });

      if (code && code.data) {
        return processDecodedString(code.data);
      }

      setError("No valid QR code detected in the selected image. Please try another image or photo.");
      return false;
    },
    [processDecodedString],
  );

  // Decode file from disk/picker
  const handleImageFile = useCallback(
    (file: File) => {
      setError(null);
      const reader = new FileReader();
      reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
          void decodeImageElement(img);
        };
        img.onerror = () => {
          setError("Failed to load image file.");
        };
        img.src = event.target?.result as string;
      };
      reader.readAsDataURL(file);
    },
    [decodeImageElement],
  );

  // Camera start & scan loop
  const startCamera = useCallback(
    async (targetFacing = facingMode) => {
      setError(null);
      stopCamera();

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: targetFacing,
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
        });
        streamRef.current = stream;

        const track = stream.getVideoTracks()[0];
        const caps = (track as any)?.getCapabilities?.();
        setHasTorch(Boolean(caps?.torch));

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
          scanningRef.current = true;
          scanCameraLoop();
        }
      } catch (_) {
        setError("Camera access denied or unavailable. You can upload a QR image/screenshot instead.");
      }
    },
    [facingMode, stopCamera],
  );

  const scanCameraLoop = useCallback(() => {
    if (!scanningRef.current || !videoRef.current) return;
    const video = videoRef.current;

    if (video.readyState >= 2 && video.videoWidth > 0) {
      // 1. BarcodeDetector
      if (typeof window !== "undefined" && "BarcodeDetector" in window) {
        try {
          const detector = new (window as any).BarcodeDetector({
            formats: ["qr_code"],
          });
          detector.detect(video).then((barcodes: any[]) => {
            if (barcodes.length > 0 && scanningRef.current) {
              const val = barcodes[0].rawValue;
              if (val) {
                scanningRef.current = false;
                processDecodedString(val);
                return;
              }
            }
          }).catch(() => {});
        } catch (_) {}
      }

      // 2. CPU jsQR fallback
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
            scanningRef.current = false;
            processDecodedString(code.data);
            return;
          }
        }
      }
    }

    if (scanningRef.current) {
      animFrameRef.current = requestAnimationFrame(scanCameraLoop);
    }
  }, [processDecodedString]);

  const toggleTorch = async () => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (track && "applyConstraints" in track) {
      try {
        const next = !torchOn;
        await (track as any).applyConstraints({ advanced: [{ torch: next }] });
        setTorchOn(next);
      } catch (_) {}
    }
  };

  const flipCamera = async () => {
    const nextFacing = facingMode === "environment" ? "user" : "environment";
    setFacingMode(nextFacing);
    await startCamera(nextFacing);
  };

  // Switch tabs
  const handleTabChange = (nextTab: ImportTab) => {
    setError(null);
    setTab(nextTab);
    if (nextTab === "camera") {
      void startCamera();
    } else {
      stopCamera();
    }
  };

  // Global Clipboard paste listener (Ctrl+V images / text)
  useEffect(() => {
    if (!open) return;

    const handlePaste = (e: ClipboardEvent) => {
      // If user is focused on textarea in text tab, let default paste happen
      if (document.activeElement?.tagName === "TEXTAREA") return;

      const items = e.clipboardData?.items;
      if (!items) return;

      // 1. Look for image in clipboard (e.g. screenshot of QR)
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.startsWith("image/")) {
          const file = items[i].getAsFile();
          if (file) {
            handleImageFile(file);
            return;
          }
        }
      }

      // 2. Look for text in clipboard
      const text = e.clipboardData?.getData("text");
      if (text && text.trim()) {
        processDecodedString(text);
      }
    };

    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, [open, handleImageFile, processDecodedString]);

  // Clean camera on unmount or close
  useEffect(() => {
    if (!open) {
      stopCamera();
      setParsedAccounts([]);
      setSelectedIndices(new Set());
      setSourceType(null);
      setError(null);
      setInput("");
    } else if (tab === "camera" && !parsedAccounts.length) {
      void startCamera();
    }
    return () => stopCamera();
  }, [open, tab, parsedAccounts.length, startCamera, stopCamera]);

  // Toggle selection
  const toggleAccountSelection = (index: number) => {
    setSelectedIndices((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  const selectAll = () => {
    setSelectedIndices(new Set(parsedAccounts.map((_, i) => i)));
  };

  const deselectAll = () => {
    setSelectedIndices(new Set());
  };

  // Submit import
  const handleSubmit = async () => {
    const toImport = parsedAccounts.filter((_, i) => selectedIndices.has(i));
    if (toImport.length === 0) {
      setError("Please select at least one account to import.");
      return;
    }

    setBusy(true);
    try {
      const count = await onImport(toImport, selectedPersonId);
      onMessage?.(`Successfully imported ${count} 2FA account(s).`);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="Import 2FA Accounts" open={open} onClose={onClose}>
      <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
        <p style={{ color: "#aaa", fontSize: "0.85rem", margin: 0 }}>
          Export your accounts in Google Authenticator (or Aegis/2FAS) and scan or upload the QR code below.
        </p>

        {parsedAccounts.length === 0 ? (
          <>
            {/* Import Method Tabs */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr 1fr",
                gap: "6px",
                background: "#111",
                padding: "4px",
                borderRadius: "8px",
                border: "1px solid #222",
              }}
            >
              <button
                type="button"
                onClick={() => handleTabChange("camera")}
                style={{
                  background: tab === "camera" ? "var(--bg-elevated, #222)" : "transparent",
                  color: tab === "camera" ? "var(--text, #fff)" : "#888",
                  border: tab === "camera" ? "1px solid var(--border, #333)" : "none",
                  borderRadius: "6px",
                  padding: "0.5rem 0.25rem",
                  fontSize: "0.8rem",
                  fontWeight: 600,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "5px",
                }}
              >
                <span>📷</span> Scan QR
              </button>
              <button
                type="button"
                onClick={() => handleTabChange("image")}
                style={{
                  background: tab === "image" ? "var(--bg-elevated, #222)" : "transparent",
                  color: tab === "image" ? "var(--text, #fff)" : "#888",
                  border: tab === "image" ? "1px solid var(--border, #333)" : "none",
                  borderRadius: "6px",
                  padding: "0.5rem 0.25rem",
                  fontSize: "0.8rem",
                  fontWeight: 600,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "5px",
                }}
              >
                <span>🖼️</span> Upload QR
              </button>
              <button
                type="button"
                onClick={() => handleTabChange("text")}
                style={{
                  background: tab === "text" ? "var(--bg-elevated, #222)" : "transparent",
                  color: tab === "text" ? "var(--text, #fff)" : "#888",
                  border: tab === "text" ? "1px solid var(--border, #333)" : "none",
                  borderRadius: "6px",
                  padding: "0.5rem 0.25rem",
                  fontSize: "0.8rem",
                  fontWeight: 600,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "5px",
                }}
              >
                <span>📝</span> Text / File
              </button>
            </div>

            {/* TAB 1: Live Camera Scanner */}
            {tab === "camera" && (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", alignItems: "center" }}>
                <div
                  style={{
                    position: "relative",
                    width: "100%",
                    maxWidth: "360px",
                    aspectRatio: "1/1",
                    background: "#000",
                    borderRadius: "12px",
                    overflow: "hidden",
                    border: "1px solid #333",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <video
                    ref={videoRef}
                    playsInline
                    muted
                    style={{
                      width: "100%",
                      height: "100%",
                      objectFit: "cover",
                    }}
                  />
                  <canvas ref={canvasRef} style={{ display: "none" }} />

                  {/* Viewfinder Reticle */}
                  <div
                    style={{
                      position: "absolute",
                      width: "70%",
                      height: "70%",
                      border: "2px dashed rgba(255, 68, 56, 0.75)",
                      borderRadius: "16px",
                      pointerEvents: "none",
                      boxShadow: "0 0 0 9999px rgba(0, 0, 0, 0.45)",
                    }}
                  />

                  {/* Camera Controls Bar */}
                  <div
                    style={{
                      position: "absolute",
                      bottom: "10px",
                      display: "flex",
                      gap: "10px",
                    }}
                  >
                    {hasTorch && (
                      <button
                        type="button"
                        onClick={toggleTorch}
                        style={{
                          background: torchOn ? "#ff4438" : "rgba(0,0,0,0.6)",
                          color: "#fff",
                          border: "1px solid #444",
                          borderRadius: "20px",
                          padding: "6px 12px",
                          fontSize: "0.75rem",
                          cursor: "pointer",
                        }}
                      >
                        {torchOn ? "🔦 Flash ON" : "🔦 Flash"}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={flipCamera}
                      style={{
                        background: "rgba(0,0,0,0.6)",
                        color: "#fff",
                        border: "1px solid #444",
                        borderRadius: "20px",
                        padding: "6px 12px",
                        fontSize: "0.75rem",
                        cursor: "pointer",
                      }}
                    >
                      🔄 Flip
                    </button>
                  </div>
                </div>

                <span style={{ color: "#888", fontSize: "0.75rem", textAlign: "center" }}>
                  Point camera at the QR code displayed in Google Authenticator export screen.
                </span>
              </div>
            )}

            {/* TAB 2: Upload QR Image / Screenshot */}
            {tab === "image" && (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                <div
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    const file = e.dataTransfer.files?.[0];
                    if (file && file.type.startsWith("image/")) {
                      handleImageFile(file);
                    }
                  }}
                  style={{
                    border: "2px dashed #333",
                    borderRadius: "12px",
                    padding: "2rem 1rem",
                    textAlign: "center",
                    cursor: "pointer",
                    background: "#0d0d0d",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: "0.75rem",
                    transition: "border-color 0.2s",
                  }}
                >
                  <div style={{ fontSize: "2.5rem" }}>🖼️</div>
                  <div>
                    <div style={{ color: "#fff", fontWeight: 600, fontSize: "0.95rem" }}>
                      Choose QR Code Image or Screenshot
                    </div>
                    <div style={{ color: "#888", fontSize: "0.8rem", marginTop: "4px" }}>
                      Tap to select from photo gallery or drag & drop image here
                    </div>
                  </div>
                  <span
                    style={{
                      background: "rgba(255, 255, 255, 0.08)",
                      border: "1px solid rgba(255, 255, 255, 0.15)",
                      color: "#fff",
                      fontSize: "0.75rem",
                      padding: "4px 10px",
                      borderRadius: "6px",
                      marginTop: "6px",
                    }}
                  >
                    Tip: Press Ctrl+V to paste screenshot directly
                  </span>
                </div>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleImageFile(file);
                  }}
                  style={{ display: "none" }}
                />
              </div>
            )}

            {/* TAB 3: Paste Text or JSON */}
            {tab === "text" && (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                <div>
                  <label
                    htmlFor={inputId}
                    style={{
                      display: "block",
                      color: "#888",
                      fontSize: "0.75rem",
                      letterSpacing: "0.05em",
                      marginBottom: "0.5rem",
                      textTransform: "uppercase",
                    }}
                  >
                    Paste Export Text or Link
                  </label>
                  <textarea
                    id={inputId}
                    rows={5}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="Paste otpauth-migration:// URI, otpauth:// link, or JSON export here..."
                    style={{
                      width: "100%",
                      background: "#111",
                      border: "1px solid #333",
                      color: "#fff",
                      padding: "0.75rem",
                      borderRadius: "6px",
                      fontSize: "0.85rem",
                      fontFamily: "monospace",
                      boxSizing: "border-box",
                      resize: "vertical",
                    }}
                  />
                </div>

                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <label
                    style={{
                      cursor: "pointer",
                      color: "#888",
                      fontSize: "0.8rem",
                      textDecoration: "underline",
                    }}
                  >
                    Or upload .json file
                    <input
                      type="file"
                      accept=".json,.txt"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        const reader = new FileReader();
                        reader.onload = (event) => {
                          const content = event.target?.result as string;
                          if (content) processDecodedString(content);
                        };
                        reader.readAsText(file);
                      }}
                      style={{ display: "none" }}
                    />
                  </label>

                  <button
                    type="button"
                    onClick={() => processDecodedString(input)}
                    disabled={!input.trim()}
                    style={{
                      background: "#fff",
                      color: "#000",
                      fontWeight: 600,
                      padding: "0.5rem 1rem",
                      borderRadius: "6px",
                      border: "none",
                      cursor: "pointer",
                      opacity: input.trim() ? 1 : 0.5,
                    }}
                  >
                    Analyze Text
                  </button>
                </div>
              </div>
            )}
          </>
        ) : (
          /* ACCOUNTS PREVIEW SCREEN */
          <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            <div
              style={{
                background: "#111",
                border: "1px solid #222",
                borderRadius: "8px",
                padding: "0.75rem",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <div>
                <div style={{ color: "#fff", fontWeight: 700, fontSize: "0.95rem" }}>
                  {parsedAccounts.length} Account(s) Found
                </div>
                <div style={{ color: "#888", fontSize: "0.75rem" }}>
                  Source: <strong style={{ color: "var(--accent, #ff4438)" }}>{sourceType}</strong>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setParsedAccounts([]);
                  setSelectedIndices(new Set());
                  setSourceType(null);
                  setError(null);
                }}
                style={{
                  background: "transparent",
                  color: "#888",
                  border: "1px solid #333",
                  borderRadius: "4px",
                  padding: "0.3rem 0.6rem",
                  fontSize: "0.75rem",
                  cursor: "pointer",
                }}
              >
                Scan Another
              </button>
            </div>

            {/* Select All / Deselect All Controls */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ color: "#888", fontSize: "0.75rem" }}>
                Selected: {selectedIndices.size} of {parsedAccounts.length}
              </span>
              <div style={{ display: "flex", gap: "8px" }}>
                <button
                  type="button"
                  onClick={selectAll}
                  style={{
                    background: "none",
                    border: "none",
                    color: "var(--accent, #ff4438)",
                    fontSize: "0.75rem",
                    cursor: "pointer",
                    padding: 0,
                  }}
                >
                  Select All
                </button>
                <span style={{ color: "#444" }}>|</span>
                <button
                  type="button"
                  onClick={deselectAll}
                  style={{
                    background: "none",
                    border: "none",
                    color: "#888",
                    fontSize: "0.75rem",
                    cursor: "pointer",
                    padding: 0,
                  }}
                >
                  Deselect All
                </button>
              </div>
            </div>

            {/* Account List */}
            <div
              style={{
                maxHeight: "220px",
                overflowY: "auto",
                display: "flex",
                flexDirection: "column",
                gap: "0.4rem",
              }}
            >
              {parsedAccounts.map((acc, idx) => {
                const isChecked = selectedIndices.has(idx);
                return (
                  <label
                    key={idx}
                    style={{
                      background: isChecked ? "#141414" : "#0a0a0a",
                      border: `1px solid ${isChecked ? "var(--border, #333)" : "#1a1a1a"}`,
                      padding: "0.6rem 0.75rem",
                      borderRadius: "6px",
                      display: "flex",
                      alignItems: "center",
                      gap: "10px",
                      cursor: "pointer",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => toggleAccountSelection(idx)}
                      style={{
                        accentColor: "var(--accent, #ff4438)",
                        width: "16px",
                        height: "16px",
                        cursor: "pointer",
                      }}
                    />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          color: "#eee",
                          fontSize: "0.85rem",
                          fontWeight: 600,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {acc.issuer ? `${acc.issuer} — ` : ""}
                        {acc.name}
                      </div>
                      <div style={{ color: "#666", fontSize: "0.72rem", fontFamily: "monospace" }}>
                        Key: {acc.secret.slice(0, 4)}•••••••• ({acc.digits || 6} digits)
                      </div>
                    </div>
                  </label>
                );
              })}
            </div>

            {/* Profile Assignment */}
            {people.length > 1 && (
              <div>
                <label
                  style={{
                    display: "block",
                    color: "#888",
                    fontSize: "0.75rem",
                    marginBottom: "0.4rem",
                    textTransform: "uppercase",
                  }}
                >
                  Assign To Profile
                </label>
                <select
                  value={selectedPersonId}
                  onChange={(e) => setSelectedPersonId(e.target.value)}
                  style={{
                    width: "100%",
                    background: "#111",
                    border: "1px solid #333",
                    color: "#fff",
                    padding: "0.6rem",
                    borderRadius: "6px",
                  }}
                >
                  {people.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.emoji ? `${p.emoji} ` : ""}{p.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <button
              type="button"
              onClick={handleSubmit}
              disabled={busy || selectedIndices.size === 0}
              style={{
                background: "var(--accent, #ff4438)",
                color: "#fff",
                fontWeight: 700,
                padding: "0.75rem",
                borderRadius: "6px",
                border: "none",
                cursor: selectedIndices.size === 0 ? "not-allowed" : "pointer",
                opacity: selectedIndices.size === 0 ? 0.5 : 1,
                marginTop: "0.25rem",
              }}
            >
              {busy ? "Importing..." : `Import ${selectedIndices.size} 2FA Account(s)`}
            </button>
          </div>
        )}

        {error && (
          <div
            style={{
              color: "#ff4438",
              fontSize: "0.8rem",
              background: "rgba(255,68,56,0.1)",
              border: "1px solid rgba(255,68,56,0.25)",
              padding: "0.6rem",
              borderRadius: "6px",
            }}
          >
            {error}
          </div>
        )}
      </div>
    </Modal>
  );
}
