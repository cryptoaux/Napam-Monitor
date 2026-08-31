const test = require("node:test");
const assert = require("node:assert/strict");
const {
  formatApplicationResult,
  filterAndFormatResults,
  groupResultsByCompany,
  buildOutputStructure
} = require("../src/result-processor");

test("formatApplicationResult normalizes stages and preserves success results", () => {
  const input = {
    companyId: "company_1",
    companyName: "Test Company",
    applicationNumber: "NF-AA-2024",
    appID: "123",
    product: "Test Product",
    currentStatus: "Final Review",
    currentStatusColor: "YELLOW",
    stages: [
      {
        trackingStageName: "Submitted",
        description: "bg-primary",
        duration: "1d",
        stageStatus: "Complete",
        currentStageSet: false
      },
      {
        trackingStageName: "Final Review",
        description: "bg-warning",
        duration: "2d",
        stageStatus: "In Progress",
        currentStageSet: true
      }
    ]
  };

  const output = formatApplicationResult(input);

  assert.equal(output.companyId, "company_1");
  assert.equal(output.companyName, "Test Company");
  assert.equal(output.applicationNumber, "NF-AA-2024");
  assert.equal(output.name, "Test Product");
  assert.equal(output.product, "Test Product");
  assert.equal(output.currentStatus, "Final Review");
  assert.equal(output.currentStatusColor, "YELLOW");
  assert.equal(output.stages.length, 2);
  assert.equal(output.stages[0].name, "Submitted");
  assert.equal(output.stages[1].currentStageSet, true);
});

test("formatApplicationResult handles empty or missing stages", () => {
  const input = {
    companyId: "company_1",
    companyName: "Test Company",
    applicationNumber: "NF-AA-2024",
    appID: "123",
    product: "Test Product",
    currentStatus: "Unknown",
    currentStatusColor: "RED",
    stages: null
  };

  const output = formatApplicationResult(input);

  assert.equal(output.stages.length, 0);
});

test("filterAndFormatResults excludes failed results", () => {
  const input = [
    {
      success: true,
      companyId: "company_1",
      companyName: "Company A",
      applicationNumber: "NF-AA-2024",
      appID: "123",
      product: "Product A",
      currentStatus: "Final Review",
      currentStatusColor: "YELLOW",
      stages: []
    },
    {
      success: false,
      companyId: "company_1",
      companyName: "Company A",
      applicationNumber: "NF-BB-2024",
      appID: "124",
      product: "Product B",
      currentStatus: "Unknown",
      currentStatusColor: "RED",
      stages: []
    }
  ];

  const output = filterAndFormatResults(input);

  assert.equal(output.length, 1);
  assert.equal(output[0].applicationNumber, "NF-AA-2024");
});

test("groupResultsByCompany organizes applications by company", () => {
  const input = [
    {
      companyId: "company_1",
      companyName: "Company A",
      applicationNumber: "NF-AA-2024",
      appID: "123",
      name: "Product A",
      product: "Product A",
      currentStatus: "Final Review",
      currentStatusColor: "YELLOW",
      stages: []
    },
    {
      companyId: "company_1",
      companyName: "Company A",
      applicationNumber: "NF-AA-2025",
      appID: "124",
      name: "Product B",
      product: "Product B",
      currentStatus: "Final Review",
      currentStatusColor: "YELLOW",
      stages: []
    },
    {
      companyId: "company_2",
      companyName: "Company B",
      applicationNumber: "NF-BB-2024",
      appID: "125",
      name: "Product C",
      product: "Product C",
      currentStatus: "Submitted",
      currentStatusColor: "GREEN",
      stages: []
    }
  ];

  const output = groupResultsByCompany(input);

  assert.equal(output.length, 2);
  assert.equal(output[0].name, "Company A");
  assert.equal(output[0].applications.length, 2);
  assert.equal(output[1].name, "Company B");
  assert.equal(output[1].applications.length, 1);
});

test("buildOutputStructure constructs complete output with metadata", () => {
  const input = [
    {
      success: true,
      companyId: "company_1",
      companyName: "Company A",
      applicationNumber: "NF-AA-2024",
      appID: "123",
      product: "Product A",
      currentStatus: "Final Review",
      currentStatusColor: "YELLOW",
      stages: [
        {
          trackingStageName: "Submitted",
          description: "bg-primary",
          duration: "1d",
          currentStageSet: false
        }
      ]
    }
  ];

  const output = buildOutputStructure(input);

  assert.match(output.updatedAt, /T.*Z$/);
  assert.equal(output.totalCompanies, 1);
  assert.equal(output.totalApplications, 1);
  assert.equal(output.companies.length, 1);
  assert.equal(output.applications.length, 1);
  assert.equal(output.companies[0].applications.length, 1);
});

test("buildOutputStructure returns empty structure for no results", () => {
  const output = buildOutputStructure([]);

  assert.equal(output.totalCompanies, 0);
  assert.equal(output.totalApplications, 0);
  assert.equal(output.companies.length, 0);
  assert.equal(output.applications.length, 0);
});

test("buildOutputStructure sanitizes output and excludes failed results", () => {
  const input = [
    {
      success: true,
      companyId: "company_1",
      companyName: "Company A",
      applicationNumber: "NF-AA-2024",
      appID: "123",
      product: "Product A",
      currentStatus: "Final Review",
      currentStatusColor: "YELLOW",
      stages: []
    },
    {
      success: false,
      companyId: "company_1",
      companyName: "Company A",
      applicationNumber: "NF-BB-2024",
      appID: "124",
      product: "Product B",
      currentStatus: "Unknown",
      currentStatusColor: "RED",
      stages: []
    }
  ];

  const output = buildOutputStructure(input);

  assert.equal(output.totalApplications, 1);
  assert.equal(output.applications.length, 1);
  assert.equal(output.applications[0].applicationNumber, "NF-AA-2024");
});

test("buildOutputStructure handles multiple stages correctly", () => {
  const input = [
    {
      success: true,
      companyId: "company_1",
      companyName: "Company A",
      applicationNumber: "NF-AA-2024",
      appID: "123",
      product: "Product A",
      currentStatus: "Final Review",
      currentStatusColor: "YELLOW",
      stages: [
        {
          trackingStageName: "Submitted",
          description: "bg-primary",
          duration: "1d",
          status: "Complete",
          trackingApplicationStage: "SUBMITTED",
          currentStageSet: false
        },
        {
          trackingStageName: "Final Review",
          description: "bg-warning",
          duration: "2d",
          status: "In Progress",
          trackingApplicationStage: "FINAL_REVIEW",
          currentStageSet: true
        },
        {
          trackingStageName: "Approved",
          description: "bg-success",
          duration: "1d",
          status: "Pending",
          trackingApplicationStage: "APPROVED",
          currentStageSet: false
        }
      ]
    }
  ];

  const output = buildOutputStructure(input);

  assert.equal(output.applications[0].stages.length, 3);
  assert.equal(output.applications[0].stages[0].name, "Submitted");
  assert.equal(output.applications[0].stages[1].name, "Final Review");
  assert.equal(output.applications[0].stages[2].name, "Approved");
  assert.equal(output.applications[0].stages[1].currentStageSet, true);
});
