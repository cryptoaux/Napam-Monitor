const { chromium } = require("playwright");

async function main() {
  const browser = await chromium.launch({
    headless: true
  });

  try {
    const context = await browser.newContext();

    const response = await context.request.get(
      "https://registration.nafdac.gov.ng/Applicant/Login",
      {
        timeout: 60000
      }
    );

    console.log("HTTP STATUS:", response.status());
    console.log("CONTENT TYPE:", response.headers()["content-type"]);

    const html = await response.text();

    console.log("HTML LENGTH:", html.length);

    console.log("\n--- HAS BODY ---");
    console.log(html.toLowerCase().includes("<body"));

    console.log("\n--- HAS USERNAME ---");
    console.log(html.includes('id="Username"'));

    console.log("\n--- HAS PASSWORD ---");
    console.log(html.includes('id="Password"'));

    console.log("\n--- HAS ADMIN BUTTON ---");
    console.log(html.includes('value="admin"'));

    console.log("\n--- HTML LENGTH/ENDING ---");
    console.log(html.slice(-1000));

  } finally {
    await browser.close();
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
