const test = require("node:test");
const assert = require("node:assert/strict");
const httpClient = require("../src/http-client");
const { loginCompany } = require("../src/login");

const company = { name: "Example Company" };

function buildLoginPage() {
  return {
    status: 200,
    headers: {
      "set-cookie": [
        ".AspNetCore.Antiforgery=initial-cookie; path=/; secure",
        "NAPAMS.Session=seed-session; path=/; HttpOnly"
      ]
    },
    body: '<input name="__RequestVerificationToken" value="login-token-abc123">'
  };
}

test("loginCompany succeeds when the login flow completes with a redirect", async () => {
  let attempts = 0;
  const originalSetTimeout = global.setTimeout;
  global.setTimeout = (fn) => {
    fn();
    return 0;
  };

  const requestStub = test.mock.method(
    httpClient,
    "request",
    async (method) => {
      attempts += 1;

      if (attempts === 1) {
        return buildLoginPage();
      }

      if (attempts === 2) {
        return {
          status: 302,
          headers: {
            "set-cookie": [
              ".AspNetCore.Antiforgery=session-cookie; path=/; secure",
              "NAPAMS.Auth=auth-token-123; path=/; secure"
            ]
          },
          body: ""
        };
      }

      if (attempts === 3) {
        return {
          status: 200,
          headers: {},
          body: "<html>Applications</html>"
        };
      }

      throw new Error(`Unexpected request: ${method}`);
    }
  );

  try {
    const result = await loginCompany(
      company,
      "TIN-12345",
      "Secret123",
      "NodeTestAgent"
    );

    assert.deepEqual(
      result.cookies,
      ".AspNetCore.Antiforgery=initial-cookie; NAPAMS.Session=seed-session; .AspNetCore.Antiforgery=session-cookie; NAPAMS.Auth=auth-token-123"
    );
    assert.equal(result.html, "<html>Applications</html>");
    assert.equal(attempts, 3);
  } finally {
    global.setTimeout = originalSetTimeout;
    requestStub.mock.restore();
  }
});

test("loginCompany retries HTTP 400 before failing", async () => {
  let attempts = 0;
  const originalSetTimeout = global.setTimeout;
  global.setTimeout = (fn) => {
    fn();
    return 0;
  };

  const requestStub = test.mock.method(
    httpClient,
    "request",
    async (method) => {
      attempts += 1;

      if (attempts === 1) {
        return buildLoginPage();
      }

      if (attempts === 2) {
        return {
          status: 400,
          headers: {},
          body: "Bad Request"
        };
      }

      if (attempts === 3) {
        return buildLoginPage();
      }

      if (attempts === 4) {
        return {
          status: 302,
          headers: {
            "set-cookie": [
              ".AspNetCore.Antiforgery=session-cookie; path=/; secure",
              "NAPAMS.Auth=second-attempt-auth; path=/; secure"
            ]
          },
          body: ""
        };
      }

      if (attempts === 5) {
        return {
          status: 200,
          headers: {},
          body: "<html>Applications</html>"
        };
      }

      throw new Error(`Unexpected request: ${method}`);
    }
  );

  try {
    const result = await loginCompany(
      company,
      "TIN-12345",
      "Secret123",
      "NodeTestAgent"
    );

    assert.equal(result.cookies.includes("second-attempt-auth"), true);
    assert.equal(attempts, 5);
  } finally {
    global.setTimeout = originalSetTimeout;
    requestStub.mock.restore();
  }
});

test("loginCompany retries when the page does not provide an antiforgery token", async () => {
  let attempts = 0;
  const originalSetTimeout = global.setTimeout;
  global.setTimeout = (fn) => {
    fn();
    return 0;
  };

  const requestStub = test.mock.method(
    httpClient,
    "request",
    async (method) => {
      attempts += 1;

      if (attempts === 1) {
        return {
          status: 200,
          headers: {
            "set-cookie": [".AspNetCore.Antiforgery=old-cookie; path=/; secure"]
          },
          body: "<form><input type='text' name='other'></form>"
        };
      }

      if (attempts === 2) {
        return {
          status: 200,
          headers: {
            "set-cookie": [
              ".AspNetCore.Antiforgery=refresh-cookie; path=/; secure",
              "NAPAMS.Session=refreshed-session; path=/; HttpOnly"
            ]
          },
          body: '<input name="__RequestVerificationToken" value="retry-token-xyz">'
        };
      }

      if (attempts === 3) {
        return {
          status: 302,
          headers: {
            "set-cookie": [
              ".AspNetCore.Antiforgery=session-cookie; path=/; secure",
              "NAPAMS.Auth=auth-token-456; path=/; secure"
            ]
          },
          body: ""
        };
      }

      if (attempts === 4) {
        return {
          status: 200,
          headers: {},
          body: "<html>Applications</html>"
        };
      }

      throw new Error(`Unexpected request: ${method}`);
    }
  );

  try {
    const result = await loginCompany(
      company,
      "TIN-12345",
      "Secret123",
      "NodeTestAgent"
    );

    assert.equal(result.cookies.includes("auth-token-456"), true);
    assert.equal(attempts, 4);
  } finally {
    global.setTimeout = originalSetTimeout;
    requestStub.mock.restore();
  }
});

test("loginCompany fails with an informative error when the session cannot be established", async () => {
  const requestStub = test.mock.method(
    httpClient,
    "request",
    async (method) => {
      if (method === "GET") {
        return {
          status: 200,
          headers: {
            "set-cookie": [
              ".AspNetCore.Antiforgery=initial-cookie; path=/; secure"
            ]
          },
          body: '<input name="__RequestVerificationToken" value="login-token-abc123">'
        };
      }

      return {
        status: 500,
        headers: {},
        body: "Server Error"
      };
    }
  );

  try {
    await assert.rejects(
      () => loginCompany(company, "TIN-12345", "Secret123", "NodeTestAgent"),
      {
        message: "NAPAMS login failed. HTTP 500"
      }
    );
  } finally {
    requestStub.mock.restore();
  }
});
