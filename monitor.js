const fs = require("fs");
const logger = require("./src/logger");
const {
  initializeErrorTracking,
  captureException,
  flushErrorTracking
} = require("./src/error-tracker");
const { NapamsConfigError, NapamsParseError } = require("./src/errors");
const { getStructuredCompanyCredentials } = require("./src/config-loader");
const { loginCompany } = require("./src/login");
const { checkApplicationStatus } = require("./src/status-checker");
const { companiesSchema, applicationStatusSchema } = require("./src/schemas");
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
const { buildOutputStructure } = require("./src/result-processor");
const MonitorRun = require("./src/monitor-run");

/*
 * ============================================================
 * NAPAMS MULTI-COMPANY MONITOR
 * ============================================================
 */

const COMPANIES_FILE = "companies.json";

/*
 * ============================================================
 * LOAD COMPANIES
 * ============================================================
 */

function loadCompanies(filePath = COMPANIES_FILE) {

  if (
    !fs.existsSync(
      filePath
    )
  ) {

    throw new NapamsConfigError(
      "COMPANY_CONFIG_INVALID",
      `Missing ${filePath}`
    );

  }

  let raw;

  try {
    raw = fs.readFileSync(filePath, "utf8");
  } catch (error) {
    throw new NapamsConfigError(
      "COMPANY_CONFIG_INVALID",
      `Could not read ${filePath}: ${error.message}`
    );
  }

  let parsed;

  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new NapamsConfigError(
      "COMPANY_CONFIG_INVALID",
      `Invalid JSON in ${filePath}: ${error.message}`
    );
  }

  const candidates =
    Array.isArray(parsed)
      ? parsed
      : parsed &&
        Array.isArray(parsed.companies)
      ? parsed.companies
      : null;

  if (!candidates) {
    throw new NapamsConfigError(
      "CONFIG_SCHEMA_INVALID",
      "companies.json must contain a companies array."
    );
  }

  const result = companiesSchema.safeParse(candidates);

  if (!result.success) {
    throw new NapamsConfigError(
      "CONFIG_SCHEMA_INVALID",
      `Invalid company configuration in ${filePath}: ${result.error.issues
        .map((issue) => `${issue.path.join(".") || "root"}: ${issue.message}`)
        .join("; ")}`
    );
  }

  return result.data;

}



/**
 * @param {Array<{ trackingStageName?: string, description?: string, status?: string, stageStatus?: string, currentStatus?: string, duration?: string | number | null, trackingApplicationStage?: string | number | null, currentStageSet?: boolean }>} stages
 */
function logStages(stages) {

  logger.info({ stageCount: stages.length }, "Tracking stages");

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

      logger.info(
        {
          stageIndex: index + 1,
          emoji,
          stageName: normalizeStageName(stage.trackingStageName),
          duration: stage.duration || null,
          color
        },
        "Stage status"
      );

    }
  );

}


/*
 * ============================================================
 * PROCESS ONE COMPANY
 * ============================================================
 */

/**
 * @param {{ id: string, name: string, tinSecret?: string, passwordSecret?: string }} company
 * @param {string} tin
 * @param {string} password
 * @param {string} userAgent
 * @returns {Promise<Array<{ companyId?: string, companyName?: string, applicationNumber?: string, appID?: string, success?: boolean, product?: string, currentStatus?: string, currentStatusColor?: string, stages?: Array<{ trackingStageName?: string, description?: string, status?: string, stageStatus?: string, currentStatus?: string, duration?: string | number | null, trackingApplicationStage?: string | number | null, currentStageSet?: boolean }> }>>}
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

  logger.info(
    { company: company.name, submittedApplications: submittedCount ?? "Unknown" },
    "Submitted applications count"
  );


  const appIDs =
    extractApplicationIds(
      html
    );

  const submittedApplicationNumbers =
    extractSubmittedApplicationNumbers(
      html
    );

  logger.info(
    {
      company: company.name,
      applicationIdsFound: appIDs.length,
      applicationNumbersFound: submittedApplicationNumbers.length
    },
    "Application discovery summary"
  );

  submittedApplicationNumbers.forEach((number, index) => {
    logger.info(
      { company: company.name, applicationIndex: index + 1, applicationNumber: number },
      "Discovered submitted application number"
    );
  });

  if (
    appIDs.length === 0
  ) {

    throw new NapamsParseError(
      "APPLICATION_ID_MISSING",
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

    logger.info(
      { company: company.name, applicationIndex: index + 1, applicationNumber },
      "Checking application"
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

      logger.error(
        {
          company: company.name,
          applicationNumber,
          errorCode: error?.code,
          err: error,
          error: { message: error?.message }
        },
        "Application status check failed"
      );

      continue;

    }

    logger.info(
      { company: company.name, applicationNumber, statusCode: response.status },
      "Status endpoint HTTP response"
    );

    if (
      response.status < 200 ||
      response.status >= 300
    ) {

      logger.warn(
        { company: company.name, applicationNumber, statusCode: response.status },
        "Status endpoint returned non-2xx response"
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

      logger.warn(
        { company: company.name, applicationNumber },
        "Status endpoint returned invalid JSON"
      );

      continue;

    }

    const validation = applicationStatusSchema.safeParse(data);

    if (!validation.success) {
      logger.warn(
        {
          company: company.name,
          applicationNumber,
          issues: validation.error.issues.map(
            (issue) => `${issue.path.join(".") || "root"}: ${issue.message}`
          )
        },
        "Application status payload did not match expected structure"
      );

      const product =
        data && typeof data.statusProductName === "string"
          ? data.statusProductName
          : "Unknown Product";

      const stages =
        Array.isArray(data?.trackingAppStageVMs)
          ? data.trackingAppStageVMs
          : [];

      const currentStatus =
        getCurrentStatus(stages);

      const currentStage =
        stages.find(
          (stage) => stage?.currentStageSet === true
        ) ||
        stages.find(
          (stage) => getStageColor(stage) === "YELLOW"
        );

      const currentStatusColor =
        currentStage
          ? getStageColor(currentStage)
          : stages.length > 0
          ? getStageColor(stages[stages.length - 1])
          : "RED";

      logger.info(
        {
          company: company.name,
          applicationNumber,
          product,
          currentStatus,
          currentStatusColor
        },
        "Application status summary recovered from partially valid payload"
      );

      logStages(stages);

      results.push({
        companyId: company.id,
        companyName: company.name,
        applicationNumber,
        appID,
        success: true,
        product,
        currentStatus,
        currentStatusColor,
        stages
      });

      continue;
    }

    const product =
      validation.data.statusProductName ||
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

    logger.info(
      {
        company: company.name,
        applicationNumber,
        product,
        currentStatus,
        currentStatusColor
      },
      "Application status summary"
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
  results,
  outputPath = "public/data.json"
) {
  const data = buildOutputStructure(results);

  const resolvedOutputPath = outputPath || "public/data.json";

  fs.mkdirSync(
    require("node:path").dirname(resolvedOutputPath),
    {
      recursive: true
    }
  );

  fs.writeFileSync(
    resolvedOutputPath,
    JSON.stringify(
      data,
      null,
      2
    ),
    "utf8"
  );

  logger.info(
    {
      companiesProcessed: data.totalCompanies,
      applicationsSaved: data.totalApplications,
      file: resolvedOutputPath,
      updatedAt: data.updatedAt
    },
    "Website data created"
  );

}


/*
 * ============================================================
 * MAIN
 * ============================================================
 */

