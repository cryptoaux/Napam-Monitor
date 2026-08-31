const test = require("node:test");
const assert = require("node:assert/strict");
const MonitorRun = require("../src/monitor-run");

test("MonitorRun initializes with zero metrics", () => {
  const run = new MonitorRun();

  assert.equal(run.companiesConfigured, 0);
  assert.equal(run.companiesProcessed, 0);
  assert.equal(run.companiesSucceeded, 0);
  assert.equal(run.companiesFailed, 0);
  assert.equal(run.companiesSkipped, 0);
  assert.equal(run.applicationsFound, 0);
  assert.equal(run.applicationsUpdated, 0);
  assert.equal(run.errors.length, 0);
  assert(run.startedAt instanceof Date);
  assert.equal(run.finishedAt, null);
});

test("MonitorRun.recordCompanySkipped increments skipped count", () => {
  const run = new MonitorRun();

  run.recordCompanySkipped("Test Company");

  assert.equal(run.companiesSkipped, 1);
});

test("MonitorRun.recordCompanySuccess increments success count and application count", () => {
  const run = new MonitorRun();

  run.recordCompanySuccess("Company A", 3);

  assert.equal(run.companiesSucceeded, 1);
  assert.equal(run.applicationsUpdated, 3);
});

test("MonitorRun.recordCompanyFailure increments failure count and records error", () => {
  const run = new MonitorRun();

  run.recordCompanyFailure(
    "Company A",
    "LOGIN_FAILED",
    "Authentication failed"
  );

  assert.equal(run.companiesFailed, 1);
  assert.equal(run.errors.length, 1);
  assert.equal(run.errors[0].companyName, "Company A");
  assert.equal(run.errors[0].errorCode, "LOGIN_FAILED");
  assert.equal(run.errors[0].message, "Authentication failed");
});

test("MonitorRun.recordApplicationsDiscovered increments applications found", () => {
  const run = new MonitorRun();

  run.recordApplicationsDiscovered(5);
  run.recordApplicationsDiscovered(3);

  assert.equal(run.applicationsFound, 8);
});

test("MonitorRun.finish returns summary with correct structure", () => {
  const run = new MonitorRun();
  run.companiesConfigured = 5;
  run.companiesProcessed = 4;
  run.companiesSucceeded = 3;
  run.companiesFailed = 1;
  run.companiesSkipped = 1;
  run.applicationsFound = 10;
  run.applicationsUpdated = 10;

  const summary = run.finish();

  assert(summary.runStartedAt);
  assert(summary.runFinishedAt);
  assert.equal(typeof summary.durationMs, "number");
  assert(summary.durationMs >= 0);
  assert.equal(summary.companiesConfigured, 5);
  assert.equal(summary.companiesProcessed, 4);
  assert.equal(summary.companiesSucceeded, 3);
  assert.equal(summary.companiesFailed, 1);
  assert.equal(summary.companiesSkipped, 1);
  assert.equal(summary.applicationsFound, 10);
  assert.equal(summary.applicationsUpdated, 10);
  assert.equal(summary.errorCount, 0);
  assert(run.finishedAt instanceof Date);
});

test("MonitorRun.finish includes errors in summary", () => {
  const run = new MonitorRun();
  run.recordCompanyFailure("Company A", "LOGIN_FAILED", "Auth failed");
  run.recordCompanyFailure("Company B", "APP_NOT_FOUND", "No apps");

  const summary = run.finish();

  assert.equal(summary.errorCount, 2);
});

test("MonitorRun prevents credentials from appearing in summary", () => {
  const run = new MonitorRun();
  run.companiesConfigured = 1;
  run.companiesSucceeded = 1;
  run.applicationsUpdated = 2;

  const summary = run.finish();

  const summaryStr = JSON.stringify(summary);

  assert(!summaryStr.includes("password"));
  assert(!summaryStr.includes("secret"));
  assert(!summaryStr.includes("token"));
  assert(!summaryStr.includes("TIN"));
  assert(!summaryStr.includes("Auth"));
});

test("MonitorRun tracks multiple companies and preserves error details", () => {
  const run = new MonitorRun();
  run.companiesConfigured = 3;
  run.recordCompanySuccess("Company A", 2);
  run.recordCompanySuccess("Company B", 3);
  run.recordCompanyFailure("Company C", "NETWORK_ERROR", "Connection timeout");

  assert.equal(run.companiesProcessed, 0);
  assert.equal(run.companiesSucceeded, 2);
  assert.equal(run.companiesFailed, 1);
  assert.equal(run.applicationsUpdated, 5);

  const summary = run.finish();

  assert.equal(summary.companiesSucceeded, 2);
  assert.equal(summary.companiesFailed, 1);
  assert.equal(summary.applicationsUpdated, 5);
  assert.equal(summary.errorCount, 1);
});

test("MonitorRun duration is measurable", async () => {
  const run = new MonitorRun();

  await new Promise((resolve) => {
    setTimeout(resolve, 10);
  });

  const summary = run.finish();

  assert(summary.durationMs >= 10);
});
