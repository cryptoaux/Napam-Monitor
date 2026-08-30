const test = require("node:test");
const assert = require("node:assert/strict");

const { companiesSchema } = require("../src/schemas");

test("valid company configuration passes schema validation", () => {
  const companies = [
    {
      id: "company_01",
      name: "Sample Company",
      tinSecret: "COMPANY_1_TIN",
      passwordSecret: "COMPANY_1_PASSWORD"
    }
  ];

  const result = companiesSchema.safeParse(companies);

  assert.equal(result.success, true);
  assert.deepEqual(result.data, companies);
});

test("invalid company configuration fails schema validation", () => {
  const invalid = [
    {
      id: "company_01",
      name: "Sample Company",
      tinSecret: "COMPANY_1_TIN"
    }
  ];

  const result = companiesSchema.safeParse(invalid);

  assert.equal(result.success, false);
  assert.equal(result.error.issues[0].path[0], 0);
  assert.equal(result.error.issues[0].path[1], "passwordSecret");
});

test("descriptive validation failure is available for invalid configuration", () => {
  const invalid = [
    {
      id: "",
      name: "Sample Company",
      tinSecret: "COMPANY_1_TIN",
      passwordSecret: "COMPANY_1_PASSWORD"
    }
  ];

  const result = companiesSchema.safeParse(invalid);

  assert.equal(result.success, false);
  assert.match(result.error.issues[0].message, /Too small|>=1 characters/i);
  assert.match(String(result.error), /id/i);
});
