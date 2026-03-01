import { chromium } from "playwright";

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

  await page.goto("http://localhost:5173", { waitUntil: "networkidle" });
  await page.evaluate(() => localStorage.removeItem("kp-prefs"));
  await page.reload({ waitUntil: "networkidle" });

  await page.selectOption("select >> nth=0", "Tricky Words");
  await page.waitForTimeout(300);

  // Set slider via native setter to bypass React controlled input
  await page.evaluate(() => {
    const s = document.querySelector("input[type=range]") as HTMLInputElement;
    const setter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value"
    )!.set!;
    setter.call(s, "0.285");
    s.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await page.waitForTimeout(500);

  // Literata at 323
  await page.selectOption("select >> nth=1", "0");
  await page.waitForTimeout(2000);
  await page.screenshot({ path: "screenshot-323-literata.png", fullPage: true });

  // Inter at 323
  await page.selectOption("select >> nth=1", "3");
  await page.waitForTimeout(2000);
  await page.screenshot({ path: "screenshot-323-inter.png", fullPage: true });

  // Roboto Flex at 323
  await page.selectOption("select >> nth=1", "6");
  await page.waitForTimeout(2000);
  await page.screenshot({
    path: "screenshot-323-roboto.png",
    fullPage: true,
  });

  await browser.close();
  console.log("Done — 3 screenshots at 323px");
}

main();
