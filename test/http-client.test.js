const test = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const https = require("node:https");

const { request } = require("../src/http-client");
const { NapamsHttpError } = require("../src/errors");

function buildResponse(statusCode, body, headers = {}) {
  const res = new EventEmitter();
  res.statusCode = statusCode;
  res.httpVersion = "1.1";
  res.headers = headers;
  res.setEncoding = () => {};
  return res;
}

test("request resolves on the first attempt when the HTTPS call succeeds", async () => {
  const requestStub = test.mock.method(
    https,
    "request",
    (options, callback) => {
      void options;
      const req = new EventEmitter();
      req.write = () => {};
      req.end = () => {
        process.nextTick(() => {
          const res = buildResponse(200, "ok", {
            "content-type": "text/plain"
          });

          callback(res);
          res.emit("data", "ok");
          res.emit("end");
        });
      };
      req.destroy = () => {};

      return req;
    }
  );

  try {
    const response = await request("GET", "/ok", {
      Accept: "text/plain"
    });

    assert.deepEqual(response, {
      status: 200,
      headers: { "content-type": "text/plain" },
      body: "ok"
    });
    assert.equal(requestStub.mock.callCount(), 1);
  } finally {
    requestStub.mock.restore();
  }
});

test("request retries a transport error and resolves after a successful retry", async () => {
  let attempts = 0;
  const delays = [];
  const originalSetTimeout = global.setTimeout;
  global.setTimeout = (fn, delay) => {
    delays.push(delay);
    fn();
    return 0;
  };

  const requestStub = test.mock.method(
    https,
    "request",
    (options, callback) => {
      void options;
      const req = new EventEmitter();
      req.write = () => {};
      req.end = () => {
        process.nextTick(() => {
          attempts += 1;

          if (attempts === 1) {
            req.emit(
              "error",
              Object.assign(new Error("ECONNRESET"), { code: "ECONNRESET" })
            );
            return;
          }

          const res = buildResponse(202, "retry-success", {});
          callback(res);
          res.emit("data", "retry-success");
          res.emit("end");
        });
      };
      req.destroy = () => {};

      return req;
    }
  );

  try {
    const response = await request(
      "POST",
      "/retry",
      { "Content-Type": "application/json" },
      '{"retry":true}'
    );

    assert.deepEqual(response, {
      status: 202,
      headers: {},
      body: "retry-success"
    });
    assert.equal(attempts, 2);
    assert.deepEqual(delays, [3000]);
    assert.equal(requestStub.mock.callCount(), 2);
  } finally {
    global.setTimeout = originalSetTimeout;
    requestStub.mock.restore();
  }
});

test("request keeps retrying until the configured limit is exhausted", async () => {
  let attempts = 0;
  const delays = [];
  const originalSetTimeout = global.setTimeout;
  global.setTimeout = (fn, delay) => {
    delays.push(delay);
    fn();
    return 0;
  };

  const requestStub = test.mock.method(https, "request", () => {
    const req = new EventEmitter();
    req.write = () => {};
    req.end = () => {
      process.nextTick(() => {
        attempts += 1;
        req.emit(
          "error",
          Object.assign(new Error("ETIMEDOUT"), { code: "ETIMEDOUT" })
        );
      });
    };
    req.destroy = () => {};

    return req;
  });

  try {
    await assert.rejects(
      () => request("GET", "/timeout"),
      (err) => {
        assert.ok(err instanceof NapamsHttpError);
        assert.equal(err.code, "HTTP_REQUEST_FAILED");
        assert.equal(err.cause.code, "ETIMEDOUT");
        assert.equal(attempts, 3);
        assert.deepEqual(delays, [3000, 6000]);
        return true;
      }
    );

    assert.equal(requestStub.mock.callCount(), 3);
  } finally {
    global.setTimeout = originalSetTimeout;
    requestStub.mock.restore();
  }
});
