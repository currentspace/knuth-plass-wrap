/**
 * Test all 6 presets in Safari and Chromium, checking for overflow and gap issues.
 * Single page load per browser, click through presets sequentially.
 * Usage: node --import tsx scripts/test-all-presets.ts
 */
import { spawn, spawnSync, type ChildProcess } from "child_process";
import { chromium, webkit, type Browser, type Page } from "playwright";

const PRESETS = [
  "Classic Knuth",
  "Narrow Sans",
  "Tricky Long Words",
  "Heavy Garamond",
  "Tight Mono",
  "Wide Light",
];

const DEV_PORT = Number(process.env.KP_TEST_PORT ?? 5178);
const BASE_URL =
  process.env.KP_TEST_BASE_URL ?? `http://127.0.0.1:${DEV_PORT}`;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForServer(url: string, server: ChildProcess): Promise<void> {
  let lastError = "";
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (server.exitCode !== null) {
      throw new Error(`Dev server exited early with code ${server.exitCode}`);
    }

    try {
      const response = await fetch(url);
      if (response.ok) return;
      lastError = `${response.status} ${response.statusText}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }

    await delay(500);
  }

  throw new Error(`Timed out waiting for dev server at ${url}: ${lastError}`);
}

async function startDevServer(): Promise<ChildProcess | null> {
  if (process.env.KP_TEST_BASE_URL) {
    return null;
  }

  const server = spawn(
    "pnpm",
    ["dev", "--host", "127.0.0.1", "--port", String(DEV_PORT), "--strictPort"],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        FORCE_COLOR: "0",
        NO_COLOR: "1",
      },
      stdio: "ignore",
    },
  );
  await waitForServer(BASE_URL, server);
  return server;
}

async function stopDevServer(server: ChildProcess | null): Promise<void> {
  if (!server || server.exitCode !== null) {
    return;
  }

  server.kill("SIGTERM");
  await Promise.race([
    new Promise<void>((resolve) => {
      server.once("exit", () => resolve());
    }),
    delay(2000).then(() => {
      if (server.exitCode === null) {
        server.kill("SIGKILL");
      }
    }),
  ]);
}

function measureScript(presetName: string): string {
  // Self-contained JS that clicks a preset, waits, then measures Harfrust lines.
  // Uses only ES5 for Safari WebDriver compat.
  return `
    var btns = document.querySelectorAll('button');
    for (var i = 0; i < btns.length; i++) {
      if (btns[i].textContent.indexOf('${presetName}') >= 0) {
        btns[i].click(); break;
      }
    }
    return 'clicked';
  `;
}

const COLLECT_SCRIPT = `
  var allDivs = document.querySelectorAll('div');
  var results = [];
  for (var i = 0; i < allDivs.length; i++) {
    var d = allDivs[i];
    var cs = getComputedStyle(d);
    if (cs.whiteSpace !== 'nowrap') continue;
    var el = d;
    var bcr = el.getBoundingClientRect();
    if (bcr.width < 100 || bcr.width > 600 || d.textContent.length < 5) continue;

    var origTA = el.style.textAlign;
    var origTAL = el.style.textAlignLast;
    el.style.textAlign = 'start';
    el.style.textAlignLast = 'auto';
    var range = document.createRange();
    range.selectNodeContents(d);
    var natW = range.getBoundingClientRect().width;
    el.style.textAlign = origTA;
    el.style.textAlignLast = origTAL;

    var range2 = document.createRange();
    range2.selectNodeContents(d);
    var gap = bcr.right - range2.getBoundingClientRect().right;

    results.push({
      text: d.textContent.substring(0, 50),
      natW: Math.round(natW * 100) / 100,
      containerW: Math.round(bcr.width * 100) / 100,
      gap: Math.round(gap * 100) / 100,
      ta: cs.textAlign,
      last: cs.textAlign === 'start'
    });
  }
  return JSON.stringify(results);
`;

interface LineResult {
  text: string;
  natW: number;
  containerW: number;
  gap: number;
  ta: string;
  last: boolean;
}

function reportPreset(engine: string, preset: string, lines: LineResult[]) {
  // Only look at lines that are in the Harfrust card (second half of results).
  // The page shows two cards side-by-side; take the second half.
  const half = Math.ceil(lines.length / 2);
  const hfLines = lines.slice(half);

  const overflows = hfLines.filter(
    (l) => !l.last && l.natW > l.containerW + 2,
  );
  const gaps = hfLines.filter(
    (l) => !l.last && l.ta === "justify" && l.gap > 1,
  );
  const ok = overflows.length === 0 && gaps.length === 0;

  console.log(`  ${ok ? "✓" : "✗"} ${engine} ${preset} (${hfLines.length} lines)`);
  for (const l of overflows) {
    console.log(
      `    OVERFLOW +${(l.natW - l.containerW).toFixed(1)}px: "${l.text}"`,
    );
  }
  for (const l of gaps) {
    console.log(`    GAP ${l.gap.toFixed(1)}px: "${l.text}"`);
  }
  if (!ok) {
    for (const l of hfLines) {
      const over = l.natW - l.containerW;
      const flag =
        !l.last && over > 2 ? " <<<" : !l.last && l.gap > 1 ? " !!!" : "";
      console.log(
        `      natW=${l.natW} cW=${l.containerW} gap=${l.gap} ta=${l.ta}${flag} "${l.text}"`,
      );
    }
  }
}

// ── Playwright (Chromium + WebKit) ──

async function testPlaywright(
  engine: string,
  launchFn: () => Promise<Browser>,
) {
  const browser = await launchFn();
  const page: Page = await browser.newPage({
    viewport: { width: 1200, height: 1200 },
  });

  console.log(`\n── ${engine} ──`);

  await page.goto(BASE_URL, { waitUntil: "networkidle" });
  await page
    .getByText("Loading font & engine...")
    .waitFor({ state: "hidden", timeout: 15_000 })
    .catch(() => {});
  await page.waitForSelector('button:has-text("Classic Knuth")', {
    timeout: 15_000,
  });

  for (const preset of PRESETS) {
    await page.click(`button:has-text("${preset}")`);
    await page.waitForTimeout(1500);

    const raw = (await page.evaluate(() => {
      const allDivs = document.querySelectorAll("div");
      const results: unknown[] = [];
      for (const d of allDivs) {
        const cs = getComputedStyle(d);
        if (cs.whiteSpace !== "nowrap") continue;
        const el = d as HTMLElement;
        const bcr = el.getBoundingClientRect();
        if (bcr.width < 100 || bcr.width > 600) continue;
        if ((d.textContent?.length ?? 0) < 5) continue;

        const origTA = el.style.textAlign;
        const origTAL = el.style.textAlignLast;
        el.style.textAlign = "start";
        el.style.textAlignLast = "auto";
        const range = document.createRange();
        range.selectNodeContents(d);
        const natW = range.getBoundingClientRect().width;
        el.style.textAlign = origTA;
        el.style.textAlignLast = origTAL;

        const range2 = document.createRange();
        range2.selectNodeContents(d);
        const gap = bcr.right - range2.getBoundingClientRect().right;

        results.push({
          text: (d.textContent ?? "").substring(0, 50),
          natW: Math.round(natW * 100) / 100,
          containerW: Math.round(bcr.width * 100) / 100,
          gap: Math.round(gap * 100) / 100,
          ta: cs.textAlign,
          last: cs.textAlign === "start",
        });
      }
      return results;
    })) as LineResult[];

    reportPreset(engine, preset, raw);
  }

  await browser.close();
}

function isBrowserInstallError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /Executable doesn't exist|Please run.*playwright install|browserType\.launch/u.test(
    message,
  );
}

async function testPlaywrightIfAvailable(
  engine: string,
  launchFn: () => Promise<Browser>,
): Promise<void> {
  try {
    await testPlaywright(engine, launchFn);
  } catch (error) {
    if (!isBrowserInstallError(error)) {
      throw error;
    }
    const message = error instanceof Error ? error.message.split("\n")[0] : String(error);
    console.log(`\n── ${engine} ──`);
    console.log(`  skipped: ${message}`);
  }
}

// ── Safari via safaridriver ──

async function testSafari() {
  if (process.env.KP_TEST_SAFARI === "0") {
    console.log("\n── Safari native ──");
    console.log("  skipped: KP_TEST_SAFARI=0");
    return;
  }
  if (process.platform !== "darwin") {
    console.log("\n── Safari native ──");
    console.log("  skipped: native Safari is only available on macOS");
    return;
  }
  if (spawnSync("which", ["safaridriver"]).status !== 0) {
    console.log("\n── Safari native ──");
    console.log("  skipped: safaridriver not found");
    return;
  }

  let driver: ChildProcess | null = null;
  try {
    driver = spawn("safaridriver", ["-p", "9540"], { stdio: "pipe" });
    await new Promise((r) => setTimeout(r, 2000));

    async function wd(method: string, path: string, body?: unknown) {
      const url = "http://localhost:9540" + path;
      const opts: RequestInit = {
        method,
        headers: { "Content-Type": "application/json" },
      };
      if (body) opts.body = JSON.stringify(body);
      const resp = await fetch(url, opts);
      return (await resp.json()) as { value: unknown };
    }

    const session = await wd("POST", "/session", {
      capabilities: { alwaysMatch: { browserName: "safari" } },
    });
    const sid = (session.value as { sessionId?: string })?.sessionId;
    if (!sid) {
      console.error(
        "Safari: no session -",
        (session.value as { message?: string })?.message,
      );
      return;
    }

    await wd("POST", `/session/${sid}/window/rect`, {
      width: 1200,
      height: 1200,
    });

    console.log("\n── Safari 26.4 ──");

    await wd("POST", `/session/${sid}/url`, {
      url: BASE_URL,
    });
    await new Promise((r) => setTimeout(r, 5000));

    for (const preset of PRESETS) {
      await wd("POST", `/session/${sid}/execute/sync`, {
        script: measureScript(preset),
        args: [],
      });
      await new Promise((r) => setTimeout(r, 2000));

      const res = await wd("POST", `/session/${sid}/execute/sync`, {
        script: COLLECT_SCRIPT,
        args: [],
      });

      let lines: LineResult[];
      try {
        lines = JSON.parse(res.value as string);
      } catch {
        console.log(`  ? ${preset}: could not parse result`);
        continue;
      }
      reportPreset("Safari", preset, lines);
    }

    await wd("DELETE", `/session/${sid}`);
  } finally {
    driver?.kill();
  }
}

// ── Run ──

let devServer: ChildProcess | null = null;
try {
  devServer = await startDevServer();
  await testPlaywright("Chromium", () => chromium.launch());
  await testPlaywrightIfAvailable("WebKit (Playwright)", () => webkit.launch());
  await testSafari();
} finally {
  await stopDevServer(devServer);
}

console.log("\nDone.");
