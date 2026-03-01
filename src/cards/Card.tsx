import type { ReactNode } from "react";

export function Card({
  label,
  accent,
  note,
  children,
}: {
  label: string;
  accent: string;
  note?: string;
  children: ReactNode;
}): ReactNode {
  return (
    <div style={{ marginBottom: 28 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 7,
          marginBottom: 10,
        }}
      >
        <span
          style={{
            width: 7,
            height: 7,
            borderRadius: "50%",
            background: accent,
            display: "inline-block",
            flexShrink: 0,
          }}
        />
        <span
          style={{
            fontFamily: "var(--mono)",
            fontSize: 11,
            fontWeight: 500,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: accent,
          }}
        >
          {label}
        </span>
        {note && (
          <span
            style={{
              fontFamily: "var(--mono)",
              fontSize: 11,
              color: "var(--muted)",
            }}
          >
            {note}
          </span>
        )}
      </div>
      <div
        style={{
          background: "#fff",
          border: "1px solid #dcd8d1",
          borderRadius: 8,
          padding: 24,
          boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
          overflow: "visible",
        }}
      >
        {children}
      </div>
    </div>
  );
}
