import { useState, useRef, type ReactNode } from "react";
import type { Font } from "../lib/types";

export function FontPicker({
  value,
  onChange,
  fonts,
  hzLabels,
}: {
  value: number;
  onChange: (v: number) => void;
  fonts: Font[];
  hzLabels: Map<number, string>;
}): ReactNode {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const close = (): void => setOpen(false);

  return (
    <div ref={ref} style={{ position: "relative", display: "inline-block" }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        style={{
          fontFamily: "var(--mono)",
          fontSize: 12,
          padding: "6px 10px",
          border: "1px solid #d4cfc8",
          borderRadius: 5,
          background: "#fff",
          color: "var(--text)",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          gap: 6,
          minWidth: 140,
        }}
      >
        <span style={{ flex: 1, textAlign: "left" }}>{fonts[value].label}</span>
        {hzLabels.has(value) && (
          <span
            style={{
              fontFamily: "var(--mono)",
              fontSize: 8,
              fontWeight: 600,
              letterSpacing: "0.06em",
              color: "#fff",
              background: "#4a8fe7",
              padding: "1px 4px",
              borderRadius: 3,
              lineHeight: "14px",
            }}
          >
            Hz
          </span>
        )}
        <span style={{ fontSize: 8, color: "#999" }}>▼</span>
      </button>
      {open && (
        <>
          <div
            style={{ position: "fixed", inset: 0, zIndex: 99 }}
            onClick={close}
            onKeyDown={(e) => {
              if (e.key === "Escape") close();
            }}
            role="presentation"
          />
          <div
            style={{
              position: "absolute",
              top: "100%",
              left: 0,
              marginTop: 2,
              background: "#fff",
              border: "1px solid #d4cfc8",
              borderRadius: 6,
              boxShadow: "0 4px 16px rgba(0,0,0,0.12)",
              zIndex: 100,
              minWidth: 200,
              maxHeight: 320,
              overflowY: "auto",
              padding: "4px 0",
            }}
          >
            {fonts.map((f, i) => (
              <button
                key={i}
                type="button"
                onClick={() => {
                  onChange(i);
                  close();
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  width: "100%",
                  padding: "7px 12px",
                  border: "none",
                  background: i === value ? "#f0ebe4" : "transparent",
                  fontFamily: "var(--mono)",
                  fontSize: 12,
                  color: "var(--text)",
                  cursor: "pointer",
                  textAlign: "left",
                }}
              >
                <span style={{ flex: 1 }}>{f.label}</span>
                {hzLabels.has(i) && (
                  <span
                    style={{
                      fontFamily: "var(--mono)",
                      fontSize: 8,
                      fontWeight: 600,
                      letterSpacing: "0.06em",
                      color: "#fff",
                      background: "#4a8fe7",
                      padding: "1px 4px",
                      borderRadius: 3,
                      lineHeight: "14px",
                    }}
                  >
                    Hz
                  </span>
                )}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
