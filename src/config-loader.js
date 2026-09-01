const { companyCredentialsSchema } = require("./schemas");
const { NapamsConfigError } = require("./errors");

function getStructuredCompanyCredentials() {
  const raw = process.env.COMPANIES_CREDENTIALS_JSON;

  if (!raw || !raw.trim()) {
    return new Map();
  }

  let parsed;

  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new NapamsConfigError(
      "COMPANIES_CREDENTIALS_INVALID",
      `Invalid JSON in COMPANIES_CREDENTIALS_JSON: ${error.message}`
    );
  }

  const result = companyCredentialsSchema.safeParse(parsed);

  if (!result.success) {
    throw new NapamsConfigError(
      "COMPANIES_CREDENTIALS_INVALID",
      `COMPANIES_CREDENTIALS_JSON is invalid: ${result.error.issues
        .map((issue) => `${issue.path.join(".") || "root"}: ${issue.message}`)
        .join("; ")}`
    );
  }

  const credentialMap = new Map();

  for (const credential of result.data) {
    credentialMap.set(credential.id, {
      tin: credential.tin,
      password: credential.password
    });
  }

  return credentialMap;
}

module.exports = {
  getStructuredCompanyCredentials
};
