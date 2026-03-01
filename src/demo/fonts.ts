import type { Font, WdthRange } from "../lib/types";
import { detectWdthSupport } from "../lib/measure";
import { registerFontBinary, registerFontBinaryMap } from "../lib/resolve-font-binary";
import { init as initWasm } from "../core/wasm";

export const FONT_CSS_URLS = [
  "https://fonts.googleapis.com/css2?family=Literata:opsz,wght@7..72,400;7..72,600;7..72,700&display=swap",
  "https://fonts.googleapis.com/css2?family=Source+Sans+3:wght@400;600&display=swap",
  "https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&display=swap",
  "https://fonts.googleapis.com/css2?family=Inter:wght@400;600&display=swap",
  "https://fonts.googleapis.com/css2?family=EB+Garamond:wght@400;600&display=swap",
  "https://fonts.googleapis.com/css2?family=Lora:wght@400;600&display=swap",
  "https://fonts.googleapis.com/css2?family=Roboto+Flex:wdth,wght@75..125,400;75..125,600&display=swap",
  "https://fonts.googleapis.com/css2?family=Noto+Sans:wdth,wght@62.5..100,400;62.5..100,600&display=swap",
  "https://fonts.googleapis.com/css2?family=Roboto+Serif:opsz,wdth,wght@8..144,75..100,400;8..144,75..100,600&display=swap",
  "https://fonts.googleapis.com/css2?family=Encode+Sans:wdth,wght@75..125,400;75..125,600&display=swap",
  "https://fonts.googleapis.com/css2?family=Inconsolata:wdth,wght@50..200,400;50..200,600&display=swap",
  "https://fonts.googleapis.com/css2?family=Noto+Sans+Display:wdth,wght@62.5..100,400;62.5..100,600&display=swap",
  "https://fonts.googleapis.com/css2?family=Roboto:wdth,wght@75..100,400;75..100,600&display=swap",
];

let _injected = false;
export function injectFontStylesheets(): void {
  if (_injected) return;
  _injected = true;
  for (const url of FONT_CSS_URLS) {
    if (!document.querySelector(`link[href="${url}"]`)) {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = url;
      document.head.appendChild(link);
    }
  }
}

export const FONTS: Font[] = [
  { label: "Literata", css: '18px "Literata", Georgia, serif', check: '18px "Literata"', family: '"Literata", Georgia, serif', size: 18, system: false, fontUrl: "/fonts/Literata[opsz,wght].ttf" },
  { label: "Source Sans 3", css: '17px "Source Sans 3", sans-serif', check: '17px "Source Sans 3"', family: '"Source Sans 3", sans-serif', size: 17, system: false, fontUrl: "/fonts/SourceSans3[wght].ttf" },
  { label: "Georgia", css: "18px Georgia, serif", check: "18px Georgia", family: "Georgia, serif", size: 18, system: true },
  { label: "Inter", css: '17px "Inter", sans-serif', check: '17px "Inter"', family: '"Inter", sans-serif', size: 17, system: false, fontUrl: "/fonts/Inter[opsz,wght].ttf" },
  { label: "EB Garamond", css: '19px "EB Garamond", serif', check: '19px "EB Garamond"', family: '"EB Garamond", serif', size: 19, system: false, fontUrl: "/fonts/EBGaramond[wght].ttf" },
  { label: "Lora", css: '18px "Lora", serif', check: '18px "Lora"', family: '"Lora", serif', size: 18, system: false, fontUrl: "/fonts/Lora[wght].ttf" },
  { label: "Roboto Flex", css: '17px "Roboto Flex", sans-serif', check: '17px "Roboto Flex"', family: '"Roboto Flex", sans-serif', size: 17, system: false, fontUrl: "/fonts/RobotoFlex-VariableFont.ttf" },
  { label: "Noto Sans", css: '17px "Noto Sans", sans-serif', check: '17px "Noto Sans"', family: '"Noto Sans", sans-serif', size: 17, system: false, fontUrl: "/fonts/NotoSans[wdth,wght].ttf" },
  { label: "Roboto Serif", css: '18px "Roboto Serif", serif', check: '18px "Roboto Serif"', family: '"Roboto Serif", serif', size: 18, system: false, fontUrl: "/fonts/RobotoSerif[GRAD,opsz,wdth,wght].ttf" },
  { label: "Encode Sans", css: '17px "Encode Sans", sans-serif', check: '17px "Encode Sans"', family: '"Encode Sans", sans-serif', size: 17, system: false, fontUrl: "/fonts/EncodeSans[wdth,wght].ttf" },
  { label: "Inconsolata", css: '16px "Inconsolata", monospace', check: '16px "Inconsolata"', family: '"Inconsolata", monospace', size: 16, system: false, fontUrl: "/fonts/Inconsolata[wdth,wght].ttf" },
  { label: "Noto Sans Display", css: '17px "Noto Sans Display", sans-serif', check: '17px "Noto Sans Display"', family: '"Noto Sans Display", sans-serif', size: 17, system: false, fontUrl: "/fonts/NotoSansDisplay[wdth,wght].ttf" },
  { label: "Roboto", css: '17px "Roboto", sans-serif', check: '17px "Roboto"', family: '"Roboto", sans-serif', size: 17, system: false, fontUrl: "/fonts/Roboto[wdth,wght].ttf" },
  { label: "DM Mono (static)", css: '16px "DM Mono", monospace', check: '16px "DM Mono"', family: '"DM Mono", monospace', size: 16, system: false, fontUrls: { 400: "/fonts/DMMono-Regular.ttf", 500: "/fonts/DMMono-Medium.ttf" } },
];

