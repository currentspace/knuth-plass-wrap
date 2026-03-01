import { chromium } from "playwright";

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

  // Clear localStorage before loading to avoid stale prefs
  await page.goto("http://localhost:5173", { waitUntil: "networkidle" });
  await page.evaluate(() => localStorage.removeItem("kp-prefs"));
  await page.reload({ waitUntil: "networkidle" });

  // Tricky Words
  await page.selectOption("select >> nth=0", "Tricky Words");
  await page.waitForTimeout(300);

  // Set pct via React-compatible input trick
  async function setSlider(pct: number) {
    await page.evaluate((val: number) => {
      const s = document.querySelector("input[type=range]") as HTMLInputElement;
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        "value"
      )!.set!;
      nativeInputValueSetter.call(s, String(val));
      s.dispatchEvent(new Event("input", { bubbles: true }));
    }, pct);
    await page.waitForTimeout(300);
  }

  await setSlider(0.285);

  const measure = await page.evaluate(() => {
    const divs = document.querySelectorAll("div");
    for (const d of divs) {
      const t = d.textContent || "";
      const m = t.match(/^Measure\s*[—–-]\s*(\d+)px$/);
      if (m) return m[1];
    }
    return "?";
  });
  console.log("Measure:", measure + "px\n");

  const fonts = [
    [0, "Literata"],
    [3, "Inter"],
    [6, "Roboto Flex"],
  ] as const;

  for (const [fi, name] of fonts) {
    await page.selectOption("select >> nth=1", String(fi));
    await page.waitForTimeout(2500);

    console.log(`=== ${name} ===`);

    // Extract line content from each card
    const cardInfo = await page.evaluate((_lineWidth: number) => {
      const cards: Array<{
        label: string;
        lines: Array<{ text: string; width: number }>;
      }> = [];

      // Cards: div with marginBottom:28
      const allDivs = document.querySelectorAll("div");
      for (const d of allDivs) {
        if (d.style.marginBottom !== "28px") continue;

        const labelSpan = d.querySelector("span[style*='text-transform']");
        const label = labelSpan?.textContent || "?";

        const contentBox = Array.from(d.querySelectorAll("div")).find(
          (el) =>
            el.style.border &&
            el.style.borderRadius === "8px" &&
            el.style.padding === "24px"
        );
        if (!contentBox) continue;

        const inner = contentBox.firstElementChild;
        if (!inner) continue;

        if (inner.tagName === "CANVAS") {
          cards.push({ label, lines: [{ text: "[canvas]", width: 0 }] });
          continue;
        }

        const children = inner.children;
        if (children.length === 0) {
          // CSS card - browser handles line breaking, get full text
          cards.push({
            label,
            lines: [{ text: "[browser-wrapped]", width: 0 }],
          });
          continue;
        }

        const lines: Array<{ text: string; width: number }> = [];
        for (const child of children) {
          // Reconstruct text by iterating spans (spaces rendered via inline-block)
          const parts: string[] = [];
          for (const node of child.childNodes) {
            if (node.nodeType === 3) {
              // text node
              parts.push(node.textContent || "");
            } else if (node instanceof HTMLElement) {
              const t = node.textContent || "";
              // If it's a spacer span (empty, just width), add space
              if (
                node.style.display === "inline-block" &&
                t === "" &&
                node.style.width
              ) {
                parts.push(" ");
              } else {
                parts.push(t);
              }
            }
          }
          const text = parts.join("").trim();
          if (!text) continue;

          // Measure visible text width
          const range = document.createRange();
          range.selectNodeContents(child);
          const w = range.getBoundingClientRect().width;
          lines.push({ text, width: Math.round(w * 10) / 10 });
        }
        cards.push({ label, lines });
      }
      return cards;
    }, 323);

    for (const card of cardInfo) {
      const n = card.lines.length;
      console.log(`\n  ${card.label} (${n} lines):`);
      for (let i = 0; i < n; i++) {
        const ln = card.lines[i];
        const marker =
          i === n - 1
            ? " <-- LAST"
            : ln.width > 324
              ? " <-- OVERFULL"
              : "";
        console.log(
          `    L${i + 1}: "${ln.text}" [${ln.width}px]${marker}`
        );
      }
    }
    console.log("");
  }

  await browser.close();
}

main();
