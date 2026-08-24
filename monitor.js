const https = require("https");
const fs = require("fs");

/*
 * ============================================================
 * NAPAMS MULTI-COMPANY MONITOR
 * ============================================================
 */

const HOST = "registration.nafdac.gov.ng";

const LOGIN_PATH = "/Applicant/Login";

const APPLICATIONS_PATH =
  "/Application/FormApplication/Applications";

const COMPANIES_FILE = "companies.json";

/*
 * ============================================================
 * HTTPS AGENT
 * ============================================================
 *
 * Force IPv4.
 *
 * GitHub Actions can sometimes experience connection problems
 * when Node attempts IPv6 first against the NAPAMS server.
 */

const httpsAgent = new https.Agent({
  keepAlive: true,
  family: 4,
  maxSockets: 10,
  maxFreeSockets: 5,
  timeout: 120000
});

/*
 * ============================================================
 * HTTP REQUEST WITH RETRIES
 * ============================================================
 */

function request(
  method,
  path,
  headers = {},
  body = null,
  attempt = 1
) {

  const MAX_ATTEMPTS = 3;

  return new Promise((resolve, reject) => {

    console.log(
      `HTTP ${method} ${path} (attempt ${attempt}/${MAX_ATTEMPTS})`
    );

    const req = https.request(
      {
        hostname: HOST,
        port: 443,
        path,
        method,

        /*
         * Force IPv4.
         */
        family: 4,

        agent: httpsAgent,

        headers: {
          Connection: "keep-alive",
          ...headers
        },

        /*
         * Give NAPAMS more time to respond.
         */
        timeout: 120000,

        servername: HOST
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

    req.on("error", async (error) => {

      console.error(
        `HTTP ERROR: ${error.code || error.message}`
      );

      /*
       * Retry connection failures and timeouts.
       */

      if (attempt < MAX_ATTEMPTS) {

        const delay =
          attempt * 3000;

        console.log(
          `Retrying in ${delay / 1000} seconds...`
        );

        setTimeout(
          async () => {

            try {

              const result =
                await request(
                  method,
                  path,
                  headers,
                  body,
                  attempt + 1
                );

              resolve(result);

            } catch (retryError) {

              reject(retryError);

            }

          },
          delay
        );

        return;

      }

      reject(error);

    });

    req.on("timeout", () => {

      console.error(
        `REQUEST TIMEOUT after 120 seconds`
      );

      req.destroy(
        new Error(
          "NAPAMS request timed out after 120 seconds."
        )
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
    .map(
      (cookie) =>
        cookie.split(";")[0]
    )
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

  return match
    ? match[1]
    : null;

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
 */

function extractSubmittedApplicationNumbers(html) {

  const numbers = [];

  const rowRegex =
    /<tr[\s\S]*?<\/tr>/gi;

  const rows =
    html.match(rowRegex) || [];

  for (const row of rows) {

    if (!/View Status/i.test(row)) {
      continue;
    }

    const matches =
      row.match(
        /\b(?:NF|PEX)-[A-Z]{2}-\d{4,}\b/gi
      ) || [];

    for (const value of matches) {

      const number =
        value.toUpperCase();

      if (!numbers.includes(number)) {
        numbers.push(number);
      }

    }

  }

  /*
   * Fallback.
   */

  if (numbers.length === 0) {

    const matches =
      html.match(
        /\b(?:NF|PEX)-[A-Z]{2}-\d{4,}\b/gi
      ) || [];

    for (const value of matches) {

      const number =
        value.toUpperCase();

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

  while (
    (match = regex.exec(html)) !== null
  ) {

    const index =
      Number(match[1]);

    const id =
      match[2];

    if (
      !Number.isNaN(index) &&
      id
    ) {

      ids[index] = id;

    }

  }

  return ids.filter(Boolean);

}


/*
 * ============================================================
 * NAPAMS STAGE COLOR
 * ============================================================
 */

function getStageColor(stage) {

  const description =
    String(
      stage?.description || ""
    ).toLowerCase();

  /*
   * Current stage is authoritative.
   */

  if (
    stage?.currentStageSet === true
  ) {

    return "YELLOW";

  }

  if (
    /\bbg-warning\b/.test(
      description
    )
  ) {

    return "YELLOW";

  }

  if (
    /\bbg-danger\b/.test(
      description
    )
  ) {

    return "RED";

  }

  if (
    /\bbg-primary\b/.test(
      description
    )
  ) {

    return "GREEN";

  }

  return "RED";

}


/*
 * ============================================================
 * STAGE NAME
 * ============================================================
 */

function normalizeStageName(name) {

  const value =
    String(name || "").trim();

  /*
   * Internal NAPAMS stage 5039.
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
 */

function getCurrentStatus(stages) {

  if (
    !Array.isArray(stages) ||
    stages.length === 0
  ) {

    return "Unknown";

  }

  /*
   * Explicit current stage.
   */

  const explicitCurrent =
    stages.find(
      (stage) =>
        stage?.currentStageSet === true
    );

  if (explicitCurrent) {

    return normalizeStageName(
      explicitCurrent.trackingStageName
    );

  }

  /*
   * Warning stage.
   */

  const yellowStage =
    stages.find(
      (stage) =>
        getStageColor(stage) ===
        "YELLOW"
    );

  if (yellowStage) {

    return normalizeStageName(
      yellowStage.trackingStageName
    );

  }

  /*
   * First non-green stage.
   */

  const firstNonGreen =
    stages.find(
      (stage) =>
        getStageColor(stage) !==
        "GREEN"
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
    stages[
      stages.length - 1
    ].trackingStageName
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
      "User-Agent":
        userAgent,

      "Cookie":
        cookies,

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

  if (
    !fs.existsSync(
      COMPANIES_FILE
    )
  ) {

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

  if (
    Array.isArray(parsed)
  ) {

    return parsed;

  }

  if (
    parsed &&
    Array.isArray(
      parsed.companies
    )
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
        "User-Agent":
          userAgent,

        "Accept":
          "text/html"
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
      loginPage.headers[
        "set-cookie"
      ]
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
        "User-Agent":
          userAgent,

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
    loginResponse.status !==
    302
  ) {

    throw new Error(
      `NAPAMS login failed. HTTP ${loginResponse.status}`
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
        "User-Agent":
          userAgent,

        "Cookie":
          cookies,

        "Accept":
          "text/html"
      }
    );

  console.log(
    "APPLICATIONS STATUS:",
    applicationsPage.status
  );

  if (
    applicationsPage.status !==
    200
  ) {

    throw new Error(
      `Could not open Applications page. HTTP ${applicationsPage.status}`
    );

  }

  return {
    cookies,
    html:
      applicationsPage.body
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

      if (
        stage.duration
      ) {

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
      ? Number(
          countMatch[1]
        )
      : null;

  console.log(
    "SUBMITTED APPLICATIONS:",
    submittedCount ??
      "Unknown"
  );

  const appIDs =
    extractApplicationIds(
      html
    );

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

  if (
    appIDs.length === 0
  ) {

    throw new Error(
      "No appID values were found."
    );

  }

  const results = [];

  /*
   * Check every application.
   *
   * IMPORTANT:
   *
   * A failure on one application no longer
   * causes the entire company to fail.
   */

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
      `\nChecking application ${index + 1}...`
    );

    console.log(
      "Application Number:",
      applicationNumber
    );

    let response;

    try {

      response =
        await checkApplicationStatus(
          appID,
          cookies,
          userAgent
        );

    } catch (error) {

      console.error(
        `APPLICATION FAILED: ${applicationNumber}`
      );

      console.error(
        error.message
      );

      /*
       * Continue to the next application.
       */

      continue;

    }

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

      /*
       * Do not stop the company.
       */

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

      /*
       * Continue to next application.
       */

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

    /*
     * Find actual current stage.
     */

    const currentStage =
      stages.find(
        (stage) =>
          stage?.currentStageSet ===
          true
      ) ||
      stages.find(
        (stage) =>
          getStageColor(stage) ===
          "YELLOW"
      );

    const currentStatusColor =
      currentStage
        ? getStageColor(
            currentStage
          )
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

    logStages(
      stages
    );

    results.push({

      companyId:
        company.id,

      companyName:
        company.name,

      applicationNumber,

      appID,

      success:
        true,

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

function saveWebsiteData(
  results
) {

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
                    getStageColor(
                      stage
                    ),

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
                    stage.currentStageSet ===
                    true

                })
              )

          };

        }
      );

  /*
   * Group applications by company.
   */

  const companyMap =
    new Map();

  for (
    const application of
    successfulResults
  ) {

    const companyKey =
      application.companyId ||
      application.companyName;

    if (
      !companyMap.has(
        companyKey
      )
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
      .push(
        application
      );

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
     * Backwards compatibility.
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

      /*
       * Continue to the next company.
       */

      continue;

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


/*
 * ============================================================
 * START
 * ============================================================
 */

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
