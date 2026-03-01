import { test, expect } from "@playwright/test";

test.describe("Edge cases", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    const fallback = page.getByText("Loading font & engine...");
    await expect(fallback).toBeHidden({ timeout: 15_000 });
  });

  test("empty custom text does not crash", async ({ page }) => {
    // Select "Custom…"
    const textSelect = page.locator("select").first();
    await textSelect.selectOption("__c");
    await page.waitForTimeout(300);

    // Leave textarea empty
    const textarea = page.locator("textarea");
    await expect(textarea).toBeVisible();
    await textarea.fill("");
    await page.waitForTimeout(500);

    // Page should not crash — header still visible
    const heading = page.locator("h1");
    await expect(heading).toBeVisible();
  });

  test("single word renders one line", async ({ page }) => {
    const textSelect = page.locator("select").first();
    await textSelect.selectOption("__c");
    await page.waitForTimeout(300);

    const textarea = page.locator("textarea");
    await textarea.fill("Hello");
    await page.waitForTimeout(1000);

    const lines = page.locator('div[style*="white-space: nowrap"]');
    // May have CSS card lines too, but KP should have at least 1
    const count = await lines.count();
    expect(count).toBeGreaterThanOrEqual(1);
  });

  test("very long word renders without crashing", async ({ page }) => {
    const textSelect = page.locator("select").first();
    await textSelect.selectOption("__c");
    await page.waitForTimeout(300);

    const textarea = page.locator("textarea");
    await textarea.fill(
      "Supercalifragilisticexpialidociousantidisestablishmentarianism is a very long word indeed.",
    );
    await page.waitForTimeout(1500);

    // Page should not crash
    const heading = page.locator("h1");
    await expect(heading).toBeVisible();

    // Should still render lines
    const lines = page.locator('div[style*="white-space: nowrap"]');
    const count = await lines.count();
    expect(count).toBeGreaterThanOrEqual(1);
  });

  test("rapid preset switching does not crash", async ({ page }) => {
    const presets = [
      "Classic Knuth",
      "Narrow Sans",
      "Tricky Long Words",
      "Heavy Garamond",
      "Tight Mono",
      "Wide Light",
    ];

    // Click through all presets rapidly
    for (const preset of presets) {
      await page.click(`button:has-text("${preset}")`);
      // Very short delay — testing rapid switching
      await page.waitForTimeout(100);
    }

    // Wait for the final preset to settle
    await page.waitForTimeout(2000);

    // Page should not have crashed
    const heading = page.locator("h1");
    await expect(heading).toBeVisible();

    // Final preset should have rendered lines
    const lines = page.locator('div[style*="white-space: nowrap"]');
    await expect(lines.first()).toBeVisible({ timeout: 10_000 });
    const count = await lines.count();
    expect(count).toBeGreaterThan(0);
  });
});
