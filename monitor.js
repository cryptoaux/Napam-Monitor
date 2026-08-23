const https = require("https");
const fs = require("fs");

/*
 * ============================================================
 * NAPAMS MULTI-COMPANY MONITOR
 * ============================================================
 *
 * companies.json must contain:
 *
 * {
 *   "companies": [
 *     {
 *       "id": "company_01",
 *       "name": "Company Name 1",
 *       "tinSecret": "COMPANY_1_TIN",
 *       "passwordSecret": "COMPANY_1_PASSWORD"
 *     }
 *   ]
 * }
 *
 * NAPAMS stage colors:
 *
 * bg-primary  = GREEN / completed
 * bg-warning  = YELLOW / current
 * bg-danger   = RED / pending
 *
 * Credentials are read from GitHub Actions Secrets.
 *
 * TIN and passwords are NEVER written to public/data.json.
 * ============================================================
 */

const HOST = "registration.nafdac.gov.ng";

const LOGIN_PATH = "/Applicant/Login";

const APPLICATIONS_PATH =
  "/Application/FormApplication/Applications";

const COMPANIES_FILE = "companies.json";


/*
 * ============================================================
 * HTTP REQUEST
 * ============================================================
 */

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

      req.destroy(
        new Error("Request timed out.")
      );

    });

    if (body) {
      req.write(body);
    }

    req.end();

  });
}


/*
 * ============================================================
 * COOKIES
 * ============================================================
 */

function getCookies(setCookie) {

  if (!setCookie) {
    return "";
  }

  if (!Array.isArray(setCookie)) {
    setCookie = [setCookie];
  }

  return setCookie
    .map((cookie) => cookie.split(";")[0])
    .join("; ");

}


/*
 * ============================================================
 * ANTIFORGERY TOKEN
 * ============================================================
 */

