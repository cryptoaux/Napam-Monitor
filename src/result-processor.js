const logger = require("./logger");
const { normalizeStageName, getStageColor } = require("./parsers");

/**
 * @typedef {{ companyId?: string, companyName?: string, applicationNumber?: string, appID?: string, product?: string, currentStatus?: string, currentStatusColor?: string, success?: boolean, stages?: Array<{ trackingStageName?: string, description?: string, status?: string, stageStatus?: string, currentStatus?: string, duration?: string | number | null, trackingApplicationStage?: string | number | null, currentStageSet?: boolean }> }} ApplicationResult
 */

/**
 * Format a single application result with normalized stage information.
 *
 * @param {ApplicationResult} result - Raw application result from processCompany
 * @returns {Object} Formatted application for output
 */
function formatApplicationResult(result) {
  const stages = Array.isArray(result.stages) ? result.stages : [];

  return {
    companyId: result.companyId,
    companyName: result.companyName,
    applicationNumber: result.applicationNumber,
    appID: result.appID,
    name: result.product,
    product: result.product,
    currentStatus: result.currentStatus,
    currentStatusColor: result.currentStatusColor,
    stages: stages.map((stage) => ({
      name: normalizeStageName(stage.trackingStageName),
      color: getStageColor(stage),
      napamsDescription: stage.description || "",
      status: stage.status || stage.stageStatus || stage.currentStatus || "",
      duration: stage.duration || "",
      trackingApplicationStage: stage.trackingApplicationStage,
      currentStageSet: stage.currentStageSet === true
    }))
  };
}

/**
 * Filter successful results and format them for output.
 *
 * @param {Array} results - Array of results from processCompany
 * @returns {Array} Formatted successful results
 */
/**
 * @param {ApplicationResult[]} results
 * @returns {Object[]}
 */
function filterAndFormatResults(results) {
  return results
    .filter((result) => result.success)
    .map((result) => formatApplicationResult(result));
}

/**
 * Group formatted application results by company.
 *
 * @param {Array} formattedResults - Array of formatted application results
 * @returns {Array} Array of company objects with their applications
 */
/**
 * @param {Object[]} formattedResults
 * @returns {Array<{ id?: string, name?: string, applications: Object[] }>}
 */
function groupResultsByCompany(formattedResults) {
  const companyMap = new Map();

  for (const application of formattedResults) {
    const companyKey = application.companyId || application.companyName;

    if (!companyMap.has(companyKey)) {
      companyMap.set(companyKey, {
        id: application.companyId,
        name: application.companyName,
        applications: []
      });
    }

    companyMap.get(companyKey).applications.push(application);
  }

  return Array.from(companyMap.values());
}

/**
 * Build the final output structure for website data.
 *
 * @param {Array} allResults - All results from all companies
 * @returns {Object} Final output structure with metadata and data
 */
function buildOutputStructure(allResults) {
  const formattedResults = filterAndFormatResults(allResults);
  const companies = groupResultsByCompany(formattedResults);

  return {
    updatedAt: new Date().toISOString(),
    totalCompanies: companies.length,
    totalApplications: formattedResults.length,
    companies,
    applications: formattedResults
  };
}

module.exports = {
  formatApplicationResult,
  filterAndFormatResults,
  groupResultsByCompany,
  buildOutputStructure
};
