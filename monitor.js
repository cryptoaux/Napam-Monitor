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
 * Get only the application numbers belonging to the
 * Submitted Applications section.
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
 * NAPAMS appears to use the stage "description" field
 * to attach the CSS/status class to each stage.
 *
 * We check several possible names so the monitor remains
 * flexible if NAPAMS changes the exact class name.
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
  const combined = `${description} ${status}`;
  // GREEN = completed
  if (
    /success|complete|completed|approved|green/.test(
      combined
    )
  ) {
    return "GREEN";
  }
  // YELLOW = current
  if (
    /warning|current|active|processing|progress|in-progress|in progress|orange|yellow/.test(
      combined
    )
  ) {
    return "YELLOW";
  }
  // RED = pending
  return "RED";
}
/*
 * Determine the current stage dynamically.
 *
 * Priority:
 * 1. NAPAMS explicitly marks a stage as current.
 * 2. NAPAMS gives a yellow/current CSS class.
 * 3. If completed stages are green, the first non-green
 *    stage becomes the current stage.
 * 4. If nothing is identifiable, use the first stage.
 */
function getCurrentStatus(stages) {
  if (
    !Array.isArray(stages) ||
    stages.length === 0
  ) {
    return "Unknown";
  }
  const explicitCurrent = stages.find((stage) => {
    const description = String(
      stage?.description || ""
    ).toLowerCase();
    const status = String(
      stage?.status ||
        stage?.stageStatus ||
        stage?.currentStatus ||
        ""
    ).toLowerCase();
    return (
      /current|active|processing|progress|in-progress|in progress/.test(
        `${description} ${status}`
      )
    );
  });
  if (explicitCurrent) {
    return normalizeStageName(
      explicitCurrent.trackingStageName
    );
  }
  const yellowStage = stages.find(
    (stage) => getStageColor(stage) === "YELLOW"
  );
  if (yellowStage) {
    return normalizeStageName(
      yellowStage.trackingStageName
    );
  }
  /*
   * If NAPAMS marks completed stages green,
   * the first stage that isn't green is the current stage.
   */
  const firstNonCompleted = stages.find(
    (stage) => getStageColor(stage) !== "GREEN"
  );
  if (firstNonCompleted) {
    return normalizeStageName(
      firstNonCompleted.trackingStageName
    );
  }
  /*
   * Everything is completed.
   * Use the last completed stage.
   */
  return normalizeStageName(
    stages[stages.length - 1].trackingStageName
  );
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
  console.log(
    "Fetching NAPAMS login page..."
  );
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
  const token =
    getAntiforgeryToken(loginPage.body);
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
  // 2. ADMIN LOGIN
  // ==================================================
  console.log(
    "Submitting Admin login..."
  );
  const form = new URLSearchParams();
  form.append("ReturnUrl", "");
  form.append("Username", tin);
  form.append("Password", password);
  form.append("buttonFunc", "admin");
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
    throw new Error(
      "NAPAMS login failed."
    );
  }
  const authCookies =
    getCookies(
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
  if (applicationsPage.status !== 200) {
    throw new Error(
      "Could not open Applications page."
    );
  }
  const html =
    applicationsPage.body;
  const pageText =
    cleanText(html);
  // ==================================================
  // 4. SUBMITTED APPLICATION COUNT
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
    submittedCount ?? "Unknown"
  );
  // ==================================================
  // 5. FIND SUBMITTED APPLICATION IDs
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
  if (appIDs.length === 0) {
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
  // 6. CHECK EACH SUBMITTED APPLICATION
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
      submittedApplicationNumbers[index] ||
      "Unknown";
    console.log(
      `\nChecking application ${index + 1}...`
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
      console.log(
        "Status request failed."
      );
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
        applicationNumber,
        appID,
        success: false,
        error: "Invalid JSON"
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
      getCurrentStatus(stages);
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
          `  ${stageIndex + 1}. ${colorLabel(
            color
          )} ${stageName}`
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
      applicationNumber,
      appID,
      success: true,
      product,
      currentStatus,
      stages
    });
  }
  // ==================================================
  // 7. FINAL APPLICATION SUMMARY
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
          const marker =
            colorLabel(color);
          console.log(
            `  ${index + 1}. ${marker} ${stageName}`
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
    console.error(error);
    process.exit(1);
  }
);
