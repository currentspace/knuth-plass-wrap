import { use, useMemo, useDeferredValue } from "react";
import type { Line, HzLine, LayoutOptions } from "../core/types";
import { init, layoutParagraph } from "../core/wasm";
import { SIMILAR_DEM } from "../core/constants";
import { loadHyphenationLangs } from "../core/hyphenation";

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

/**
 * Options for {@link useKnuthPlassWrap}.
 */
export interface UseKnuthPlassWrapOptions {
  /** The paragraph text to lay out. */
  text: string;
  /** Raw TTF/OTF font binary. Pass `null` while loading. */
  fontData: ArrayBuffer | null;
  /** Font size in CSS pixels. */
  fontSize: number;
  /** Target line width in CSS pixels. */
  lineWidth: number;
  /** CSS font-weight. Passed to HarfBuzz for variable font shaping. Default: `400`. */
  fontWeight?: number;
  /** Enable standard ligatures in HarfBuzz shaping. Default: `true`. */
  liga?: boolean;
  /** Optical sizing axis value for HarfBuzz shaping.
   *  - positive number: set opsz to that value
   *  - 0: disable opsz (matches CSS `font-optical-sizing: none`)
   *  Defaults to `fontSize` (matches CSS `font-optical-sizing: auto`). */
  opsz?: number;
  /** Enable automatic hyphenation. Default: `false`. */
  hyphenate?: boolean;
  /** ISO 639-1 language code for hyphenation (e.g. `"en"`, `"de"`, `"fr"`).
   *  Also passed through for language-sensitive shaping. Default: `"en"`. */
  lang?: string;
  /** Text direction metadata. Default: `"auto"`. */
  dir?: "auto" | "ltr" | "rtl";
  /** CSS writing-mode metadata. KP optimization is horizontal-width based. */
  writingMode?: "horizontal-tb" | "vertical-rl" | "vertical-lr";
  /** Apply similarity demerits for adjacent line tightness. Default: `true`. */
  similarity?: boolean;
  /** Hz-program justification using the font's `wdth` axis. */
  hz?: { min: number; max: number };
}

/**
 * Result of {@link useKnuthPlassWrap}.
 */
export interface UseKnuthPlassWrapResult {
  /** Laid-out lines (or HzLines when `hz` is set). */
  lines: Line[] | HzLine[];
  /** `true` while WASM is initializing or font is loading. */
  isLoading: boolean;
}

/**
 * React hook for Knuth-Plass optimal line breaking. Wraps the WASM layout
 * engine for use in components that want custom rendering. Does not handle
 * font fetching — the component must provide `fontData` when ready.
 *
 * Must be used inside a `<Suspense>` boundary — suspends while WASM
 * initialises.
 *
 * @param options - Layout parameters (text, fontData, fontSize, lineWidth, etc.).
 * @returns Laid-out lines and loading state.
 */
export function useKnuthPlassWrap(
  options: UseKnuthPlassWrapOptions,
): UseKnuthPlassWrapResult {
  const {
    text,
    fontData,
    fontSize,
    lineWidth,
    fontWeight = 400,
    liga = true,
    opsz,
    hyphenate = false,
    lang = "en",
    dir = "auto",
    writingMode = "horizontal-tb",
    similarity = true,
    hz,
  } = options;

  use(ensureWasmInit());
  if (hyphenate) use(ensureHyphenationData(lang));

  const deferredLineWidth = useDeferredValue(lineWidth);
  const effectiveOpsz = opsz ?? fontSize;

  const lines = useMemo(() => {
    if (fontData === null || fontData.byteLength === 0) {
      return [];
    }
    const layoutOptions: LayoutOptions = {
      text,
      fontSize,
      lineWidth: deferredLineWidth,
      fontWeight,
      liga,
      opsz: effectiveOpsz,
      hyphenate,
      lang,
      dir,
      writingMode,
      similarityDemerits: similarity ? SIMILAR_DEM : 0,
      hz,
    };
    return layoutParagraph(fontData, layoutOptions);
  }, [
    fontData,
    text,
    fontSize,
    deferredLineWidth,
    fontWeight,
    liga,
    effectiveOpsz,
    hyphenate,
    lang,
    dir,
    writingMode,
    similarity,
    hz,
  ]);

  const isLoading = fontData === null || fontData.byteLength === 0;

  return { lines, isLoading };
}
