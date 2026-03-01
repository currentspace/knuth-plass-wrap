import { chromium } from "playwright";

const url = process.argv[2] || "http://localhost:5173";
const output = process.argv[3] || "screenshot.png";

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.goto(url, { waitUntil: "networkidle" });
  await page.screenshot({ path: output, fullPage: true });
  await browser.close();
  console.log(`Screenshot saved to ${output}`);
}

main();
