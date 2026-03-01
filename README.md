# knuth-plass-wrap

TeX-quality Knuth-Plass line breaking for the web, powered by HarfBuzz WASM.

Produces optimally justified paragraphs by considering the entire text at once — the same algorithm TeX has used since 1981 — instead of the greedy line-at-a-time approach browsers use. Word measurement runs through HarfBuzz (via the [harfrust](https://github.com/nickkadutskyi/harfrust) Rust port) compiled to WebAssembly, so glyph widths match the browser's rendering with sub-pixel accuracy.

## Features

- **Optimal line breaking** — Knuth-Plass dynamic programming minimises total paragraph demerits
- **HarfBuzz-accurate measurement** — glyph shaping in WASM matches browser rendering
- **Hyphenation** — automatic hyphenation (17 languages) via the `hypher` crate
- **Hz justification** — micro-adjusts the font's `wdth` axis per-line for tighter composition
- **Variable font support** — `wght`, `opsz`, `ital`/`slnt`, `wdth` axes
- **React 19** — `use()` + Suspense for zero-effect async loading
- **Headless hook** — `useKnuthPlassWrap` returns lines for custom rendering
- **Vanilla JS** — `init()` + `layoutParagraph()` works without React
- **Tree-shakeable** — separate `knuth-plass-wrap/core` and `knuth-plass-wrap/react` entry points
- **Small** — ~80 KB WASM binary (gzipped)

## Installation

```bash
npm install knuth-plass-wrap
# or
pnpm add knuth-plass-wrap
```

## Quick Start

### React Component

```tsx
import { Suspense } from "react";
import { KnuthPlassWrap } from "knuth-plass-wrap/react";

function Article() {
  return (
    <Suspense fallback={<p>Loading…</p>}>
      <KnuthPlassWrap
        text="The problem of breaking a paragraph into lines of approximately equal length has been important since the invention of movable type."
        fontUrl="/fonts/Literata[opsz,wght].ttf"
        fontSize={17}
        lineWidth={400}
      />
    </Suspense>
  );
}
```

The component suspends while the WASM module and font binary load, then renders justified lines as plain `<div>` elements with `text-align: justify`.

### Headless Hook

Use `useKnuthPlassWrap` when you need custom rendering (canvas, SVG, etc.):

```tsx
import { useKnuthPlassWrap } from "knuth-plass-wrap/react";

function CustomRenderer({ fontData }: { fontData: ArrayBuffer }) {
  const { lines } = useKnuthPlassWrap({
    text: "Your paragraph text here…",
    fontData,
    fontSize: 16,
    lineWidth: 500,
  });

  return (
    <div>
      {lines.map((line, i) => (
        <div key={i}>{line.words.join(" ")}</div>
      ))}
    </div>
  );
}
```

### Vanilla JS (No React)

```ts
import { init, layoutParagraph } from "knuth-plass-wrap/core";

await init();

const fontData = await fetch("/fonts/Inter[opsz,wght].ttf").then(r => r.arrayBuffer());
const lines = layoutParagraph(fontData, {
  text: "Your paragraph text…",
  fontSize: 16,
  lineWidth: 400,
});

for (const line of lines) {
  console.log(line.words.join(" "));
}
```

## API Reference

### `init(input?): Promise<void>`

Initialise the WASM module. Must be called before `layoutParagraph` or `measureWord`. The component and hook call this automatically.

```ts
// Default — loads .wasm from the package directory
await init();

// Custom URL (self-hosted, CDN, etc.)
await init("https://cdn.example.com/kp_break_wasm_bg.wasm");

// Fetch response
await init(fetch("/my-path/kp_break_wasm_bg.wasm"));
```

### `layoutParagraph(fontData, options): Line[] | HzLine[]`

Lay out a paragraph. The entire pipeline — measurement, tokenisation, hyphenation, optimal breaking, and line construction — runs in a single WASM call.

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `text` | `string` | required | Paragraph text |
| `fontSize` | `number` | required | Font size in CSS px |
| `lineWidth` | `number` | required | Target line width in CSS px |
| `fontWeight` | `number` | `400` | Font weight (variable font axis) |
| `liga` | `boolean` | `true` | Standard ligatures |
| `opsz` | `number` | `fontSize` | Optical sizing axis value (0 = disabled) |
| `ital` | `number` | `0` | Italic/slant axis (e.g. 12 for 12° slant) |
| `hyphenate` | `boolean` | `false` | Automatic English hyphenation |
| `similarityDemerits` | `number` | `2000` | Penalty for adjacent lines with different tightness (0 = disabled) |
| `hz` | `{ min, max }` | — | Hz justification `wdth` axis range |

### `measureWord(fontData, fontSize, word, ...): number`

Measure the advance width of a single word using HarfBuzz shaping. Useful for debugging or building custom layout logic.

### `KnuthPlassWrap` (React Component)

Must be wrapped in a `<Suspense>` boundary.

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `text` | `string` | required | Paragraph text |
| `fontSize` | `number` | required | Font size in CSS px |
| `lineWidth` | `number` | required | Target line width in CSS px |
| `fontData` | `ArrayBuffer` | — | Raw TTF/OTF font binary |
| `fontUrl` | `string` | — | URL to font file (fetched and cached) |
| `fontDataMap` | `Record<number, ArrayBuffer>` | — | Weight-keyed binaries for static font families |
| `fontFamily` | `string` | — | CSS font-family (when managing `@font-face` yourself) |
| `fontWeight` | `number` | `400` | CSS font-weight / variable font axis |
| `fontStyle` | `string` | `"normal"` | CSS font-style |
| `fontStretch` | `string` | `"100%"` | CSS font-stretch |
| `lineHeight` | `number` | `1.6` | Line height multiplier |
| `color` | `string` | `"#2a2623"` | Text colour |
| `liga` | `boolean` | `true` | Standard ligatures |
| `opticalSizing` | `"auto" \| "none" \| number` | `"auto"` | Optical sizing |
| `hyphenate` | `boolean` | `false` | Automatic hyphenation |
| `similarity` | `boolean` | `true` | Similarity demerits |
| `hz` | `{ min, max }` | — | Hz justification `wdth` range |
| `className` | `string` | — | Container CSS class |
| `style` | `CSSProperties` | — | Container inline styles |
| `fallback` | `ReactNode` | — | Content shown while loading |

### `useKnuthPlassWrap(options): { lines, isLoading }`

Headless hook for custom rendering. Same WASM engine, you control the DOM.

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `text` | `string` | required | Paragraph text |
| `fontData` | `ArrayBuffer \| null` | required | Font binary (null while loading) |
| `fontSize` | `number` | required | Font size in CSS px |
| `lineWidth` | `number` | required | Target line width in CSS px |
| `fontWeight` | `number` | `400` | Font weight |
| `liga` | `boolean` | `true` | Ligatures |
| `opsz` | `number` | `fontSize` | Optical sizing (0 = disabled) |
| `hyphenate` | `boolean` | `false` | Hyphenation |
| `similarity` | `boolean` | `true` | Similarity demerits |
| `hz` | `{ min, max }` | — | Hz justification range |

### Font Registration Utilities

When you provide `fontData` or `fontUrl` without a `fontFamily`, the component automatically registers the font binary as a scoped `@font-face` so the browser renders with the exact same bytes HarfBuzz shaped.

```ts
import { registerFontBinary, registerFontBinaryMap } from "knuth-plass-wrap/core";

// Single variable font
const { name, ready } = registerFontBinary("MyFont", arrayBuffer);
await ready;

// Static font family (multiple weights)
const { name, ready } = registerFontBinaryMap("MyFont", [
  { binary: regular, weight: 400 },
  { binary: bold, weight: 700 },
]);
await ready;
```

## Line Data

Each line returned by `layoutParagraph` or `useKnuthPlassWrap` has:

```ts
interface Line {
  words: string[];      // Words on this line
  widths: number[];     // Per-word widths in px
  boxW: number;         // Total word width (excluding spaces)
  spaceWidth: number;   // Natural inter-word space width
  last: boolean;        // True for the last line (left-aligned)
}

interface HzLine extends Line {
  wdth: number;         // CSS font-variation-settings 'wdth' value (100 = normal)
}
```

## Hz Justification

When the font supports a `wdth` variation axis, Hz justification micro-adjusts the font width per-line to achieve tighter composition — the same technique used by Adobe InDesign and Hermann Zapf's Hz-program.

```tsx
<KnuthPlassWrap
  text={text}
  fontUrl="/fonts/RobotoFlex-VariableFont.ttf"
  fontSize={16}
  lineWidth={400}
  hz={{ min: 95, max: 105 }}
/>
```

## Browser Support

Requires `WebAssembly`, `FontFace` API, and `fetch`. Works in all modern browsers (Chrome 57+, Firefox 52+, Safari 11+, Edge 79+).

## CDN Usage

```html
<script type="module">
  import { init, layoutParagraph } from "https://esm.sh/knuth-plass-wrap/core";

  await init("https://esm.sh/knuth-plass-wrap/wasm/kp_break_wasm_bg.wasm");

  const fontData = await fetch("/fonts/MyFont.ttf").then(r => r.arrayBuffer());
  const lines = layoutParagraph(fontData, {
    text: "Your text here…",
    fontSize: 16,
    lineWidth: 400,
  });
</script>
```

## Development

```bash
pnpm install
pnpm build:wasm    # Build WASM (requires Rust + wasm-pack)
pnpm dev           # Start Vite dev server
pnpm build         # Build library (WASM + ESM + CJS + types)
pnpm build:demo    # Build demo app
pnpm lint          # Run ESLint
pnpm test          # Run Rust tests
```

## License

MIT
