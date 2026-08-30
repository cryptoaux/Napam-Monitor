const https = require("https");
const logger = require("./logger");

const HOST = "registration.nafdac.gov.ng";

function request(method, path, headers = {}, body = null, attempt = 1) {
  const MAX_ATTEMPTS = 3;

  return new Promise((resolve, reject) => {
    logger.info(
      { method, path, attempt, maxAttempts: MAX_ATTEMPTS },
      "HTTP request started"
    );
    logger.info({ nodeVersion: process.version }, "Runtime info");

    const req = https.request(
      {
        hostname: HOST,
        port: 443,
        path,
        method,
        headers,
        timeout: 120000
      },
      (res) => {
        let data = "";

        logger.info(
          { statusCode: res.statusCode, httpVersion: res.httpVersion },
          "HTTP response received"
        );

        res.setEncoding("utf8");

        res.on("data", (chunk) => {
          data += chunk;
        });

        res.on("end", () => {
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: data
          });
        });
      }
    );

    req.on("socket", (socket) => {
      logger.info({ host: HOST }, "Socket assigned");

      socket.on("connect", () => {
        logger.info({ host: HOST }, "TCP connection established");
      });

      socket.on("secureConnect", () => {
        logger.info({ host: HOST }, "TLS secure connection established");

        try {
          logger.info(
            {
              host: HOST,
              protocol: socket.getProtocol(),
              cipher: socket.getCipher()?.name || "Unknown",
              authorized: socket.authorized
            },
            "TLS diagnostics"
          );
        } catch {
          logger.warn({ host: HOST }, "TLS diagnostics unavailable");
        }
      });

      socket.on("error", (error) => {
        logger.error(
          { host: HOST, error: { code: error.code, message: error.message } },
          "Socket error"
        );
      });
    });

    req.on("error", (error) => {
      logger.error(
        {
          host: HOST,
          method,
          path,
          attempt,
          error: { code: error.code, message: error.message }
        },
        "HTTP request error"
      );

      if (attempt < MAX_ATTEMPTS) {
        const delay = attempt * 3000;

        logger.warn(
          { host: HOST, method, path, attempt, delayMs: delay },
          "Retrying HTTP request"
        );

        setTimeout(() => {
          request(method, path, headers, body, attempt + 1)
            .then(resolve)
            .catch(reject);
        }, delay);

        return;
      }

      reject(error);
    });

    req.on("timeout", () => {
      logger.error(
        { host: HOST, method, path, timeoutMs: 120000 },
        "HTTP request timed out"
      );
      req.destroy(new Error("NAPAMS request timed out after 120 seconds."));
    });

    if (body) {
      req.write(body);
    }

    req.end();
  });
}

module.exports = { request };
