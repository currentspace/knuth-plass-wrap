import { chromium } from "playwright";
import { readFileSync } from "fs";
import { resolve } from "path";

const wasmBytes = readFileSync(
  resolve(import.meta.dirname!, "../wasm/pkg/kp_break_wasm_bg.wasm"),
);
const wasmB64 = wasmBytes.toString("base64");

const wasmGlueJs = readFileSync(
  resolve(import.meta.dirname!, "../wasm/pkg/kp_break_wasm.js"),
  "utf-8",
);

// The wasm-bindgen glue uses `import.meta.url` which won't work in addScriptTag.
// We strip the default export and init logic, keeping only the helpers + initSync.
// Then we initialise from a base64-encoded buffer.
const glueForBrowser = wasmGlueJs
  .replace(/\/\* @ts-self-types.*?\*\/\n?/, "")
  .replace(/export function kp_break_pass/, "function kp_break_pass")
  .replace(/export \{ initSync.*\};\n?/, "")
  .replace(/async function __wbg_init[\s\S]*$/, "");

const BENCH_JS = `
${glueForBrowser}

// Decode base64 WASM and init synchronously
var wasmB64 = "${wasmB64}";
var wasmBin = Uint8Array.from(atob(wasmB64), function(c) { return c.charCodeAt(0); });
initSync(wasmBin);

(function() {
  var text = "The problem of breaking a paragraph into lines of approximately equal length has been a subject of study since the earliest days of printing. It is a surprisingly difficult problem to solve well, and the solutions used by most word processing systems are far from optimal. The approach used in TeX is based on a dynamic programming algorithm that considers all possible breakpoints simultaneously, rather than making greedy decisions one line at a time. This yields paragraphs with noticeably more even spacing throughout.";
  var longText = "";
  for (var k = 0; k < 10; k++) longText += (k ? " " : "") + text;

  var el = document.createElement("span");
  el.style.cssText = "position:absolute;top:-9999px;left:-9999px;white-space:pre;visibility:hidden;pointer-events:none;font:17px sans-serif;font-kerning:normal;";
  document.body.appendChild(el);
  function measure(s) { el.textContent = s; return el.getBoundingClientRect().width; }

  var INF = 1e10, INF_BAD = 10000, LINE_PENALTY = 10, FLAG_DEM = 3000, FIT_DEM = 3000, WIDOW_PENALTY = 50;

  function tokenise(txt) {
    var words = txt.split(/\\s+/).filter(Boolean);
    var sp = measure("\\u00A0");
    var items = [];
    for (var i = 0; i < words.length; i++) {
      items.push({ t: "box", w: measure(words[i]), v: words[i] });
      if (i < words.length - 1) {
        if (i === words.length - 2) items.push({ t: "pen", w: 0, p: WIDOW_PENALTY });
        items.push({ t: "glue", w: sp, y: sp * 0.5, z: sp * 0.33 });
      }
    }
    items.push({ t: "glue", w: 0, y: 1e7, z: 0 });
    items.push({ t: "pen", w: 0, p: -INF });
    return { items: items, spaceWidth: sp };
  }

  function jsKpBreakPass(items, L, simDem, eStretch) {
    var N = items.length;
    var cW = new Float64Array(N+1), cY = new Float64Array(N+1), cZ = new Float64Array(N+1);
    var cHY = new Float64Array(N+1), cHZ = new Float64Array(N+1);
    for (var i = 0; i < N; i++) {
      var it = items[i];
      cW[i+1] = cW[i] + (it.t === "box" || it.t === "glue" ? it.w : 0);
      cY[i+1] = cY[i] + (it.t === "glue" ? (it.y || 0) : 0);
      cZ[i+1] = cZ[i] + (it.t === "glue" ? (it.z || 0) : 0);
      cHY[i+1] = cHY[i] + (it.t === "box" ? (it.hy || 0) : 0);
      cHZ[i+1] = cHZ[i] + (it.t === "box" ? (it.hz || 0) : 0);
    }
    function ratio(a, b) {
      var w = cW[b+1] - a.aW, y = cY[b+1] - a.aY, z = cZ[b+1] - a.aZ;
      if (items[b].t === "glue") { w -= items[b].w; y -= (items[b].y || 0); z -= (items[b].z || 0); }
      if (items[b].t === "pen") w += items[b].w;
      var hzY = cHY[b+1] - a.aHY, hzZ = cHZ[b+1] - a.aHZ;
      if (w < L) { var tY = y + hzY + eStretch; return tY > 0 ? (L - w) / tY : INF; }
      if (w > L) { var tZ = z + hzZ; return tZ > 0 ? (L - w) / tZ : -INF; }
      return 0;
    }
    function fc(r) { return r < -0.5 ? 0 : r < 0.5 ? 1 : r < 1 ? 2 : 3; }
    var lastD = null;
    var active = [{pos:-1,line:0,fit:1,aW:0,aY:0,aZ:0,aHY:0,aHZ:0,dem:0,prev:null,flagged:false}];
    for (var b = 0; b < N; b++) {
      var it2 = items[b];
      if (it2.t === "box") continue;
      if (it2.t === "pen" && (it2.p || 0) >= INF) continue;
      if (it2.t === "glue" && (b === 0 || items[b-1].t !== "box")) continue;
      var best4 = [{},{},{},{}], dead = [];
      var isF = !!(it2.t === "pen" && it2.f);
      for (var ai = 0; ai < active.length; ai++) {
        var a = active[ai], r = ratio(a, b);
        if (r < -1 || (it2.t === "pen" && it2.p === -INF)) dead.push(ai);
        if (r < -1 || r > 6) continue;
        var bad = Math.min(INF_BAD, 100 * Math.pow(Math.abs(r), 3));
        var pen = it2.t === "pen" ? (it2.p || 0) : 0;
        var dem;
        if (pen >= 0) dem = Math.pow(LINE_PENALTY + bad + pen, 2);
        else if (pen > -INF) dem = Math.pow(LINE_PENALTY + bad, 2) - pen * pen;
        else dem = Math.pow(LINE_PENALTY + bad, 2);
        var f = fc(r);
        if (Math.abs(f - a.fit) > 1) dem += FIT_DEM;
        if (isF && a.flagged) dem += FLAG_DEM;
        dem += a.dem;
        if (!best4[f].a || best4[f].d === undefined || dem < best4[f].d) best4[f] = {a:a,d:dem,f:f};
      }
      for (var j = dead.length - 1; j >= 0; j--) { lastD = active[dead[j]]; active.splice(dead[j], 1); }
      var nW = cW[b+1], nY = cY[b+1], nZ = cZ[b+1], nHY = cHY[b+1], nHZ = cHZ[b+1];
      for (var bi = 0; bi < best4.length; bi++) {
        if (best4[bi].a) active.push({pos:b,line:best4[bi].a.line+1,fit:best4[bi].f||0,aW:nW,aY:nY,aZ:nZ,aHY:nHY,aHZ:nHZ,dem:best4[bi].d||0,prev:best4[bi].a,flagged:isF});
      }
      if (active.length === 0) { var ln = lastD ? lastD.line + 1 : 1; active.push({pos:b,line:ln,fit:1,aW:nW,aY:nY,aZ:nZ,aHY:nHY,aHZ:nHZ,dem:0,prev:lastD,flagged:false}); }
    }
    var best = active[0];
    for (var ai2 = 0; ai2 < active.length; ai2++) if (active[ai2].dem < best.dem) best = active[ai2];
    var breaks = [];
    for (var n = best; n; n = n.prev) if (n.pos >= 0) breaks.unshift(n.pos);
    return breaks;
  }

  // Convert items to typed arrays for WASM
  function itemsToArrays(items) {
    var n = items.length;
    var types = new Uint8Array(n), w = new Float64Array(n), y = new Float64Array(n);
    var z = new Float64Array(n), p = new Float64Array(n), f = new Uint8Array(n);
    var hy = new Float64Array(n), hz = new Float64Array(n);
    for (var i = 0; i < n; i++) {
      var it = items[i];
      if (it.t === "box") { types[i] = 0; w[i] = it.w; hy[i] = it.hy || 0; hz[i] = it.hz || 0; }
      else if (it.t === "glue") { types[i] = 1; w[i] = it.w; y[i] = it.y || 0; z[i] = it.z || 0; }
      else { types[i] = 2; w[i] = it.w; p[i] = it.p || 0; f[i] = it.f ? 1 : 0; }
    }
    return { types: types, w: w, y: y, z: z, p: p, f: f, hy: hy, hz: hz };
  }

  function wasmKpBreakPass(items, L, simDem, eStretch) {
    var a = itemsToArrays(items);
    return kp_break_pass(a.types, a.w, a.y, a.z, a.p, a.f, a.hy, a.hz, L, simDem, eStretch);
  }

  function bench(name, fn, iters) {
    for (var w = 0; w < 5; w++) fn();
    var t0 = performance.now();
    for (var i = 0; i < iters; i++) fn();
    var elapsed = performance.now() - t0;
    return { name: name, iterations: iters, totalMs: Math.round(elapsed * 100) / 100, perCallUs: Math.round(elapsed / iters * 1000 * 100) / 100 };
  }

  var shortTok = tokenise(text);
  var longTok = tokenise(longText);

  // Pre-allocate typed arrays for WASM (amortise conversion cost)
  var shortArrays = itemsToArrays(shortTok.items);
  var longArrays = itemsToArrays(longTok.items);

  // Verify both produce the same breaks
  var jsBreaks = jsKpBreakPass(shortTok.items, 475, 0, 0);
  var wasmBreaks = Array.from(kp_break_pass(shortArrays.types, shortArrays.w, shortArrays.y, shortArrays.z, shortArrays.p, shortArrays.f, shortArrays.hy, shortArrays.hz, 475, 0, 0));
  var match = JSON.stringify(jsBreaks) === JSON.stringify(wasmBreaks);

  window.__benchResults = {
    match: match,
    jsBreaks: jsBreaks,
    wasmBreaks: wasmBreaks,
    results: [
      bench("tokenise (short)", function() { tokenise(text); }, 1000),
      bench("tokenise (10x)", function() { tokenise(longText); }, 100),
      bench("JS kpBreak (short)", function() { jsKpBreakPass(shortTok.items, 475, 0, 0); }, 5000),
      bench("JS kpBreak (10x)", function() { jsKpBreakPass(longTok.items, 475, 0, 0); }, 500),
      bench("WASM kpBreak (short, w/ conv)", function() { wasmKpBreakPass(shortTok.items, 475, 0, 0); }, 5000),
      bench("WASM kpBreak (10x, w/ conv)", function() { wasmKpBreakPass(longTok.items, 475, 0, 0); }, 500),
      bench("WASM kpBreak (short, pre-conv)", function() { kp_break_pass(shortArrays.types, shortArrays.w, shortArrays.y, shortArrays.z, shortArrays.p, shortArrays.f, shortArrays.hy, shortArrays.hz, 475, 0, 0); }, 5000),
      bench("WASM kpBreak (10x, pre-conv)", function() { kp_break_pass(longArrays.types, longArrays.w, longArrays.y, longArrays.z, longArrays.p, longArrays.f, longArrays.hy, longArrays.hz, 475, 0, 0); }, 500),
      bench("DOM measure (word)", function() { measure("approximately"); }, 10000),
    ],
  };
  el.parentNode.removeChild(el);
})();
`;

