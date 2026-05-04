import type { BinaryData } from "./types";

let _loadFn: ((lang: string, data: Uint8Array) => void) | null = null;
let _hasFn: ((lang: string) => boolean) | null = null;

function toUint8Array(data: BinaryData): Uint8Array {
  if (ArrayBuffer.isView(data)) {
    return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  }
  return new Uint8Array(data);
}

/** @internal Wire up the WASM bindings after init(). */
export function _setHyphenationBindings(
  load: (lang: string, data: Uint8Array) => void,
  has: (lang: string) => boolean,
): void {
  _loadFn = load;
  _hasFn = has;
}

/**
 * Load hyphenation trie data for a language into the WASM module.
 *
 * Must be called after {@link init}. Typically you'll use
 * {@link loadHyphenationLangs} instead, which handles fetching.
 *
 * @param lang - ISO 639-1 language code (e.g. `"en"`, `"de"`)
 * @param data - The raw trie binary (contents of `<lang>.bin`)
 */
export function loadHyphenationData(lang: string, data: BinaryData): void {
  if (!_loadFn) {
    throw new Error(
      "knuth-plass-wrap: WASM not initialized. Call init() first.",
    );
  }
  _loadFn(lang, toUint8Array(data));
}

/**
 * Check if hyphenation data has been loaded for a language.
 *
 * @param lang - ISO 639-1 language code
 */
export function hasHyphenationData(lang: string): boolean {
  if (!_hasFn) return false;
  return _hasFn(lang);
}

const _fetchCache = new Map<string, Promise<void>>();
const DEFAULT_HYPHENATION_BASE_URL = "../../wasm/pkg/hyphenation/";

/**
 * Fetch and load hyphenation trie data for one or more languages.
 *
 * Each language's trie is fetched from `${baseUrl}/${lang}.bin` and
 * loaded into the WASM module. Fetches are deduplicated — calling
 * this multiple times for the same language is safe and cheap.
 *
 * @param langs - Array of ISO 639-1 language codes
 * @param options.baseUrl - Base URL for `.bin` files. Defaults to
 *   the `hyphenation/` subdirectory next to the WASM module.
 *
 * @example
 * ```ts
 * await init();
 * await loadHyphenationLangs(["en", "de"]);
 * // Now layoutParagraph(..., { hyphenate: true, lang: "de" }) works
 * ```
 */
export async function loadHyphenationLangs(
  langs: string[],
  options?: { baseUrl?: string },
): Promise<void> {
  const baseUrl =
    options?.baseUrl ??
    new URL(DEFAULT_HYPHENATION_BASE_URL, import.meta.url).href;

  const promises = langs.map((lang) => {
    if (hasHyphenationData(lang)) return Promise.resolve();

    let p = _fetchCache.get(lang);
    if (!p) {
      const url = `${baseUrl.replace(/\/$/, "")}/${lang}.bin`;
      p = fetch(url)
        .then((r) => {
          if (!r.ok) throw new Error(`Failed to fetch hyphenation data for "${lang}": ${r.status}`);
          return r.arrayBuffer();
        })
        .then((buf) => {
          loadHyphenationData(lang, buf);
        });
      _fetchCache.set(lang, p);
    }
    return p;
  });

  await Promise.all(promises);
}
