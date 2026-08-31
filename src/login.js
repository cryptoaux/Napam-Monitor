const logger = require("./logger");
const httpClient = require("./http-client");
const { NapamsHttpError, NapamsParseError } = require("./errors");
const { getCookies, getAntiforgeryToken } = require("./parsers");

const LOGIN_PATH = "/Applicant/Login";

async function loginCompany(company, tin, password, userAgent) {
  logger.info({ company: company.name }, "Company processing started");

  const MAX_LOGIN_ATTEMPTS = 4;

  let cookies = "";

  let authenticated = false;

  for (
    let loginAttempt = 1;
    loginAttempt <= MAX_LOGIN_ATTEMPTS;
    loginAttempt++
  ) {
    logger.info(
      {
        company: company.name,
        loginAttempt,
        maxLoginAttempts: MAX_LOGIN_ATTEMPTS
      },
      "Login attempt started"
    );

    logger.info({ company: company.name }, "Fetching NAPAMS login page");

    const loginPage = await httpClient.request("GET", LOGIN_PATH, {
      "User-Agent": userAgent,
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
    });

    logger.info(
      { company: company.name, statusCode: loginPage.status },
      "Login page status"
    );

    if (loginPage.status !== 200) {
      logger.warn(
        { company: company.name, statusCode: loginPage.status },
        "Login page returned unexpected status"
      );

      if (loginAttempt < MAX_LOGIN_ATTEMPTS) {
        const delay = loginAttempt * 3000;

        logger.warn(
          { company: company.name, delayMs: delay },
          "Refreshing login page before retry"
        );

        await new Promise((resolve) => {
          setTimeout(resolve, delay);
        });

        continue;
      }

      throw new NapamsHttpError(
        "HTTP_STATUS_ERROR",
        `Could not load NAPAMS login page. HTTP ${loginPage.status}`
      );
    }

    const token = getAntiforgeryToken(loginPage.body);

    const initialCookies = getCookies(loginPage.headers["set-cookie"]);

    if (!token) {
      logger.warn({ company: company.name }, "Antiforgery token not found");

      if (loginAttempt < MAX_LOGIN_ATTEMPTS) {
        logger.warn(
          { company: company.name },
          "Refreshing login page to obtain a new token"
        );

        await new Promise((resolve) => {
          setTimeout(resolve, 3000);
        });

        continue;
      }

      throw new NapamsParseError(
        "ANTIFORGERY_TOKEN_MISSING",
        "Antiforgery token was not found after multiple login page refreshes."
      );
    }

    logger.info({ company: company.name }, "Fresh antiforgery token obtained");

    const form = new URLSearchParams();

    form.append("ReturnUrl", "");
    form.append("Username", tin);
    form.append("Password", password);
    form.append("buttonFunc", "admin");
    form.append("__RequestVerificationToken", token);

    logger.info({ company: company.name }, "Submitting admin login");

    const loginResponse = await httpClient.request(
      "POST",
      LOGIN_PATH,
      {
        "User-Agent": userAgent,
        "Content-Type": "application/x-www-form-urlencoded",
        "Content-Length": Buffer.byteLength(form.toString()),
        Cookie: initialCookies,
        Referer: "https://registration.nafdac.gov.ng/Applicant/Login",
        Origin: "https://registration.nafdac.gov.ng",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
      },
      form.toString()
    );

    logger.info(
      { company: company.name, statusCode: loginResponse.status },
      "Login response status"
    );

    if (loginResponse.status === 302 || loginResponse.status === 303) {
      const authCookies = getCookies(loginResponse.headers["set-cookie"]);

      cookies = [initialCookies, authCookies].filter(Boolean).join("; ");

      authenticated = true;

      logger.info(
        { company: company.name },
        "Authenticated session established"
      );

      break;
    }

    if (loginResponse.status === 400) {
      logger.warn(
        { company: company.name, statusCode: loginResponse.status },
        "NAPAMS returned HTTP 400 Bad Request"
      );

      if (loginAttempt < MAX_LOGIN_ATTEMPTS) {
        const delay = loginAttempt * 3000;

        logger.warn(
          { company: company.name, delayMs: delay },
          "Refreshing login page and generating a new session"
        );

        await new Promise((resolve) => {
          setTimeout(resolve, delay);
        });

        continue;
      }

      throw new NapamsHttpError(
        "HTTP_STATUS_ERROR",
        `NAPAMS login returned HTTP 400 after ${MAX_LOGIN_ATTEMPTS} fresh login attempts.`
      );
    }

    throw new NapamsHttpError(
      "HTTP_STATUS_ERROR",
      `NAPAMS login failed. HTTP ${loginResponse.status}`
    );
  }

  if (!authenticated || !cookies) {
    throw new NapamsHttpError(
      "HTTP_STATUS_ERROR",
      "NAPAMS login did not establish an authenticated session."
    );
  }

  logger.info({ company: company.name }, "Opening applications page");

  const applicationsPage = await httpClient.request(
    "GET",
    "/Application/FormApplication/Applications",
    {
      "User-Agent": userAgent,
      Cookie: cookies,
      Accept: "text/html"
    }
  );

  logger.info(
    { company: company.name, statusCode: applicationsPage.status },
    "Applications page status"
  );

  if (applicationsPage.status !== 200) {
    throw new NapamsHttpError(
      "HTTP_STATUS_ERROR",
      `Could not open Applications page. HTTP ${applicationsPage.status}`
    );
  }

  return {
    cookies,
    html: applicationsPage.body
  };
}

module.exports = { loginCompany };
