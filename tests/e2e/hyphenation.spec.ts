import { test, expect } from "@playwright/test";

test.describe("Hyphenation tests", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    const fallback = page.getByText("Loading font & engine...");
    await expect(fallback).toBeHidden({ timeout: 15_000 });
  });

  test("enabling hyphens inserts soft hyphens in CSS card", async ({
    page,
  }) => {
    // Select "Tricky Words" text which has long words like "internationalization"
    const textSelect = page.locator("select").first();
    await textSelect.selectOption("Tricky Words");
    await page.waitForTimeout(500);

    // Get the CSS card's text content before enabling hyphens
    // The CSS card uses text-wrap: pretty (not nowrap)
    const cssCard = page.locator('div[style*="text-wrap: pretty"]');
    await expect(cssCard).toBeVisible();
    const textBefore = await cssCard.textContent();

    // Check the Hyphens checkbox
    const hyphensLabel = page.locator("label", { hasText: "Hyphens" });
    await hyphensLabel.click();
    await page.waitForTimeout(500);

    // CSS card text should now contain soft hyphens (\u00AD)
    const textAfter = await cssCard.textContent();
    expect(textAfter).not.toBe(textBefore);
    const hasSoftHyphen = textAfter?.includes("\u00AD");
    expect(
      hasSoftHyphen,
      "CSS card text should contain soft hyphens after enabling",
    ).toBe(true);
  });

  test("unchecking hyphens removes soft hyphens", async ({ page }) => {
    // Enable hyphenation first
    const hyphensLabel = page.locator("label", { hasText: "Hyphens" });
    await hyphensLabel.click();
    await page.waitForTimeout(500);

    const cssCard = page.locator('div[style*="text-wrap: pretty"]');
    const textWith = await cssCard.textContent();
    expect(textWith?.includes("\u00AD")).toBe(true);

    // Disable hyphenation
    await hyphensLabel.click();
    await page.waitForTimeout(500);

    const textWithout = await cssCard.textContent();
    expect(
      textWithout?.includes("\u00AD"),
      "Soft hyphens should be removed after disabling",
    ).toBe(false);
  });
});
