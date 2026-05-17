import { useState } from "react";
import { MpinPad } from "./MpinPad";

interface MpinConfirmFlowProps {
  size?: "default" | "large";
  onComplete: (mpin: string) => void;
}

export function MpinConfirmFlow({ size = "default", onComplete }: MpinConfirmFlowProps) {
  const [phase, setPhase] = useState<"enter" | "confirm">("enter");
  const [entry, setEntry] = useState("");
  const [draft, setDraft] = useState("");
  const [mismatch, setMismatch] = useState(false);

  const handleComplete = (code: string) => {
    if (phase === "enter") {
      setDraft(code);
      setEntry("");
      setPhase("confirm");
      setMismatch(false);
      return;
    }

    if (code === draft) {
      onComplete(code);
    } else {
      setMismatch(true);
      setDraft("");
      setEntry("");
      setPhase("enter");
    }
  };

  return (
    <div className="setup-mpin-flow">
      <p className="label-mono center-text">
        {phase === "enter" ? "NEW MPIN" : "CONFIRM MPIN"}
      </p>
      <MpinPad
        size={size}
        value={entry}
        onChange={setEntry}
        onComplete={handleComplete}
      />
      {mismatch && (
        <p className="error center-text">MPINs do not match. Try again.</p>
      )}
    </div>
  );
}
