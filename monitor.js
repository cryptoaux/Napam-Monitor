const https = require("https");

const HOST = "registration.nafdac.gov.ng";
const LOGIN_PATH = "/Applicant/Login";
const APPLICATIONS_PATH = "/Application/FormApplication/Applications";

function request(method, path, headers = {}, body = null) {
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: HOST,
        path,
        method,
        headers,
        timeout: 60000
      },
      (res) => {
        let data = "";

        res.setEncoding("utf8");

        res.on("data", (chunk) => {
          data += chunk;
        });

        res.on("end", () => {
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: data
          });
        });
      }
    );

    req.on("error", reject);

    req.on("timeout", () => {
      req.destroy(new Error("Request timed out."));
    });

    if (body) {
      req.write(body);
    }

    req.end();
  });
}

function getCookies(setCookie) {
  if (!setCookie) return "";

  return setCookie
    .map((cookie) => cookie.split(";")[0])
    .join("; ");
}

function getAntiforgeryToken(html) {
  const match = html.match(
    /name="__RequestVerificationToken"[^>]*value="([^"]+)"/i
  );

  return match ? match[1] : null;
}

function cleanText(value) {
  return value
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function main() {
  const tin = process.env.NAPAMS_TIN;
  const password = process.env.NAPAMS_PASSWORD;

  if (!tin || !password) {
    throw new Error("NAPAMS_TIN or NAPAMS_PASSWORD is missing.");
  }

  const userAgent =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
    "AppleWebKit/537.36 (KHTML, like Gecko) " +
    "Chrome/131.0.0.0 Safari/537.36";

  // ==================================================
  // 1. GET LOGIN PAGE
  // ==================================================

  console.log("Fetching NAPAMS login page...");

  const loginPage = await request("GET", LOGIN_PATH, {
    "User-Agent": userAgent,
    "Accept": "text/html"
  });

  console.log("LOGIN PAGE STATUS:", loginPage.status);

  const token = getAntiforgeryToken(loginPage.body);
  const initialCookies = getCookies(loginPage.headers["set-cookie"]);

  if (!token) {
    throw new Error("Antiforgery token was not found.");
  }

  console.log("Antiforgery token found.");

  // ==================================================
  // 2. LOGIN AS ADMIN
  // ==================================================

  console.log("Submitting Admin login...");

  const form = new URLSearchParams();

  form.append("ReturnUrl", "");
  form.append("Username", tin);
  form.append("Password", password);
  form.append("buttonFunc", "admin");
  form.append("__RequestVerificationToken", token);

  const loginResponse = await request(
    "POST",
    LOGIN_PATH,
    {
      "User-Agent": userAgent,
      "Content-Type": "application/x-www-form-urlencoded",
      "Content-Length": Buffer.byteLength(form.toString()),
      "Cookie": initialCookies,
      "Referer": "https://registration.nafdac.gov.ng/Applicant/Login",
      "Origin": "https://registration.nafdac.gov.ng",
      "Accept":
        "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
    },
    form.toString()
  );

  console.log("LOGIN STATUS:", loginResponse.status);
  console.log("LOGIN LOCATION:", loginResponse.headers.location);

  if (loginResponse.status !== 302) {
    console.log("\n--- LOGIN RESPONSE ---");
    console.log(cleanText(loginResponse.body).slice(0, 5000));
    throw new Error("NAPAMS login failed.");
  }

  const authCookies = getCookies(loginResponse.headers["set-cookie"]);

  const cookies = [initialCookies, authCookies]
    .filter(Boolean)
    .join("; ");

  console.log("Authenticated session established.");

  // ==================================================
  // 3. OPEN APPLICATIONS
  // ==================================================

  console.log("\nOpening Applications...");

  const applications = await request(
    "GET",
    APPLICATIONS_PATH,
    {
      "User-Agent": userAgent,
      "Cookie": cookies,
      "Accept": "text/html"
    }
  );

  console.log("APPLICATIONS STATUS:", applications.status);
  console.log(
    "APPLICATIONS HTML LENGTH:",
    applications.body.length
  );

  if (applications.status !== 200) {
    throw new Error("Could not open Applications page.");
  }

  // ==================================================
  // 4. CONFIRM SUBMITTED APPLICATIONS
  // ==================================================

  const pageText = cleanText(applications.body);

  console.log("\n--- SUBMITTED APPLICATIONS SUMMARY ---");

  const submittedMatch = pageText.match(
    /Submitted Applications\s+(\d+)/i
  );

  if (submittedMatch) {
    console.log(
      "Submitted Applications:",
      submittedMatch[1]
    );
  } else {
    console.log(
      "Could not determine submitted application count."
    );
  }

  // ==================================================
  // 5. FIND APPLICATION NUMBERS
  // ==================================================

  console.log("\n--- APPLICATION NUMBERS ---");

  const applicationNumbers = [
    ...new Set(
      (
        applications.body.match(
          /(?:NF-FD|PEX-FD)-\d+/gi
        ) || []
      ).map((x) => x.toUpperCase())
    )
  ];

  console.log(
    "Found:",
    applicationNumbers.length
  );

  applicationNumbers.forEach((number, index) => {
    console.log(`${index + 1}. ${number}`);
  });

  // ==================================================
  // 6. FIND VIEW STATUS ELEMENTS
  // ==================================================

  console.log("\n--- VIEW STATUS ELEMENTS ---");

  const statusElements =
    applications.body.match(
      /<[^>]*(?:View Status|view status)[^>]*>[\s\S]{0,1500}/gi
    ) || [];

  console.log(
    "View Status references found:",
    statusElements.length
  );

  statusElements.forEach((item, index) => {
    console.log(`\n--- VIEW STATUS ${index + 1} ---`);
    console.log(item.slice(0, 2000));
  });

  // ==================================================
  // 7. FIND LINKS / BUTTONS ASSOCIATED WITH STATUS
  // ==================================================

  console.log("\n--- STATUS LINKS AND BUTTONS ---");

  const allTags =
    applications.body.match(
      /<(?:a|button)[^>]*>[\s\S]{0,1000}?(?:View Status|view status)[\s\S]{0,1000}?(?:<\/a>|<\/button>)/gi
    ) || [];

  console.log(
    "Status link/button references:",
    allTags.length
  );

  allTags.forEach((item, index) => {
    console.log(`\n--- STATUS CONTROL ${index + 1} ---`);
    console.log(item.slice(0, 3000));
  });

  // ==================================================
  // 8. FIND STATUS-RELATED JAVASCRIPT
  // ==================================================

  console.log("\n--- STATUS JAVASCRIPT ---");

  const scripts =
    applications.body.match(
      /<script[\s\S]*?<\/script>/gi
    ) || [];

  let statusScriptFound = false;

  scripts.forEach((script, index) => {
    if (
      /statusProductName|trackingAppStageVMs|trackingStageName|fetch\s*\(|ajax\s*\(|View Status|viewStatus/i.test(
        script
      )
    ) {
      statusScriptFound = true;

      console.log(
        `\n--- MATCHING SCRIPT ${index + 1} ---`
      );

      console.log(script.slice(0, 12000));
    }
  });

  if (!statusScriptFound) {
    console.log(
      "No status-related JavaScript block was identified."
    );
  }

  // ==================================================
  // 9. SHOW STATUS SECTION FROM PAGE
  // ==================================================

  console.log("\n--- APPLICATION STATUS TEXT ---");

  const statusTextMatches =
    pageText.match(
      /APPLICATION STATUS[\s\S]{0,3000}/i
    ) || [];

  if (statusTextMatches.length) {
    console.log(statusTextMatches[0]);
  } else {
    console.log(
      "No visible APPLICATION STATUS section found in page text."
    );
  }

  // ==================================================
  // COMPLETE
  // ==================================================

  console.log(
    "\n--- STATUS DIAGNOSTIC COMPLETE ---"
  );
}

main().catch((error) => {
  console.error("\nNAPAMS monitor failed:");
  console.error(error);
  process.exit(1);
});