async function main({ companiesFile = process.env.MONITOR_COMPANIES_FILE || COMPANIES_FILE, outputPath = process.env.MONITOR_OUTPUT_PATH || "public/data.json" } = {}) {

  const run = new MonitorRun();

  const companies =
    loadCompanies(companiesFile);

  run.companiesConfigured = companies.length;

  const userAgent =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
    "AppleWebKit/537.36 (KHTML, like Gecko) " +
    "Chrome/131.0.0.0 Safari/537.36";

  const allResults = [];
  const structuredCompanyCredentials = getStructuredCompanyCredentials();

  logger.info(
    { companiesConfigured: companies.length, nodeVersion: process.version },
    "NAPAMS multi-company monitor started"
  );


  /*
   * Process companies one by one.
   */

  for (
    const company of companies
  ) {

    logger.info({ company: company.name }, "Processing company");

    const structuredCredentials = structuredCompanyCredentials.get(company.id);

    const tin =
      structuredCredentials?.tin ||
      (company.tinSecret
        ? process.env[
            company.tinSecret
          ]
        : null);

    const password =
      structuredCredentials?.password ||
      (company.passwordSecret
        ? process.env[
            company.passwordSecret
          ]
        : null);

    if (
      !tin ||
      !password
    ) {

      logger.warn({ company: company.name }, "Skipping company because credentials are missing");
      run.recordCompanySkipped(company.name);

      continue;

    }

    run.companiesProcessed++;

    try {

      const results =
        await processCompany(
          company,
          tin,
          password,
          userAgent
        );

      run.recordApplicationsDiscovered(results.length);
      run.recordCompanySuccess(company.name, results.length);

      allResults.push(
        ...results
      );

      logger.info({ company: company.name }, "Finished processing company");

    } catch (error) {

      logger.error(
        {
          company: company.name,
          errorCode: error?.code,
          err: error,
          error: { message: error?.message }
        },
        "Company processing failed"
      );

      run.recordCompanyFailure(
        company.name,
        error?.code || "UNKNOWN",
        error?.message || "Unknown error"
      );

      continue;

    }

  }


  /*
   * Save combined website data.
   */

  saveWebsiteData(
    allResults,
    outputPath
  );

  logger.info("Monitor complete");
  run.finish();

}


if (require.main === module) {

  /**
   * Top-level error boundary for the monitor process.
   *
   * This wraps the main monitor execution and ensures:
   * 1. Errors are always logged through the structured logger
   * 2. Errors are optionally captured by the configured error tracker
   * 3. Pending tracking events are flushed before process exit
   * 4. The process still exits with code 1 on any failure
   */
  (async () => {

    try {

      // Initialize optional error tracking
      await initializeErrorTracking();

      // Run the monitor
      await main();

    } catch (error) {

      // Always log the error through the structured logger
      logger.error(
        {
          errorCode: error?.code,
          err: error,
          error: { message: error?.message, stack: error?.stack }
        },
        "NAPAMS monitor failed"
      );

      // Capture error with the optional error tracker
      captureException(error, {
        stage: "monitor_execution"
      });

      // Flush pending tracking events before exit
      await flushErrorTracking();

      // Set non-zero exit code to signal failure
      process.exitCode = 1;

    }

  })();

}

module.exports = {
  loadCompanies,
  processCompany,
  saveWebsiteData,
  main,
  getCookies,
  getAntiforgeryToken,
  cleanText,
  extractSubmittedApplicationNumbers,
  extractApplicationIds,
  getStageColor,
  normalizeStageName,
  getCurrentStatus
};
