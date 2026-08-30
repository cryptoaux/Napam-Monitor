const fs = require("fs");
const { request } = require("./src/http-client");
const {
  getCookies,
  getAntiforgeryToken,
  cleanText,
  extractSubmittedApplicationNumbers,
  extractApplicationIds,
  getStageColor,
  normalizeStageName,
  getCurrentStatus
} = require("./src/parsers");

/*
 * ============================================================
 * NAPAMS MULTI-COMPANY MONITOR
 * ============================================================
 */

const LOGIN_PATH = "/Applicant/Login";

const APPLICATIONS_PATH =
  "/Application/FormApplication/Applications";

const COMPANIES_FILE = "companies.json";


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
 *
 * IMPORTANT:
 *
 * NAPAMS sometimes returns HTTP 400 when logging in even
 * though the credentials are correct.
 *
 * Manually refreshing the login page and logging in again
 * normally fixes it.
 *
 * This function now automatically does the same thing.
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
   * NAPAMS login retry count.
   *
   * Each attempt gets:
   *
   * - a completely fresh login page
   * - a fresh antiforgery token
   * - fresh cookies
   *
   * This is equivalent to manually refreshing
   * the NAPAMS login page before trying again.
   */

  const MAX_LOGIN_ATTEMPTS = 4;

  let cookies = "";

  let authenticated = false;


  for (
    let loginAttempt = 1;
    loginAttempt <= MAX_LOGIN_ATTEMPTS;
    loginAttempt++
  ) {

    console.log(
      `\nLOGIN ATTEMPT ${loginAttempt}/${MAX_LOGIN_ATTEMPTS}`
    );


    /*
     * ========================================================
     * 1. FRESH LOGIN PAGE
     * ========================================================
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
            "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
        }
      );

    console.log(
      "LOGIN PAGE STATUS:",
      loginPage.status
    );

    if (
      loginPage.status !==
      200
    ) {

      console.log(
        `Login page returned HTTP ${loginPage.status}`
      );

      if (
        loginAttempt <
        MAX_LOGIN_ATTEMPTS
      ) {

        const delay =
          loginAttempt * 3000;

        console.log(
          `Refreshing again in ${delay / 1000} seconds...`
        );

        await new Promise(
          (resolve) => {
            setTimeout(
              resolve,
              delay
            );
          }
        );

        continue;

      }

      throw new Error(
        `Could not load NAPAMS login page. HTTP ${loginPage.status}`
      );

    }


    /*
     * ========================================================
     * 2. FRESH ANTIFORGERY TOKEN
     * ========================================================
     */

    const token =
      getAntiforgeryToken(
        loginPage.body
      );


    /*
     * ========================================================
     * 3. FRESH LOGIN COOKIES
     * ========================================================
     */

    const initialCookies =
      getCookies(
        loginPage.headers[
          "set-cookie"
        ]
      );


    if (!token) {

      console.log(
        "Antiforgery token was not found."
      );

      if (
        loginAttempt <
        MAX_LOGIN_ATTEMPTS
      ) {

        console.log(
          "Refreshing login page to obtain a new token..."
        );

        await new Promise(
          (resolve) => {
            setTimeout(
              resolve,
              3000
            );
          }
        );

        continue;

      }

      throw new Error(
        "Antiforgery token was not found after multiple login page refreshes."
      );

    }

    console.log(
      "Fresh antiforgery token obtained."
    );


    /*
     * ========================================================
     * 4. LOGIN FORM
     * ========================================================
     */

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


    /*
     * ========================================================
     * 5. SUBMIT LOGIN
     * ========================================================
     */

    console.log(
      "Submitting Admin login..."
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


    /*
     * ========================================================
     * 6. SUCCESSFUL LOGIN
     * ========================================================
     */

    if (
      loginResponse.status ===
        302 ||
      loginResponse.status ===
        303
    ) {

      const authCookies =
        getCookies(
          loginResponse.headers[
            "set-cookie"
          ]
        );

      cookies = [
        initialCookies,
        authCookies
      ]
        .filter(Boolean)
        .join("; ");

      authenticated = true;

      console.log(
        "Authenticated session established."
      );

      break;

    }


    /*
     * ========================================================
     * 7. HTTP 400
     * ========================================================
     *
     * This is the important fix.
     *
     * Instead of immediately failing, we behave like a user
     * manually refreshing the NAPAMS page and logging in again.
     */

    if (
      loginResponse.status ===
      400
    ) {

      console.log(
        "NAPAMS returned HTTP 400 Bad Request."
      );

      if (
        loginAttempt <
        MAX_LOGIN_ATTEMPTS
      ) {

        const delay =
          loginAttempt * 3000;

        console.log(
          "Refreshing login page and generating a new session..."
        );

        console.log(
          `Retrying login in ${delay / 1000} seconds...`
        );

        await new Promise(
          (resolve) => {
            setTimeout(
              resolve,
              delay
            );
          }
        );

        continue;

      }

      throw new Error(
        `NAPAMS login returned HTTP 400 after ${MAX_LOGIN_ATTEMPTS} fresh login attempts.`
      );

    }


    /*
     * ========================================================
     * 8. OTHER LOGIN ERRORS
     * ========================================================
     */

    throw new Error(
      `NAPAMS login failed. HTTP ${loginResponse.status}`
    );

  }


  /*
   * ==========================================================
   * MAKE SURE LOGIN SUCCEEDED
   * ==========================================================
   */

  if (
    !authenticated ||
    !cookies
  ) {

    throw new Error(
      "NAPAMS login did not establish an authenticated session."
    );

  }


  /*
   * ==========================================================
   * 9. OPEN APPLICATIONS
   * ==========================================================
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
      ] ||
      "Unknown";

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

      continue;

    }

    let data;

    try {

      data =
        JSON.parse(
          response.body
        );

    } catch {

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
      getCurrentStatus(
        stages
      );

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

  console.log(
    `Node.js version: ${process.version}`
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


if (require.main === module) {

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

}

module.exports = {
  getCookies,
  getAntiforgeryToken,
  cleanText,
  extractSubmittedApplicationNumbers,
  extractApplicationIds,
  getStageColor,
  normalizeStageName,
  getCurrentStatus
};
