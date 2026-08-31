class NapamsError extends Error {
  constructor(name, code, message, options = {}) {
    super(message);
    this.name = name;
    this.code = code;

    if (options.cause !== undefined) {
      this.cause = options.cause;
    }
  }
}

class NapamsHttpError extends NapamsError {
  constructor(code, message, options = {}) {
    super("NapamsHttpError", code, message, options);
  }
}

class NapamsParseError extends NapamsError {
  constructor(code, message, options = {}) {
    super("NapamsParseError", code, message, options);
  }
}

class NapamsConfigError extends NapamsError {
  constructor(code, message, options = {}) {
    super("NapamsConfigError", code, message, options);
  }
}

module.exports = {
  NapamsError,
  NapamsHttpError,
  NapamsParseError,
  NapamsConfigError
};
