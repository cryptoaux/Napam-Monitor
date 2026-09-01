const { z } = require("zod");

const companySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  tinSecret: z.string().min(1),
  passwordSecret: z.string().min(1)
});

const companyCredentialSchema = z.object({
  id: z.string().min(1),
  tin: z.string().min(1),
  password: z.string().min(1)
});

const companiesSchema = z.array(companySchema);
const companyCredentialsSchema = z.array(companyCredentialSchema);

const applicationStatusSchema = z.object({
  statusProductName: z.string().optional(),
  trackingAppStageVMs: z
    .array(
      z.object({
        trackingStageName: z.string().optional(),
        description: z.string().optional(),
        status: z.string().optional(),
        stageStatus: z.string().optional(),
        currentStatus: z.string().optional(),
        duration: z.string().optional(),
        trackingApplicationStage: z
          .union([z.string(), z.number(), z.null()])
          .optional(),
        currentStageSet: z.boolean().optional()
      })
    )
    .optional()
});

module.exports = {
  companySchema,
  companyCredentialSchema,
  companyCredentialsSchema,
  companiesSchema,
  applicationStatusSchema
};
