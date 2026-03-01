import { test, expect } from "@playwright/test";

test.describe("Smoke tests", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("page loads with correct title", async ({ page }) => {
    const heading = page.locator("h1");
    await expect(heading).toContainText("Knuth");
  });

  test("WASM initializes and suspense fallback disappears", async ({
    page,
  }) => {
    // The Suspense fallback contains "Loading font & engine..."
    const fallback = page.getByText("Loading font & engine...");
    await expect(fallback).toBeHidden({ timeout: 15_000 });
  });

  test("both cards render", async ({ page }) => {
    // Wait for WASM to load
    const fallback = page.getByText("Loading font & engine...");
    await expect(fallback).toBeHidden({ timeout: 15_000 });

    // CSS card
    const cssCard = page.getByText("CSS text-wrap: pretty", { exact: false });
    await expect(cssCard).toBeVisible();

    // Knuth-Plass card (use the exact card label)
    const kpCard = page.getByText("Knuth–Plass — Harfrust");
    await expect(kpCard).toBeVisible();
  });

  test("Knuth-Plass card contains rendered lines", async ({ page }) => {
    const fallback = page.getByText("Loading font & engine...");
    await expect(fallback).toBeHidden({ timeout: 15_000 });

    // Lines are divs with white-space: nowrap
    const lines = page.locator('div[style*="white-space: nowrap"]');
    await expect(lines.first()).toBeVisible({ timeout: 10_000 });
    const count = await lines.count();
    expect(count).toBeGreaterThan(2);

    // Lines contain visible text
    const firstText = await lines.first().textContent();
    expect(firstText?.trim().length).toBeGreaterThan(0);
  });
});
