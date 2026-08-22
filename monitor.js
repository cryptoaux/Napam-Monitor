const { chromium } = require("playwright");

async function main() {
  console.log("NAPAMS monitor starting...");

  const browser = await chromium.launch({
    headless: true
  });

  const page = await browser.newPage();

  await page.goto("https://registration.nafdac.gov.ng/", {
    waitUntil: "domcontentloaded"
  });

  console.log("NAPAMS opened:");
  console.log(await page.title());

  await browser.close();
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
