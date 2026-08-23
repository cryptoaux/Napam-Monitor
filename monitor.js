const { chromium } = require("playwright");

async function main() {
  const browser = await chromium.launch({
    headless: true
  });

  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
      "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
  });

  const page = await context.newPage();

  try {
    console.log("Opening NAPAMS in Chrome-compatible mode...");

    await page.goto(
      "https://registration.nafdac.gov.ng/Applicant/Login",
      {
        waitUntil: "commit",
        timeout: 60000
      }
    );

    await page.waitForTimeout(15000);

    console.log("URL:", page.url());
    console.log("TITLE:", await page.title());

    const html = await page.content();

    console.log("HTML LENGTH:", html.length);

    console.log("\n--- BODY COUNT ---");
    console.log(await page.locator("body").count());

    console.log("\n--- PAGE TEXT ---");

    if (await page.locator("body").count()) {
      console.log(
        (await page.locator("body").innerText()).slice(0, 12000)
      );
    } else {
      console.log("NO BODY FOUND");
    }

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

  } finally {
    await browser.close();
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
