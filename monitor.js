const { chromium } = require("playwright");

async function main() {
  const tin = process.env.NAPAMS_TIN;
  const password = process.env.NAPAMS_PASSWORD;

  if (!tin || !password) {
    throw new Error("NAPAMS_TIN or NAPAMS_PASSWORD is missing.");
  }

  const browser = await chromium.launch({
    headless: true
  });

  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    console.log("Opening NAPAMS Admin login...");

    await page.goto(
      "https://registration.nafdac.gov.ng/Applicant/Login",
      {
        waitUntil: "commit",
        timeout: 60000
      }
    );

    await page.waitForTimeout(5000);

    console.log("URL:", page.url());
    console.log("TITLE:", await page.title());

    // Admin is the default login tab.
    console.log("Filling Admin TIN...");

    await page.locator("#Username").fill(tin);

    console.log("Filling Admin password...");

    await page.locator("#Password").fill(password);

    console.log("Logging in as Admin...");

    await page.locator('#login-submit[value="admin"]').click();

    await page.waitForTimeout(5000);

    console.log("\n--- AFTER LOGIN ---");
    console.log("URL:", page.url());
    console.log("TITLE:", await page.title());

    console.log("\n--- PAGE TEXT ---");

    const text = await page.locator("body").innerText();

    console.log(text.slice(0, 12000));

  } catch (error) {
    console.error("NAPAMS login failed:");
    console.error(error);

    await page.screenshot({
      path: "napams-login-error.png",
      fullPage: true
    }).catch(() => {});

    throw error;

  } finally {
    await browser.close();
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
