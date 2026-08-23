const https = require("https");

const HOST = "registration.nafdac.gov.ng";
const LOGIN_PATH = "/Applicant/Login";

function request(method, path, headers = {}, body = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: HOST,
      path,
      method,
      headers: {
        ...headers
      },
      timeout: 60000
    };

    const req = https.request(options, res => {
      let data = "";

      res.setEncoding("utf8");

      res.on("data", chunk => {
        data += chunk;
      });

      res.on("end", () => {
        resolve({
          status: res.statusCode,
          headers: res.headers,
          body: data
        });
      });
    });

    req.on("error", reject);

    req.on("timeout", () => {
      req.destroy(new Error("Request timed out."));
    });

    if (body) {
      req.write(body);
    }

    req.end();
  });
}

function getCookies(setCookie) {
  if (!setCookie) return "";

  return setCookie
    .map(cookie => cookie.split(";")[0])
    .join("; ");
}

function getAntiforgeryToken(html) {
  const match = html.match(
    /name="__RequestVerificationToken"[^>]*value="([^"]+)"/i
  );

  return match ? match[1] : null;
}

async function main() {
  const tin = process.env.NAPAMS_TIN;
  const password = process.env.NAPAMS_PASSWORD;

  if (!tin || !password) {
    throw new Error("NAPAMS_TIN or NAPAMS_PASSWORD is missing.");
  }

  console.log("Fetching NAPAMS Admin login page...");

  const loginPage = await request("GET", LOGIN_PATH, {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
      "AppleWebKit/537.36 (KHTML, like Gecko) " +
      "Chrome/131.0.0.0 Safari/537.36",
    Accept: "text/html"
  });

  console.log("LOGIN PAGE STATUS:", loginPage.status);

  if (loginPage.status !== 200) {
    throw new Error(
      `Could not load NAPAMS login page. HTTP ${loginPage.status}`
    );
  }

  const token = getAntiforgeryToken(loginPage.body);
  const cookies = getCookies(loginPage.headers["set-cookie"]);

  if (!token) {
    throw new Error("Antiforgery token was not found.");
  }

  console.log("Antiforgery token found.");
  console.log("Session cookie received.");

  const form = new URLSearchParams();

  form.append("ReturnUrl", "");
  form.append("Username", tin);
  form.append("Password", password);
  form.append("buttonFunc", "admin");
  form.append("__RequestVerificationToken", token);

  console.log("Submitting Admin login...");

  const loginResponse = await request(
    "POST",
    LOGIN_PATH,
    {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
        "AppleWebKit/537.36 (KHTML, like Gecko) " +
        "Chrome/131.0.0.0 Safari/537.36",

      "Content-Type":
        "application/x-www-form-urlencoded",

      "Content-Length":
        Buffer.byteLength(form.toString()),

      "Cookie": cookies,

      "Referer":
        "https://registration.nafdac.gov.ng/Applicant/Login",

      "Origin":
        "https://registration.nafdac.gov.ng",

      "Accept":
        "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
    },
    form.toString()
  );

  console.log("\n--- LOGIN RESPONSE ---");
  console.log("STATUS:", loginResponse.status);
  console.log("LOCATION:", loginResponse.headers.location || "none");

  const newCookies = getCookies(
    loginResponse.headers["set-cookie"]
  );

  console.log(
    "AUTH COOKIE RECEIVED:",
    newCookies ? "YES" : "NO"
  );

  console.log("\n--- RESPONSE CHECK ---");

  if (loginResponse.status >= 300 && loginResponse.status < 400) {
    console.log("Login returned a redirect.");

    if (loginResponse.headers.location) {
      console.log(
        "Redirect destination:",
        loginResponse.headers.location
      );
    }
  } else {
    console.log(
      "Response body length:",
      loginResponse.body.length
    );

    console.log(
      loginResponse.body.slice(0, 5000)
    );
  }

  console.log("\n--- LOGIN TEST COMPLETE ---");
}

main().catch(error => {
  console.error("NAPAMS monitor failed:");
  console.error(error);
  process.exit(1);
});