export interface FontLoadResult {
  wdthRange: WdthRange | null;
}

injectFontStylesheets();

const _fontCache = new Map<number, Promise<FontLoadResult>>();
export function loadFontData(fontIdx: number): Promise<FontLoadResult> {
  let p = _fontCache.get(fontIdx);
  if (p) return p;
  const font = FONTS[fontIdx];
  if (font.system) {
    p = Promise.resolve({ wdthRange: detectWdthSupport(font.css) });
  } else {
    p = Promise.race([
      document.fonts.load(font.check),
      new Promise<FontFace[]>((resolve) => setTimeout(() => resolve([]), 5000)),
    ]).then(() => ({ wdthRange: detectWdthSupport(font.css) }));
  }
  _fontCache.set(fontIdx, p);
  return p;
}

const _readyCache = new Map<number, Promise<FontLoadResult>>();
export function fontAndWasmReady(fontIdx: number): Promise<FontLoadResult> {
  let p = _readyCache.get(fontIdx);
  if (p) return p;
  p = Promise.all([loadFontData(fontIdx), initWasm()]).then(([fontData]) => fontData);
  _readyCache.set(fontIdx, p);
  return p;
}

export interface HarfrustFontLoadResult extends FontLoadResult {
  fontBinary: ArrayBuffer;
  fontBinaryMap?: Record<number, ArrayBuffer>;
}

const _binaryCache = new Map<string, Promise<ArrayBuffer>>();
function fetchFontBinary(url: string): Promise<ArrayBuffer> {
  let p = _binaryCache.get(url);
  if (p) return p;
  p = fetch(url).then((r) => {
    if (!r.ok) throw new Error(`Failed to fetch font from ${url}: ${r.status}`);
    return r.arrayBuffer();
  });
  _binaryCache.set(url, p);
  return p;
}

const _harfrustReadyCache = new Map<number, Promise<HarfrustFontLoadResult>>();
export function fontAndHarfrustReady(fontIdx: number): Promise<HarfrustFontLoadResult> {
  let p = _harfrustReadyCache.get(fontIdx);
  if (p) return p;
  const font = FONTS[fontIdx];

  if (font.fontUrls) {
    const entries = Object.entries(font.fontUrls);
    const binaryPromises = entries.map(
      ([w, url]) => fetchFontBinary(url).then((buf) => [Number(w), buf] as const),
    );
    p = Promise.all([
      loadFontData(fontIdx),
      Promise.all(binaryPromises),
      initWasm(),
    ]).then(async ([fontData, weightEntries]) => {
      const binaryMap: Record<number, ArrayBuffer> = {};
      const regEntries: { binary: ArrayBuffer; weight: number }[] = [];
      for (const [w, buf] of weightEntries) {
        binaryMap[w] = buf;
        regEntries.push({ binary: buf, weight: w });
      }
      const bareFamily = font.family.split(",")[0].trim().replace(/"/g, "");
      const { ready } = registerFontBinaryMap(bareFamily, regEntries);
      await ready;
      return { ...fontData, fontBinary: new ArrayBuffer(0), fontBinaryMap: binaryMap };
    });
  } else {
    p = Promise.all([
      loadFontData(fontIdx),
      font.system || !font.fontUrl
        ? Promise.resolve(new ArrayBuffer(0))
        : fetchFontBinary(font.fontUrl),
      initWasm(),
    ]).then(async ([fontData, fontBinary]) => {
      if (fontBinary.byteLength > 0) {
        const bareFamily = font.family.split(",")[0].trim().replace(/"/g, "");
        const { ready } = registerFontBinary(bareFamily, fontBinary);
        await ready;
      }
      return { ...fontData, fontBinary };
    });
  }

  _harfrustReadyCache.set(fontIdx, p);
  return p;
}
