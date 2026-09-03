const test = require("node:test");
const assert = require("node:assert/strict");
const { execFileSync, spawnSync } = require("node:child_process");
const { EventEmitter } = require("node:events");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const https = require("https");
const { request } = require("../src/http-client");
const { main } = require("../monitor");

const {
  getCookies,
  getAntiforgeryToken,
  cleanText,
  extractSubmittedApplicationNumbers,
  extractApplicationIds,
  getStageColor,
  normalizeStageName,
  getCurrentStatus
} = require("../src/parsers");

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

test("main returns a structured summary when the monitor completes", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "napams-monitor-"));
  const companiesPath = path.join(tempDir, "companies.json");
  const outputPath = path.join(tempDir, "out", "data.json");

  fs.writeFileSync(
    companiesPath,
    JSON.stringify([
      {
        id: "company-1",
        name: "Example Company",
        tinSecret: "COMPANY_1_TIN",
        passwordSecret: "COMPANY_1_PASSWORD"
      }
    ])
  );

  process.env.COMPANY_1_TIN = "tin-1";
  process.env.COMPANY_1_PASSWORD = "pass-1";

  try {
    const summary = await main({
      companiesFile: companiesPath,
      outputPath,
      companyProcessor: async (company) => [
        {
          companyId: company.id,
          companyName: company.name,
          applicationNumber: "NF-AB-0001",
          appID: "app-1",
          success: true,
          product: "Sample Product",
          currentStatus: "Approved",
          currentStatusColor: "GREEN",
          stages: []
        }
      ]
    });

    assert.equal(summary.companiesConfigured, 1);
    assert.equal(summary.companiesProcessed, 1);
    assert.equal(summary.companiesSucceeded, 1);
    assert.equal(summary.errorCount, 0);
    assert(summary.runStartedAt);
    assert(summary.runFinishedAt);
    assert.equal(typeof summary.durationMs, "number");
    assert(fs.existsSync(outputPath));
  } finally {
    delete process.env.COMPANY_1_TIN;
    delete process.env.COMPANY_1_PASSWORD;
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("monitor entrypoint exits non-zero on fatal startup failures", () => {
  const tempDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "napams-monitor-fail-")
  );
  const missingConfig = path.join(tempDir, "missing-companies.json");

  const projectRoot = process.cwd();

  const result = spawnSync(process.execPath, ["monitor.js"], {
    cwd: projectRoot,
    env: {
      ...process.env,
      MONITOR_COMPANIES_FILE: missingConfig,
      MONITOR_OUTPUT_PATH: path.join(tempDir, "out", "data.json")
    },
    encoding: "utf8"
  });

  assert.notEqual(result.status, 0);
  assert.match(result.stdout + result.stderr, /NAPAMS monitor failed|Missing/);

  fs.rmSync(tempDir, { recursive: true, force: true });
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

  assert.deepEqual(extractSubmittedApplicationNumbers(html), [
    "NF-AB-1234",
    "PEX-CD-98765"
  ]);
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

  assert.deepEqual(extractApplicationIds(html), [
    "first-id",
    "second-id",
    "third-id"
  ]);
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
  assert.equal(
    getStageColor({ description: "<span class='bg-warning'>Waiting</span>" }),
    "YELLOW"
  );
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

test("request resolves successful HTTPS responses and emits socket diagnostics", async () => {
  const socket = new EventEmitter();
  socket.getProtocol = () => "TLSv1.3";
  socket.getCipher = () => ({ name: "TLS_AES_256_GCM_SHA384" });
  socket.authorized = true;

  const req = new EventEmitter();
  req.write = () => {};
  req.end = () => {};
  req.destroy = () => {};

  const requestStub = test.mock.method(
    https,
    "request",
    (options, callback) => {
      const res = new EventEmitter();
      res.statusCode = 200;
      res.httpVersion = "1.1";
      res.headers = { "content-type": "application/json" };
      res.setEncoding = () => {};

      process.nextTick(() => {
        req.emit("socket", socket);
        callback(res);
        res.emit("data", '{"ok":true}');
        res.emit("end");
      });

      return req;
    }
  );

  try {
    const response = await request("GET", "/test", {
      "User-Agent": "NodeTest"
    });

    assert.deepEqual(response, {
      status: 200,
      headers: { "content-type": "application/json" },
      body: '{"ok":true}'
    });
  } finally {
    requestStub.mock.restore();
  }
});

test("request retries transient errors before succeeding", async () => {
  let attempts = 0;
  const originalSetTimeout = global.setTimeout;
  global.setTimeout = (fn) => {
    fn();
    return 0;
  };

  const requestStub = test.mock.method(
    https,
    "request",
    (options, callback) => {
      const req = new EventEmitter();
      req.write = () => {};
      req.end = () => {
        process.nextTick(() => {
          if (attempts === 0) {
            attempts += 1;
            req.emit(
              "error",
              Object.assign(new Error("ECONNRESET"), { code: "ECONNRESET" })
            );
            return;
          }

          const res = new EventEmitter();
          res.statusCode = 202;
          res.httpVersion = "1.1";
          res.headers = {};
          res.setEncoding = () => {};
          callback(res);
          res.emit("data", "retry-success");
          res.emit("end");
        });
      };
      req.destroy = () => {};

      return req;
    }
  );

  try {
    const response = await request(
      "POST",
      "/retry",
      { "Content-Type": "text/plain" },
      "payload"
    );

    assert.equal(response.status, 202);
    assert.equal(response.body, "retry-success");
    assert.equal(attempts, 1);
  } finally {
    global.setTimeout = originalSetTimeout;
    requestStub.mock.restore();
  }
});
