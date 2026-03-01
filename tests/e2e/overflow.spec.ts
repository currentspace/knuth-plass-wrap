import { test, expect, type Page } from "@playwright/test";

const PRESETS = [
  "Classic Knuth",
  "Narrow Sans",
  "Tricky Long Words",
  "Heavy Garamond",
  "Tight Mono",
  "Wide Light",
];

interface LineMeasurement {
  text: string;
  naturalWidth: number;
  containerWidth: number;
  gap: number;
  isLast: boolean;
  textAlign: string;
}

/**
 * Measure all rendered lines in the Knuth-Plass card.
 * Returns the second half of nowrap divs (the KP card, not the CSS card).
 */
async function measureLines(page: Page): Promise<LineMeasurement[]> {
  return page.evaluate(() => {
    const allDivs = document.querySelectorAll("div");
    const results: {
      text: string;
      naturalWidth: number;
      containerWidth: number;
      gap: number;
      isLast: boolean;
      textAlign: string;
    }[] = [];

    for (const d of allDivs) {
      const cs = getComputedStyle(d);
      if (cs.whiteSpace !== "nowrap") continue;
      const el = d as HTMLElement;
      const bcr = el.getBoundingClientRect();
      if (bcr.width < 100 || bcr.width > 600) continue;
      if ((d.textContent?.length ?? 0) < 5) continue;

      // Temporarily remove justification to measure natural width
      const origTA = el.style.textAlign;
      const origTAL = el.style.textAlignLast;
      el.style.textAlign = "start";
      el.style.textAlignLast = "auto";
      const range = document.createRange();
      range.selectNodeContents(d);
      const natW = range.getBoundingClientRect().width;
      el.style.textAlign = origTA;
      el.style.textAlignLast = origTAL;

      // Measure gap (unjustified trailing space)
      const range2 = document.createRange();
      range2.selectNodeContents(d);
      const gap = bcr.right - range2.getBoundingClientRect().right;

      results.push({
        text: (d.textContent ?? "").substring(0, 50),
        naturalWidth: Math.round(natW * 100) / 100,
        containerWidth: Math.round(bcr.width * 100) / 100,
        gap: Math.round(gap * 100) / 100,
        isLast: cs.textAlign === "start",
        textAlign: cs.textAlign,
      });
    }

    // Only the KP card uses whiteSpace: nowrap, so all results are KP lines
    return results;
  });
}

test.describe("Overflow regression tests", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    const fallback = page.getByText("Loading font & engine...");
    await expect(fallback).toBeHidden({ timeout: 15_000 });
  });

  for (const preset of PRESETS) {
    test(`"${preset}" — no overflows > 4px`, async ({ page }) => {
      await page.click(`button:has-text("${preset}")`);
      await page.waitForTimeout(1500);

      const lines = await measureLines(page);
      expect(lines.length).toBeGreaterThan(0);

      const overflows = lines.filter(
        (l) => !l.isLast && l.naturalWidth > l.containerWidth + 4,
      );
      for (const o of overflows) {
        console.log(
          `OVERFLOW +${(o.naturalWidth - o.containerWidth).toFixed(1)}px: "${o.text}"`,
        );
      }
      expect(overflows).toEqual([]);
    });

    test(`"${preset}" — no unjustified gaps > 1px`, async ({ page }) => {
      await page.click(`button:has-text("${preset}")`);
      await page.waitForTimeout(1500);

      const lines = await measureLines(page);
      expect(lines.length).toBeGreaterThan(0);

      const gaps = lines.filter(
        (l) => !l.isLast && l.textAlign === "justify" && l.gap > 1,
      );
      for (const g of gaps) {
        console.log(`GAP ${g.gap.toFixed(1)}px: "${g.text}"`);
      }
      expect(gaps).toEqual([]);
    });
  }
});
