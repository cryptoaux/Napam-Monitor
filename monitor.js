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

function extractHiddenValue(html, id) {
  const regex = new RegExp(
    `<input[^>]+id=["']${id}["'][^>]+value=["']([^"']+)["']`,
    "i"
  );

  const match = html.match(regex);

  return match ? match[1] : null;
}

function extractApplicationRows(html) {
  const applications = [];

  const rowRegex =
    /<tr[\s\S]*?<\/tr>/gi;

  const rows = html.match(rowRegex) || [];

  for (const row of rows) {
    const appMatch = row.match(
      /((?:NF-FD|PEX-FD)-\d+)/i
    );

    if (!appMatch) continue;

    const applicationNumber =
      appMatch[1].toUpperCase();

    const productMatch = row.match(
      /<td[^>]*>\s*([^<]+)\s*<\/td>/gi
    );

    const statusMatch =
      row.match(/View Status/i);

    if (!statusMatch) continue;

    applications.push({
      applicationNumber,
      row
    });
  }

  return applications;
}

async function checkApplicationStatus(
  appID,
  cookies,
  userAgent
) {
  const path =
    `/Application/SubmittedApplication/CheckApplicationStatus?appID=${encodeURIComponent(
      appID
    )}`;

  const response = await request(
    "POST",
    path,
    {
      "User-Agent": userAgent,
      "Cookie": cookies,
      "Accept": "application/json, text/plain, */*",
      "Referer":
        "https://registration.nafdac.gov.ng/Application/FormApplication/Applications",
      "X-Requested-With": "XMLHttpRequest"
    }
  );

  return response;
}

