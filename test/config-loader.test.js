const assert = require("node:assert");
const { test } = require("node:test");
const { getStructuredCompanyCredentials } = require("../src/config-loader");

function withCompanyCredentialsJson(jsonPayload, callback) {
  const original = process.env.COMPANIES_CREDENTIALS_JSON;

  if (jsonPayload === undefined) {
    delete process.env.COMPANIES_CREDENTIALS_JSON;
  } else {
    process.env.COMPANIES_CREDENTIALS_JSON = jsonPayload;
  }

  try {
    return callback();
  } finally {
    if (original === undefined) {
      delete process.env.COMPANIES_CREDENTIALS_JSON;
    } else {
      process.env.COMPANIES_CREDENTIALS_JSON = original;
    }
  }
}

test("config-loader: valid JSON with one credential is accepted", () => {
  const payload =
    '[{"id":"company_01","tin":"tin-001","password":"password-001"}]';

  withCompanyCredentialsJson(payload, () => {
    const credentials = getStructuredCompanyCredentials();

    assert.equal(credentials.size, 1);
    assert.deepEqual(credentials.get("company_01"), {
      tin: "tin-001",
      password: "password-001"
    });
  });
});

test("config-loader: valid JSON with multiple credentials is accepted", () => {
  const payload =
    '[{"id":"company_01","tin":"tin-001","password":"password-001"},{"id":"company_02","tin":"tin-002","password":"password-002"}]';

  withCompanyCredentialsJson(payload, () => {
    const credentials = getStructuredCompanyCredentials();

    assert.equal(credentials.size, 2);
    assert.deepEqual(credentials.get("company_01"), {
      tin: "tin-001",
      password: "password-001"
    });
    assert.deepEqual(credentials.get("company_02"), {
      tin: "tin-002",
      password: "password-002"
    });
  });
});

test("config-loader: empty environment returns empty Map", () => {
  withCompanyCredentialsJson("", () => {
    const credentials = getStructuredCompanyCredentials();
    assert.equal(credentials.size, 0);
  });
});

test("config-loader: missing environment returns empty Map", () => {
  withCompanyCredentialsJson(undefined, () => {
    const credentials = getStructuredCompanyCredentials();
    assert.equal(credentials.size, 0);
  });
});

test("config-loader: invalid JSON is rejected", () => {
  const payload = '{"invalid json without closing bracket';

  assert.throws(
    () => {
      withCompanyCredentialsJson(payload, () =>
        getStructuredCompanyCredentials()
      );
    },
    (error) =>
      error.message.includes("Invalid JSON in COMPANIES_CREDENTIALS_JSON")
  );
});

test("config-loader: invalid schema is rejected", () => {
  const invalidPayload =
    '[{"id":"","tin":"tin-001","password":"password-001"}]';

  assert.throws(
    () => {
      withCompanyCredentialsJson(invalidPayload, () =>
        getStructuredCompanyCredentials()
      );
    },
    (error) => error.message.includes("COMPANIES_CREDENTIALS_JSON is invalid")
  );
});

test("config-loader: credentials are keyed by id", () => {
  const payload =
    '[{"id":"company_01","tin":"tinA","password":"passA"},{"id":"company_02","tin":"tinB","password":"passB"}]';

  withCompanyCredentialsJson(payload, () => {
    const credentials = getStructuredCompanyCredentials();

    assert.ok(credentials.has("company_01"));
    assert.ok(credentials.has("company_02"));
    assert.equal(credentials.get("company_01").tin, "tinA");
    assert.equal(credentials.get("company_02").password, "passB");
  });
});

test("config-loader: synthetic credentials do not appear in error messages", () => {
  assert.throws(
    () => {
      withCompanyCredentialsJson(
        '[{"id":"","tin":"sensitive-tin","password":"sensitive-password"}]',
        () => getStructuredCompanyCredentials()
      );
    },
    (error) => {
      const message = String(error.message);
      return (
        message.includes("COMPANIES_CREDENTIALS_JSON is invalid") &&
        !message.includes("sensitive-password") &&
        !message.includes("sensitive-tin")
      );
    }
  );
});

test("config-loader: whitespace handling in JSON works correctly", () => {
  const payload = `
    [
      {
        "id": "company_01",
        "tin": "tin-001",
        "password": "password-001"
      }
    ]
  `;

  withCompanyCredentialsJson(payload, () => {
    const credentials = getStructuredCompanyCredentials();

    assert.equal(credentials.size, 1);
    assert.deepEqual(credentials.get("company_01"), {
      tin: "tin-001",
      password: "password-001"
    });
  });
});

test("config-loader: returns a Map with the expected structure", () => {
  const payload =
    '[{"id":"company_01","tin":"tin-001","password":"password-001"}]';

  withCompanyCredentialsJson(payload, () => {
    const credentials = getStructuredCompanyCredentials();

    assert.ok(credentials instanceof Map);
    assert.equal(typeof credentials.get, "function");
    assert.equal(typeof credentials.get("company_01").tin, "string");
    assert.equal(typeof credentials.get("company_01").password, "string");
  });
});
