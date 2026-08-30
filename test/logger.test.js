const test = require("node:test");
const assert = require("node:assert/strict");
const logger = require("../src/logger");

test("logger module can be imported successfully", () => {
  assert.equal(typeof logger, "object");
  assert.equal(typeof logger.info, "function");
  assert.equal(typeof logger.warn, "function");
  assert.equal(typeof logger.error, "function");
});

test("logger writes valid JSON lines", () => {
  logger.__capturedLogs.length = 0;

  logger.child({ component: "test" }).info({ event: "probe" }, "hello");

  const lastLine = logger.__capturedLogs.at(-1)?.trim();
  assert.ok(lastLine);

  const line = JSON.parse(lastLine);
  assert.equal(line.msg, "hello");
  assert.equal(line.component, "test");
  assert.equal(line.event, "probe");
  assert.equal(typeof line.time, "string");
  assert.equal(typeof line.level, "number");
});
