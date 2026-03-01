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

  el.style.fontVariationSettings = "'wdth' 100";
  const w100 = el.getBoundingClientRect().width;

  el.style.fontVariationSettings = "'wdth' 85";
  const w85 = el.getBoundingClientRect().width;

  el.style.fontVariationSettings = "'wdth' 115";
  const w115 = el.getBoundingClientRect().width;

  el.parentNode?.removeChild(el);

  if (Math.abs(w100 - w85) < 0.5 && Math.abs(w100 - w115) < 0.5) return null;

  const pxPerUnit = (w115 - w85) / 30;
  if (Math.abs(pxPerUnit) < 0.001) return null;

  const targetDelta = w100 * HZ_TARGET_PCT;
  const unitRange = Math.ceil(targetDelta / Math.abs(pxPerUnit));

  const range: WdthRange = {
    min: Math.max(75, 100 - unitRange),
    max: Math.min(125, 100 + unitRange),
  };
  _wdthCache.set(key, range);
  return range;
}
