const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { EventEmitter } = require("node:events");
const https = require("https");

const { request } = require("../src/http-client");
const {
  getAntiforgeryToken,
  getCookies,
  extractApplicationIds,
  extractSubmittedApplicationNumbers,
  getCurrentStatus
} = require("../src/parsers");

const fixtureRoot = path.resolve(process.cwd(), "test", "fixtures");

const loginPageFixture = fs.readFileSync(
  path.join(fixtureRoot, "login-page.html"),
  "utf8"
);

const applicationsPageFixture = fs.readFileSync(
  path.join(fixtureRoot, "applications-page.html"),
  "utf8"
);

function buildStatusPayload() {
  return {
    statusProductName: "Sample Product",
    trackingAppStageVMs: [
      {
        trackingStageName: "Submitted",
        description: "bg-primary",
        duration: "1d",
        currentStageSet: false
      },
      {
        trackingStageName: "Final Review",
        description: "bg-warning",
        duration: "2d",
        currentStageSet: true
      }
    ]
  };
}

test("login, authenticated app access, and status parsing work with mocked HTTPS responses", async () => {
  const responseSequence = [
    {
      status: 200,
      headers: {
        "set-cookie": [
          ".AspNetCore.Antiforgery=login-cookie; path=/; secure",
          "NAPAMS.Session=seed-session; path=/; HttpOnly"
        ]
      },
      body: loginPageFixture
    },
    {
      status: 302,
      headers: {
        "set-cookie": [
          ".AspNetCore.Antiforgery=session-cookie; path=/; secure",
          "NAPAMS.Auth=auth-token-123; path=/; secure"
        ]
      },
      body: ""
    },
    {
      status: 200,
      headers: {},
      body: applicationsPageFixture
    },
    {
      status: 200,
      headers: {},
      body: JSON.stringify(buildStatusPayload())
    }
  ];

  let callIndex = 0;

  const mockRequest = test.mock.method(
    https,
    "request",
    (options, callback) => {
      const req = new EventEmitter();
      req.write = () => {};
      req.end = () => {
        const response = responseSequence[callIndex++];

        if (!response) {
          throw new Error(
            "Unexpected HTTPS request beyond the mocked sequence."
          );
        }

        const res = new EventEmitter();
        res.statusCode = response.status;
        res.httpVersion = "1.1";
        res.headers = response.headers;
        res.setEncoding = () => {};

        process.nextTick(() => {
          callback(res);

          if (response.body) {
            res.emit("data", response.body);
          }

          res.emit("end");
        });
      };
      req.destroy = () => {};

      return req;
    }
  );

  try {
    const loginPageResponse = await request("GET", "/Applicant/Login", {
      "User-Agent": "NodeTestAgent"
    });

    assert.equal(loginPageResponse.status, 200);
    assert.equal(
      getAntiforgeryToken(loginPageResponse.body),
      "login-token-abc123"
    );

    const initialCookies = getCookies(loginPageResponse.headers["set-cookie"]);
    assert.match(initialCookies, /AspNetCore\.Antiforgery=login-cookie/);
    assert.match(initialCookies, /NAPAMS\.Session=seed-session/);

    const form = new URLSearchParams();
    form.append("Username", "TIN-12345");
    form.append("Password", "ExamplePassword");
    form.append("buttonFunc", "admin");
    form.append("__RequestVerificationToken", "login-token-abc123");

    const loginResponse = await request(
      "POST",
      "/Applicant/Login",
      {
        "User-Agent": "NodeTestAgent",
        "Content-Type": "application/x-www-form-urlencoded",
        "Content-Length": Buffer.byteLength(form.toString()),
        Cookie: initialCookies,
        Referer: "https://registration.nafdac.gov.ng/Applicant/Login",
        Origin: "https://registration.nafdac.gov.ng",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
      },
      form.toString()
    );

    assert.equal(loginResponse.status, 302);

    const authenticatedCookies = getCookies(
      loginResponse.headers["set-cookie"]
    );
    const cookies = [initialCookies, authenticatedCookies]
      .filter(Boolean)
      .join("; ");

    assert.match(cookies, /NAPAMS\.Auth=auth-token-123/);

    const applicationsResponse = await request(
      "GET",
      "/Application/FormApplication/Applications",
      {
        "User-Agent": "NodeTestAgent",
        Cookie: cookies,
        Accept: "text/html"
      }
    );

    assert.equal(applicationsResponse.status, 200);

    const appIds = extractApplicationIds(applicationsResponse.body);
    const appNumbers = extractSubmittedApplicationNumbers(
      applicationsResponse.body
    );

    assert.deepEqual(appIds, ["103", "104"]);
    assert.deepEqual(appNumbers, ["NF-AA-2024", "NF-BB-2025"]);

    const statusPath = `/Application/SubmittedApplication/CheckApplicationStatus?appID=${encodeURIComponent(appIds[0])}`;
    const statusResponse = await request("POST", statusPath, {
      "User-Agent": "NodeTestAgent",
      Cookie: cookies,
      Accept: "application/json, text/plain, */*",
      Referer:
        "https://registration.nafdac.gov.ng/Application/FormApplication/Applications",
      "X-Requested-With": "XMLHttpRequest"
    });

    assert.equal(statusResponse.status, 200);

    const payload = JSON.parse(statusResponse.body);
    assert.equal(getCurrentStatus(payload.trackingAppStageVMs), "Final Review");

    assert.equal(mockRequest.mock.callCount(), 4);
    assert.equal(callIndex, 4);
    assert.equal(
      mockRequest.mock.calls.length,
      4,
      "mocked HTTPS requests should be the only outbound requests in the integration flow"
    );
  } finally {
    mockRequest.mock.restore();
  }
});
