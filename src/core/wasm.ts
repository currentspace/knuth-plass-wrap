import type { BinaryData, Line, HzLine, InitInput, LayoutOptions } from "./types";
import { SIMILAR_DEM } from "./constants";
import { _setHyphenationBindings } from "./hyphenation";

type RawLayoutFn = (
  font_data: Uint8Array,
  font_size_px: number,
  text: string,
  line_width: number,
  sim_dem: number,
  hyphenate: boolean,
  lang: string,
  dir: string,
  writing_mode: string,
  hz_min: number,
  hz_max: number,
  liga: boolean,
  font_weight: number,
  opsz: number,
  ital: number,
) => Line[] | HzLine[];

type RawMeasureFn = (
  font_data: Uint8Array,
  font_size_px: number,
  text: string,
  liga: boolean,
  font_weight: number,
  opsz: number,
  ital: number,
  wdth: number,
) => number;

type RawRegisterFontFn = (font_data: Uint8Array) => number;
type RawUnregisterFontFn = (handle: number) => boolean;
type RawLayoutWithFontFn = (
  font_handle: number,
  font_size_px: number,
  text: string,
  line_width: number,
  sim_dem: number,
  hyphenate: boolean,
  lang: string,
  dir: string,
  writing_mode: string,
  hz_min: number,
  hz_max: number,
  liga: boolean,
  font_weight: number,
  opsz: number,
  ital: number,
) => Line[] | HzLine[];

let _layoutFn: RawLayoutFn | null = null;
let _measureFn: RawMeasureFn | null = null;
let _registerFontFn: RawRegisterFontFn | null = null;
let _unregisterFontFn: RawUnregisterFontFn | null = null;
let _layoutWithFontFn: RawLayoutWithFontFn | null = null;
let _initPromise: Promise<void> | null = null;

function toUint8Array(data: BinaryData): Uint8Array {
  if (ArrayBuffer.isView(data)) {
    return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  }
  return new Uint8Array(data);
}

/**
 * Initialize the WASM module. Must be called (and awaited) before
 * {@link layoutParagraph} or {@link measureWord}.
 *
 * The wasm-pack generated loader handles all input types: when called
 * without arguments it loads `kp_break_wasm_bg.wasm` from the same
 * directory via `import.meta.url`. You can override this by passing
 * a URL string, `URL` object, `Request`, `Response`, or
 * `Promise<Response>`.
 *
 * @param input - Optional override for the `.wasm` binary location.
 *
 * @example
 * ```ts
 * // Default — loads .wasm from the package directory
 * await init();
 *
 * // Custom URL (self-hosted, CDN, etc.)
 * await init("https://cdn.example.com/kp_break_wasm_bg.wasm");
 *
 * // Fetch response
 * await init(fetch("/my-path/kp_break_wasm_bg.wasm"));
 * ```
 */
export async function init(input?: InitInput): Promise<void> {
  if (_layoutFn) return;
  if (_initPromise) {
    await _initPromise;
    return;
  }

  _initPromise = (async () => {
    const mod = await import(
      /* @vite-ignore */ "../../wasm/pkg/kp_break_wasm.js"
    );

    if (input !== undefined) {
      await mod.default({ module_or_path: input });
    } else {
      await mod.default();
    }

    _layoutFn = mod.layout_paragraph as RawLayoutFn;
    _measureFn = mod.measure_word_width as RawMeasureFn;
    _registerFontFn = mod.register_layout_font as RawRegisterFontFn;
    _unregisterFontFn = mod.unregister_layout_font as RawUnregisterFontFn;
    _layoutWithFontFn = mod.layout_paragraph_for_font as RawLayoutWithFontFn;

    _setHyphenationBindings(
      mod.load_hyphenation_data as (lang: string, data: Uint8Array) => void,
      mod.has_hyphenation_data as (lang: string) => boolean,
    );
  })();

  await _initPromise;
}

/** Returns `true` if the WASM module has been initialized. */
export function isReady(): boolean {
  return _layoutFn !== null;
}

/**
 * Lay out a paragraph of text using the Knuth-Plass algorithm with
 * HarfBuzz-accurate glyph measurement.
 *
 * The entire pipeline — text measurement, tokenization, hyphenation,
 * optimal line breaking, and line construction — runs in a single
 * WASM call for maximum performance.
 *
 * @param fontData - Raw TTF/OTF font binary.
 * @param options  - Layout parameters (text, fontSize, lineWidth, etc.).
 * @returns An array of {@link Line} objects (or {@link HzLine} when Hz is enabled).
 *
 * @throws If {@link init} has not been called.
 *
 * @example
 * ```ts
 * await init();
 * const fontData = await fetch("/fonts/Inter.ttf").then(r => r.arrayBuffer());
 * const lines = layoutParagraph(fontData, {
 *   text: "The problem of breaking a paragraph into lines...",
 *   fontSize: 17,
 *   lineWidth: 400,
 * });
 * ```
 */
