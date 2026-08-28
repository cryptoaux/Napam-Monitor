const test = require("node:test");
const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");

const {
  getCookies,
  getAntiforgeryToken,
  cleanText,
  extractSubmittedApplicationNumbers,
  extractApplicationIds,
  getStageColor,
  normalizeStageName,
  getCurrentStatus
} = require("../monitor");

test("imports monitor helpers without starting the monitoring routine", () => {
  assert.equal(typeof getCookies, "function");
  assert.equal(typeof getCurrentStatus, "function");
  assert.equal(
    execFileSync(
      process.execPath,
      ["-e", "require('./monitor'); console.log('imported')"],
      { encoding: "utf8" }
    ),
    "imported\n"
  );
});

test("getCookies extracts cookie values from one or several Set-Cookie headers", () => {
  assert.equal(
    getCookies([
      ".AspNetCore.Antiforgery=token; path=/; secure",
      "NAPAMS.Session=session-id; path=/; HttpOnly"
    ]),
    ".AspNetCore.Antiforgery=token; NAPAMS.Session=session-id"
  );
  assert.equal(getCookies("session=value; Path=/"), "session=value");
  assert.equal(getCookies(undefined), "");
});

test("getAntiforgeryToken extracts the token from single or double quoted HTML", () => {
  assert.equal(
    getAntiforgeryToken(
      '<input type="hidden" name="__RequestVerificationToken" value="abc123">'
    ),
    "abc123"
  );
  assert.equal(
    getAntiforgeryToken(
      "<input name='__RequestVerificationToken' value='xyz789'>"
    ),
    "xyz789"
  );
  assert.equal(getAntiforgeryToken("<form></form>"), null);
});

test("cleanText removes markup, decodes supported entities, and normalizes whitespace", () => {
  assert.equal(
    cleanText("  <span>Pending</span>&nbsp; &amp; <b>Review</b>  "),
    "Pending & Review"
  );
  assert.equal(cleanText(null), "");
});

test("extractSubmittedApplicationNumbers reads status rows, deduplicates, and normalizes case", () => {
  const html = `
    <tr><td>nf-ab-1234</td><td><a>View Status</a></td></tr>
    <tr><td>NF-AB-1234</td><td>View Status</td></tr>
    <tr><td>PEX-cd-98765</td><td>View Status</td></tr>
    <tr><td>NF-ZZ-5555</td><td>Draft</td></tr>`;

  assert.deepEqual(
    extractSubmittedApplicationNumbers(html),
    ["NF-AB-1234", "PEX-CD-98765"]
  );
});

test("extractSubmittedApplicationNumbers falls back when status rows have no match", () => {
  assert.deepEqual(
    extractSubmittedApplicationNumbers(
      "<div>NF-ab-1234 is available outside a table</div>"
    ),
    ["NF-AB-1234"]
  );
});

test("extractApplicationIds returns input IDs in their numeric HTML order", () => {
  const html = `
    <input id="appID_1" value="second-id">
    <input id='appID_0' value='first-id'>
    <input id="appID_3" value="third-id">`;

  assert.deepEqual(
    extractApplicationIds(html),
    ["first-id", "second-id", "third-id"]
  );
});

test("extractApplicationIds ignores malformed or empty values", () => {
  assert.deepEqual(
    extractApplicationIds(
      '<input id="appID_x" value="bad"><input id="appID_0" value="">'
    ),
    []
  );
});

test("getStageColor maps current, warning, danger, primary, and unknown stages", () => {
  assert.equal(getStageColor({ currentStageSet: true }), "YELLOW");
  assert.equal(getStageColor({ description: "<span class='bg-warning'>Waiting</span>" }), "YELLOW");
  assert.equal(getStageColor({ description: "bg-danger" }), "RED");
  assert.equal(getStageColor({ description: "bg-primary" }), "GREEN");
  assert.equal(getStageColor({ description: "No recognized class" }), "RED");
});

test("normalizeStageName supplies a default and collapses whitespace", () => {
  assert.equal(normalizeStageName("  Document   Review\n"), "Document Review");
  assert.equal(normalizeStageName(""), "Internal Review");
  assert.equal(normalizeStageName(null), "Internal Review");
});

test("getCurrentStatus handles missing stages and prioritizes the explicit current stage", () => {
  assert.equal(getCurrentStatus([]), "Unknown");
  assert.equal(getCurrentStatus(null), "Unknown");
  assert.equal(
    getCurrentStatus([
      { trackingStageName: "Submitted", description: "bg-primary" },
      { trackingStageName: "  Final   Review ", currentStageSet: true }
    ]),
    "Final Review"
  );
});

test("getCurrentStatus chooses warning, then first non-green, then final stage", () => {
  assert.equal(
    getCurrentStatus([
      { trackingStageName: "Submitted", description: "bg-primary" },
      { trackingStageName: "Awaiting Payment", description: "bg-warning" },
      { trackingStageName: "Approved", description: "bg-primary" }
    ]),
    "Awaiting Payment"
  );
  assert.equal(
    getCurrentStatus([
      { trackingStageName: "Submitted", description: "bg-primary" },
      { trackingStageName: "Needs Correction", description: "bg-danger" },
      { trackingStageName: "Approved", description: "bg-primary" }
    ]),
    "Needs Correction"
  );
  assert.equal(
    getCurrentStatus([
      { trackingStageName: "Submitted", description: "bg-primary" },
      { trackingStageName: "Approved", description: "bg-primary" }
    ]),
    "Approved"
  );
});
