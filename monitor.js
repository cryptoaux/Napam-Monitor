const https = require("https");
const fs = require("fs");

/*
 * ============================================================
 * NAPAMS MULTI-COMPANY MONITOR
 * ============================================================
 *
 * Companies are configured in:
 *
 * companies.json
 *
 * Credentials are NOT stored in this file.
 *
 * Credentials come from GitHub Actions Secrets.
 *
 * The website only receives:
 *
 * Company Name
 * Application Number
 * Product
 * Current Status
 * Status Stages
 *
 * TIN and passwords are NEVER written to public/data.json.
 * ============================================================
 */

const HOST =
  "registration.nafdac.gov.ng";

const LOGIN_PATH =
  "/Applicant/Login";

const APPLICATIONS_PATH =
  "/Application/FormApplication/Applications";

const COMPANIES_FILE =
  "companies.json";


/*
 * ============================================================
 * HTTP REQUEST
 * ============================================================
 */

function request(
  method,
  path,
  headers = {},
  body = null
) {
  return new Promise(
    (resolve, reject) => {

      const req =
        https.request(
          {
            hostname: HOST,
            path,
            method,
            headers,
            timeout: 60000
          },
          (res) => {

            let data = "";

            res.setEncoding(
              "utf8"
            );

            res.on(
              "data",
              (chunk) => {
                data += chunk;
              }
            );

            res.on(
              "end",
              () => {

                resolve({
                  status:
                    res.statusCode,

                  headers:
                    res.headers,

                  body:
                    data
                });

              }
            );

          }
        );


      req.on(
        "error",
        reject
      );


      req.on(
        "timeout",
        () => {

          req.destroy(
            new Error(
              "Request timed out."
            )
          );

        }
      );


      if (body) {
        req.write(body);
      }


      req.end();

    }
  );
}


/*
 * ============================================================
 * COOKIES
 * ============================================================
 */

