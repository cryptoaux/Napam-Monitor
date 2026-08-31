const test = require("node:test");
const assert = require("node:assert/strict");
const httpClient = require("../src/http-client");
const { checkApplicationStatus } = require("../src/status-checker");

test("checkApplicationStatus returns the raw NAPAMS status response", async () => {
  const requestStub = test.mock.method(httpClient, "request", async () => ({
    status: 200,
    headers: { "content-type": "application/json" },
    body: '{"statusProductName":"Example Product","trackingAppStageVMs":[{"trackingStageName":"Submitted","description":"bg-primary"}]}'
  }));

  try {
    const response = await checkApplicationStatus(
      "123",
      "session=abc",
      "NodeTestAgent"
    );

    assert.equal(response.status, 200);
    assert.equal(response.body.includes("Example Product"), true);
  } finally {
    requestStub.mock.restore();
  }
});

test("checkApplicationStatus preserves the existing request path, headers, and POST semantics", async () => {
  let seenOptions;

  const requestStub = test.mock.method(
    httpClient,
    "request",
    async (method, path, headers) => {
      seenOptions = { method, path, headers };

      return {
        status: 200,
        headers: {},
        body: '{"statusProductName":"Example Product","trackingAppStageVMs":[]}'
      };
    }
  );

  try {
    await checkApplicationStatus("app-42", "cookie=value", "NodeTestAgent");

    assert.equal(seenOptions.method, "POST");
    assert.equal(
      seenOptions.path,
      "/Application/SubmittedApplication/CheckApplicationStatus?appID=app-42"
    );
    assert.equal(seenOptions.headers["User-Agent"], "NodeTestAgent");
    assert.equal(seenOptions.headers.Cookie, "cookie=value");
    assert.equal(
      seenOptions.headers.Accept,
      "application/json, text/plain, */*"
    );
    assert.equal(
      seenOptions.headers.Referer,
      "https://registration.nafdac.gov.ng/Application/FormApplication/Applications"
    );
    assert.equal(seenOptions.headers["X-Requested-With"], "XMLHttpRequest");
  } finally {
    requestStub.mock.restore();
  }
});

test("checkApplicationStatus propagates request failures", async () => {
  const requestStub = test.mock.method(httpClient, "request", async () => {
    throw new Error("Status request failed");
  });

  try {
    await assert.rejects(
      () => checkApplicationStatus("123", "session=abc", "NodeTestAgent"),
      {
        message: "Status request failed"
      }
    );
  } finally {
    requestStub.mock.restore();
  }
});
