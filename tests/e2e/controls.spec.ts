import { test, expect } from "@playwright/test";

test.describe("Control interaction tests", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    const fallback = page.getByText("Loading font & engine...");
    await expect(fallback).toBeHidden({ timeout: 15_000 });
  });

  test("text selector changes content", async ({ page }) => {
    // Get initial text
    const lines = page.locator('div[style*="white-space: nowrap"]');
    await expect(lines.first()).toBeVisible({ timeout: 10_000 });
    const initialText = (await lines.allTextContents()).join(" ");

    // Switch to "On Typography" via the select
    const textSelect = page.locator("select").first();
    await textSelect.selectOption("On Typography");
    await page.waitForTimeout(500);

    // Text should have changed
    const newText = (await lines.allTextContents()).join(" ");
    expect(newText).not.toBe(initialText);
    expect(newText).toContain("Typography");
  });

  test("font picker changes rendering", async ({ page }) => {
    const lines = page.locator('div[style*="white-space: nowrap"]');
    await expect(lines.first()).toBeVisible({ timeout: 10_000 });

    // FontPicker is a custom dropdown, not a <select>
    // Click the trigger button (shows current font name)
    const fontTrigger = page.locator('button:has-text("Literata")');
    await fontTrigger.click();

    // Click a different font in the dropdown
    const fontOption = page.locator('button:has-text("Source Sans 3")');
    await fontOption.click();
    await page.waitForTimeout(2000);

    // Should still have lines (re-rendered with new font)
    await expect(lines.first()).toBeVisible({ timeout: 10_000 });
    const newCount = await lines.count();
    expect(newCount).toBeGreaterThan(0);
  });

  test("weight slider updates font-weight in DOM", async ({ page }) => {
    const lines = page.locator('div[style*="white-space: nowrap"]');
    await expect(lines.first()).toBeVisible({ timeout: 10_000 });

    // Get initial font-weight
    const initialWeight = await lines.first().evaluate((el) =>
      getComputedStyle(el).fontWeight,
    );

    // Find the weight slider — labeled "Weight"
    const weightSlider = page.locator('input[type="range"]').nth(1);
    await weightSlider.fill("700");
    await page.waitForTimeout(500);

    // font-weight should have changed
    const newWeight = await lines.first().evaluate((el) =>
      getComputedStyle(el).fontWeight,
    );
    expect(newWeight).not.toBe(initialWeight);
  });

  test("size slider updates fontSize in DOM", async ({ page }) => {
    const lines = page.locator('div[style*="white-space: nowrap"]');
    await expect(lines.first()).toBeVisible({ timeout: 10_000 });

    // Get initial font-size
    const initialSize = await lines.first().evaluate((el) =>
      getComputedStyle(el).fontSize,
    );

    // Find the size slider — labeled "Size"
    const sizeSlider = page.locator('input[type="range"]').nth(2);
    await sizeSlider.fill("28");
    await page.waitForTimeout(500);

    const newSize = await lines.first().evaluate((el) =>
      getComputedStyle(el).fontSize,
    );
    expect(newSize).not.toBe(initialSize);
  });

  test("leading slider updates lineHeight in DOM", async ({ page }) => {
    const lines = page.locator('div[style*="white-space: nowrap"]');
    await expect(lines.first()).toBeVisible({ timeout: 10_000 });

    const initialLH = await lines.first().evaluate((el) =>
      getComputedStyle(el).lineHeight,
    );

    // Leading slider is the 4th range input
    const leadingSlider = page.locator('input[type="range"]').nth(3);
    await leadingSlider.fill("2.2");
    await page.waitForTimeout(500);

    const newLH = await lines.first().evaluate((el) =>
      getComputedStyle(el).lineHeight,
    );
    expect(newLH).not.toBe(initialLH);
  });

  test("custom text renders user input", async ({ page }) => {
    // Select "Custom…" from the text selector
    const textSelect = page.locator("select").first();
    await textSelect.selectOption("__c");
    await page.waitForTimeout(300);

    // Type in the textarea
    const textarea = page.locator("textarea");
    await expect(textarea).toBeVisible();
    await textarea.fill(
      "The quick brown fox jumps over the lazy dog near the riverbank.",
    );
    await page.waitForTimeout(1000);

    // Lines should contain our custom text
    const lines = page.locator('div[style*="white-space: nowrap"]');
    await expect(lines.first()).toBeVisible({ timeout: 10_000 });
    const allText = (await lines.allTextContents()).join(" ");
    expect(allText).toContain("quick brown fox");
  });

  test("similarity checkbox toggles without crash", async ({ page }) => {
    const lines = page.locator('div[style*="white-space: nowrap"]');
    await expect(lines.first()).toBeVisible({ timeout: 10_000 });

    const similarityLabel = page.locator("label", { hasText: "Similarity" });
    await similarityLabel.click();
    await page.waitForTimeout(500);

    // Still has lines after toggling
    await expect(lines.first()).toBeVisible();
    const count = await lines.count();
    expect(count).toBeGreaterThan(0);
  });
});
