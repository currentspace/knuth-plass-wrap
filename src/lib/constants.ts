export const INF = 1e10;
export const INF_BAD = 10000;
export const LINE_PENALTY = 10;
export const FLAG_DEM = 3000;
export const FIT_DEM = 3000;
export const WIDOW_PENALTY = 50;
export const HYPHEN_PENALTY = 50;
export const SIMILAR_DEM = 2000;
export const HZ_TARGET_PCT = 0.03;

// Maximum fraction of the natural space width that interword glue may
// shrink.  The minimum rendered space is (1 − SPACE_SHRINK_RATIO) of
// natural.  TeX's default is 1/3 (min space = 2/3); we use 1/5 for a
// more conservative 80% floor that keeps word boundaries clearly legible.
export const SPACE_SHRINK_RATIO = 0.2;

