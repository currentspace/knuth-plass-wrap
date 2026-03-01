export type {
  Line,
  HzLine,
  LayoutOptions,
  InitInput,
} from "./types";

export {
  init,
  isReady,
  layoutParagraph,
  measureWord,
} from "./wasm";

export {
  SPACE_SHRINK_RATIO,
  LINE_PENALTY,
  SIMILAR_DEM,
  WIDOW_PENALTY,
  HYPHEN_PENALTY,
  FLAG_DEM,
  FIT_DEM,
  HZ_TARGET_PCT,
  INF,
  INF_BAD,
} from "./constants";

export {
  loadHyphenationData,
  loadHyphenationLangs,
  hasHyphenationData,
} from "./hyphenation";

export {
  registerFontBinary,
  registerFontBinaryMap,
} from "../lib/resolve-font-binary";

export { isWoff2, ensureRawFont } from "../lib/decode-woff2";
