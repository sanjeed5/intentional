const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const { INTENTIONAL_DEFAULTS } = require("../lib/defaults.js");
const { DEFAULT_BLOCKED } = require("../lib/behavior.js");

describe("INTENTIONAL_DEFAULTS", () => {
  it("has the expected settings shape", () => {
    assert.deepEqual(INTENTIONAL_DEFAULTS.blockedSites, ["x.com", "twitter.com"]);
    assert.equal(INTENTIONAL_DEFAULTS.pauseSeconds, 10);
    assert.equal(INTENTIONAL_DEFAULTS.allowGraceMinutes, 0);
    assert.equal(INTENTIONAL_DEFAULTS.checkInMinutes, 10);
  });

  it("keeps behavior.js DEFAULT_BLOCKED in sync with blockedSites", () => {
    assert.deepEqual(DEFAULT_BLOCKED, INTENTIONAL_DEFAULTS.blockedSites);
  });
});
