/**
 * Registers a font binary (ArrayBuffer) under a scoped @font-face name so the
 * browser renders text with the exact same bytes that HarfBuzz/harfrust shapes.
 *
 * The scoped name avoids conflicts with any other @font-face entries the page
 * may have for the same family (e.g. subsetted Google Fonts WOFF2 files).
 */

const _isBrowser =
  typeof document !== "undefined" && typeof FontFace !== "undefined";

let _counter = 0;
const _cache = new Map<ArrayBuffer, { name: string; ready: Promise<void> }>();

/**
 * Register a font binary as an @font-face with a unique scoped family name.
 *
 * The same ArrayBuffer identity always returns the same scoped name.
 * The returned `ready` promise resolves once the FontFace is loaded and added
 * to `document.fonts`. Await it before measuring text with this font.
 *
 * @param family - Human-readable family name (used to build the scoped name)
 * @param binary - Full (non-subsetted) font file bytes (TTF/OTF/WOFF2)
 * @returns `{ name, ready }` — scoped family name and load promise
 */
export function registerFontBinary(
  family: string,
  binary: ArrayBuffer,
): { name: string; ready: Promise<void> } {
  if (!_isBrowser) {
    return { name: family, ready: Promise.resolve() };
  }

  const cached = _cache.get(binary);
  if (cached) return cached;

  const bare = family.split(",")[0].trim().replace(/"/g, "");
  const id = ++_counter;
  const scopedName = `__kp_${bare}_${id}`;

  const face = new FontFace(scopedName, binary, {
    weight: "1 1000",
    stretch: "25% 200%",
  });
  const ready = face.load().then(
    (loaded) => { document.fonts.add(loaded); },
    () => { /* consumer's binary failed to parse -- fallback fonts will apply */ },
  );

  const entry = { name: scopedName, ready };
  _cache.set(binary, entry);
  return entry;
}

/**
 * Register multiple font binaries (one per weight) under a single scoped
 * @font-face family name. Used for static font families that ship separate
 * files per weight (e.g. `Roboto-Regular.woff2`, `Roboto-Bold.woff2`).
 *
 * Each entry becomes a separate FontFace with a narrow weight descriptor so
 * the browser selects the correct face for the CSS `font-weight`.
 *
 * @param family  - Human-readable family name
 * @param entries - Array of `{ binary, weight }` pairs
 * @returns `{ name, ready }` — scoped family name and a promise that resolves
 *          when all FontFaces are loaded
 */
export function registerFontBinaryMap(
  family: string,
  entries: { binary: ArrayBuffer; weight: number }[],
): { name: string; ready: Promise<void> } {
  if (!_isBrowser) {
    return { name: family, ready: Promise.resolve() };
  }

  const bare = family.split(",")[0].trim().replace(/"/g, "");
  const id = ++_counter;
  const scopedName = `__kp_${bare}_${id}`;

  const facePromises = entries.map(({ binary, weight }) => {
    const face = new FontFace(scopedName, binary, {
      weight: String(weight),
      stretch: "25% 200%",
    });
    return face.load().then(
      (loaded) => { document.fonts.add(loaded); },
      () => { /* individual weight failed to parse -- skip it */ },
    );
  });

  const ready = Promise.all(facePromises).then(() => undefined);

  return { name: scopedName, ready };
}
