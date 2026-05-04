# Changelog

## 2.0.0

- Move the package to core-first npm exports with React 19 as an optional peer entry point.
- Add Unicode-aware line breaking with ICU4X/UAX #14 and language metadata for shaping and hyphenation.
- Add reusable WASM font handles and a shaping cache for repeated layout work.
- Return exact line `text` and layout `segments` while keeping compatibility fields.
- Update the vendored HarfRust fork to upstream HarfRust 0.6.0 / HarfBuzz 13.0.0.
- Ship all 17 hyphenation trie files in the npm package and validate them during release.
