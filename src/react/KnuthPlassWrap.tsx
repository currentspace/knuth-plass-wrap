import {
  use,
  useMemo,
  useDeferredValue,
  type ReactNode,
  type CSSProperties,
} from "react";
import { init, layoutParagraph } from "../core/wasm";
import type { HzLine } from "../core/types";
import { SIMILAR_DEM } from "../core/constants";
import {
  registerFontBinary,
  registerFontBinaryMap,
} from "../lib/resolve-font-binary";
import { ensureRawFont } from "../lib/decode-woff2";
import { loadHyphenationLangs } from "../core/hyphenation";

const fontCache = new Map<string, Promise<ArrayBuffer>>();

function fetchFont(url: string): Promise<ArrayBuffer> {
  let p = fontCache.get(url);
  if (!p) {
    p = fetch(url)
      .then((r) => r.arrayBuffer())
      .then((buf) => ensureRawFont(buf));
    fontCache.set(url, p);
  }
  return p;
}

let _initPromise: Promise<void> | null = null;
function ensureWasmInit(): Promise<void> {
  _initPromise ??= init();
  return _initPromise;
}

const _hyphenCache = new Map<string, Promise<void>>();
function ensureHyphenationData(lang: string): Promise<void> {
  let p = _hyphenCache.get(lang);
  if (!p) {
    p = loadHyphenationLangs([lang]);
    _hyphenCache.set(lang, p);
  }
  return p;
}

export interface KnuthPlassWrapProps {
  /** The paragraph text to lay out. */
  text: string;
  /** Raw TTF/OTF font binary (variable font — covers all weights). */
  fontData?: ArrayBuffer;
  /** URL to a TTF/OTF font file. Fetched and cached automatically. */
  fontUrl?: string;
  /** Map of weight → font binary for static font families.
   *  Keys are CSS font-weight values (e.g. 400, 700).
   *  The component picks the closest match for the requested fontWeight. */
  fontDataMap?: Record<number, ArrayBuffer>;
  /** Font size in CSS pixels. */
  fontSize: number;
  /** Target line width in CSS pixels. */
  lineWidth: number;
  /** CSS font-family for rendering. Only needed when NOT using scoped font
   *  registration (i.e. when you manage @font-face yourself). */
  fontFamily?: string;
  /** CSS font-weight. Also passed to HarfBuzz for variable font shaping. Default: 400. */
  fontWeight?: number;
  /** CSS font-style. Default: "normal". */
  fontStyle?: string;
  /** CSS font-stretch or wdth value. Default: "100%". */
  fontStretch?: string;
  /** Line height multiplier. Default: 1.6. */
  lineHeight?: number;
  /** Text color. Default: "#2a2623". */
  color?: string;
  /** Enable standard ligatures. Default: true. */
  liga?: boolean;
  /** Optical sizing: "auto" (default), "none", or an explicit opsz value. */
  opticalSizing?: "auto" | "none" | number;
  /** Enable automatic hyphenation. Default: false. */
  hyphenate?: boolean;
  /** ISO 639-1 language code for hyphenation (e.g. `"en"`, `"de"`, `"fr"`).
   *  Also passed through for language-sensitive shaping. Default: `"en"`. */
  lang?: string;
  /** Text direction metadata. Default: "auto". */
  dir?: "auto" | "ltr" | "rtl";
  /** CSS writing-mode metadata. KP optimization is horizontal-width based. */
  writingMode?: "horizontal-tb" | "vertical-rl" | "vertical-lr";
  /** Enable similarity demerits. Default: true. */
  similarity?: boolean;
  /** Hz justification wdth axis range. */
  hz?: { min: number; max: number };
  /** Additional CSS class name on the outer container. */
  className?: string;
  /** Additional inline styles on the outer container. */
  style?: CSSProperties;
  /** Fallback content shown while WASM or font is loading. */
  fallback?: ReactNode;
}

