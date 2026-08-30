const https = require("https");

const HOST = "registration.nafdac.gov.ng";

function request(method, path, headers = {}, body = null, attempt = 1) {
  const MAX_ATTEMPTS = 3;

  return new Promise((resolve, reject) => {
    console.log(`HTTP ${method} ${path} (attempt ${attempt}/${MAX_ATTEMPTS})`);
    console.log(`Node.js version: ${process.version}`);

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

        console.log(`HTTP RESPONSE: ${res.statusCode}`);
        console.log(`HTTP VERSION: ${res.httpVersion}`);

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
      console.log("Socket assigned.");

      socket.on("connect", () => {
        console.log("TCP connection established.");
      });

      socket.on("secureConnect", () => {
        console.log("TLS secure connection established.");

        try {
          console.log(`TLS protocol: ${socket.getProtocol()}`);
          console.log(`TLS cipher: ${socket.getCipher()?.name || "Unknown"}`);
          console.log(`TLS authorized: ${socket.authorized}`);
        } catch {
          console.log("TLS diagnostic information unavailable.");
        }
      });

      socket.on("error", (error) => {
        console.error(`SOCKET ERROR: ${error.code || error.message}`);
      });
    });

    req.on("error", (error) => {
      console.error(`HTTP ERROR: ${error.code || error.message}`);

      if (attempt < MAX_ATTEMPTS) {
        const delay = attempt * 3000;

        console.log(`Retrying in ${delay / 1000} seconds...`);

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
      console.error("REQUEST TIMEOUT after 120 seconds");
      req.destroy(new Error("NAPAMS request timed out after 120 seconds."));
    });

    if (body) {
      req.write(body);
    }

    req.end();
  });
}

module.exports = { request };
