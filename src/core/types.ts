/** A single line of justified text produced by the layout engine. */
export interface Line {
  /** Words on this line, in order. */
  words: string[];
  /** Per-word widths in pixels, parallel to `words`. */
  widths: number[];
  /** Total width of all word boxes (excluding spaces). */
  boxW: number;
  /** Natural interword space width in pixels. */
  spaceWidth: number;
  /** True if this is the last line of the paragraph (left-aligned, not justified). */
  last: boolean;
}

/**
 * A line with an additional `wdth` field for Hz (font-width-axis) justification.
 * When Hz is enabled, each line may use a different `wdth` value to achieve
 * tighter justification by varying the font's width axis.
 */
export interface HzLine extends Line {
  /** The CSS `font-variation-settings: 'wdth'` value used for this line (100 = normal). */
  wdth: number;
}

/** Options for {@link layoutParagraph}. */
export interface LayoutOptions {
  /** The paragraph text to lay out. */
  text: string;
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
   *  - 0: don't set opsz (matches CSS `font-optical-sizing: none`)
   *  Defaults to `fontSize` (matches CSS `font-optical-sizing: auto`). */
  opsz?: number;
  /** Italic/slant axis value for variable font shaping.
   *  - positive number: set ital=1 and slnt=-value (e.g. 12 for 12° slant)
   *  - 0: upright (default) */
  ital?: number;
  /** Enable automatic hyphenation. Default: `false`. */
  hyphenate?: boolean;
  /** ISO 639-1 language code for hyphenation (e.g. `"en"`, `"de"`, `"fr"`).
   *  Only used when `hyphenate` is `true`. Default: `"en"`. */
  lang?: string;
  /**
   * Similarity demerits penalise adjacent lines with very different
   * tightness. Set to 0 to disable. Default: `2000`.
   */
  similarityDemerits?: number;
  /**
   * Enable Hz-program justification using the font's `wdth` axis.
   * Provide the min/max wdth values the font supports.
   * When omitted, Hz is disabled.
   */
  hz?: { min: number; max: number };
}

/**
 * Input accepted by {@link init} for loading the WASM module.
 * Matches the wasm-pack generated `InitInput` union.
 */
export type InitInput =
  | RequestInfo
  | URL
  | Response
  | BufferSource
  | WebAssembly.Module;
