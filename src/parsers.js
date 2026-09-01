/**
 * @typedef {{ trackingStageName?: string, description?: string, currentStageSet?: boolean, status?: string, stageStatus?: string, currentStatus?: string, duration?: string | number | null }} StageInfo
 */

/**
 * @param {string|string[]|undefined} setCookie
 * @returns {string}
 */
function getCookies(setCookie) {
  if (!setCookie) {
    return "";
  }

  if (!Array.isArray(setCookie)) {
    setCookie = [setCookie];
  }

  return setCookie.map((cookie) => cookie.split(";")[0]).join("; ");
}

/**
 * @param {string} html
 * @returns {string|null}
 */
function getAntiforgeryToken(html) {
  const match = html.match(
    /name=["']__RequestVerificationToken["'][^>]*value=["']([^"']+)["']/i
  );

  return match ? match[1] : null;
}

/**
 * @param {string|unknown} value
 * @returns {string}
 */
function cleanText(value) {
  return String(value || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * @param {string} html
 * @returns {string[]}
 */
function extractSubmittedApplicationNumbers(html) {
  /** @type {string[]} */
  const numbers = [];
  const rowRegex = /<tr[\s\S]*?<\/tr>/gi;
  const rows = html.match(rowRegex) || [];

  for (const row of rows) {
    if (!/View Status/i.test(row)) {
      continue;
    }

    const matches = row.match(/\b(?:NF|PEX)-[A-Z]{2}-\d{4,}\b/gi) || [];

    for (const value of matches) {
      const number = value.toUpperCase();

      if (!numbers.includes(number)) {
        numbers.push(number);
      }
    }
  }

  if (numbers.length === 0) {
    const matches = html.match(/\b(?:NF|PEX)-[A-Z]{2}-\d{4,}\b/gi) || [];

    for (const value of matches) {
      const number = value.toUpperCase();

      if (!numbers.includes(number)) {
        numbers.push(number);
      }
    }
  }

  return numbers;
}

/**
 * @param {string} html
 * @returns {string[]}
 */
function extractApplicationIds(html) {
  /** @type {string[]} */
  const ids = [];
  const regex = /id=["']appID_(\d+)["'][^>]*value=["']([^"']+)["']/gi;
  let match;

  while ((match = regex.exec(html)) !== null) {
    const index = Number(match[1]);
    const id = match[2];

    if (!Number.isNaN(index) && id) {
      ids[index] = id;
    }
  }

  return ids.filter(Boolean);
}

/**
 * @param {StageInfo | null | undefined} stage
 * @returns {"GREEN" | "YELLOW" | "RED"}
 */
function getStageColor(stage) {
  const description = String(stage?.description || "").toLowerCase();

  if (stage?.currentStageSet === true) {
    return "YELLOW";
  }

  if (/\bbg-warning\b/.test(description)) {
    return "YELLOW";
  }

  if (/\bbg-danger\b/.test(description)) {
    return "RED";
  }

  if (/\bbg-primary\b/.test(description)) {
    return "GREEN";
  }

  return "RED";
}

/**
 * @param {string | null | undefined} name
 * @returns {string}
 */
function normalizeStageName(name) {
  const value = String(name || "").trim();

  if (!value) {
    return "Internal Review";
  }

  return value.replace(/\s+/g, " ").trim();
}

/**
 * @param {StageInfo[] | undefined | null} stages
 * @returns {string}
 */
function getCurrentStatus(stages) {
  if (!Array.isArray(stages) || stages.length === 0) {
    return "Unknown";
  }

  const explicitCurrent = stages.find(
    (stage) => stage?.currentStageSet === true
  );

  if (explicitCurrent) {
    return normalizeStageName(explicitCurrent.trackingStageName);
  }

  const yellowStage = stages.find((stage) => getStageColor(stage) === "YELLOW");

  if (yellowStage) {
    return normalizeStageName(yellowStage.trackingStageName);
  }

  const firstNonGreen = stages.find(
    (stage) => getStageColor(stage) !== "GREEN"
  );

  if (firstNonGreen) {
    return normalizeStageName(firstNonGreen.trackingStageName);
  }

  return normalizeStageName(stages[stages.length - 1].trackingStageName);
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
