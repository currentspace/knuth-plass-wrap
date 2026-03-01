import { test, expect, type Page } from "@playwright/test";

const PRESETS = [
  "Classic Knuth",
  "Narrow Sans",
  "Tricky Long Words",
  "Heavy Garamond",
  "Tight Mono",
  "Wide Light",
];

async function waitForKPLines(page: Page) {
  const lines = page.locator('div[style*="white-space: nowrap"]');
  await expect(lines.first()).toBeVisible({ timeout: 10_000 });
  return lines;
}

test.describe("Preset tests", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    const fallback = page.getByText("Loading font & engine...");
    await expect(fallback).toBeHidden({ timeout: 15_000 });
  });

  for (const preset of PRESETS) {
    test(`preset "${preset}" renders correctly`, async ({ page }) => {
      // Click the preset button
      await page.click(`button:has-text("${preset}")`);

      // Wait for font loading and WASM re-layout
      await page.waitForTimeout(1500);

      // Wait for lines to render
      const lines = await waitForKPLines(page);

      // At least 2 lines
      const count = await lines.count();
      expect(count).toBeGreaterThanOrEqual(2);

      // Check no line overflows by more than 2px
      const overflows = await page.evaluate(() => {
        const allDivs = document.querySelectorAll("div");
        const issues: string[] = [];
        for (const d of allDivs) {
          const cs = getComputedStyle(d);
          if (cs.whiteSpace !== "nowrap") continue;
          const el = d as HTMLElement;
          const bcr = el.getBoundingClientRect();
          if (bcr.width < 100 || bcr.width > 600) continue;
          if ((d.textContent?.length ?? 0) < 5) continue;
          if (cs.textAlign === "start") continue; // last line

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

          if (natW > bcr.width + 4) {
            issues.push(
              `Overflow +${(natW - bcr.width).toFixed(1)}px: "${d.textContent?.substring(0, 40)}"`,
            );
          }
        }
        return issues;
      });
      expect(overflows, "No lines should overflow by > 4px").toEqual([]);
    });
  }

  test("active preset button gets active styling", async ({ page }) => {
    const btn = page.locator('button:has-text("Classic Knuth")');
    await btn.click();
    await page.waitForTimeout(300);

    // Active button should have bold font-weight (600 vs 400 for inactive)
    const fontWeight = await btn.evaluate(
      (el) => getComputedStyle(el).fontWeight,
    );
    expect(fontWeight).toBe("600");
  });
});
