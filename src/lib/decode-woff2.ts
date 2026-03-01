const WOFF2_MAGIC = 0x774f4632; // "wOF2"

/** Returns `true` if the buffer starts with the WOFF2 magic bytes. */
export function isWoff2(data: ArrayBuffer): boolean {
  if (data.byteLength < 4) return false;
  return new DataView(data).getUint32(0) === WOFF2_MAGIC;
}

/**
 * If the buffer is a WOFF2 font, decompress it to raw TTF/OTF.
 * Otherwise return the buffer unchanged.
 *
 * The `wawoff2` dependency is loaded lazily on first WOFF2 encounter
 * so non-WOFF2 users pay no cost.
 */
export async function ensureRawFont(
  data: ArrayBuffer,
): Promise<ArrayBuffer> {
  if (!isWoff2(data)) return data;
  const { decompress } = await import("wawoff2");
  const result = await decompress(new Uint8Array(data));
  return result.buffer as ArrayBuffer;
}
