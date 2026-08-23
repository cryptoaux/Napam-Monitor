const https = require("https");

async function main() {
  console.log("Fetching NAPAMS login page...");

  await new Promise((resolve, reject) => {
    const request = https.get(
      "https://registration.nafdac.gov.ng/Applicant/Login",
      {
        timeout: 30000,
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
            "AppleWebKit/537.36 (KHTML, like Gecko) " +
            "Chrome/131.0.0.0 Safari/537.36"
        }
      },
      response => {
        let data = "";

        response.setEncoding("utf8");

        response.on("data", chunk => {
          data += chunk;
        });

        response.on("end", () => {
          console.log("HTTP STATUS:", response.statusCode);
          console.log("HTML LENGTH:", data.length);

          console.log("\nHAS BODY:", /<body[\s>]/i.test(data));
          console.log("HAS USERNAME:", /id=["']Username["']/i.test(data));
          console.log("HAS PASSWORD:", /id=["']Password["']/i.test(data));
          console.log("HAS ADMIN:", /value=["']admin["']/i.test(data));

          console.log("\n--- RELEVANT LOGIN HTML ---");

          const usernamePosition = data.indexOf('id="Username"');

          if (usernamePosition !== -1) {
            console.log(
              data.substring(
                Math.max(0, usernamePosition - 1500),
                usernamePosition + 3000
              )
            );
          } else {
            console.log("Username field was NOT found.");
            console.log(data.slice(-5000));
          }

          resolve();
        });
      }
    );

    request.on("error", reject);

    request.on("timeout", () => {
      request.destroy(new Error("HTTPS request timed out."));
    });
  });
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
