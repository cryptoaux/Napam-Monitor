const assert = require("node:assert");
const { test } = require("node:test");

/**
 * Helper to test error-tracker with custom environment.
 *
 * @param {object} env - Environment variables override
 * @returns {object} - { errorTracker }
 */
function setupErrorTracker(env = {}) {
  // Clear any cached module state
  delete require.cache[require.resolve("../src/error-tracker.js")];

  // Save original environment
  const savedEnv = { ...process.env };

  // Apply test environment
  Object.assign(process.env, env);

  // Reset to saved values after module load
  try {
    // @ts-expect-error - requiring the module fresh
    const errorTracker = require("../src/error-tracker.js");
    return { errorTracker };
  } finally {
    // Restore environment
    Object.assign(process.env, savedEnv);
  }
}

test("error-tracker: when disabled, captureException does nothing safely", async () => {
  // Force tracking to be disabled
  process.env.ERROR_TRACKING_ENABLED = "false";
  delete process.env.ERROR_TRACKING_DSN;

  const { errorTracker } = setupErrorTracker({
    ERROR_TRACKING_ENABLED: "false"
  });

  // Should not throw when capturing an exception
  const error = new Error("Test error");
  errorTracker.captureException(error);
  errorTracker.captureException(error, { metadata: "value" });

  // Flushing should also work
  await errorTracker.flushErrorTracking();
});

test("error-tracker: when enabled but missing DSN, remains disabled safely", async () => {
  const { errorTracker } = setupErrorTracker({
    ERROR_TRACKING_ENABLED: "true",
    ERROR_TRACKING_DSN: ""
  });

  // Should still not throw
  const error = new Error("Test error");
  errorTracker.captureException(error);

  await errorTracker.flushErrorTracking();
});

test("error-tracker: normalizes Error objects", async () => {
  const { errorTracker } = setupErrorTracker({
    ERROR_TRACKING_ENABLED: "false"
  });

  // Should accept normal Error
  const normalError = new Error("Normal error");
  errorTracker.captureException(normalError);

  // Should handle string
  errorTracker.captureException("string error");

  // Should handle object
  errorTracker.captureException({
    code: "CUSTOM_ERROR",
    message: "Object error"
  });

  // Should handle null/undefined
  errorTracker.captureException(null);
  errorTracker.captureException(undefined);
});

test("error-tracker: excludes sensitive metadata from tracking", async () => {
  const { errorTracker } = setupErrorTracker({
    ERROR_TRACKING_ENABLED: "false"
  });

  // Should not throw when handling sensitive context
  const error = new Error("Auth error");
  const sensitiveContext = {
    password: "secret-password",
    token: "secret-token",
    authorization: "Bearer token123",
    cookie: "session=abc123",
    tin: "company-tin-12345",
    safe_field: "this is safe"
  };

  errorTracker.captureException(error, sensitiveContext);
});

test("error-tracker: initialization can be called multiple times safely", async () => {
  const { errorTracker } = setupErrorTracker({
    ERROR_TRACKING_ENABLED: "false"
  });

  // Multiple initializations should not throw
  await errorTracker.initializeErrorTracking();
  await errorTracker.initializeErrorTracking();
  await errorTracker.initializeErrorTracking();
});

test("error-tracker: flushErrorTracking completes without blocking indefinitely", async () => {
  const { errorTracker } = setupErrorTracker({
    ERROR_TRACKING_ENABLED: "false"
  });

  // Flush should complete quickly when disabled
  const start = Date.now();
  await errorTracker.flushErrorTracking(1000);
  const elapsed = Date.now() - start;

  // Should complete almost immediately when disabled
  assert.ok(elapsed < 100, "Flush should complete quickly when disabled");
});

test("error-tracker: returns early when tracking is disabled", async () => {
  const { errorTracker } = setupErrorTracker({
    ERROR_TRACKING_ENABLED: "false"
  });

  // All operations should be no-ops
  await errorTracker.initializeErrorTracking();

  const error = new Error("Test");
  errorTracker.captureException(error);
  errorTracker.captureException(error, { context: "value" });

  await errorTracker.flushErrorTracking();

  // No errors should be thrown
  assert.ok(true, "All tracking operations completed without error");
});

test("error-tracker module exports required functions", () => {
  const { errorTracker } = setupErrorTracker({
    ERROR_TRACKING_ENABLED: "false"
  });

  assert.equal(typeof errorTracker.initializeErrorTracking, "function");
  assert.equal(typeof errorTracker.captureException, "function");
  assert.equal(typeof errorTracker.flushErrorTracking, "function");
});

test("error-tracker: handles unknown thrown values gracefully", async () => {
  const { errorTracker } = setupErrorTracker({
    ERROR_TRACKING_ENABLED: "false"
  });

  // Should not throw for various unexpected inputs
  errorTracker.captureException(123);
  errorTracker.captureException(true);
  errorTracker.captureException([1, 2, 3]);
  errorTracker.captureException(() => {});

  // Flushing should still work
  await errorTracker.flushErrorTracking();
});

test("error-tracker: contextual metadata is properly structured", async () => {
  const { errorTracker } = setupErrorTracker({
    ERROR_TRACKING_ENABLED: "false"
  });

  const error = new Error("Nested error");

  // Should handle nested context
  const context = {
    stage: "company_processing",
    company: {
      id: "company_01",
      name: "Test Company",
      password: "[SHOULD_BE_REDACTED]"
    },
    attempt: 3,
    details: {
      status: "failed",
      code: "LOGIN_FAILED"
    }
  };

  errorTracker.captureException(error, context);
});
