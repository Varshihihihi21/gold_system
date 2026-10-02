/** Error with an HTTP status suitable for a business-rule rejection. */
class FinanceError extends Error {
  constructor(status, message) {
    super(message);
    this.name = 'FinanceError';
    this.status = status;
  }
}

module.exports = { FinanceError };
