const test = require("node:test");
const assert = require("node:assert/strict");
const logger = require("../src/logger");

test("logger redacts sensitive fields before emitting structured logs", () => {
  logger.__capturedLogs.length = 0;

  logger.info(
    {
      company: "Example Co",
      password: "super-secret",
      tin: "ABC123",
      token: "abc-token",
      nested: { cookie: "session-xyz", safe: "visible" }
    },
    "status update"
  );

  const lastLine = logger.__capturedLogs.at(-1)?.trim();
  assert.ok(lastLine);

  const line = JSON.parse(lastLine);
  assert.equal(line.company, "Example Co");
  assert.equal(line.password, "[REDACTED]");
  assert.equal(line.tin, "[REDACTED]");
  assert.equal(line.token, "[REDACTED]");
  assert.equal(line.nested.cookie, "[REDACTED]");
  assert.equal(line.nested.safe, "visible");
  assert.equal(line.msg, "status update");
});
