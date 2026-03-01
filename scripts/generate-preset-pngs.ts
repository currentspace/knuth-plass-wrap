/**
 * Generate LaTeX gold-standard reference PNGs for the 6 demo presets.
 *
 * For each preset, renders the paragraph with LuaLaTeX using the exact same
 * font file and Knuth-Plass parameters as the app, then converts the PDF
 * to a 2x retina PNG via pdftoppm.
 *
 * Usage: node --import tsx scripts/generate-preset-pngs.ts
 * Requires: lualatex and pdftoppm on PATH
 */
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync, renameSync } from "node:fs";
import { resolve } from "node:path";

const PX_TO_PT = 72.27 / 96;

const TEMPLATE = readFileSync(
  resolve(import.meta.dirname!, "tex/preset-template.tex"),
  "utf-8",
);

const SAMPLES: Record<string, string> = {
  "Knuth on TeX":
    "The problem of breaking a paragraph into lines of approximately equal length has been a subject of study since the earliest days of printing. It is a surprisingly difficult problem to solve well, and the solutions used by most word processing systems are far from optimal. The approach used in TeX is based on a dynamic programming algorithm that considers all possible breakpoints simultaneously, rather than making greedy decisions one line at a time. This yields paragraphs with noticeably more even spacing throughout.",
  "On Typography":
    "Typography is the art and technique of arranging type to make written language legible, readable, and appealing when displayed. The arrangement of type involves selecting typefaces, point sizes, line lengths, line spacing, and letter spacing, and adjusting the space between pairs of letters. Good typography establishes a strong visual hierarchy, provides a graphic balance to the page, and sets the overall tone of the product.",
  "Tricky Words":
    "Some text is particularly challenging because it contains very long words like internationalization or electroencephalography that can wreak havoc on line breaking algorithms, especially when the measure is narrow. Good algorithms handle these gracefully, sometimes accepting a loose early line to avoid catastrophic spacing later on in the paragraph.",
};

interface PresetDef {
  name: string;
  textKey: string;
  fontFile: string;
  lineWidthPx: number;
  weight: number;
  fontSize: number;
  lhMult: number;
}

const PRESETS: PresetDef[] = [
  { name: "Classic Knuth",     textKey: "Knuth on TeX",  fontFile: "Literata[opsz,wght].ttf",                lineWidthPx: 420, weight: 400, fontSize: 18, lhMult: 1.6 },
  { name: "Narrow Sans",       textKey: "On Typography", fontFile: "SourceSans3[wght].ttf",                  lineWidthPx: 240, weight: 400, fontSize: 15, lhMult: 1.5 },
  { name: "Tricky Long Words", textKey: "Tricky Words",  fontFile: "RobotoFlex-VariableFont.ttf",            lineWidthPx: 337, weight: 400, fontSize: 17, lhMult: 1.6 },
  { name: "Heavy Garamond",    textKey: "Knuth on TeX",  fontFile: "EBGaramond[wght].ttf",                   lineWidthPx: 380, weight: 700, fontSize: 19, lhMult: 1.7 },
  { name: "Tight Mono",        textKey: "On Typography", fontFile: "Inconsolata[wdth,wght].ttf",             lineWidthPx: 350, weight: 400, fontSize: 14, lhMult: 1.4 },
  { name: "Wide Light",        textKey: "Tricky Words",  fontFile: "NotoSans[wdth,wght].ttf",                lineWidthPx: 500, weight: 300, fontSize: 20, lhMult: 1.8 },
];

function escapeTeX(s: string): string {
  return s
    .replace(/\\/g, "\\textbackslash{}")
    .replace(/[#$%&_{}~^]/g, (c) => `\\${c}`);
}

function buildRawFeature(weight: number, fontSize: number): string {
  const axes = [`wght=${weight}`, `opsz=${fontSize}`];
  return `RawFeature={mode=harf;+axis={${axes.join(",")}}},`;
}

const FONT_DIR = resolve(import.meta.dirname!, "../public/fonts");
const TMP_DIR = resolve(import.meta.dirname!, "tex/tmp");
const OUT_DIR = resolve(import.meta.dirname!, "../public/presets");

mkdirSync(TMP_DIR, { recursive: true });
mkdirSync(OUT_DIR, { recursive: true });

for (let i = 0; i < PRESETS.length; i++) {
  const p = PRESETS[i];
  const num = i + 1;
  const text = SAMPLES[p.textKey];
  if (!text) {
    console.error(`Unknown text key: ${p.textKey}`);
    continue;
  }

  const sizePt = (p.fontSize * PX_TO_PT).toFixed(4);
  const leadingPt = (p.fontSize * p.lhMult * PX_TO_PT).toFixed(4);
  const widthPt = (p.lineWidthPx * PX_TO_PT).toFixed(4);

  let tex = TEMPLATE;
  tex = tex.replace(/__FONT_PATH_DIR__/g, FONT_DIR);
  tex = tex.replace(/__FONT_FILE__/g, p.fontFile);
  tex = tex.replace(/__RAW_FEATURE__/g, buildRawFeature(p.weight, p.fontSize));
  tex = tex.replace(/__FONT_SIZE__/g, sizePt);
  tex = tex.replace(/__LEADING__/g, leadingPt);
  tex = tex.replace(/__LINE_WIDTH__/g, widthPt);
  tex = tex.replace(/__ADJUSTSPACING__/g,
    "\\adjustspacing=2\n\\expandglyphsinfont\\font 100 100 1");
  tex = tex.replace(/__PARAGRAPH__/g, escapeTeX(text));

  const slug = `preset-${num}`;
  const texFile = resolve(TMP_DIR, `${slug}.tex`);
  writeFileSync(texFile, tex);

  console.log(`[${num}/6] ${p.name}: generating PDF...`);
  try {
    execSync(
      `cd "${TMP_DIR}" && lualatex -interaction=nonstopmode -halt-on-error "${slug}.tex"`,
      { encoding: "utf-8", timeout: 30000, stdio: "pipe" },
    );
  } catch (e: unknown) {
    const err = e as { stdout?: string; stderr?: string };
    const out = (err.stdout ?? "") + (err.stderr ?? "");
    const lines = out.split("\n");
    console.error(`  lualatex failed for preset ${num}:`);
    for (const l of lines.slice(-15)) console.error("    " + l);
    continue;
  }

  const pdfFile = resolve(TMP_DIR, `${slug}.pdf`);
  const pngBase = resolve(TMP_DIR, `${slug}-png`);
  console.log(`[${num}/6] ${p.name}: converting to PNG...`);
  try {
    execSync(
      `pdftoppm -png -r 192 -singlefile "${pdfFile}" "${pngBase}"`,
      { encoding: "utf-8", timeout: 15000, stdio: "pipe" },
    );
    renameSync(`${pngBase}.png`, resolve(OUT_DIR, `${slug}.png`));
    console.log(`  -> public/presets/${slug}.png`);
  } catch (e: unknown) {
    const err = e as { stdout?: string; stderr?: string };
    console.error(`  pdftoppm failed: ${(err.stderr ?? "").trim()}`);
  }
}

console.log("\nDone.");
