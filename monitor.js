const { chromium } = require("playwright");

async function main() {
  const browser = await chromium.launch({
    headless: true
  });

  const page = await browser.newPage();

  try {
    await page.goto("https://registration.nafdac.gov.ng/Applicant/Login", {
      waitUntil: "commit",
      timeout: 60000
    });

    console.log("URL:", page.url());
    console.log("TITLE:", await page.title());

    await page.waitForTimeout(15000);

    console.log("\n--- FINAL HTML ---");

    const html = await page.content();

    console.log("HTML LENGTH:", html.length);
    console.log(html);

    console.log("\n--- BODY ---");

    const body = await page.locator("body").count();
    console.log("Body count:", body);

    if (body) {
      console.log(await page.locator("body").innerText({ timeout: 5000 }));
    }

  } finally {
    await browser.close();
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
