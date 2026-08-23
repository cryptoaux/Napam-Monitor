const { chromium } = require("playwright");

async function main() {
  const browser = await chromium.launch({
    headless: true
  });

  const page = await browser.newPage();

  try {
    console.log("Opening NAPAMS login...");

    await page.goto("https://registration.nafdac.gov.ng/Applicant/Login", {
      waitUntil: "commit",
      timeout: 60000
    });

    // Give the page time to finish loading.
    await page.waitForTimeout(10000);

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

    const buttons = await page.locator("button").evaluateAll(elements =>
      elements.map(e => ({
        text: e.innerText.trim(),
        type: e.type,
        id: e.id,
        name: e.name
      }))
    );

    console.log(JSON.stringify(buttons, null, 2));

    console.log("\n--- LINKS ---");

    const links = await page.locator("a").evaluateAll(elements =>
      elements.map(e => ({
        text: e.innerText.trim(),
        href: e.href
      }))
    );

    console.log(JSON.stringify(links, null, 2));

    console.log("\n--- PAGE TEXT ---");

    console.log(
      (await page.locator("body").innerText()).slice(0, 12000)
    );

  } finally {
    await browser.close();
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