function getCookies(
  setCookie
) {

  if (!setCookie) {
    return "";
  }

  if (!Array.isArray(setCookie)) {
    setCookie = [
      setCookie
    ];
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

function getAntiforgeryToken(
  html
) {

  const match =
    html.match(
      /name="__RequestVerificationToken"[^>]*value="([^"]+)"/i
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

function cleanText(
  value
) {

  return String(
    value || ""
  )
    .replace(
      /<[^>]+>/g,
      " "
    )
    .replace(
      /&nbsp;/gi,
      " "
    )
    .replace(
      /&amp;/gi,
      "&"
    )
    .replace(
      /\s+/g,
      " "
    )
    .trim();

}


/*
 * ============================================================
 * HIDDEN INPUT
 * ============================================================
 */

function extractHiddenValue(
  html,
  id
) {

  const regex =
    new RegExp(
      `<input[^>]+id=["']${id}["'][^>]+value=["']([^"']+)["']`,
      "i"
    );

  const match =
    html.match(
      regex
    );

  return match
    ? match[1]
    : null;

}


/*
 * ============================================================
 * APPLICATION NUMBERS
 * ============================================================
 */

function extractSubmittedApplicationNumbers(
  html
) {

  const numbers = [];

  const rowRegex =
    /<tr[\s\S]*?<\/tr>/gi;

  const rows =
    html.match(
      rowRegex
    ) || [];


  for (
    const row of rows
  ) {

    if (
      !/View Status/i.test(
        row
      )
    ) {
      continue;
    }


    const match =
      row.match(
        /((?:NF-FD|PEX-FD)-\d+)/i
      );


    if (!match) {
      continue;
    }


    const number =
      match[1].toUpperCase();


    if (
      !numbers.includes(
        number
      )
    ) {
      numbers.push(
        number
      );
    }

  }


  return numbers;

}


/*
 * ============================================================
 * APPLICATION IDS
 * ============================================================
 */

function extractApplicationIds(
  html
) {

  const ids = [];

  const regex =
    /id=["']appID_(\d+)["'][^>]*value=["']([^"']+)["']/gi;

  let match;


  while (
    (match = regex.exec(html)) !== null
  ) {

    const index =
      Number(
        match[1]
      );

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


  return ids.filter(
    Boolean
  );

}


/*
 * ============================================================
 * STAGE NAME
 * ============================================================
 */

function normalizeStageName(
  name
) {

  return String(
    name || "Unknown"
  )
    .replace(
      /\s+/g,
      " "
    )
    .trim();

}


/*
 * ============================================================
 * STAGE COLOR
 * ============================================================
 */

function getStageColor(
  stage
) {

  const description =
    String(
      stage?.description ||
      ""
    ).toLowerCase();


  const status =
    String(
      stage?.status ||
      stage?.stageStatus ||
      stage?.currentStatus ||
      ""
    ).toLowerCase();


  const combined =
    `${description} ${status}`;


  /*
   * Completed
   */

  if (
    /success|complete|completed|approved|green/.test(
      combined
    )
  ) {

    return "GREEN";

  }


  /*
   * Current / active
   */

  if (
    /warning|current|active|processing|progress|in-progress|in progress|orange|yellow/.test(
      combined
    )
  ) {

    return "YELLOW";

  }


  /*
   * Pending
   */

  return "RED";

}


/*
 * ============================================================
 * CURRENT STATUS
 * ============================================================
 */

function getCurrentStatus(
  stages
) {

  if (
    !Array.isArray(
      stages
    ) ||
    stages.length === 0
  ) {

    return "Unknown";

  }


  /*
   * Explicit current stage
   */

  const explicitCurrent =
    stages.find(
      (stage) => {

        const description =
          String(
            stage?.description ||
            ""
          ).toLowerCase();


        const status =
          String(
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


  if (
    explicitCurrent
  ) {

    return normalizeStageName(
      explicitCurrent.trackingStageName
    );

  }


  /*
   * Yellow stage
   */

  const yellowStage =
    stages.find(
      (stage) =>
        getStageColor(
          stage
        ) === "YELLOW"
    );


  if (
    yellowStage
  ) {

    return normalizeStageName(
      yellowStage.trackingStageName
    );

  }


  /*
   * First incomplete stage
   */

  const firstNonCompleted =
    stages.find(
      (stage) =>
        getStageColor(
          stage
        ) !== "GREEN"
    );


  if (
    firstNonCompleted
  ) {

    return normalizeStageName(
      firstNonCompleted.trackingStageName
    );

  }


  /*
   * Everything completed
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


  const companies =
    JSON.parse(
      raw
    );


  if (
    !Array.isArray(
      companies
    )
  ) {

    throw new Error(
      "companies.json must contain an array."
    );

  }


  return companies;

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
    `\n========================================`
  );

  console.log(
    `COMPANY: ${company.name}`
  );

  console.log(
    `========================================`
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
    applicationsPage.status !== 200
  ) {

    throw new Error(
      "Could not open Applications page."
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
    cleanText(
      html
    );


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


  /*
   * Application IDs
   */

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


  if (
    appIDs.length === 0
  ) {

    throw new Error(
      "No appID values were found."
    );

  }


  const results = [];


  /*
   * Check each application
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

    } catch (
      error
    ) {

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


    /*
     * Current stage
     */

    const currentStage =
      stages.find(
        (stage) => {

          const description =
            String(
              stage?.description ||
              ""
            ).toLowerCase();


          const status =
            String(
              stage?.status ||
              stage?.stageStatus ||
              stage?.currentStatus ||
              ""
            ).toLowerCase();


          return /current|active|processing|progress|in-progress|in progress/.test(
            `${description} ${status}`
          );

        }
      ) ||
      stages.find(
        (stage) =>
          getStageColor(
            stage
          ) === "YELLOW"
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
        : "YELLOW";


    console.log(
      "Product:",
      product
    );


    console.log(
      "CURRENT STATUS:",
      currentStatus
    );


    /*
     * IMPORTANT:
     * Company name is added here.
     *
     * This is what allows the website
     * to group applications correctly.
     */

    results.push({

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
        (result) => ({

          companyName:
            result.companyName,

          applicationNumber:
            result.applicationNumber,

          name:
            result.product,

          currentStatus:
            result.currentStatus,

          currentStatusColor:
            result.currentStatusColor,

          stages:
            result.stages.map(
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
                  ""

              })
            )

        })
      );


  const data = {

    updatedAt:
      new Date().toISOString(),

    totalApplications:
      successfulResults.length,

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
    `Companies processed: ${
      new Set(
        successfulResults.map(
          (item) =>
            item.companyName
        )
      ).size
    }`
  );


  console.log(
    `Applications saved: ${
      successfulResults.length
    }`
  );


  console.log(
    "File: public/data.json"
  );


  console.log(
    `Updated: ${
      data.updatedAt
    }`
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
      `\n\nProcessing: ${company.name}`
    );


    /*
     * Each company tells the monitor
     * which GitHub Secret contains its
     * TIN and password.
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


    /*
     * Credentials can be added later.
     *
     * The monitor will simply skip
     * companies that do not have them yet.
     */

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


    } catch (
      error
    ) {

      console.error(
        `FAILED: ${company.name}`
      );


      console.error(
        error.message
      );

    }

  }


  /*
   * Save combined data.
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


    process.exit(
      1
    );

  }
);
:::
