/**
 * Test all 6 presets in Safari and Chromium, checking for overflow and gap issues.
 * Single page load per browser, click through presets sequentially.
 * Usage: node --import tsx scripts/test-all-presets.ts
 */
import { spawn, type ChildProcess } from "child_process";
import { chromium, webkit, type Page } from "playwright";

const PRESETS = [
  "Classic Knuth",
  "Narrow Sans",
  "Tricky Long Words",
  "Heavy Garamond",
  "Tight Mono",
  "Wide Light",
];

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

  console.log(`  ${ok ? "✓" : "✗"} ${preset} (${hfLines.length} lines)`);
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
  launchFn: () => ReturnType<typeof chromium.launch>,
) {
  const browser = await launchFn();
  const page: Page = await browser.newPage({
    viewport: { width: 1200, height: 1200 },
  });

  console.log(`\n── ${engine} ──`);

  await page.goto("http://localhost:5173", { waitUntil: "networkidle" });
  await page.waitForTimeout(3000);

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

// ── Safari via safaridriver ──

async function testSafari() {
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
      url: "http://localhost:5173",
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

await testPlaywright("Chromium", () => chromium.launch());
await testPlaywright("WebKit (Playwright)", () => webkit.launch());
await testSafari();

console.log("\nDone.");
