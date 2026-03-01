# Knuth-Plass Wrap — Dev Guide

React + TypeScript library for Knuth-Plass optimal word wrapping, powered by HarfBuzz WASM.

## Dev workflow

- `pnpm dev` — start Vite dev server on http://localhost:5173
- `pnpm build` — build library (WASM + ESM + CJS + type declarations) to `dist/`
- `pnpm build:demo` — build the demo app
- `pnpm screenshot` — capture a screenshot of the running app to `screenshot.png`
- `pnpm lint` — run ESLint
- `pnpm test` — run Rust tests (`cd wasm && cargo test`)

## Viewing rendered output

After any visual change, take a screenshot to verify:

1. Make sure dev server is running (`pnpm dev` in background)
2. Run `pnpm screenshot`
3. View `screenshot.png` with the Read tool

## Project structure

```
src/
  core/          — Published package: core API (no React dependency)
    types.ts       — Line, HzLine, LayoutOptions, InitInput
    constants.ts   — INF, LINE_PENALTY, SIMILAR_DEM, etc.
    wasm.ts        — init(), layoutParagraph(), measureWord()
    index.ts       — barrel export
  react/         — Published package: React components
    KnuthPlassWrap.tsx  — main component (Suspense-based)
    useKnuthPlassWrap.ts — headless hook
    index.ts       — barrel export
  lib/           — Internal utilities (not published)
    types.ts       — Font, Item, WdthRange, etc.
    constants.ts   — shared constants
    resolve-font-binary.ts — registerFontBinary(), registerFontBinaryMap()
  cards/         — Demo card components (not published)
    Card.tsx, JustifiedLines.tsx, CSSPrettyCard.tsx, CSSJustifyCard.tsx, KPHarfrustCard.tsx
    index.ts       — barrel export
  hooks/         — React hooks (not published)
    useContainerWidth.ts, useFontHzLabels.ts, usePersistPrefs.ts
  demo/          — Demo app (not published)
    App.tsx, FontPicker.tsx, fonts.ts, samples.ts, presets.ts, ui.tsx
  pkg-index.ts   — Package root entry (re-exports core/ + react/)
  main.tsx       — Demo entry point (Vite dev server)
wasm/
  src/lib.rs     — Rust: HarfBuzz measurement + Knuth-Plass DP + line building
  Cargo.toml     — crate config (harfrust, hypher, wasm-bindgen)
  build.rs       — build ID (git hash + timestamp)
```

## Architecture

The library has two layers:

1. **WASM layer** (`wasm/src/lib.rs`) — Single Rust file compiled to WebAssembly.
   Contains the entire pipeline: HarfBuzz text shaping via harfrust, Knuth-Plass
   dynamic programming, hyphenation via hypher, Hz justification, and line building.
   Exports `layout_paragraph()` (unified pipeline) and `measure_word_width()`.

2. **TypeScript layer** (`src/core/` + `src/react/`) — Published API surface.
   `core/wasm.ts` loads and calls the WASM module. `react/KnuthPlassWrap.tsx`
   provides a Suspense-based React component. `react/useKnuthPlassWrap.ts`
   provides a headless hook for custom rendering.

The demo app (`src/demo/`, `src/cards/`) is internal and not part of the published package.

## Published exports

```
knuth-plass-wrap         — re-exports core + react
knuth-plass-wrap/core    — init, layoutParagraph, measureWord, types, constants
knuth-plass-wrap/react   — KnuthPlassWrap, useKnuthPlassWrap
knuth-plass-wrap/wasm/*  — WASM binary and JS glue
```

## Lint policy

There are no pre-existing lint issues in this codebase. All lint errors must be treated as regressions introduced by the current change and fixed immediately.

## ESLint rules

- **No `useEffect`**. The codebase targets React 19. Use `use()` with Suspense for async
  data (WASM init, font loading). Use callback refs for one-shot DOM measurement. Extract
  reusable logic into custom hooks in `src/hooks/` if needed, but even there prefer
  non-effect patterns.
- **No ESLint suppressions**. Fix the root cause instead.

## Debugging philosophy: fix the WASM, not the DOM

The WASM layer (Harfrust + Knuth-Plass) is the single source of truth for line breaking.
It measures words, computes optimal breakpoints, and assigns words to lines. The React/DOM
layer's only job is to render those decisions faithfully.

**If a line overflows or looks wrong, the bug is almost certainly in the WASM layer.**
The correct response is to investigate why Harfrust's measurements diverge from the
browser's — wrong font weight, missing variation axis, stale binary, etc. — and fix it
there. Past bugs have all traced back to WASM issues: wrong `wght` axis application,
missing `opsz` passthrough, stale `wasm/pkg/` binaries.

**Do not add DOM hacks to compensate for WASM measurement errors.** Specifically:
- Do not add `useLayoutEffect` / `useEffect` to re-measure and patch styles after render.
- Do not compute word-spacing corrections from DOM measurements to force lines to fit.
- Do not add `overflow: hidden` to silently clip overfull lines.

The DOM rendering layer should be simple and declarative:
- Underfull lines: `text-align: justify` stretches spaces to fill the measure.
- Overfull lines (rare, <1px): negative `word-spacing` from the callback ref compresses
  the single gap. This is a thin safety net for sub-pixel rounding, not a layout engine.
- Last lines: `text-align: start`, no justification.

If lines are overfull by more than ~1px, that means the WASM layer was too optimistic
about how much text fits on a line. Go fix the measurement there. Do not try to shrink
the DOM to match — it will create cross-browser inconsistencies and hide real bugs.