function getAntiforgeryToken(html) {

  const match = html.match(
    /name=["']__RequestVerificationToken["'][^>]*value=["']([^"']+)["']/i
  );

  return match ? match[1] : null;

}


/*
 * ============================================================
 * TEXT CLEANING
 * ============================================================
 */

function cleanText(value) {

  return String(value || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();

}


/*
 * ============================================================
 * APPLICATION NUMBERS
 * ============================================================
 *
 * NAPAMS application numbers appear in rows containing
 * "View Status".
 *
 * Supported examples:
 *
 * NF-BR-517353
 * PEX-BR-517870
 *
 * We also keep a broader fallback so other NAPAMS product
 * prefixes do not break the monitor.
 * ============================================================
 */

function extractSubmittedApplicationNumbers(html) {

  const numbers = [];

  const rowRegex = /<tr[\s\S]*?<\/tr>/gi;

  const rows = html.match(rowRegex) || [];

  for (const row of rows) {

    if (!/View Status/i.test(row)) {
      continue;
    }

    const matches = row.match(
      /\b(?:NF|PEX)-[A-Z]{2}-\d{4,}\b/gi
    ) || [];

    for (const value of matches) {

      const number = value.toUpperCase();

      if (!numbers.includes(number)) {
        numbers.push(number);
      }

    }

  }

  /*
   * Fallback:
   *
   * If the table structure changes, search the whole page.
   */

  if (numbers.length === 0) {

    const matches = html.match(
      /\b(?:NF|PEX)-[A-Z]{2}-\d{4,}\b/gi
    ) || [];

    for (const value of matches) {

      const number = value.toUpperCase();

      if (!numbers.includes(number)) {
        numbers.push(number);
      }

    }

  }

  return numbers;

}


/*
 * ============================================================
 * APPLICATION IDS
 * ============================================================
 */

function extractApplicationIds(html) {

  const ids = [];

  const regex =
    /id=["']appID_(\d+)["'][^>]*value=["']([^"']+)["']/gi;

  let match;

  while ((match = regex.exec(html)) !== null) {

    const index = Number(match[1]);

    const id = match[2];

    if (!Number.isNaN(index) && id) {
      ids[index] = id;
    }

  }

  return ids.filter(Boolean);

}


/*
 * ============================================================
 * NAPAMS STAGE COLOR
 * ============================================================
 *
 * IMPORTANT:
 *
 * Do NOT determine colors from words such as:
 *
 * "success"
 * "complete"
 * "approved"
 *
 * NAPAMS itself tells us the real state through the
 * Bootstrap class inside `description`.
 *
 * bg-primary -> GREEN
 * bg-warning -> YELLOW
 * bg-danger  -> RED
 *
 * currentStageSet is also authoritative for the current
 * stage.
 * ============================================================
 */

function getStageColor(stage) {

  const description = String(
    stage?.description || ""
  ).toLowerCase();

  /*
   * Current stage.
   *
   * NAPAMS explicitly marks the current stage with
   * currentStageSet = true and normally uses bg-warning.
   */

  if (stage?.currentStageSet === true) {
    return "YELLOW";
  }

  /*
   * Explicit NAPAMS warning class.
   */

  if (/\bbg-warning\b/.test(description)) {
    return "YELLOW";
  }

  /*
   * Explicit NAPAMS danger class.
   */

  if (/\bbg-danger\b/.test(description)) {
    return "RED";
  }

  /*
   * Explicit NAPAMS primary class.
   *
   * In the NAPAMS tracking page this represents a
   * completed/green stage.
   */

  if (/\bbg-primary\b/.test(description)) {
    return "GREEN";
  }

  /*
   * Fallback.
   */

  return "RED";

}


/*
 * ============================================================
 * STAGE NAME
 * ============================================================
 */

function normalizeStageName(name) {

  const value = String(name || "").trim();

  /*
   * NAPAMS has an internal stage with ID 5039 whose name can
   * be empty.
   *
   * Give it a useful public name instead of "Unknown".
   */

  if (!value) {
    return "Internal Review";
  }

  return value
    .replace(/\s+/g, " ")
    .trim();

}


/*
 * ============================================================
 * CURRENT STATUS
 * ============================================================
 *
 * NAPAMS currentStageSet is authoritative.
 * ============================================================
 */

function getCurrentStatus(stages) {

  if (
    !Array.isArray(stages) ||
    stages.length === 0
  ) {
    return "Unknown";
  }

  /*
   * First priority:
   * NAPAMS explicitly says which stage is current.
   */

  const explicitCurrent = stages.find(
    (stage) =>
      stage?.currentStageSet === true
  );

  if (explicitCurrent) {

    return normalizeStageName(
      explicitCurrent.trackingStageName
    );

  }

  /*
   * Second priority:
   * Warning stage.
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
   * Third priority:
   * First stage which is not green.
   */

  const firstNonGreen = stages.find(
    (stage) =>
      getStageColor(stage) !== "GREEN"
  );

  if (firstNonGreen) {

    return normalizeStageName(
      firstNonGreen.trackingStageName
    );

  }

  /*
   * Everything is green.
   */

  return normalizeStageName(
    stages[stages.length - 1].trackingStageName
  );

}


/*
 * ============================================================
 * CHECK APPLICATION STATUS
 * ============================================================
 */

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
 * ============================================================
 * LOAD COMPANIES
 * ============================================================
 */

function loadCompanies() {

  if (!fs.existsSync(COMPANIES_FILE)) {

    throw new Error(
      `Missing ${COMPANIES_FILE}`
    );

  }

  const raw =
    fs.readFileSync(
      COMPANIES_FILE,
      "utf8"
    );

  const parsed =
    JSON.parse(raw);

  /*
   * Support both:
   *
   * 1. New format:
   *    { "companies": [...] }
   *
   * 2. Old format:
   *    [...]
   *
   * This prevents the previous
   * "companies.json must contain an array"
   * error.
   */

  if (Array.isArray(parsed)) {
    return parsed;
  }

  if (
    parsed &&
    Array.isArray(parsed.companies)
  ) {
    return parsed.companies;
  }

  throw new Error(
    "companies.json must contain a companies array."
  );

}


/*
 * ============================================================
 * LOGIN TO ONE COMPANY
 * ============================================================
 */

async function loginCompany(
  company,
  tin,
  password,
  userAgent
) {

  console.log(
    "\n========================================"
  );

  console.log(
    `COMPANY: ${company.name}`
  );

  console.log(
    "========================================"
  );

  /*
   * 1. Login page
   */

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

  /*
   * 2. Login
   */

  console.log(
    "Submitting Admin login..."
  );

  const form =
    new URLSearchParams();

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

  if (
    loginResponse.status !== 302
  ) {

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

  /*
   * 3. Applications page
   */

  console.log(
    "Opening Applications..."
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

  if (
    applicationsPage.status !== 200
  ) {

    throw new Error(
      "Could not open Applications page."
    );

  }

  return {
    cookies,
    html: applicationsPage.body
  };

}


/*
 * ============================================================
 * DEBUG STAGES
 * ============================================================
 */

function logStages(stages) {

  console.log(
    "Tracking stages:"
  );

  stages.forEach(
    (stage, index) => {

      const color =
        getStageColor(stage);

      const emoji =
        color === "GREEN"
          ? "🟢"
          : color === "YELLOW"
          ? "🟡"
          : "🔴";

      console.log(
        `  ${index + 1}. ${emoji} ${normalizeStageName(
          stage.trackingStageName
        )}`
      );

      if (stage.duration) {

        console.log(
          `     Duration: ${stage.duration}`
        );

      }

    }
  );

}


/*
 * ============================================================
 * PROCESS ONE COMPANY
 * ============================================================
 */

async function processCompany(
  company,
  tin,
  password,
  userAgent
) {

  const session =
    await loginCompany(
      company,
      tin,
      password,
      userAgent
    );

  const html =
    session.html;

  const cookies =
    session.cookies;

  const pageText =
    cleanText(html);

  const countMatch =
    pageText.match(
      /Submitted Applications\s+(\d+)/i
    );

  const submittedCount =
    countMatch
      ? Number(countMatch[1])
      : null;

  console.log(
    "SUBMITTED APPLICATIONS:",
    submittedCount ??
      "Unknown"
  );

  /*
   * Application IDs
   */

  const appIDs =
    extractApplicationIds(html);

  /*
   * Application numbers
   */

  const submittedApplicationNumbers =
    extractSubmittedApplicationNumbers(
      html
    );

  console.log(
    "Application IDs found:",
    appIDs.length
  );

  console.log(
    "Application numbers found:",
    submittedApplicationNumbers.length
  );

  submittedApplicationNumbers.forEach(
    (number, index) => {

      console.log(
        `${index + 1}. ${number}`
      );

    }
  );

  if (appIDs.length === 0) {

    throw new Error(
      "No appID values were found."
    );

  }

  const results = [];

  /*
   * Check every application.
   */

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
        "ERROR:",
        `HTTP ${response.status}`
      );

      continue;

    }

    let data;

    try {

      data =
        JSON.parse(
          response.body
        );

    } catch (error) {

      console.log(
        "ERROR: Invalid JSON"
      );

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

    /*
     * Find the actual current stage.
     */

    const currentStage =
      stages.find(
        (stage) =>
          stage?.currentStageSet === true
      ) ||
      stages.find(
        (stage) =>
          getStageColor(stage) === "YELLOW"
      );

    const currentStatusColor =
      currentStage
        ? getStageColor(currentStage)
        : stages.length > 0
        ? getStageColor(
            stages[
              stages.length - 1
            ]
          )
        : "RED";

    console.log(
      "Product:",
      product
    );

    console.log(
      "CURRENT STATUS:",
      currentStatus
    );

    console.log(
      "CURRENT COLOR:",
      currentStatusColor
    );

    logStages(stages);

    /*
     * Save the company name with every application.
     *
     * This allows the website to group applications
     * by company instead of treating every product as
     * a separate company.
     */

    results.push({

      companyId:
        company.id,

      companyName:
        company.name,

      applicationNumber,

      appID,

      success: true,

      product,

      currentStatus,

      currentStatusColor,

      stages

    });

  }

  return results;

}


/*
 * ============================================================
 * SAVE WEBSITE DATA
 * ============================================================
 */

function saveWebsiteData(results) {

  const successfulResults =
    results
      .filter(
        (result) =>
          result.success
      )
      .map(
        (result) => {

          const stages =
            Array.isArray(
              result.stages
            )
              ? result.stages
              : [];

          return {

            companyId:
              result.companyId,

            companyName:
              result.companyName,

            applicationNumber:
              result.applicationNumber,

            appID:
              result.appID,

            name:
              result.product,

            product:
              result.product,

            currentStatus:
              result.currentStatus,

            currentStatusColor:
              result.currentStatusColor,

            stages:
              stages.map(
                (stage) => ({

                  name:
                    normalizeStageName(
                      stage.trackingStageName
                    ),

                  color:
                    getStageColor(stage),

                  napamsDescription:
                    stage.description ||
                    "",

                  status:
                    stage.status ||
                    stage.stageStatus ||
                    stage.currentStatus ||
                    "",

                  duration:
                    stage.duration ||
                    "",

                  trackingApplicationStage:
                    stage.trackingApplicationStage,

                  currentStageSet:
                    stage.currentStageSet === true

                })
              )

          };

        }
      );

  /*
   * Group applications by company.
   *
   * This makes the structure much easier for the
   * website to render:
   *
   * companies
   *   └── applications
   */

  const companyMap =
    new Map();

  for (
    const application of successfulResults
  ) {

    const companyKey =
      application.companyId ||
      application.companyName;

    if (
      !companyMap.has(companyKey)
    ) {

      companyMap.set(
        companyKey,
        {
          id:
            application.companyId,

          name:
            application.companyName,

          applications: []
        }
      );

    }

    companyMap
      .get(companyKey)
      .applications
      .push(application);

  }

  const companies =
    Array.from(
      companyMap.values()
    );

  const data = {

    updatedAt:
      new Date().toISOString(),

    totalCompanies:
      companies.length,

    totalApplications:
      successfulResults.length,

    companies,

    /*
     * Keep the flat applications array for backwards
     * compatibility with the current website.
     */

    applications:
      successfulResults

  };

  fs.mkdirSync(
    "public",
    {
      recursive: true
    }
  );

  fs.writeFileSync(
    "public/data.json",
    JSON.stringify(
      data,
      null,
      2
    ),
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
    `Companies processed: ${companies.length}`
  );

  console.log(
    `Applications saved: ${successfulResults.length}`
  );

  console.log(
    "File: public/data.json"
  );

  console.log(
    `Updated: ${data.updatedAt}`
  );

}


/*
 * ============================================================
 * MAIN
 * ============================================================
 */

async function main() {

  const companies =
    loadCompanies();

  const userAgent =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
    "AppleWebKit/537.36 (KHTML, like Gecko) " +
    "Chrome/131.0.0.0 Safari/537.36";

  const allResults = [];

  console.log(
    "\n========================================"
  );

  console.log(
    "NAPAMS MULTI-COMPANY MONITOR"
  );

  console.log(
    "========================================"
  );

  console.log(
    `Companies configured: ${companies.length}`
  );

  /*
   * Process companies one by one.
   */

  for (
    const company of companies
  ) {

    console.log(
      `\nProcessing: ${company.name}`
    );

    /*
     * Read credentials using the names specified
     * in companies.json.
     */

    const tin =
      company.tinSecret
        ? process.env[
            company.tinSecret
          ]
        : null;

    const password =
      company.passwordSecret
        ? process.env[
            company.passwordSecret
          ]
        : null;

    if (
      !tin ||
      !password
    ) {

      console.log(
        `SKIPPING ${company.name}`
      );

      console.log(
        "Credentials have not been added yet."
      );

      continue;

    }

    try {

      const results =
        await processCompany(
          company,
          tin,
          password,
          userAgent
        );

      allResults.push(
        ...results
      );

      console.log(
        `Finished: ${company.name}`
      );

    } catch (error) {

      console.error(
        `FAILED: ${company.name}`
      );

      console.error(
        error.message
      );

    }

  }

  /*
   * Save combined website data.
   */

  saveWebsiteData(
    allResults
  );

  console.log(
    "\n========================================"
  );

  console.log(
    "MONITOR COMPLETE"
  );

  console.log(
    "========================================"
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
