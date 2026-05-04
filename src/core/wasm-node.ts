import { init } from "./wasm";
import { loadHyphenationData } from "./hyphenation";

/**
 * Initialize the WASM module for Node.js / SSR environments.
 *
 * Reads the `.wasm` binary from the filesystem and passes it
 * directly to the WASM loader, bypassing `fetch` and `import.meta.url`.
 *
 * Optionally loads hyphenation data for the specified languages
 * from `.bin` files on disk.
 *
 * @param wasmPath - Path to `kp_break_wasm_bg.wasm`.
 *   Defaults to the copy shipped in the package's `dist/wasm/` directory.
 * @param options.hyphenationLangs - ISO 639-1 codes to load (e.g. `["en", "de"]`)
 * @param options.hyphenationDir - Directory containing `<lang>.bin` files.
 *   Defaults to the `hyphenation/` subdirectory next to the WASM binary.
 *
 * @example
 * ```ts
 * import { initNode } from "knuth-plass-wrap/node";
 * import { layoutParagraph } from "knuth-plass-wrap/core";
 * import { readFileSync } from "node:fs";
 *
 * await initNode(undefined, { hyphenationLangs: ["en", "de"] });
 * const font = readFileSync("./fonts/Inter.ttf");
 * const lines = layoutParagraph(font, {
 *   text: "Hello world",
 *   fontSize: 16,
 *   lineWidth: 400,
 *   hyphenate: true,
 *   lang: "en",
 * });
 * ```
 */
export async function initNode(
  wasmPath?: string,
  options?: { hyphenationLangs?: string[]; hyphenationDir?: string },
): Promise<void> {
  const { readFileSync } = await import("node:fs");
  const { resolve, dirname } = await import("node:path");
  const { fileURLToPath } = await import("node:url");

  const defaultPath = resolve(
    dirname(fileURLToPath(import.meta.url)),
    "../wasm/kp_break_wasm_bg.wasm",
  );
  const binary = readFileSync(wasmPath ?? defaultPath);
  await init(binary);

  if (options?.hyphenationLangs?.length) {
    const hyphenDir =
      options.hyphenationDir ??
      resolve(dirname(wasmPath ?? defaultPath), "hyphenation");

    for (const lang of options.hyphenationLangs) {
      const triePath = resolve(hyphenDir, `${lang}.bin`);
      const trieData = readFileSync(triePath);
      loadHyphenationData(lang, trieData);
    }
  }
}
