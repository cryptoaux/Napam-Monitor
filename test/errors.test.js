const test = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const https = require("https");

const {
  NapamsHttpError,
  NapamsParseError,
  NapamsConfigError
} = require("../src/errors");
const httpClient = require("../src/http-client");
const { loginCompany } = require("../src/login");
const monitor = require("../monitor");

test("NapamsHttpError keeps the class name, code, and message", () => {
  const cause = new Error("ECONNRESET");
  const error = new NapamsHttpError("HTTP_REQUEST_FAILED", "Request failed", {
    cause
  });

  assert.ok(error instanceof Error);
  assert.equal(error.name, "NapamsHttpError");
  assert.equal(error.code, "HTTP_REQUEST_FAILED");
  assert.equal(error.message, "Request failed");
  assert.equal(error.cause, cause);
});

test("NapamsParseError keeps the class name, code, and message", () => {
  const error = new NapamsParseError(
    "ANTIFORGERY_TOKEN_MISSING",
    "Antiforgery token missing"
  );

  assert.ok(error instanceof Error);
  assert.equal(error.name, "NapamsParseError");
  assert.equal(error.code, "ANTIFORGERY_TOKEN_MISSING");
  assert.equal(error.message, "Antiforgery token missing");
});

test("NapamsConfigError keeps the class name, code, and message", () => {
  const error = new NapamsConfigError(
    "CONFIG_SCHEMA_INVALID",
    "Company config invalid"
  );

  assert.ok(error instanceof Error);
  assert.equal(error.name, "NapamsConfigError");
  assert.equal(error.code, "CONFIG_SCHEMA_INVALID");
  assert.equal(error.message, "Company config invalid");
});

test("monitor.loadCompanies raises NapamsConfigError for invalid config", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "napams-error-"));
  const missingPath = path.join(tmpDir, "missing.json");
  const badPath = path.join(tmpDir, "bad.json");

  fs.writeFileSync(badPath, JSON.stringify({ noCompanies: true }), "utf8");

  try {
    assert.throws(() => monitor.loadCompanies(missingPath), {
      name: "NapamsConfigError",
      code: "COMPANY_CONFIG_INVALID"
    });

    assert.throws(() => monitor.loadCompanies(badPath), {
      name: "NapamsConfigError",
      code: "CONFIG_SCHEMA_INVALID"
    });
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("loginCompany raises NapamsParseError for a missing antiforgery token", async () => {
  const company = { name: "Example Company" };
  const originalSetTimeout = global.setTimeout;
  global.setTimeout = (fn) => {
    fn();
    return 0;
  };

  const requestStub = test.mock.method(httpClient, "request", async () => ({
    status: 200,
    headers: {
      "set-cookie": [".AspNetCore.Antiforgery=stale-cookie; path=/; secure"]
    },
    body: "<form><input type='text' name='Username' /></form>"
  }));

  try {
    await assert.rejects(
      () => loginCompany(company, "TIN-12345", "Secret123", "NodeTestAgent"),
      (error) => {
        assert.equal(error.name, "NapamsParseError");
        assert.equal(error.code, "ANTIFORGERY_TOKEN_MISSING");
        return true;
      }
    );
  } finally {
    global.setTimeout = originalSetTimeout;
    requestStub.mock.restore();
  }
});

test("httpClient.request wraps socket errors as NapamsHttpError", async () => {
  const originalSetTimeout = global.setTimeout;
  global.setTimeout = (fn) => {
    fn();
    return 0;
  };

  const requestStub = test.mock.method(https, "request", () => {
    const req = new EventEmitter();

    req.write = () => {};
    req.end = () => {
      process.nextTick(() => {
        req.emit(
          "error",
          Object.assign(new Error("ECONNRESET"), { code: "ECONNRESET" })
        );
      });
    };
    req.destroy = () => {};

    return req;
  });

  try {
    await assert.rejects(
      () => httpClient.request("GET", "/test", { "User-Agent": "NodeTest" }),
      (error) => {
        assert.equal(error.name, "NapamsHttpError");
        assert.equal(error.code, "HTTP_REQUEST_FAILED");
        assert.equal(error.cause.message, "ECONNRESET");
        return true;
      }
    );
  } finally {
    global.setTimeout = originalSetTimeout;
    requestStub.mock.restore();
  }
});
