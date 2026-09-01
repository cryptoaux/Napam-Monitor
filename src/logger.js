const { Writable } = require("node:stream");
const pino = require("pino");

const SENSITIVE_KEY_PATTERN =
  /password|passphrase|secret|token|cookie|tin|authorization|auth/i;

function sanitizeForLogging(value) {
  if (value === null || value === undefined) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeForLogging(item));
  }

  if (typeof value === "string") {
    return value;
  }

  if (typeof value !== "object") {
    return value;
  }

  const sanitized = {};

  for (const [key, nestedValue] of Object.entries(value)) {
    if (SENSITIVE_KEY_PATTERN.test(key)) {
      sanitized[key] = "[REDACTED]";
      continue;
    }

    sanitized[key] = sanitizeForLogging(nestedValue);
  }

  return sanitized;
}

/** @type {string[]} */
const capturedLogs = [];
const stream = new Writable({
  write(chunk, _encoding, callback) {
    capturedLogs.push(chunk.toString());
    callback();
  }
});

const baseLogger = pino(
  {
    level: process.env.LOG_LEVEL || "info",
    timestamp: pino.stdTimeFunctions.isoTime,
    formatters: {
      bindings() {
        return {};
      }
    }
  },
  stream
);

const logger = {
  ...baseLogger,
  __capturedLogs: capturedLogs,
  info: (...args) =>
    baseLogger.info(sanitizeForLogging(args[0]), ...args.slice(1)),
  warn: (...args) =>
    baseLogger.warn(sanitizeForLogging(args[0]), ...args.slice(1)),
  error: (...args) =>
    baseLogger.error(sanitizeForLogging(args[0]), ...args.slice(1)),
  debug: (...args) =>
    baseLogger.debug(sanitizeForLogging(args[0]), ...args.slice(1)),
  child: (bindings) => baseLogger.child(sanitizeForLogging(bindings))
};

module.exports = logger;
