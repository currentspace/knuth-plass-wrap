import { type ReactNode, type CSSProperties } from "react";
import type { Font, Line } from "../lib/types";
import { shapingCSS } from "../lib/measure";

export function JustifiedLines({
  lines,
  font,
  lineWidth,
  liga = true,
}: {
  lines: Line[];
  font: Font;
  lineWidth: number;
  liga?: boolean;
}): ReactNode {
  const lh = font.lineHeight ?? Math.round(font.size * 1.6);

  return (
    <div style={{ width: lineWidth }}>
      {lines.map((line, i) => {
        const isJustified = !line.last && line.segments.length > 1;

        const divStyle: CSSProperties = {
          width: lineWidth,
          height: lh,
          fontFamily: font.family,
          fontSize: font.size,
          fontWeight: font.weight ?? 400,
          lineHeight: `${lh}px`,
          color: "#2a2623",
          whiteSpace: "nowrap",
          ...shapingCSS(liga),
        };

        if (isJustified) {
          divStyle.textAlign = "justify";
          divStyle.textAlignLast = "justify";
        }

        return (
          <div key={i} style={divStyle}>
            {line.text}
          </div>
        );
      })}
    </div>
  );
}
