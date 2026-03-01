import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";
import { copyFileSync, mkdirSync } from "fs";

const HYPHENATION_LANGS = [
  "en", "fr", "de", "es", "it", "pt", "nl", "sv", "no",
  "da", "fi", "pl", "cs", "hu", "ru", "el", "tr",
];

function copyWasmPlugin(): Plugin {
  return {
    name: "copy-wasm-assets",
    closeBundle() {
      const distWasm = resolve(__dirname, "dist/wasm");
      try {
        mkdirSync(distWasm, { recursive: true });
        copyFileSync(
          resolve(__dirname, "wasm/pkg/kp_break_wasm.js"),
          resolve(distWasm, "kp_break_wasm.js"),
        );
        copyFileSync(
          resolve(__dirname, "wasm/pkg/kp_break_wasm_bg.wasm"),
          resolve(distWasm, "kp_break_wasm_bg.wasm"),
        );
        copyFileSync(
          resolve(__dirname, "wasm/pkg/kp_break_wasm.d.ts"),
          resolve(distWasm, "kp_break_wasm.d.ts"),
        );

        // Copy hyphenation trie binaries
        const hyphenDir = resolve(distWasm, "hyphenation");
        mkdirSync(hyphenDir, { recursive: true });
        for (const lang of HYPHENATION_LANGS) {
          copyFileSync(
            resolve(__dirname, `crates/hypher-dynamic/tries/${lang}.bin`),
            resolve(hyphenDir, `${lang}.bin`),
          );
        }
      } catch (e) {
        console.warn("Warning: could not copy WASM assets to dist/wasm/", e);
      }
    },
  };
}

function rewriteWasmImportPlugin(): Plugin {
  return {
    name: "rewrite-wasm-import",
    renderChunk(code) {
      return code.replace(
        /["'][./]*wasm\/pkg\/kp_break_wasm\.js["']/g,
        '"./wasm/kp_break_wasm.js"',
      );
    },
  };
}

export default defineConfig(({ mode }) => {
  if (mode === "demo") {
    return { plugins: [react()] };
  }

  if (mode === "umd") {
    return {
      plugins: [rewriteWasmImportPlugin()],
      publicDir: false,
      build: {
        lib: {
          entry: resolve(__dirname, "src/core/index.ts"),
          name: "KnuthPlassWrap",
          formats: ["umd"],
          fileName: () => "knuth-plass-wrap.umd.js",
        },
        outDir: "dist",
        emptyOutDir: false,
        rollupOptions: {
          external: [/wasm\/pkg\/kp_break_wasm/, "wawoff2"],
          output: {
            globals: {
              "./wasm/kp_break_wasm.js": "KPBreakWasm",
              wawoff2: "wawoff2",
            },
          },
        },
      },
    };
  }

  return {
    plugins: [react(), copyWasmPlugin(), rewriteWasmImportPlugin()],
    publicDir: mode === "development" ? "public" : false,
    build: {
      lib: {
        entry: {
          index: resolve(__dirname, "src/pkg-index.ts"),
          core: resolve(__dirname, "src/core/index.ts"),
          "core-node": resolve(__dirname, "src/core/wasm-node.ts"),
          react: resolve(__dirname, "src/react/index.ts"),
        },
        formats: ["es", "cjs"],
      },
      rollupOptions: {
        external: [
          "react",
          "react-dom",
          "react/jsx-runtime",
          "wawoff2",
          /^node:/,
          /wasm\/pkg\/kp_break_wasm/,
        ],
        output: {
          globals: {
            react: "React",
            "react-dom": "ReactDOM",
            "react/jsx-runtime": "jsxRuntime",
          },
        },
      },
    },
  };
});
