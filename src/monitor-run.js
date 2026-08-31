const logger = require("./logger");

/**
 * MonitorRun tracks execution metrics for a monitoring session.
 * Collects counts and timings without exposing sensitive data.
 */
class MonitorRun {
  constructor() {
    this.startedAt = new Date();
    this.finishedAt = null;
    this.companiesConfigured = 0;
    this.companiesProcessed = 0;
    this.companiesSucceeded = 0;
    this.companiesFailed = 0;
    this.companiesSkipped = 0;
    this.applicationsFound = 0;
    this.applicationsUpdated = 0;
    this.errors = [];
  }

  /**
   * Log completion and emit structured summary.
   */
  finish() {
    this.finishedAt = new Date();
    const durationMs = this.finishedAt - this.startedAt;

    const summary = {
      runStartedAt: this.startedAt.toISOString(),
      runFinishedAt: this.finishedAt.toISOString(),
      durationMs,
      companiesConfigured: this.companiesConfigured,
      companiesProcessed: this.companiesProcessed,
      companiesSucceeded: this.companiesSucceeded,
      companiesFailed: this.companiesFailed,
      companiesSkipped: this.companiesSkipped,
      applicationsFound: this.applicationsFound,
      applicationsUpdated: this.applicationsUpdated,
      errorCount: this.errors.length
    };

    logger.info(summary, "NAPAMS monitoring session completed");

    if (this.errors.length > 0) {
      logger.info(
        {
          errors: this.errors.map((e) => ({
            companyName: e.companyName,
            errorCode: e.errorCode,
            message: e.message
          }))
        },
        "NAPAMS monitoring session errors"
      );
    }

    return summary;
  }

  /**
   * Record that a company was skipped (missing credentials).
   */
  recordCompanySkipped(companyName) {
    this.companiesSkipped++;
    logger.debug({ company: companyName }, "Company skipped");
  }

  /**
   * Record successful company processing.
   */
  recordCompanySuccess(companyName, applicationCount) {
    this.companiesSucceeded++;
    this.applicationsUpdated += applicationCount;
    logger.debug(
      { company: companyName, applicationsUpdated: applicationCount },
      "Company processed successfully"
    );
  }

  /**
   * Record failed company processing.
   */
  recordCompanyFailure(companyName, errorCode, errorMessage) {
    this.companiesFailed++;
    this.errors.push({
      companyName,
      errorCode,
      message: errorMessage
    });
    logger.debug(
      { company: companyName, errorCode },
      "Company processing failed"
    );
  }

  /**
   * Record application count for a company (before processing).
   */
  recordApplicationsDiscovered(count) {
    this.applicationsFound += count;
  }
}

module.exports = MonitorRun;
