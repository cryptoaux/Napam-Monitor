const { chromium } = require("playwright");

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  try {
    await page.goto("https://registration.nafdac.gov.ng/", {
      waitUntil: "domcontentloaded",
      timeout: 60000
    });

    console.log("URL:", page.url());
    console.log("TITLE:", await page.title());

    console.log("\n--- INPUTS ---");
    const inputs = await page.locator("input").evaluateAll(elements =>
      elements.map(e => ({
        type: e.type,
        name: e.name,
        id: e.id,
        placeholder: e.placeholder
      }))
    );
    console.log(JSON.stringify(inputs, null, 2));

    console.log("\n--- BUTTONS ---");
    const buttons = await page.locator("button").allTextContents();
    console.log(buttons);

    console.log("\n--- LINKS ---");
    const links = await page.locator("a").allTextContents();
    console.log(links);

    console.log("\n--- PAGE TEXT ---");
    console.log((await page.locator("body").innerText()).slice(0, 10000));

  } finally {
    await browser.close();
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