async function main(): Promise<void> {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto("about:blank");
  await page.addStyleTag({
    url: "https://fonts.googleapis.com/css2?family=Roboto+Flex:wdth,wght@75..125,400&display=swap",
  });
  await page.waitForTimeout(2000);

  await page.addScriptTag({ content: BENCH_JS });
  await page.waitForTimeout(5000);

  interface BenchResult {
    name: string;
    iterations: number;
    totalMs: number;
    perCallUs: number;
  }

  const data = await page.evaluate(
    () =>
      (window as unknown as {
        __benchResults: {
          match: boolean;
          jsBreaks: number[];
          wasmBreaks: number[];
          results: BenchResult[];
        };
      }).__benchResults,
  );

  console.log("\n=== JS vs WASM BENCHMARK ===\n");
  console.log(
    `Break positions match: ${data.match ? "YES" : "NO !!!"}`,
  );
  if (!data.match) {
    console.log(`  JS:   [${data.jsBreaks.join(", ")}]`);
    console.log(`  WASM: [${data.wasmBreaks.join(", ")}]`);
  }
  console.log();
  console.log(
    "Function                              | Iterations | Total (ms) | Per call (µs)",
  );
  console.log(
    "--------------------------------------|------------|------------|-------------",
  );
  for (const r of data.results) {
    console.log(
      `${r.name.padEnd(38)}| ${String(r.iterations).padStart(10)} | ${String(r.totalMs).padStart(10)} | ${String(r.perCallUs).padStart(12)}`,
    );
  }

  // Compute speedups
  const jsShort = data.results.find((r) => r.name === "JS kpBreak (short)");
  const wasmShortConv = data.results.find(
    (r) => r.name === "WASM kpBreak (short, w/ conv)",
  );
  const wasmShortPre = data.results.find(
    (r) => r.name === "WASM kpBreak (short, pre-conv)",
  );
  const jsLong = data.results.find((r) => r.name === "JS kpBreak (10x)");
  const wasmLongConv = data.results.find(
    (r) => r.name === "WASM kpBreak (10x, w/ conv)",
  );
  const wasmLongPre = data.results.find(
    (r) => r.name === "WASM kpBreak (10x, pre-conv)",
  );

  console.log("\n=== SPEEDUP ANALYSIS ===\n");
  if (jsShort && wasmShortConv && wasmShortPre) {
    console.log(
      `Short paragraph (~80 words):`,
    );
    console.log(
      `  JS: ${jsShort.perCallUs} µs | WASM+conv: ${wasmShortConv.perCallUs} µs (${(jsShort.perCallUs / wasmShortConv.perCallUs).toFixed(2)}x) | WASM pre-conv: ${wasmShortPre.perCallUs} µs (${(jsShort.perCallUs / wasmShortPre.perCallUs).toFixed(2)}x)`,
    );
  }
  if (jsLong && wasmLongConv && wasmLongPre) {
    console.log(
      `Long paragraph (~800 words):`,
    );
    console.log(
      `  JS: ${jsLong.perCallUs} µs | WASM+conv: ${wasmLongConv.perCallUs} µs (${(jsLong.perCallUs / wasmLongConv.perCallUs).toFixed(2)}x) | WASM pre-conv: ${wasmLongPre.perCallUs} µs (${(jsLong.perCallUs / wasmLongPre.perCallUs).toFixed(2)}x)`,
    );
  }
  console.log();

  await browser.close();
}

main().catch(console.error);
