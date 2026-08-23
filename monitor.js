const https = require("https");
const fs = require("fs");

const HOST = "registration.nafdac.gov.ng";
const LOGIN_PATH = "/Applicant/Login";
const APPLICATIONS_PATH =
  "/Application/FormApplication/Applications";

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
  return String(value || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
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

/*
 * Only extract application numbers from rows
 * containing "View Status".
 */
function extractSubmittedApplicationNumbers(html) {
  const numbers = [];

  const rowRegex = /<tr[\s\S]*?<\/tr>/gi;
  const rows = html.match(rowRegex) || [];

  for (const row of rows) {
    if (!/View Status/i.test(row)) {
      continue;
    }

    const match = row.match(
      /((?:NF-FD|PEX-FD)-\d+)/i
    );

    if (!match) {
      continue;
    }

    const number = match[1].toUpperCase();

    if (!numbers.includes(number)) {
      numbers.push(number);
    }
  }

  return numbers;
}

function extractApplicationIds(html) {
  const ids = [];

  for (let index = 0; index < 20; index++) {
    const id = extractHiddenValue(
      html,
      `appID_${index}`
    );

    if (!id) {
      break;
    }

    ids.push(id);
  }

  return ids;
}

function normalizeStageName(name) {
  return String(name || "Unknown")
    .replace(/\s+/g, " ")
    .trim();
}

/*
 * NAPAMS supplies the stage description/CSS information.
 *
 * We preserve the original NAPAMS values in data.json
 * so the website can use the same status information.
 */
function getStageColor(stage) {
  const description = String(
    stage?.description || ""
  ).toLowerCase();

  const status = String(
    stage?.status ||
      stage?.stageStatus ||
      stage?.currentStatus ||
      ""
  ).toLowerCase();

  const combined =
    `${description} ${status}`;

  /*
   * These are based on the status meanings observed
   * from NAPAMS:
   *
   * green  = completed
   * yellow = current
   * red    = pending
   */

  if (
    /success|complete|completed|approved|green/.test(
      combined
    )
  ) {
    return "GREEN";
  }

  if (
    /warning|current|active|processing|progress|in-progress|in progress|orange|yellow/.test(
      combined
    )
  ) {
    return "YELLOW";
  }

  return "RED";
}

function colorLabel(color) {
  if (color === "GREEN") {
    return "🟢";
  }

  if (color === "YELLOW") {
    return "🟡";
  }

  return "🔴";
}

function getCurrentStatus(stages) {
  if (
    !Array.isArray(stages) ||
    stages.length === 0
  ) {
    return "Unknown";
  }

  /*
   * First preference:
   * NAPAMS explicitly identifies the current stage.
   */
  const explicitCurrent = stages.find(
    (stage) => {
      const description = String(
        stage?.description || ""
      ).toLowerCase();

      const status = String(
        stage?.status ||
          stage?.stageStatus ||
          stage?.currentStatus ||
          ""
      ).toLowerCase();

      return /current|active|processing|progress|in-progress|in progress/.test(
        `${description} ${status}`
      );
    }
  );

  if (explicitCurrent) {
    return normalizeStageName(
      explicitCurrent.trackingStageName
    );
  }

  /*
   * Second preference:
   * Find the yellow/current stage.
   */
  const yellowStage = stages.find(
    (stage) =>
      getStageColor(stage) === "YELLOW"
  );

  if (yellowStage) {
    return normalizeStageName(
      yellowStage.trackingStageName
    );
  }

  /*
   * Third preference:
   * First stage that isn't completed.
   */
  const firstNonCompleted = stages.find(
    (stage) =>
      getStageColor(stage) !== "GREEN"
  );

  if (firstNonCompleted) {
    return normalizeStageName(
      firstNonCompleted.trackingStageName
    );
  }

  /*
   * Everything completed.
   */
  return normalizeStageName(
    stages[stages.length - 1]
      .trackingStageName
  );
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

  return request(
    "POST",
    path,
    {
      "User-Agent": userAgent,
      "Cookie": cookies,
      "Accept":
        "application/json, text/plain, */*",
      "Referer":
        "https://registration.nafdac.gov.ng/Application/FormApplication/Applications",
      "X-Requested-With":
        "XMLHttpRequest"
    }
  );
}

/*
 * Create the JSON file that the website will read.
 */
function saveWebsiteData(results) {
  const successfulResults =
    results
      .filter((result) => result.success)
      .map((result) => ({
        applicationNumber:
          result.applicationNumber,

        name: result.product,

        currentStatus:
          result.currentStatus,

        stages:
          result.stages.map(
            (stage) => ({
              name:
                normalizeStageName(
                  stage.trackingStageName
                ),

              color:
                getStageColor(stage),

              napamsDescription:
                stage.description || "",

              status:
                stage.status ||
                stage.stageStatus ||
                stage.currentStatus ||
                "",

              duration:
                stage.duration || ""
            })
          )
      }));

  const data = {
    updatedAt:
      new Date().toISOString(),

    totalApplications:
      successfulResults.length,

    applications:
      successfulResults
  };

  fs.writeFileSync(
    "data.json",
    JSON.stringify(data, null, 2),
    "utf8"
  );

  console.log(
    "\n========================================"
  );

  console.log(
    "WEBSITE DATA CREATED"
  );

  console.log(
    "========================================"
  );

  console.log(
    `Applications saved: ${successfulResults.length}`
  );

  console.log(
    "File: data.json"
  );

  console.log(
    `Updated: ${data.updatedAt}`
  );
}

async function main() {
  const tin =
    process.env.NAPAMS_TIN;

  const password =
    process.env.NAPAMS_PASSWORD;

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

  console.log(
    "Fetching NAPAMS login page..."
  );

  const loginPage =
    await request(
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

  const token =
    getAntiforgeryToken(
      loginPage.body
    );

  const initialCookies =
    getCookies(
      loginPage.headers["set-cookie"]
    );

  if (!token) {
    throw new Error(
      "Antiforgery token was not found."
    );
  }

  console.log(
    "Antiforgery token found."
  );

  // ==================================================
  // 2. LOGIN
  // ==================================================

  console.log(
    "Submitting Admin login..."
  );

  const form =
    new URLSearchParams();

  form.append(
    "ReturnUrl",
    ""
  );

  form.append(
    "Username",
    tin
  );

  form.append(
    "Password",
    password
  );

  form.append(
    "buttonFunc",
    "admin"
  );

  form.append(
    "__RequestVerificationToken",
    token
  );

  const loginResponse =
    await request(
      "POST",
      LOGIN_PATH,
      {
        "User-Agent": userAgent,

        "Content-Type":
          "application/x-www-form-urlencoded",

        "Content-Length":
          Buffer.byteLength(
            form.toString()
          ),

        "Cookie":
          initialCookies,

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

  if (
    loginResponse.status !== 302
  ) {
    throw new Error(
      "NAPAMS login failed."
    );
  }

  const authCookies =
    getCookies(
      loginResponse.headers[
        "set-cookie"
      ]
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

  const applicationsPage =
    await request(
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

  if (
    applicationsPage.status !== 200
  ) {
    throw new Error(
      "Could not open Applications page."
    );
  }

  const html =
    applicationsPage.body;

  const pageText =
    cleanText(html);

  // ==================================================
  // 4. SUBMITTED COUNT
  // ==================================================

  const countMatch =
    pageText.match(
      /Submitted Applications\s+(\d+)/i
    );

  const submittedCount =
    countMatch
      ? Number(countMatch[1])
      : null;

  console.log(
    "\nSUBMITTED APPLICATIONS:",
    submittedCount ??
      "Unknown"
  );

  // ==================================================
  // 5. APPLICATION IDS
  // ==================================================

  console.log(
    "\nFinding submitted application IDs..."
  );

  const appIDs =
    extractApplicationIds(html);

  const submittedApplicationNumbers =
    extractSubmittedApplicationNumbers(
      html
    );

  console.log(
    "Application IDs found:",
    appIDs.length
  );

  console.log(
    "Submitted application numbers found:",
    submittedApplicationNumbers.length
  );

  if (
    appIDs.length === 0
  ) {
    throw new Error(
      "No appID values were found."
    );
  }

  submittedApplicationNumbers.forEach(
    (number, index) => {
      console.log(
        `${index + 1}. ${number}`
      );
    }
  );

  // ==================================================
  // 6. CHECK APPLICATIONS
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
    const appID =
      appIDs[index];

    const applicationNumber =
      submittedApplicationNumbers[
        index
      ] || "Unknown";

    console.log(
      `\nChecking application ${
        index + 1
      }...`
    );

    console.log(
      "Application Number:",
      applicationNumber
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
      results.push({
        index: index + 1,

        applicationNumber,

        appID,

        success: false,

        error:
          `HTTP ${response.status}`
      });

      continue;
    }

    let data;

    try {
      data =
        JSON.parse(
          response.body
        );
    } catch (error) {
      results.push({
        index: index + 1,

        applicationNumber,

        appID,

        success: false,

        error:
          "Invalid JSON"
      });

      continue;
    }

    const product =
      data.statusProductName ||
      "Unknown Product";

    const stages =
      Array.isArray(
        data.trackingAppStageVMs
      )
        ? data.trackingAppStageVMs
        : [];

    const currentStatus =
      getCurrentStatus(
        stages
      );

    console.log(
      "Product:",
      product
    );

    console.log(
      "CURRENT STATUS:",
      currentStatus
    );

    console.log(
      "Tracking stages:"
    );

    stages.forEach(
      (stage, stageIndex) => {
        const stageName =
          normalizeStageName(
            stage.trackingStageName
          );

        const color =
          getStageColor(stage);

        console.log(
          `  ${
            stageIndex + 1
          }. ${colorLabel(
            color
          )} ${stageName}`
        );

        if (
          stage.duration
        ) {
          console.log(
            `     Duration: ${stage.duration}`
          );
        }
      }
    );

    results.push({
      index: index + 1,

      applicationNumber,

      appID,

      success: true,

      product,

      currentStatus,

      stages
    });
  }

  // ==================================================
  // 7. SAVE WEBSITE DATA
  // ==================================================

  saveWebsiteData(
    results
  );

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
        "\n----------------------------------------"
      );

      if (!result.success) {
        console.log(
          "Application Number:",
          result.applicationNumber
        );

        console.log(
          "ERROR:",
          result.error
        );

        return;
      }

      console.log(
        "Application Number:",
        result.applicationNumber
      );

      console.log(
        "Name:",
        result.product
      );

      console.log(
        "CURRENT STATUS:",
        result.currentStatus
      );

      console.log(
        "\nSTATUS STAGES:"
      );

      result.stages.forEach(
        (stage, index) => {
          const stageName =
            normalizeStageName(
              stage.trackingStageName
            );

          const color =
            getStageColor(stage);

          console.log(
            `  ${
              index + 1
            }. ${colorLabel(
              color
            )} ${stageName}`
          );
        }
      );
    }
  );

  console.log(
    "\n--- MONITOR COMPLETE ---"
  );
}

main().catch(
  (error) => {
    console.error(
      "\nNAPAMS monitor failed:"
    );

    console.error(
      error
    );

    process.exit(1);
  }
);
