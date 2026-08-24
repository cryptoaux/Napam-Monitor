const https = require("https");
const fs = require("fs");
const { execFile } = require("child_process");

/*
 * ============================================================
 * NAPAMS MULTI-COMPANY MONITOR
 * ============================================================
 */

const HOST = "registration.nafdac.gov.ng";

const BASE_URL = `https://${HOST}`;

const LOGIN_PATH = "/Applicant/Login";

const APPLICATIONS_PATH =
  "/Application/FormApplication/Applications";

const COMPANIES_FILE = "companies.json";

const REQUEST_TIMEOUT = 180000;

const MAX_ATTEMPTS = 3;


/*
 * ============================================================
 * CURL REQUEST
 * ============================================================
 *
 * Node's https.request() was repeatedly receiving ECONNRESET
 * from the NAPAMS server.
 *
 * curl from the SAME GitHub Actions runner successfully gets:
 *
 * HTTP/1.1 -> 200
 * HTTP/2   -> 200
 *
 * Therefore all NAPAMS HTTP traffic is handled through curl.
 *
 * This keeps the rest of the monitor in Node.js while using
 * the networking implementation that has already been proven
 * to work against NAPAMS.
 * ============================================================
 */

function request(
  method,
  path,
  headers = {},
  body = null,
  attempt = 1
) {

  return new Promise((resolve, reject) => {

    console.log(
      `HTTP ${method} ${path} (attempt ${attempt}/${MAX_ATTEMPTS})`
    );

    console.log(
      `Node.js version: ${process.version}`
    );

    const url =
      `${BASE_URL}${path}`;

    const args = [
      "--silent",
      "--show-error",
      "--location",
      "--http1.1",
      "--max-time",
      String(Math.ceil(REQUEST_TIMEOUT / 1000)),

      "--request",
      method,

      "--url",
      url,

      "--dump-header",
      "-"
    ];


    /*
     * Headers
     */

    for (
      const [name, value] of Object.entries(headers)
    ) {

      if (
        value === undefined ||
        value === null
      ) {
        continue;
      }

      args.push(
        "--header",
        `${name}: ${value}`
      );

    }


    /*
     * Body
     */

    if (body !== null) {

      args.push(
        "--data",
        body
      );

    }


    console.log(
      `CURL REQUEST: ${method} ${url}`
    );


    execFile(
      "curl",
      args,
      {
        encoding: "utf8",
        maxBuffer: 20 * 1024 * 1024,
        timeout: REQUEST_TIMEOUT + 10000
      },
      (error, stdout, stderr) => {

        if (error) {

          console.error(
            `CURL ERROR: ${error.code || error.message}`
          );

          if (stderr) {

            console.error(
              stderr.trim()
            );

          }


          /*
           * Retry failed requests.
           */

          if (
            attempt <
            MAX_ATTEMPTS
          ) {

            const delay =
              attempt * 3000;

            console.log(
              `Retrying in ${delay / 1000} seconds...`
            );

            setTimeout(() => {

              request(
                method,
                path,
                headers,
                body,
                attempt + 1
              )
                .then(resolve)
                .catch(reject);

            }, delay);

            return;

          }

          reject(error);

          return;

        }


        /*
         * curl output contains:
         *
         * HTTP headers
         *
         * blank line
         *
         * response body
         *
         * Because --location is enabled, there can be more
         * than one header block.
         */

        const parsed =
          parseCurlResponse(
            stdout
          );


        console.log(
          `HTTP RESPONSE: ${parsed.status}`
        );

        console.log(
          `HTTP VERSION: ${parsed.httpVersion || "Unknown"}`
        );

        console.log(
          `RESPONSE SIZE: ${Buffer.byteLength(
            parsed.body,
            "utf8"
          )} bytes`
        );


        resolve(parsed);

      }
    );

  });

}


/*
 * ============================================================
 * PARSE CURL RESPONSE
 * ============================================================
 */

function parseCurlResponse(output) {

  const lines =
    output.split(/\r?\n/);

  let status = 0;

  let httpVersion = "";

  const responseHeaders = {};

  let bodyStart = -1;


  /*
   * Find the final HTTP response header block.
   *
   * curl --location can output multiple response blocks
   * when redirects occur.
   */

  let headerStart = -1;

  for (
    let i = 0;
    i < lines.length;
    i++
  ) {

    if (
      /^HTTP\/\d(?:\.\d)?\s+\d{3}/i.test(
        lines[i]
      )
    ) {

      headerStart = i;

    }

  }


  if (
    headerStart >= 0
  ) {

    const statusLine =
      lines[headerStart];

    const statusMatch =
      statusLine.match(
        /^HTTP\/([0-9.]+)\s+(\d{3})/i
      );

    if (statusMatch) {

      httpVersion =
        statusMatch[1];

      status =
        Number(
          statusMatch[2]
        );

    }


    for (
      let i = headerStart + 1;
      i < lines.length;
      i++
    ) {

      const line =
        lines[i];

      if (
        line.trim() === ""
      ) {

        bodyStart =
          i + 1;

        break;

      }


      const separator =
        line.indexOf(":");

      if (
        separator <= 0
      ) {
        continue;
      }

      const name =
        line
          .slice(0, separator)
          .trim()
          .toLowerCase();

      const value =
        line
          .slice(separator + 1)
          .trim();


      /*
       * Preserve multiple Set-Cookie headers.
       */

      if (
        name === "set-cookie"
      ) {

        if (
          !responseHeaders[name]
        ) {

          responseHeaders[name] = [];

        }

        responseHeaders[name].push(
          value
        );

      } else {

        responseHeaders[name] =
          value;

      }

    }

  }


  /*
   * If headers could not be identified, return the complete
   * output as body so the caller can diagnose the response.
   */

  const body =
    bodyStart >= 0
      ? lines
          .slice(bodyStart)
          .join("\n")
      : output;


  return {
    status,
    headers:
      responseHeaders,
    body,
    httpVersion
  };

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

  const match =
    html.match(
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

    if (
      !/View Status/i.test(row)
    ) {
      continue;
    }

    const matches =
      row.match(
        /\b(?:NF|PEX)-[A-Z]{2}-\d{4,}\b/gi
      ) || [];

    for (const value of matches) {

      const number =
        value.toUpperCase();

      if (
        !numbers.includes(number)
      ) {

        numbers.push(
          number
        );

      }

    }

  }


  /*
   * Fallback.
   */

  if (
    numbers.length === 0
  ) {

    const matches =
      html.match(
        /\b(?:NF|PEX)-[A-Z]{2}-\d{4,}\b/gi
      ) || [];

    for (const value of matches) {

      const number =
        value.toUpperCase();

      if (
        !numbers.includes(number)
      ) {

        numbers.push(
          number
        );

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

      ids[index] =
        id;

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
    String(
      name || ""
    ).trim();

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
        `${BASE_URL}${APPLICATIONS_PATH}`,

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
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
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
          `${BASE_URL}${LOGIN_PATH}`,

        "Origin":
          BASE_URL,

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
   * ASP.NET Core normally redirects after successful login.
   */

  if (
    loginResponse.status !== 302 &&
    loginResponse.status !== 303
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
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
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
      recursive:
        true
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
