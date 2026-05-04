import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SLEEP_BUFFER = new Int32Array(new SharedArrayBuffer(4));

function parseArgs(argv) {
  const options = new Map();
  const flags = new Set();

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg.startsWith("--") && arg.includes("=")) {
      const [key, value] = arg.split(/=(.*)/su, 2);
      options.set(key, value);
      continue;
    }
    if (arg.startsWith("--")) {
      const next = argv[i + 1];
      if (next && !next.startsWith("--")) {
        options.set(arg, next);
        i += 1;
      } else {
        flags.add(arg);
      }
    }
  }

  return { options, flags };
}

function run(command, args, options = {}) {
  const {
    cwd = ROOT_DIR,
    capture = false,
    env = {},
    allowFailure = false,
  } = options;

  const result = spawnSync(command, args, {
    cwd,
    env: {
      ...process.env,
      ...env,
    },
    encoding: "utf8",
    stdio: capture ? "pipe" : "inherit",
  });

  if (result.error) {
    throw result.error;
  }

  if (!allowFailure && result.status !== 0) {
    const details = capture
      ? `\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`
      : "";
    throw new Error(`Command failed: ${command} ${args.join(" ")}${details}`);
  }

  return result;
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function compareSemver(left, right) {
  const parse = (version) => version.split(".").map((part) => Number.parseInt(part, 10) || 0);
  const a = parse(left);
  const b = parse(right);
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    const delta = (a[i] ?? 0) - (b[i] ?? 0);
    if (delta !== 0) return delta;
  }
  return 0;
}

function npmVersion() {
  return run("npm", ["--version"], { capture: true }).stdout.trim();
}

function assertTrustedPublishRuntime() {
  const version = npmVersion();
  if (compareSemver(version, "11.5.1") < 0) {
    throw new Error(
      `Trusted publishing requires npm CLI 11.5.1 or newer; current npm is ${version}.`,
    );
  }
}

function sleep(ms) {
  Atomics.wait(SLEEP_BUFFER, 0, 0, ms);
}

function npmViewJson(spec, field) {
  const result = run("npm", ["view", spec, field, "--json"], {
    capture: true,
    allowFailure: true,
  });

  if (result.status === 0) {
    const text = result.stdout.trim();
    return text.length > 0 ? JSON.parse(text) : null;
  }

  if (/E404|404 Not Found/u.test(result.stderr)) {
    return null;
  }

  throw new Error(
    `Failed to query npm for ${spec} ${field}:\n${result.stderr || result.stdout}`,
  );
}

function assertVersionNotPublished(name, version) {
  const published = npmViewJson(`${name}@${version}`, "version");
  if (published !== null) {
    throw new Error(`Refusing to publish ${name}@${version}; that version already exists on npm.`);
  }
}

function buildPackage() {
  console.log("Building dist/ and WASM output for publish");
  run("pnpm", ["build"]);
}

function packMetadata(directory) {
  const result = run("npm", ["pack", "--dry-run", "--json"], {
    cwd: directory,
    capture: true,
  });
  const parsed = JSON.parse(result.stdout.trim());
  return Array.isArray(parsed) ? parsed[0] : parsed;
}

function packagedFiles(directory) {
  const metadata = packMetadata(directory);
  if (!Array.isArray(metadata.files)) {
    throw new Error(`Could not determine packed files for ${directory}`);
  }
  return new Set(
    metadata.files
      .map((entry) => entry?.path)
      .filter((value) => typeof value === "string"),
  );
}

function assertPackageLayout(manifest) {
  const files = packagedFiles(ROOT_DIR);
  const requiredFiles = [
    "LICENSE",
    "README.md",
    "dist/index.js",
    "dist/index.cjs",
    "dist/pkg-index.d.ts",
    "dist/core.js",
    "dist/core.cjs",
    "dist/core/index.d.ts",
    "dist/react.js",
    "dist/react.cjs",
    "dist/react/index.d.ts",
    "dist/core-node.js",
    "dist/core-node.cjs",
    "dist/core/wasm-node.d.ts",
    "dist/knuth-plass-wrap.umd.js",
    "dist/wasm/kp_break_wasm.js",
    "dist/wasm/kp_break_wasm.d.ts",
    "dist/wasm/kp_break_wasm_bg.wasm",
    "dist/wasm/hyphenation/en.bin",
    "dist/wasm/hyphenation/de.bin",
  ];

  const missing = requiredFiles.filter((file) => !files.has(file));
  if (missing.length > 0) {
    throw new Error(
      `Package ${manifest.name}@${manifest.version} is missing required published files: `
      + missing.join(", "),
    );
  }

  const hyphenationFiles = [...files].filter((file) =>
    /^dist\/wasm\/hyphenation\/[^/]+\.bin$/u.test(file)
  );
  if (hyphenationFiles.length !== 17) {
    throw new Error(`Expected 17 hyphenation data files in the npm package, found ${hyphenationFiles.length}.`);
  }
}

function verifyDistTag(name, version, distTag) {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const tags = npmViewJson(name, "dist-tags");
    if (tags && tags[distTag] === version) {
      return;
    }
    if (attempt < 11) {
      sleep(5000);
      continue;
    }
    throw new Error(
      `npm dist-tag verification failed for ${name}: expected ${distTag} -> ${version}, got ${JSON.stringify(tags)}`,
    );
  }
}

function publishPackage(distTag, dryRun, provenance) {
  const args = ["publish", "--tag", distTag, "--access", "public", "--ignore-scripts"];
  if (provenance) {
    args.push("--provenance");
  }
  if (dryRun) {
    args.push("--dry-run");
  }
  run("npm", args, { cwd: ROOT_DIR });
}

const { options, flags } = parseArgs(process.argv.slice(2));
const distTag = options.get("--dist-tag") ?? process.env.KP_DIST_TAG ?? "latest";
const dryRun = flags.has("--dry-run") || process.env.KP_DRY_RUN === "1";
const provenance = process.env.GITHUB_ACTIONS === "true";

const manifestPath = join(ROOT_DIR, "package.json");
const manifest = readJson(manifestPath);
if (typeof manifest.name !== "string" || typeof manifest.version !== "string") {
  throw new Error(`Invalid package manifest: ${manifestPath}`);
}

if (!existsSync(join(ROOT_DIR, "pnpm-lock.yaml"))) {
  throw new Error("Missing pnpm-lock.yaml; refusing to publish without a locked dependency graph.");
}

console.log(`Publishing release package for ${manifest.name}@${manifest.version}`);
console.log(`Mode: ${dryRun ? "dry-run" : "publish"}; npm dist-tag: ${distTag}`);

if (provenance) {
  assertTrustedPublishRuntime();
}

assertVersionNotPublished(manifest.name, manifest.version);
buildPackage();
assertPackageLayout(manifest);
publishPackage(distTag, dryRun, provenance);

if (!dryRun) {
  verifyDistTag(manifest.name, manifest.version, distTag);
}

console.log(`${dryRun ? "Dry-run completed" : "Publish completed"} for ${manifest.name}@${manifest.version}.`);