async function main() {
  const tin = process.env.NAPAMS_TIN;
  const password = process.env.NAPAMS_PASSWORD;

  if (!tin || !password) {
    throw new Error(
      "NAPAMS_TIN or NAPAMS_PASSWORD is missing."
    );
  }

  const userAgent =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
    "AppleWebKit/537.36 (KHTML, like Gecko) " +
    "Chrome/131.0.0.0 Safari/537.36";

  // ==================================================
  // 1. LOGIN PAGE
  // ==================================================

  console.log("Fetching NAPAMS login page...");

  const loginPage = await request(
    "GET",
    LOGIN_PATH,
    {
      "User-Agent": userAgent,
      "Accept": "text/html"
    }
  );

  console.log(
    "LOGIN PAGE STATUS:",
    loginPage.status
  );

  const token = getAntiforgeryToken(
    loginPage.body
  );

  const initialCookies = getCookies(
    loginPage.headers["set-cookie"]
  );

  if (!token) {
    throw new Error(
      "Antiforgery token was not found."
    );
  }

  console.log("Antiforgery token found.");

  // ==================================================
  // 2. ADMIN LOGIN
  // ==================================================

  console.log("Submitting Admin login...");

  const form = new URLSearchParams();

  form.append("ReturnUrl", "");
  form.append("Username", tin);
  form.append("Password", password);
  form.append("buttonFunc", "admin");
  form.append(
    "__RequestVerificationToken",
    token
  );

  const loginResponse = await request(
    "POST",
    LOGIN_PATH,
    {
      "User-Agent": userAgent,
      "Content-Type":
        "application/x-www-form-urlencoded",
      "Content-Length":
        Buffer.byteLength(form.toString()),
      "Cookie": initialCookies,
      "Referer":
        "https://registration.nafdac.gov.ng/Applicant/Login",
      "Origin":
        "https://registration.nafdac.gov.ng",
      "Accept":
        "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
    },
    form.toString()
  );

  console.log(
    "LOGIN STATUS:",
    loginResponse.status
  );

  console.log(
    "LOGIN LOCATION:",
    loginResponse.headers.location
  );

  if (loginResponse.status !== 302) {
    throw new Error("NAPAMS login failed.");
  }

  const authCookies = getCookies(
    loginResponse.headers["set-cookie"]
  );

  const cookies = [
    initialCookies,
    authCookies
  ]
    .filter(Boolean)
    .join("; ");

  console.log(
    "Authenticated session established."
  );

  // ==================================================
  // 3. OPEN APPLICATIONS
  // ==================================================

  console.log(
    "\nOpening Applications..."
  );

  const applicationsPage = await request(
    "GET",
    APPLICATIONS_PATH,
    {
      "User-Agent": userAgent,
      "Cookie": cookies,
      "Accept": "text/html"
    }
  );

  console.log(
    "APPLICATIONS STATUS:",
    applicationsPage.status
  );

  console.log(
    "APPLICATIONS HTML LENGTH:",
    applicationsPage.body.length
  );

  if (applicationsPage.status !== 200) {
    throw new Error(
      "Could not open Applications page."
    );
  }

  const html = applicationsPage.body;

  // ==================================================
  // 4. FIND SUBMITTED APPLICATION COUNT
  // ==================================================

  const pageText = cleanText(html);

  const countMatch =
    pageText.match(
      /Submitted Applications\s+(\d+)/i
    );

  const submittedCount = countMatch
    ? Number(countMatch[1])
    : null;

  console.log(
    "\nSUBMITTED APPLICATIONS:",
    submittedCount ?? "Unknown"
  );

  // ==================================================
  // 5. FIND APPLICATION IDs
  // ==================================================

  console.log(
    "\nFinding application IDs..."
  );

  const appIDs = [];

  for (
    let index = 0;
    index < 20;
    index++
  ) {
    const id =
      extractHiddenValue(
        html,
        `appID_${index}`
      );

    if (!id) break;

    appIDs.push(id);
  }

  console.log(
    "Application IDs found:",
    appIDs.length
  );

  if (appIDs.length === 0) {
    throw new Error(
      "No appID values were found."
    );
  }

  // ==================================================
  // 6. FIND SUBMITTED APPLICATION NUMBERS
  // ==================================================

  const applicationNumbers = [
    ...new Set(
      (
        html.match(
          /(?:NF-FD|PEX-FD)-\d+/gi
        ) || []
      ).map((value) =>
        value.toUpperCase()
      )
    )
  ];

  console.log(
    "\nApplication numbers found on page:"
  );

  applicationNumbers.forEach(
    (number, index) => {
      console.log(
        `${index + 1}. ${number}`
      );
    }
  );

  // ==================================================
  // 7. CHECK EACH APPLICATION
  // ==================================================

  console.log(
    "\n========================================"
  );

  console.log(
    "CHECKING SUBMITTED APPLICATION STATUSES"
  );

  console.log(
    "========================================"
  );

  const results = [];

  for (
    let index = 0;
    index < appIDs.length;
    index++
  ) {
    const appID = appIDs[index];

    console.log(
      `\nChecking application ${index + 1}...`
    );

    const response =
      await checkApplicationStatus(
        appID,
        cookies,
        userAgent
      );

    console.log(
      "STATUS ENDPOINT HTTP:",
      response.status
    );

    if (
      response.status < 200 ||
      response.status >= 300
    ) {
      console.log(
        "Status request failed."
      );

      results.push({
        index: index + 1,
        appID,
        success: false,
        error:
          `HTTP ${response.status}`
      });

      continue;
    }

    let data;

    try {
      data = JSON.parse(
        response.body
      );
    } catch (error) {
      console.log(
        "Response was not valid JSON."
      );

      console.log(
        response.body.slice(0, 2000)
      );

      results.push({
        index: index + 1,
        appID,
        success: false,
        error: "Invalid JSON"
      });

      continue;
    }

    console.log(
      "Product:",
      data.statusProductName
    );

    console.log(
      "Tracking stages:"
    );

    const stages =
      Array.isArray(
        data.trackingAppStageVMs
      )
        ? data.trackingAppStageVMs
        : [];

    stages.forEach(
      (stage, stageIndex) => {
        console.log(
          `  ${stageIndex + 1}. ${
            stage.trackingStageName || "Unknown"
          }`
        );

        if (stage.duration) {
          console.log(
            `     Duration: ${stage.duration}`
          );
        }
      }
    );

    results.push({
      index: index + 1,
      appID,
      success: true,
      product:
        data.statusProductName || null,
      stages
    });
  }

  // ==================================================
  // 8. FINAL SUMMARY
  // ==================================================

  console.log(
    "\n========================================"
  );

  console.log(
    "FINAL APPLICATION STATUS SUMMARY"
  );

  console.log(
    "========================================"
  );

  results.forEach(
    (result) => {
      console.log(
        `\nApplication ${result.index}`
      );

      if (!result.success) {
        console.log(
          "ERROR:",
          result.error
        );
        return;
      }

      console.log(
        "Product:",
        result.product
      );

      console.log(
        "Stages:"
      );

      result.stages.forEach(
        (stage, index) => {
          console.log(
            `  ${index + 1}. ${
              stage.trackingStageName ||
              "Unknown"
            }`
          );
        }
      );
    }
  );

  console.log(
    "\n--- MONITOR COMPLETE ---"
  );
}

main().catch((error) => {
  console.error(
    "\nNAPAMS monitor failed:"
  );

  console.error(error);

  process.exit(1);
});
