const logger = require("./logger");

/**
 * Optional structured error tracking for production monitoring.
 *
 * This module provides a lightweight abstraction for error tracking that is:
 * - Disabled by default
 * - Enabled only through explicit environment configuration
 * - Safe to fail without breaking the monitor
 * - Non-intrusive for offline tests and local development
 *
 * If ERROR_TRACKING_ENABLED is not explicitly set or false,
 * all tracking functions are no-ops and the monitor behaves
 * exactly as before (errors logged only, no external service contacted).
 */

/** @type {any} */
let sentryClient = null;

/** @type {boolean} */
const isEnabled = process.env.ERROR_TRACKING_ENABLED === "true";

/** @type {boolean} */
let initializationAttempted = false;

/**
 * Sanitize metadata to exclude sensitive fields before sending to tracking service.
 *
 * @param {unknown} value
 * @returns {unknown}
 */
function sanitizeMetadata(value) {
  if (value === null || value === undefined) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeMetadata(item));
  }

  if (typeof value === "string") {
    return value;
  }

  if (typeof value !== "object") {
    return value;
  }

  // Exclude sensitive fields from tracking metadata
  const REDACTED_KEYS =
    /password|passphrase|secret|token|cookie|tin|authorization|auth|credential|headers?|body|request/i;

  const sanitized = {};

  for (const [key, nestedValue] of Object.entries(value)) {
    if (REDACTED_KEYS.test(key)) {
      continue;
    }

    sanitized[key] = sanitizeMetadata(nestedValue);
  }

  return sanitized;
}

/**
 * Normalize thrown values into Error objects.
 *
 * @param {unknown} thrown
 * @returns {Error}
 */
function normalizeError(thrown) {
  if (thrown instanceof Error) {
    return thrown;
  }

  if (typeof thrown === "string") {
    return new Error(thrown);
  }

  if (typeof thrown === "object" && thrown !== null) {
    return new Error(JSON.stringify(thrown));
  }

  return new Error(String(thrown));
}

/**
 * Initialize optional error tracking.
 *
 * This is called once at startup. If ERROR_TRACKING_ENABLED is false
 * or the DSN is not provided, tracking remains disabled safely.
 *
 * @returns {Promise<void>}
 */
async function initializeErrorTracking() {
  // Prevent repeated initialization attempts
  if (initializationAttempted) {
    return;
  }

  initializationAttempted = true;

  // If not enabled, do nothing
  if (!isEnabled) {
    logger.debug("Error tracking is disabled");
    return;
  }

  const dsn = process.env.ERROR_TRACKING_DSN;

  if (!dsn || !dsn.trim()) {
    logger.warn(
      "ERROR_TRACKING_ENABLED is true but ERROR_TRACKING_DSN is missing; tracking disabled"
    );
    return;
  }

  try {
    // Dynamically import Sentry only if tracking is enabled and DSN is provided
    const Sentry = require("@sentry/node");

    Sentry.init({
      dsn,
      environment: process.env.NODE_ENV || "production",
      // Only sample errors in production to reduce noise
      sampleRate: process.env.NODE_ENV === "production" ? 1.0 : 0.1,
      // Exclude health checks and sensitive data before sending
      beforeSend(event) {
        // Never send authentication or credential headers
        if (
          event.request &&
          event.request.headers &&
          typeof event.request.headers === "object"
        ) {
          const SENSITIVE_HEADERS =
            /authorization|cookie|x-api-key|secret|token|password/i;
          for (const key of Object.keys(event.request.headers)) {
            if (SENSITIVE_HEADERS.test(key)) {
              delete event.request.headers[key];
            }
          }
        }

        return event;
      }
    });

    sentryClient = Sentry;

    logger.info("Error tracking initialized with Sentry");
  } catch (error) {
    // If Sentry is not installed or initialization fails, continue gracefully
    logger.warn(
      {
        err: error,
        error: { message: error?.message }
      },
      "Failed to initialize Sentry; error tracking disabled"
    );
  }
}

/**
 * Capture an error with the optional tracking service.
 *
 * This is a no-op if tracking is disabled.
 * It safely handles the error without breaking the monitor.
 *
 * @param {unknown} thrown
 * @param {object} [context={}]
 * @returns {void}
 */
function captureException(thrown, context = {}) {
  // If tracking is not enabled, do nothing
  if (!isEnabled || !sentryClient) {
    return;
  }

  try {
    const error = normalizeError(thrown);

    // Sanitize context to exclude sensitive data
    const sanitized = sanitizeMetadata(context);

    // Capture with Sentry
    sentryClient.captureException(error, {
      contexts: {
        monitor: sanitized
      }
    });
  } catch (captureError) {
    // Log but do not throw if tracking itself fails
    logger.warn(
      {
        err: captureError,
        error: { message: captureError?.message }
      },
      "Error tracking capture failed"
    );
  }
}

/**
 * Flush pending error events before process exit.
 *
 * This is a no-op if tracking is disabled.
 *
 * @param {number} [timeoutMs=5000]
 * @returns {Promise<void>}
 */
async function flushErrorTracking(timeoutMs = 5000) {
  // If tracking is not enabled, resolve immediately
  if (!isEnabled || !sentryClient) {
    return;
  }

  try {
    // Sentry.close() flushes pending events with timeout
    await sentryClient.close(timeoutMs);
  } catch (error) {
    // Log but do not throw if flushing fails
    logger.warn(
      {
        err: error,
        error: { message: error?.message }
      },
      "Error tracking flush failed"
    );
  }
}

module.exports = {
  initializeErrorTracking,
  captureException,
  flushErrorTracking
};
