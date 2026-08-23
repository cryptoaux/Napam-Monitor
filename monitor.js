const https = require("https");

const HOST = "registration.nafdac.gov.ng";
const LOGIN_PATH = "/Applicant/Login";
const APPLICATIONS_PATH = "/Application/FormApplication/Applications";

function request(method, path, headers = {}, body = null) {
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: HOST,
        path,
        method,
        headers,
        timeout: 60000
      },
      res => {
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
      }
    );

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

function cleanText(value) {
  return value
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function main() {
  const tin = process.env.NAPAMS_TIN;
  const password = process.env.NAPAMS_PASSWORD;

  if (!tin || !password) {
    throw new Error("NAPAMS_TIN or NAPAMS_PASSWORD is missing.");
  }

  const userAgent =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
    "AppleWebKit/537.36 (KHTML, like Gecko) " +
    "Chrome/131.0.0.0 Safari/537.36";

  // --------------------------------------------------
  // 1. GET LOGIN PAGE
  // --------------------------------------------------

  console.log("Fetching NAPAMS login page...");

  const loginPage = await request("GET", LOGIN_PATH, {
    "User-Agent": userAgent,
    Accept: "text/html"
  });

  const token = getAntiforgeryToken(loginPage.body);
  const initialCookies = getCookies(loginPage.headers["set-cookie"]);

  if (!token) {
    throw new Error("Antiforgery token was not found.");
  }

  // --------------------------------------------------
  // 2. LOGIN AS ADMIN
  // --------------------------------------------------

  console.log("Submitting Admin login...");

  const form = new URLSearchParams();

  form.append("ReturnUrl", "");
  form.append("Username", tin);
  form.append("Password", password);
  form.append("buttonFunc", "admin");
  form.append("__RequestVerificationToken", token);

  const loginResponse = await request(
    "POST",
    LOGIN_PATH,
    {
      "User-Agent": userAgent,
      "Content-Type": "application/x-www-form-urlencoded",
      "Content-Length": Buffer.byteLength(form.toString()),
      "Cookie": initialCookies,
      "Referer": "https://registration.nafdac.gov.ng/Applicant/Login",
      "Origin": "https://registration.nafdac.gov.ng",
      "Accept":
        "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
    },
    form.toString()
  );

  console.log("LOGIN STATUS:", loginResponse.status);
  console.log("LOGIN LOCATION:", loginResponse.headers.location);

  if (loginResponse.status !== 302) {
    throw new Error("NAPAMS login failed.");
  }

  const authCookies = getCookies(loginResponse.headers["set-cookie"]);

  const cookies = [initialCookies, authCookies]
    .filter(Boolean)
    .join("; ");

  console.log("Authenticated session established.");

  // --------------------------------------------------
  // 3. OPEN APPLICATIONS
  // --------------------------------------------------

  console.log("\nOpening submitted applications...");

  const applications = await request(
    "GET",
    APPLICATIONS_PATH,
    {
      "User-Agent": userAgent,
      "Cookie": cookies,
      "Accept": "text/html"
    }
  );

  console.log("APPLICATIONS STATUS:", applications.status);
  console.log(
    "APPLICATIONS HTML LENGTH:",
    applications.body.length
  );

  // --------------------------------------------------
  // 4. SHOW RELEVANT APPLICATION INFORMATION
  // --------------------------------------------------

  console.log("\n--- APPLICATION PAGE TEXT ---");

  const text = cleanText(applications.body);

  console.log(text.slice(0, 15000));

  console.log("\n--- STATUS/CHECK REFERENCES ---");

  const statusMatches =
    applications.body.match(
      /.{0,300}(check status|status|submitted application).{0,500}/gi
    ) || [];

  for (const match of statusMatches.slice(0, 20)) {
    console.log(cleanText(match));
  }

  console.log("\n--- APPLICATION PAGE TEST COMPLETE ---");
}

main().catch(error => {
  console.error("NAPAMS monitor failed:");
  console.error(error);
  process.exit(1);
});
