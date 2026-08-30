const { Writable } = require("node:stream");
const pino = require("pino");

const capturedLogs = [];
const stream = new Writable({
  write(chunk, _encoding, callback) {
    capturedLogs.push(chunk.toString());
    callback();
  }
});

const logger = pino(
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

logger.__capturedLogs = capturedLogs;

module.exports = logger;
