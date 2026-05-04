/**
 * Smoke test: verify that the core layout pipeline works in Node.js (no browser).
 *
 * Run: node --import tsx scripts/test-ssr.ts
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

async function main() {
  // Dynamic import so wasm-node can resolve import.meta.url correctly
  const { initNode } = await import("../src/core/wasm-node.js");
  const { layoutParagraph } = await import("../src/core/wasm.js");

  const wasmPath = resolve(__dirname, "../wasm/pkg/kp_break_wasm_bg.wasm");

  // Init with hyphenation data for en + de
  await initNode(wasmPath, {
    hyphenationLangs: ["en", "de"],
    hyphenationDir: resolve(__dirname, "../crates/hypher-dynamic/tries"),
  });

  const fontPath = resolve(__dirname, "../wasm/tests/fixtures/DMMono-Regular.ttf");
  const fontData = readFileSync(fontPath);

  const lines = layoutParagraph(fontData, {
    text: "The problem of breaking a paragraph into lines of approximately equal length has been important since the invention of movable type.",
    fontSize: 16,
    lineWidth: 300,
  });

  console.log(`SSR test: ${lines.length} lines produced`);
  for (const line of lines) {
    console.log(`  [${line.last ? "last" : "    "}] ${line.text}`);
  }

  if (lines.length < 2) {
    console.error("FAIL: Expected multiple lines");
    process.exit(1);
  }
  if (!lines[lines.length - 1].last) {
    console.error("FAIL: Last line should have last=true");
    process.exit(1);
  }

  // Test with hyphenation + language
  const deLines = layoutParagraph(fontData, {
    text: "Donaudampfschifffahrtsgesellschaftskapitän fährt über den Fluss mit Geschwindigkeit.",
    fontSize: 16,
    lineWidth: 200,
    hyphenate: true,
    lang: "de",
  });

  console.log(`\nGerman hyphenation test: ${deLines.length} lines`);
  for (const line of deLines) {
    console.log(`  [${line.last ? "last" : "    "}] ${line.text}`);
  }

  if (deLines.length < 2) {
    console.error("FAIL: Expected multiple lines for German text");
    process.exit(1);
  }

  // Test English hyphenation
  const enLines = layoutParagraph(fontData, {
    text: "Extraordinary accomplishments require extraordinary dedication and perseverance throughout difficulties.",
    fontSize: 16,
    lineWidth: 200,
    hyphenate: true,
    lang: "en",
  });

  console.log(`\nEnglish hyphenation test: ${enLines.length} lines`);
  for (const line of enLines) {
    console.log(`  [${line.last ? "last" : "    "}] ${line.text}`);
  }

  if (enLines.length < 2) {
    console.error("FAIL: Expected multiple lines for English hyphenated text");
    process.exit(1);
  }

  // Test graceful degradation: layout without hyphenation data for a language
  const frLines = layoutParagraph(fontData, {
    text: "Bonjour le monde extraordinaire",
    fontSize: 16,
    lineWidth: 200,
    hyphenate: true,
    lang: "fr", // Not loaded, should degrade gracefully
  });

  console.log(`\nFrench (no trie data) test: ${frLines.length} lines`);
  for (const line of frLines) {
    console.log(`  [${line.last ? "last" : "    "}] ${line.text}`);
  }

  // Should still produce valid output (just without hyphenation)
  if (frLines.length < 1) {
    console.error("FAIL: Expected at least one line even without hyphenation data");
    process.exit(1);
  }

  console.log("\nAll SSR tests passed!");
}

main().catch((err) => {
  console.error("SSR test failed:", err);
  process.exit(1);
});
