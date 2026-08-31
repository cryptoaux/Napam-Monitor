const fs = require("fs");
const logger = require("./src/logger");
const { NapamsConfigError, NapamsParseError } = require("./src/errors");
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

  const raw =
    fs.readFileSync(
      filePath,
      "utf8"
    );

  const parsed =
    JSON.parse(raw);

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
      companiesProcessed: companies.length,
      applicationsSaved: successfulResults.length,
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

  const companies =
    loadCompanies(companiesFile);

  const userAgent =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
    "AppleWebKit/537.36 (KHTML, like Gecko) " +
    "Chrome/131.0.0.0 Safari/537.36";

  const allResults = [];

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

      logger.warn({ company: company.name }, "Skipping company because credentials are missing");

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

}


if (require.main === module) {

  main().catch(
    (error) => {

      logger.error(
        {
          errorCode: error?.code,
          err: error,
          error: { message: error?.message, stack: error?.stack }
        },
        "NAPAMS monitor failed"
      );

      process.exit(1);

    }
  );

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
