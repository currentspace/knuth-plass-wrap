import {
  use,
  useMemo,
  useDeferredValue,
  type ReactNode,
  type CSSProperties,
} from "react";
import type { HzLine } from "../core/types";
import { SIMILAR_DEM } from "../core/constants";
import { layoutParagraph, isReady } from "../core/wasm";
import { shapingCSS, detectWdthSupport } from "../lib/measure";
import { registerFontBinary } from "../lib/resolve-font-binary";
import type { WdthRange } from "../lib/types";
import { Card } from "./Card";

// Browser shapers can land a few pixels wider than harfrust on CI/Linux.
const BROWSER_LAYOUT_SAFETY_PX = 10;

function intersectWdthRanges(
  provided: WdthRange | null | undefined,
  rendered: WdthRange | null,
): WdthRange | null {
  if (!provided) return rendered;
  if (!rendered) return null;

  const min = Math.max(provided.min, rendered.min);
  const max = Math.min(provided.max, rendered.max);
  if (min >= 100 && max <= 100) return null;
  return { min, max };
}

export interface KPHarfrustCardProps {
  text: string;
  width: number;
  fontBinary: ArrayBuffer;
  fontBinaryMap?: Record<number, ArrayBuffer>;
  fontFamily: string;
  fontSize: number;
  fontWeight?: number;
  fontStyle?: "normal" | "italic" | "oblique";
  lineHeight?: number;
  color?: string;
  opticalSizing?: "auto" | "none" | number;
  liga?: boolean;
  hyphenate?: boolean;
  similarity?: boolean;
  wdthRange?: WdthRange | null;
  sourceUrl?: string;
  className?: string;
  style?: CSSProperties;
}

function closestWeight(
  map: Record<number, ArrayBuffer>,
  target: number,
): number {
  const weights = Object.keys(map).map(Number);
  let best = weights[0];
  let bestDist = Math.abs(best - target);
  for (let i = 1; i < weights.length; i++) {
    const dist = Math.abs(weights[i] - target);
    if (dist < bestDist) {
      best = weights[i];
      bestDist = dist;
    }
  }
  return best;
}

export function KPHarfrustCard({
  text,
  width,
  fontBinary,
  fontBinaryMap,
  fontFamily,
  fontSize,
  fontWeight = 400,
  fontStyle = "normal",
  lineHeight,
  color = "#2a2623",
  opticalSizing = "auto",
  liga = true,
  hyphenate = false,
  similarity = true,
  wdthRange,
  sourceUrl,
  className,
  style: containerStyle,
}: KPHarfrustCardProps): ReactNode {
  const deferredWidth = useDeferredValue(width);
  const layoutWidth = Math.max(1, deferredWidth - BROWSER_LAYOUT_SAFETY_PX);
  const simDem = similarity ? SIMILAR_DEM : 0;
  const lh = lineHeight ?? Math.round(fontSize * 1.6);

  let wasmOpsz: number;
  if (opticalSizing === "auto") wasmOpsz = fontSize;
  else if (opticalSizing === "none") wasmOpsz = 0;
  else wasmOpsz = opticalSizing;

  let wasmItal = 0;
  if (fontStyle === "italic" || fontStyle === "oblique") wasmItal = 12;

  const effectiveBinary = useMemo(() => {
    if (fontBinaryMap) {
      const w = closestWeight(fontBinaryMap, fontWeight);
      return fontBinaryMap[w];
    }
    return fontBinary;
  }, [fontBinary, fontBinaryMap, fontWeight]);

  const { scopedFamily, fontReady } = useMemo(() => {
    if (effectiveBinary.byteLength === 0)
      return { scopedFamily: fontFamily, fontReady: Promise.resolve() };
    const { name, ready } = registerFontBinary(fontFamily, effectiveBinary);
    return { scopedFamily: `"${name}", ${fontFamily}`, fontReady: ready };
  }, [effectiveBinary, fontFamily]);

  use(fontReady);

  const effectiveWdthRange = useMemo(() => {
    const renderedRange = detectWdthSupport(`${fontSize}px ${scopedFamily}`, liga);
    return intersectWdthRanges(wdthRange, renderedRange);
  }, [wdthRange, fontSize, scopedFamily, liga]);

  const lines = useMemo(() => {
    if (effectiveBinary.byteLength === 0 || !isReady()) return [] as HzLine[];
    return layoutParagraph(effectiveBinary, {
      text,
      fontSize,
      lineWidth: layoutWidth,
      fontWeight,
      liga,
      opsz: wasmOpsz,
      ital: wasmItal,
      hyphenate,
      similarityDemerits: simDem,
      lang: "en",
      dir: "auto",
      writingMode: "horizontal-tb",
      hz: effectiveWdthRange ?? undefined,
    }) as HzLine[];
  }, [
    text,
    fontSize,
    layoutWidth,
    hyphenate,
    simDem,
    effectiveBinary,
    effectiveWdthRange,
    liga,
    fontWeight,
    wasmOpsz,
    wasmItal,
  ]);

  const hasHz = effectiveWdthRange && lines.some((l) => l.wdth !== 100);
  const note = `${lines.length} lines${hasHz ? " · Hz" : ""}`;
  const shaping = shapingCSS(liga) as CSSProperties;

  return (
    <Card label="Knuth–Plass — Harfrust" accent="#1a6b5a" note={note} sourceUrl={sourceUrl}>
      <div className={className} style={{ width: deferredWidth, ...containerStyle }}>
        {lines.map((line, i) => {
          const isJustified = !line.last && line.segments.length > 1;
          const isHz = line.wdth !== 100;

          const fvsParts: string[] = [];
          if (isHz) fvsParts.push(`'wdth' ${line.wdth}`);
          if (typeof opticalSizing === "number") {
            fvsParts.push(`'opsz' ${opticalSizing}`);
          } else if (opticalSizing === "auto" && fvsParts.length > 0) {
            fvsParts.push(`'opsz' ${fontSize}`);
          }

          const baseStyle: CSSProperties = {
            width: deferredWidth,
            height: lh,
            fontFamily: scopedFamily,
            fontSize,
            fontWeight,
            fontStyle,
            fontOpticalSizing: opticalSizing === "auto" ? "auto" : "none",
            lineHeight: `${lh}px`,
            color,
            whiteSpace: "nowrap",
            fontVariationSettings: fvsParts.length > 0 ? fvsParts.join(",") : undefined,
            ...shaping,
          };

          if (isJustified) {
            baseStyle.textAlign = "justify";
            baseStyle.textAlignLast = "justify";
          }

          return (
            <div key={i} style={baseStyle}>
              {line.text}
            </div>
          );
        })}
      </div>
    </Card>
  );
}
