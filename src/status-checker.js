const httpClient = require("./http-client");
const logger = require("./logger");

/**
 * @param {string} appID
 * @param {string} cookies
 * @param {string} userAgent
 * @returns {Promise<{ status: number, body: string, headers: Record<string, string|string[]|undefined> }>}
 */
async function checkApplicationStatus(appID, cookies, userAgent) {
  const path = `/Application/SubmittedApplication/CheckApplicationStatus?appID=${encodeURIComponent(appID)}`;

  logger.info({ appID, statusPath: path }, "Checking application status");

  const response = await httpClient.request("POST", path, {
    "User-Agent": userAgent,
    Cookie: cookies,
    Accept: "application/json, text/plain, */*",
    Referer:
      "https://registration.nafdac.gov.ng/Application/FormApplication/Applications",
    "X-Requested-With": "XMLHttpRequest"
  });

  logger.info(
    { appID, statusCode: response.status },
    "Status endpoint HTTP response"
  );

  return response;
}

module.exports = { checkApplicationStatus };
