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
 * HTTP REQUEST
 * ============================================================
 */
function request(
  method,
  path,
  headers = {},
  body = null
) {
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
    /name="__RequestVerificationToken"[^>]*value="([^"]+)"/i
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
 * REGEX ESCAPE
 * ============================================================
 */
function escapeRegExp(value) {
  return String(value).replace(
    /[.*+?^${}()|[\]\\]/g,
    "\\$&"
  );
}
/*
 * ============================================================
 * APPLICATION NUMBERS
 * ============================================================
 *
 * FIX:
 *
 * The previous version depended on "View Status"
 * being present in the same table row.
 *
 * That caused:
 *
 * Application Number: Unknown
 *
 * even though the application IDs were found.
 *
 * This version matches each appID to the surrounding
 * HTML and searches for the corresponding NF-FD/PEX-FD
 * application number.
 * ============================================================
 */
function extractSubmittedApplicationNumbers(
  html,
  appIDs
) {
  const numbers = [];
  for (
    let index = 0;
    index < appIDs.length;
    index++
  ) {
    const appID =
      String(appIDs[index] || "");
    if (!appID) {
      numbers.push(null);
      continue;
    }
    /*
     * Find the appID input.
     *
     * We don't assume id and value are in a
     * particular attribute order.
     */
    const inputRegex =
      new RegExp(
        `<input[^>]*id=["']appID_${index}["'][^>]*>`,
        "i"
      );
    const inputMatch =
      html.match(inputRegex);
    let position = -1;
    if (inputMatch) {
      position =
        inputMatch.index || -1;
    } else {
      /*
       * Fallback: search for the literal appID.
       */
      const literalPosition =
        html.indexOf(appID);
      position =
        literalPosition;
    }
    if (position < 0) {
      numbers.push(null);
      continue;
    }
    /*
     * First try to find the application number
     * inside the nearest table row.
     */
    const before =
      html.substring(0, position);
    const after =
      html.substring(position);
    const rowStart =
      before.lastIndexOf("<tr");
    const rowEndRelative =
      after.search(/<\/tr>/i);
    if (
      rowStart >= 0 &&
      rowEndRelative >= 0
    ) {
      const rowEnd =
        position + rowEndRelative + 5;
      const row =
        html.substring(
          rowStart,
          rowEnd
        );
      const rowMatch =
        row.match(
          /\b((?:NF-FD|PEX-FD)-\d+)\b/i
        );
      if (rowMatch) {
        numbers.push(
          rowMatch[1].toUpperCase()
        );
        continue;
      }
    }
    /*
     * Second attempt:
     * Search a large area around the appID.
     */
    const start =
      Math.max(
        0,
        position - 10000
      );
    const end =
      Math.min(
        html.length,
        position + 10000
      );
    const surroundingHTML =
      html.substring(
        start,
        end
      );
    const match =
      surroundingHTML.match(
        /\b((?:NF-FD|PEX-FD)-\d+)\b/i
      );
    if (match) {
      numbers.push(
        match[1].toUpperCase()
      );
    } else {
      numbers.push(null);
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
  /*
   * Normal format:
   *
   * id="appID_0" value="123"
   */
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
  /*
   * Fallback for pages where value appears
   * before the id.
   */
  if (ids.filter(Boolean).length === 0) {
    const fallbackRegex =
      /<input[^>]*value=["']([^"']+)["'][^>]*id=["']appID_(\d+)["'][^>]*>/gi;
    while (
      (match = fallbackRegex.exec(html)) !== null
    ) {
      const id =
        match[1];
      const index =
        Number(match[2]);
      if (
        !Number.isNaN(index) &&
        id
      ) {
        ids[index] = id;
      }
    }
  }
  return ids.filter(Boolean);
}
/*
 * ============================================================
 * STAGE NAME
 * ============================================================
 */
function normalizeStageName(name) {
  return String(
    name || "Unknown"
  )
    .replace(/\s+/g, " ")
    .trim();
}
/*
 * ============================================================
 * STAGE COLOR
 * ============================================================
 */
function getStageColor(stage) {
  const description =
    String(
      stage?.description || ""
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
   * Completed.
   */
  if (
    /success|complete|completed|approved|green/.test(
      combined
    )
  ) {
    return "GREEN";
  }
  /*
   * Current / active.
   */
  if (
    /warning|current|active|processing|progress|in-progress|in progress|orange|yellow/.test(
      combined
    )
  ) {
    return "YELLOW";
  }
  /*
   * Pending.
   */
  return "RED";
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
    stages.find((stage) => {
      const description =
        String(
          stage?.description || ""
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
    });
  if (explicitCurrent) {
    return normalizeStageName(
      explicitCurrent.trackingStageName
    );
  }
  /*
   * Yellow stage.
   */
  const yellowStage =
    stages.find(
      (stage) =>
        getStageColor(stage) === "YELLOW"
    );
  if (yellowStage) {
    return normalizeStageName(
      yellowStage.trackingStageName
    );
  }
  /*
   * First incomplete stage.
   */
  const firstNonCompleted =
    stages.find(
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
    JSON.parse(raw);
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
   * Login page.
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
   * Login.
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
   * Applications page.
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
    cleanText(html);
  /*
   * Submitted count.
   */
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
   * Application IDs.
   */
  const appIDs =
    extractApplicationIds(
      html
    );
  /*
   * FIX:
   *
   * Application numbers are now extracted
   * using the application IDs.
   */
  const submittedApplicationNumbers =
    extractSubmittedApplicationNumbers(
      html,
      appIDs
    );
  console.log(
    "Application IDs found:",
    appIDs.length
  );
  console.log(
    "Application numbers found:",
    submittedApplicationNumbers.filter(
      Boolean
    ).length
  );
  /*
   * Display extracted numbers in the log.
   */
  submittedApplicationNumbers.forEach(
    (number, index) => {
      console.log(
        `${index + 1}. ${
          number || "Unknown"
        }`
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
   * Check each application.
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
    /*
     * Current stage.
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
    console.log(
      "CURRENT COLOR:",
      currentStatusColor
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
          getStageColor(
            stage
          );
        console.log(
          `  ${
            stageIndex + 1
          }. ${color} ${stageName}`
        );
        if (
          stage.duration
        ) {
          console.log(
            `     Duration: ${
              stage.duration
            }`
          );
        }
      }
    );
    /*
     * IMPORTANT:
     * Keep company name and application number
     * in the generated data.
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
    `Companies configured: ${
      companies.length
    }`
  );
  /*
   * Process companies one by one.
   */
  for (
    const company of companies
  ) {
    console.log(
      `\n\nProcessing: ${
        company.name
      }`
    );
    /*
     * Read credentials from GitHub Secrets.
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
     * Skip companies without credentials.
     */
    if (
      !tin ||
      !password
    ) {
      console.log(
        `SKIPPING ${
          company.name
        }`
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
        `Finished: ${
          company.name
        }`
      );
    } catch (
      error
    ) {
      console.error(
        `FAILED: ${
          company.name
        }`
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
    process.exit(
      1
    );
  }
);
