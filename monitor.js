const { chromium } = require("playwright");
const fs = require("fs");

async function main() {
  const browser = await chromium.launch({
    headless: true
  });

  const page = await browser.newPage();

  try {
    console.log("Opening NAPAMS login...");

    const response = await page.goto(
      "https://registration.nafdac.gov.ng/Applicant/Login",
      {
        waitUntil: "commit",
        timeout: 60000
      }
    );

    await page.waitForTimeout(10000);

    console.log("URL:", page.url());
    console.log("TITLE:", await page.title());
    console.log("HTTP STATUS:", response ? response.status() : "unknown");

    const html = await page.content();

    console.log("\n--- HTML LENGTH ---");
    console.log(html.length);

    console.log("\n--- HTML START ---");
    console.log(html.substring(0, 10000));

    await fs.promises.writeFile("napams-login.html", html);

    await page.screenshot({
      path: "napams-login.png",
      fullPage: true
    });

    console.log("\nSaved napams-login.html");
    console.log("Saved napams-login.png");

  } finally {
    await browser.close();
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
