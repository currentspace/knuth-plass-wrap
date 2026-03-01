import eslint from "@eslint/js";
import { defineConfig } from "eslint/config";

import reactPlugin from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import globals from "globals";
import tseslint from "typescript-eslint";

export default defineConfig(
  // ── Global ignores ───────────────────────────────────────────────────
  {
    ignores: ["dist/**", "node_modules/**", "*.png", "screenshot*.png", "wasm/**"],
  },

  // ── Base: ESLint recommended ─────────────────────────────────────────
  eslint.configs.recommended,

  // ── TypeScript: strict-type-checked + stylistic-type-checked ─────────
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,

  // ── Global language options for all TS/TSX files ─────────────────────
  {
    languageOptions: {
      parserOptions: {
        projectService: {
          allowDefaultProject: ["eslint.config.ts", "vite.config.ts", "playwright.config.ts"],
        },
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },

  // ── React plugin (recommended + jsx-runtime for React 19) ───────────
  {
    files: ["**/*.{tsx,jsx}"],
    ...reactPlugin.configs.flat.recommended,
    ...reactPlugin.configs.flat["jsx-runtime"],
    settings: {
      react: { version: "detect" },
    },
  },

  // ── React Hooks: recommended-latest (all React Compiler rules) ──────
  // Uses the full recommended-latest preset which includes:
  //   Core: rules-of-hooks, exhaustive-deps
  //   Compiler: config, error-boundaries, component-hook-factories,
  //     gating, globals, immutability, preserve-manual-memoization,
  //     purity, refs, set-state-in-effect, set-state-in-render,
  //     static-components, unsupported-syntax, use-memo,
  //     incompatible-library
  {
    files: ["**/*.{ts,tsx,js,jsx}"],
    ...reactHooks.configs.flat["recommended-latest"],
  },

  // ── React Refresh (Vite HMR) ────────────────────────────────────────
  {
    files: ["**/*.{tsx,jsx}"],
    plugins: { "react-refresh": reactRefresh },
    rules: {
      "react-refresh/only-export-components": [
        "warn",
        { allowConstantExport: true },
      ],
    },
  },

  // ── Source files: opinionated rules ──────────────────────────────────
  {
    files: ["src/**/*.{ts,tsx}"],
    languageOptions: {
      globals: globals.browser,
    },
    rules: {
      // ─── No floating promises ────────────────────────────────────
      // Every Promise must be awaited, returned, or explicitly voided.
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": "error",
      "@typescript-eslint/require-await": "error",

      // ─── Ban useEffect / useLayoutEffect ─────────────────────────
      // Use React 19 primitives instead: use(), useEffectEvent(),
      // server actions, RSC, or extract into custom hooks in a
      // dedicated hooks/ directory (which has its own override below).
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "react",
              importNames: ["useEffect", "useLayoutEffect"],
              message:
                "useEffect is banned. Prefer React 19 primitives: use(), useEffectEvent(), server actions, or extract to a custom hook in src/hooks/.",
            },
          ],
        },
      ],

      // Also catch direct calls in case someone destructures elsewhere
      "no-restricted-syntax": [
        "error",
        {
          selector: "CallExpression[callee.name='useEffect']",
          message:
            "useEffect is banned in components. Extract to a custom hook in src/hooks/ or use React 19 primitives.",
        },
        {
          selector: "CallExpression[callee.name='useLayoutEffect']",
          message:
            "useLayoutEffect is banned in components. Extract to a custom hook in src/hooks/ or use React 19 primitives.",
        },
        {
          selector:
            "CallExpression[callee.object.name='React'][callee.property.name='useEffect']",
          message:
            "React.useEffect is banned. Extract to a custom hook in src/hooks/ or use React 19 primitives.",
        },
        {
          selector:
            "CallExpression[callee.object.name='React'][callee.property.name='useLayoutEffect']",
          message:
            "React.useLayoutEffect is banned. Extract to a custom hook in src/hooks/ or use React 19 primitives.",
        },
      ],

      // ─── Strict TypeScript ───────────────────────────────────────
      // No non-null assertions — handle nulls explicitly
      "@typescript-eslint/no-non-null-assertion": "error",

      // No explicit any — type everything
      "@typescript-eslint/no-explicit-any": "error",

      // No unsafe operations on `any`-typed values
      "@typescript-eslint/no-unsafe-assignment": "error",
      "@typescript-eslint/no-unsafe-call": "error",
      "@typescript-eslint/no-unsafe-member-access": "error",
      "@typescript-eslint/no-unsafe-return": "error",
      "@typescript-eslint/no-unsafe-argument": "error",

      // Prefer nullish coalescing over logical OR for nullable values
      "@typescript-eslint/prefer-nullish-coalescing": "error",

      // Flag unnecessary conditions (truthiness checks on non-nullable)
      "@typescript-eslint/no-unnecessary-condition": "error",

      // Enforce consistent type imports
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { prefer: "type-imports", fixStyle: "inline-type-imports" },
      ],

      // Enforce consistent type exports
      "@typescript-eslint/consistent-type-exports": [
        "error",
        { fixMixedExportsWithInlineTypeSpecifier: true },
      ],

      // Require explicit return types on exported functions
      "@typescript-eslint/explicit-module-boundary-types": "error",

      // Switch statements must be exhaustive
      "@typescript-eslint/switch-exhaustiveness-check": "error",

      // No empty functions — be explicit with no-op comments
      "@typescript-eslint/no-empty-function": "error",

      // Template expressions: allow numbers/booleans (practical)
      "@typescript-eslint/restrict-template-expressions": [
        "error",
        { allowNumber: true, allowBoolean: true },
      ],

      // Arrow shorthand returning void (e.g. onClick handlers) is fine
      "@typescript-eslint/no-confusing-void-expression": [
        "error",
        { ignoreArrowShorthand: true },
      ],

      // Unused vars: error, but allow _ prefix convention
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],

      // ─── General strictness ──────────────────────────────────────
      // No console.log in production code
      "no-console": ["error", { allow: ["warn", "error"] }],

      // Prefer const
      "prefer-const": "error",

      // No var
      "no-var": "error",

      // Require === and !==
      eqeqeq: ["error", "always"],

      // No nested ternaries
      "no-nested-ternary": "error",
    },
  },

  // ── Scripts: disable type-checked linting ────────────────────────────
  {
    files: ["scripts/**/*.ts"],
    extends: [tseslint.configs.disableTypeChecked],
    languageOptions: {
      globals: globals.node,
    },
    rules: {
      "no-console": "off",
      "prefer-const": "off",
      "@typescript-eslint/no-unused-vars": "off",
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-non-null-assertion": "off",
      "@typescript-eslint/no-require-imports": "off",
      "@typescript-eslint/array-type": "off",
      "@typescript-eslint/consistent-type-definitions": "off",
      "@typescript-eslint/no-inferrable-types": "off",
      "@typescript-eslint/no-empty-function": "off",
    },
  },

  // ── Tests: disable type-checked linting ─────────────────────────────
  {
    files: ["tests/**/*.ts"],
    extends: [tseslint.configs.disableTypeChecked],
    languageOptions: {
      globals: globals.node,
    },
    rules: {
      "no-console": "off",
      "prefer-const": "off",
      "@typescript-eslint/no-unused-vars": "off",
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-non-null-assertion": "off",
      "@typescript-eslint/array-type": "off",
      "@typescript-eslint/consistent-type-definitions": "off",
      "@typescript-eslint/no-inferrable-types": "off",
      "@typescript-eslint/no-empty-function": "off",
    },
  },

  // ── Config files: node globals, lenient ──────────────────────────────
  {
    files: ["*.config.ts", "*.config.js", "*.config.mjs"],
    languageOptions: {
      globals: globals.node,
    },
    rules: {
      "@typescript-eslint/no-deprecated": "off",
    },
  },
);
