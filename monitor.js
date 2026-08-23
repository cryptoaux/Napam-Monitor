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

    await page.waitForTimeout(10000);

    console.log("URL:", page.url());
    console.log("TITLE:", await page.title());

    console.log("\n--- FRAMES ---");

    for (const [index, frame] of page.frames().entries()) {
      console.log(`\nFRAME ${index}`);
      console.log("URL:", frame.url());

      try {
        console.log("TITLE:", await frame.title());
      } catch {
        console.log("TITLE: unavailable");
      }

      const inputs = await frame.locator("input").evaluateAll(elements =>
        elements.map(e => ({
          type: e.type,
          name: e.name,
          id: e.id,
          placeholder: e.placeholder
        }))
      ).catch(() => []);

      const buttons = await frame.locator("button").evaluateAll(elements =>
        elements.map(e => ({
          text: e.innerText.trim(),
          type: e.type,
          id: e.id,
          name: e.name
        }))
      ).catch(() => []);

      const links = await frame.locator("a").evaluateAll(elements =>
        elements.map(e => ({
          text: e.innerText.trim(),
          href: e.href
        }))
      ).catch(() => []);

      console.log("INPUTS:", JSON.stringify(inputs, null, 2));
      console.log("BUTTONS:", JSON.stringify(buttons, null, 2));
      console.log("LINKS:", JSON.stringify(links, null, 2));
    }

  } finally {
    await browser.close();
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
