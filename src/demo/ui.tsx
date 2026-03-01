import type { ReactNode } from "react";

export function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}): ReactNode {
  return (
    <div>
      <div
        style={{
          fontFamily: "var(--mono)",
          fontSize: 10,
          fontWeight: 500,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          color: "var(--muted)",
          marginBottom: 5,
        }}
      >
        {label}
      </div>
      {children}
    </div>
  );
}

export function Sel({
  value,
  onChange,
  opts,
}: {
  value: string;
  onChange: (v: string) => void;
  opts: [string, string][];
}): ReactNode {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={{
        fontFamily: "var(--mono)",
        fontSize: 12,
        padding: "6px 10px",
        border: "1px solid #d4cfc8",
        borderRadius: 5,
        background: "#fff",
        color: "var(--text)",
        cursor: "pointer",
      }}
    >
      {opts.map(([v, l]) => (
        <option key={v} value={v}>
          {l}
        </option>
      ))}
    </select>
  );
}

export function Note({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}): ReactNode {
  return (
    <div>
      <div
        style={{
          fontFamily: "var(--mono)",
          fontSize: 10,
          fontWeight: 500,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          color: "var(--muted)",
          marginBottom: 5,
        }}
      >
        {title}
      </div>
      <p
        style={{
          fontFamily: '"Literata", Georgia, serif',
          fontSize: 13,
          lineHeight: 1.6,
          margin: 0,
          color: "#4a4540",
        }}
      >
        {children}
      </p>
    </div>
  );
}
