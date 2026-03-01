import { chromium } from "playwright";

const url = process.argv[2] || "http://localhost:5173";

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.goto(url, { waitUntil: "networkidle" });

  // Wait for fonts to load
  await page.waitForFunction(() => {
    return document.fonts.check('18px "Literata"');
  }, { timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(500);

  const fonts = ["0", "1", "2"]; // Literata, Source Sans, Georgia
  const texts = ["Knuth on TeX", "On Typography", "Tricky Words"];
  const widths = [0.0, 0.3, 0.55, 0.85, 1.0]; // slider positions

  for (const fi of fonts) {
    // Select font
    const fontSel = page.locator('select').nth(1);
    await fontSel.selectOption(fi);
    await page.waitForTimeout(600); // wait for font load

    for (const tk of texts) {
      // Select text
      const textSel = page.locator('select').nth(0);
      await textSel.selectOption(tk);
      await page.waitForTimeout(100);

      for (const w of widths) {
        // Set slider
        const slider = page.locator('input[type="range"]');
        await slider.evaluate((el: HTMLInputElement, val: number) => {
          const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
            window.HTMLInputElement.prototype, 'value'
          )!.set!;
          nativeInputValueSetter.call(el, val);
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
        }, w);
        await page.waitForTimeout(200);

        const fontLabel = ["literata", "sourcesans", "georgia"][+fi];
        const textLabel = tk.replace(/\s+/g, "_").toLowerCase();
        const fname = `screenshots/${fontLabel}_${textLabel}_w${Math.round(w * 100)}.png`;
        await page.screenshot({ path: fname, fullPage: true });
        console.log(fname);
      }
    }
  }

  await browser.close();
  console.log("Done");
}

main();
