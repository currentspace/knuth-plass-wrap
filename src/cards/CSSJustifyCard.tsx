import { useMemo, type CSSProperties, type ReactNode } from "react";
import type { Font } from "../lib/types";
import { shapingCSS } from "../lib/measure";
import { softHyphenate } from "../lib/tokenise";
import { Card } from "./Card";

export function CSSJustifyCard({
  text,
  font,
  lineWidth,
  hyphenate,
}: {
  text: string;
  font: Font;
  lineWidth: number;
  hyphenate: boolean;
}): ReactNode {
  const lh = font.lineHeight ?? Math.round(font.size * 1.6);
  const rendered = useMemo(
    () => (hyphenate ? softHyphenate(text) : text),
    [text, hyphenate],
  );
  return (
    <Card
      label="CSS text-align: justify"
      accent="#6a4a8a"
      note="browser native · greedy"
    >
      <div
        style={
          {
            width: lineWidth,
            fontFamily: font.family,
            fontSize: font.size,
            fontWeight: font.weight ?? 400,
            lineHeight: `${lh}px`,
            color: "#2a2623",
            textAlign: "justify",
            overflowWrap: "break-word",
            hyphens: hyphenate ? "manual" : undefined,
            ...shapingCSS(),
          } as CSSProperties
        }
      >
        {rendered}
      </div>
    </Card>
  );
}