function resolveOpsz(
  opticalSizing: "auto" | "none" | number | undefined,
  fontSize: number,
): { wasmOpsz: number; cssOpticalSizing: "auto" | "none"; cssOpszValue: number | null } {
  if (opticalSizing === "none") {
    return { wasmOpsz: 0, cssOpticalSizing: "none", cssOpszValue: null };
  }
  if (typeof opticalSizing === "number") {
    return { wasmOpsz: opticalSizing, cssOpticalSizing: "none", cssOpszValue: opticalSizing };
  }
  return { wasmOpsz: fontSize, cssOpticalSizing: "auto", cssOpszValue: null };
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

/**
 * Renders a paragraph of text using Knuth-Plass optimal line breaking
 * with HarfBuzz-accurate measurement via WASM.
 *
 * Must be wrapped in a `<Suspense>` boundary — suspends while WASM
 * initialises and (when using `fontUrl`) while the font binary loads.
 */
export function KnuthPlassWrap({
  text,
  fontData: fontDataProp,
  fontUrl,
  fontDataMap,
  fontSize,
  lineWidth,
  fontFamily,
  fontWeight = 400,
  fontStyle = "normal",
  fontStretch = "100%",
  lineHeight: lineHeightMult = 1.6,
  color = "#2a2623",
  liga = true,
  opticalSizing = "auto",
  hyphenate = false,
  lang = "en",
  dir = "auto",
  writingMode = "horizontal-tb",
  similarity = true,
  hz,
  className,
  style,
  fallback,
}: KnuthPlassWrapProps): ReactNode {
  use(ensureWasmInit());
  if (hyphenate) use(ensureHyphenationData(lang));

  const fetchedData = fontUrl ? use(fetchFont(fontUrl)) : null;
  const numericWeight = fontWeight;

  const fontData = useMemo(() => {
    if (fontDataProp) return fontDataProp;
    if (fetchedData) return fetchedData;
    if (fontDataMap) {
      const w = closestWeight(fontDataMap, numericWeight);
      return fontDataMap[w];
    }
    return null;
  }, [fontDataProp, fetchedData, fontDataMap, numericWeight]);

  const scopedFamily = useMemo(() => {
    if (fontFamily) return null;
    if (!fontData && !fontDataMap) return null;

    if (fontDataMap) {
      const entries = Object.entries(fontDataMap).map(([w, buf]) => ({
        binary: buf,
        weight: Number(w),
      }));
      const reg = registerFontBinaryMap("KPFont", entries);
      use(reg.ready);
      return reg.name;
    }

    if (fontData) {
      const reg = registerFontBinary("KPFont", fontData);
      use(reg.ready);
      return reg.name;
    }

    return null;
  }, [fontFamily, fontData, fontDataMap]);

  const effectiveFamily = fontFamily ?? scopedFamily;

  const deferredLineWidth = useDeferredValue(lineWidth);
  const { wasmOpsz, cssOpticalSizing, cssOpszValue } = resolveOpsz(opticalSizing, fontSize);
  const wasmItal = fontStyle === "italic" || fontStyle === "oblique" ? 12 : 0;

  const lines = useMemo(() => {
    if (!fontData) return [];
    try {
      return layoutParagraph(fontData, {
        text,
        fontSize,
        lineWidth: deferredLineWidth,
        fontWeight: numericWeight,
        liga,
        opsz: wasmOpsz,
        ital: wasmItal,
        hyphenate,
        lang,
        dir,
        writingMode,
        similarityDemerits: similarity ? SIMILAR_DEM : 0,
        hz,
      });
    } catch {
      return [];
    }
  }, [
    fontData,
    text,
    fontSize,
    deferredLineWidth,
    numericWeight,
    liga,
    wasmOpsz,
    wasmItal,
    hyphenate,
    lang,
    dir,
    writingMode,
    similarity,
    hz,
  ]);

  if (!fontData || !effectiveFamily) return fallback ?? null;

  const lh = Math.round(fontSize * lineHeightMult);

  const variationParts: string[] = [];
  if (cssOpszValue !== null) {
    variationParts.push(`'opsz' ${cssOpszValue}`);
  }

  const lineStyleBase: CSSProperties = {
    fontFamily: effectiveFamily,
    fontSize,
    fontWeight: numericWeight,
    fontStyle,
    fontStretch,
    lineHeight: `${lh}px`,
    color,
    whiteSpace: "nowrap",
    direction: dir === "auto" ? undefined : dir,
    writingMode,
    fontKerning: "normal",
    fontOpticalSizing: cssOpticalSizing,
    fontVariantLigatures: liga ? "common-ligatures" : "no-common-ligatures",
    fontFeatureSettings: liga
      ? '"kern" 1, "liga" 1, "clig" 1'
      : '"kern" 1, "liga" 0, "clig" 0',
  };

  if (variationParts.length > 0) {
    lineStyleBase.fontVariationSettings = variationParts.join(", ");
  }

  return (
    <div className={className} style={style} lang={lang} dir={dir}>
      {lines.map((line, i) => {
        const isJustified = !line.last && line.segments.length > 1;
        const isHz = "wdth" in line && (line as HzLine).wdth !== 100;

        const divStyle: CSSProperties = {
          ...lineStyleBase,
          width: deferredLineWidth,
          height: lh,
        };

        if (isHz) {
          const fvsParts = [`'wdth' ${(line as HzLine).wdth}`];
          if (cssOpszValue !== null) {
            fvsParts.push(`'opsz' ${cssOpszValue}`);
          } else if (cssOpticalSizing === "auto") {
            // font-variation-settings overrides all auto-computed axes,
            // so we must explicitly preserve opsz=fontSize when setting wdth.
            fvsParts.push(`'opsz' ${fontSize}`);
          }
          divStyle.fontVariationSettings = fvsParts.join(", ");
        }

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
