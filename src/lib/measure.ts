import type { WdthRange } from "./types";
import { HZ_TARGET_PCT } from "./constants";

export function shapingCSS(liga = true): Record<string, string> {
  const ligVal = liga ? 1 : 0;
  const variant = liga ? "common-ligatures" : "no-common-ligatures";
  return {
    fontKerning: "normal",
    fontVariantLigatures: variant,
    fontFeatureSettings: `"kern" 1, "liga" ${ligVal}, "clig" ${ligVal}`,
  };
}

const _wdthCache = new Map<string, WdthRange | null>();
const NORMAL_WDTH = 100;
const LOCAL_WDTH_PROBE_DELTA = 5;
const MIN_RENDERED_AXIS_DELTA_PX = 0.5;

function measureWdth(el: HTMLElement, wdth: number): number {
  el.style.fontVariationSettings = `"wdth" ${wdth}`;
  return el.getBoundingClientRect().width;
}

export function detectWdthSupport(fontCSS: string, liga = true): WdthRange | null {
  const key = `${fontCSS}|liga=${liga ? 1 : 0}`;
  const cached = _wdthCache.get(key);
  if (cached !== undefined) return cached;

  const el = document.createElement("span");
  el.style.cssText =
    "position:absolute;top:-9999px;left:-9999px;" +
    "white-space:pre;visibility:hidden;pointer-events:none;" +
    `font:${fontCSS};` +
    `font-kerning:normal;font-variant-ligatures:${liga ? "common-ligatures" : "no-common-ligatures"};` +
    `font-feature-settings:"kern" 1,"liga" ${liga ? 1 : 0},"clig" ${liga ? 1 : 0};`;
  document.body.appendChild(el);
  el.textContent = "Hamburgefontsiv";

  const w100 = measureWdth(el, NORMAL_WDTH);
  const wNarrow = measureWdth(el, NORMAL_WDTH - LOCAL_WDTH_PROBE_DELTA);
  const wWide = measureWdth(el, NORMAL_WDTH + LOCAL_WDTH_PROBE_DELTA);

  el.parentNode?.removeChild(el);

  const narrowDelta = w100 - wNarrow;
  const wideDelta = wWide - w100;
  const hasNarrowResponse = narrowDelta > MIN_RENDERED_AXIS_DELTA_PX;
  const hasWideResponse = wideDelta > MIN_RENDERED_AXIS_DELTA_PX;

  // Hz justification needs small, continuous width-axis changes around 100.
  // Some browser/font pairs expose wdth but quantize nearby values into named
  // instances; sampling far from 100 would misclassify those as usable.
  if (!hasNarrowResponse && !hasWideResponse) return null;

  const targetDelta = w100 * HZ_TARGET_PCT;
  const min = hasNarrowResponse
    ? Math.max(
        75,
        NORMAL_WDTH -
          Math.ceil(targetDelta / (narrowDelta / LOCAL_WDTH_PROBE_DELTA)),
      )
    : NORMAL_WDTH;
  const max = hasWideResponse
    ? Math.min(
        125,
        NORMAL_WDTH +
          Math.ceil(targetDelta / (wideDelta / LOCAL_WDTH_PROBE_DELTA)),
      )
    : NORMAL_WDTH;

  const range: WdthRange = { min, max };
  _wdthCache.set(key, range);
  return range;
}