export function layoutParagraph(
  fontData: BinaryData,
  options: LayoutOptions,
): Line[] | HzLine[] {
  if (!_layoutFn) {
    throw new Error(
      "knuth-plass-wrap: WASM not initialized. Call init() first.",
    );
  }

  const data = toUint8Array(fontData);
  const simDem = options.similarityDemerits ?? SIMILAR_DEM;
  const hyphenate = options.hyphenate ?? false;
  const lang = options.lang ?? "en";
  const dir = options.dir ?? "auto";
  const writingMode = options.writingMode ?? "horizontal-tb";
  const hzMin = options.hz?.min ?? 0;
  const hzMax = options.hz?.max ?? 0;
  const liga = options.liga ?? true;
  const fontWeight = options.fontWeight ?? 400;
  const opsz = options.opsz ?? options.fontSize;
  const ital = options.ital ?? 0;

  return _layoutFn(
    data,
    options.fontSize,
    options.text,
    options.lineWidth,
    simDem,
    hyphenate,
    lang,
    dir,
    writingMode,
    hzMin,
    hzMax,
    liga,
    fontWeight,
    opsz,
    ital,
  );
}

/**
 * Register a font binary once and reuse the returned handle for repeated
 * layouts. This lets the WASM engine reuse parsed font state and shaping
 * caches across calls.
 */
export function registerLayoutFont(fontData: BinaryData): number {
  if (!_registerFontFn) {
    throw new Error(
      "knuth-plass-wrap: WASM not initialized. Call init() first.",
    );
  }
  return _registerFontFn(toUint8Array(fontData));
}

/** Release a font handle previously returned by {@link registerLayoutFont}. */
export function unregisterLayoutFont(fontHandle: number): boolean {
  if (!_unregisterFontFn) {
    throw new Error(
      "knuth-plass-wrap: WASM not initialized. Call init() first.",
    );
  }
  return _unregisterFontFn(fontHandle);
}

/**
 * Lay out a paragraph with a registered font handle.
 */
export function layoutParagraphWithFont(
  fontHandle: number,
  options: LayoutOptions,
): Line[] | HzLine[] {
  if (!_layoutWithFontFn) {
    throw new Error(
      "knuth-plass-wrap: WASM not initialized. Call init() first.",
    );
  }

  const simDem = options.similarityDemerits ?? SIMILAR_DEM;
  const hyphenate = options.hyphenate ?? false;
  const lang = options.lang ?? "en";
  const dir = options.dir ?? "auto";
  const writingMode = options.writingMode ?? "horizontal-tb";
  const hzMin = options.hz?.min ?? 0;
  const hzMax = options.hz?.max ?? 0;
  const liga = options.liga ?? true;
  const fontWeight = options.fontWeight ?? 400;
  const opsz = options.opsz ?? options.fontSize;
  const ital = options.ital ?? 0;

  return _layoutWithFontFn(
    fontHandle,
    options.fontSize,
    options.text,
    options.lineWidth,
    simDem,
    hyphenate,
    lang,
    dir,
    writingMode,
    hzMin,
    hzMax,
    liga,
    fontWeight,
    opsz,
    ital,
  );
}

/**
 * Measure the advance width of a single word using HarfBuzz shaping.
 * Useful for debugging or building custom layout logic.
 *
 * @param fontData   - Raw TTF/OTF font binary.
 * @param fontSize   - Font size in CSS pixels.
 * @param word       - The text to measure.
 * @param liga       - Enable standard ligatures. Default: `true`.
 * @param fontWeight - CSS font-weight. Default: `400`.
 * @param opsz       - Optical sizing axis value. Defaults to `fontSize`.
 * @param ital       - Italic/slant axis value. Default: `0`.
 * @param wdth       - Width axis value (100 = normal). Default: `100`.
 * @returns Width in CSS pixels.
 *
 * @throws If {@link init} has not been called.
 */
export function measureWord(
  fontData: BinaryData,
  fontSize: number,
  word: string,
  liga = true,
  fontWeight = 400,
  opsz?: number,
  ital = 0,
  wdth = 100,
): number {
  if (!_measureFn) {
    throw new Error(
      "knuth-plass-wrap: WASM not initialized. Call init() first.",
    );
  }
  return _measureFn(toUint8Array(fontData), fontSize, word, liga, fontWeight, opsz ?? fontSize, ital, wdth);
}
