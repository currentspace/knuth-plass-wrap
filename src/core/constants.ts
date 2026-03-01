/** Infinity sentinel used in the KP algorithm. */
export const INF = 1e10;

/** Badness threshold for overfull/underfull lines. */
export const INF_BAD = 10000;

/** Penalty added per line break (discourages excessive line count). */
export const LINE_PENALTY = 10;

/** Demerits for consecutive flagged (hyphenated) breaks. */
export const FLAG_DEM = 3000;

/** Demerits for adjacent lines with very different fitness classes. */
export const FIT_DEM = 3000;

/** Penalty discouraging breaks that leave a widow (last word alone). */
export const WIDOW_PENALTY = 50;

/** Penalty for breaking at a hyphenation point. */
export const HYPHEN_PENALTY = 50;

/** Default similarity demerits for adjacent lines with different tightness. */
export const SIMILAR_DEM = 2000;

/** Target percentage of font-width variation for Hz justification. */
export const HZ_TARGET_PCT = 0.03;

/**
 * Maximum fraction of the natural space width that interword glue may
 * shrink. The minimum rendered space is `(1 - SPACE_SHRINK_RATIO)` of
 * natural. TeX's default is 1/3; we use 1/5 for a more conservative
 * 80% floor that keeps word boundaries clearly legible.
 */
export const SPACE_SHRINK_RATIO = 0.2;

