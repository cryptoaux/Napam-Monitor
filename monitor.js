const dns = require("dns").promises;
const https = require("https");

async function main() {
  console.log("Testing NAPAMS DNS...");

  try {
    const addresses = await dns.lookup("registration.nafdac.gov.ng", {
      all: true
    });

    console.log("DNS RESULT:");
    console.log(addresses);
  } catch (error) {
    console.error("DNS FAILED:");
    console.error(error);
  }

  console.log("\nTesting HTTPS connection...");

  await new Promise((resolve) => {
    const request = https.get(
      "https://registration.nafdac.gov.ng/Applicant/Login",
      {
        timeout: 30000
      },
      response => {
        console.log("HTTPS STATUS:", response.statusCode);
        console.log("HTTPS HEADERS:", response.headers);
        response.resume();
        resolve();
      }
    );

    request.on("error", error => {
      console.error("HTTPS FAILED:");
      console.error(error);
      resolve();
    });

    request.on("timeout", () => {
      console.error("HTTPS TIMEOUT");
      request.destroy();
      resolve();
    });
  });
}

main();
