const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const {
  findBlockingPattern,
  isInterruptUrl,
  tabStillOnInterruptUrl,
  allowanceKey,
  resolvePattern,
  createAllowanceStore,
  shouldInterceptNavigation,
  tabStillOnBlockedHost,
  shouldClearCheckInSession,
  allowanceExpiry,
} = require("../lib/behavior.js");

const BLOCKED = ["x.com", "twitter.com"];
const TAB = 42;

describe("entry gate — autopilot opening", () => {
  it("intercepts a blocked site when there is no allowance", () => {
    const allowances = createAllowanceStore();
    const result = shouldInterceptNavigation({
      tabId: TAB,
      host: "x.com",
      blockedSites: BLOCKED,
      allowances,
    });
    assert.equal(result.intercept, true);
    assert.equal(result.pattern, "x.com");
  });

  it("does not intercept after continue grants allowance for that pattern", () => {
    const allowances = createAllowanceStore();
    allowances.grant(TAB, "x.com", -1);
    const result = shouldInterceptNavigation({
      tabId: TAB,
      host: "x.com",
      blockedSites: BLOCKED,
      allowances,
    });
    assert.equal(result, false);
  });

  it("does not intercept subdomains after allowance on parent pattern", () => {
    const allowances = createAllowanceStore();
    allowances.grant(TAB, "twitter.com", -1);
    const result = shouldInterceptNavigation({
      tabId: TAB,
      host: "mobile.twitter.com",
      blockedSites: BLOCKED,
      allowances,
    });
    assert.equal(result, false);
  });

  it("keeps x.com and twitter.com as separate allowances", () => {
    const allowances = createAllowanceStore();
    allowances.grant(TAB, "x.com", -1);
    const result = shouldInterceptNavigation({
      tabId: TAB,
      host: "twitter.com",
      blockedSites: BLOCKED,
      allowances,
    });
    assert.equal(result.intercept, true);
  });

  it("allows one navigation when grace is zero, then re-intercepts", () => {
    const allowances = createAllowanceStore();
    allowances.grant(TAB, "x.com", 0);
    assert.equal(allowances._entries.size, 0);
    assert.equal(allowances._pending.size, 1);

    const first = shouldInterceptNavigation({
      tabId: TAB,
      host: "x.com",
      blockedSites: BLOCKED,
      allowances,
    });
    assert.equal(first, false);
    assert.equal(allowances._pending.size, 0);

    const second = shouldInterceptNavigation({
      tabId: TAB,
      host: "x.com",
      blockedSites: BLOCKED,
      allowances,
    });
    assert.equal(second.intercept, true);
  });

  it("clears pending after storage is visible so timed grace can expire", () => {
    let now = 1_000_000;
    const allowances = createAllowanceStore(() => now);
    allowances.grant(TAB, "x.com", 5);
    assert.equal(allowances.isAllowed(TAB, "x.com", BLOCKED), true);
    assert.equal(allowances._pending.size, 0);
    now += 5 * 60 * 1000 + 1;
    assert.equal(allowances.isAllowed(TAB, "x.com", BLOCKED), false);
  });

  it("re-intercepts after a timed grace window expires", () => {
    let now = 1_000_000;
    const allowances = createAllowanceStore(() => now);
    allowances.grant(TAB, "x.com", 5);
    assert.equal(
      shouldInterceptNavigation({
        tabId: TAB,
        host: "x.com",
        blockedSites: BLOCKED,
        allowances,
      }),
      false,
    );
    now += 5 * 60 * 1000 + 1;
    const result = shouldInterceptNavigation({
      tabId: TAB,
      host: "x.com",
      blockedSites: BLOCKED,
      allowances,
    });
    assert.equal(result.intercept, true);
  });

  it("does not intercept the extension intercept page itself", () => {
    const allowances = createAllowanceStore();
    const result = shouldInterceptNavigation({
      tabId: TAB,
      host: "x.com",
      blockedSites: BLOCKED,
      allowances,
      isExtensionUrl: true,
    });
    assert.equal(result, false);
  });

  it("allows immediately after grant — no storage read race on continue", () => {
    const allowances = createAllowanceStore();
    allowances.grant(TAB, "x.com", -1);
    assert.equal(allowances.isAllowed(TAB, "x.com", BLOCKED), true);
    assert.equal(
      shouldInterceptNavigation({
        tabId: TAB,
        host: "x.com",
        blockedSites: BLOCKED,
        allowances,
      }),
      false,
    );
  });

  it("re-intercepts if navigation fires before allowance is visible (the continue bug)", () => {
    const allowances = createAllowanceStore();
    const result = shouldInterceptNavigation({
      tabId: TAB,
      host: "x.com",
      blockedSites: BLOCKED,
      allowances,
    });
    assert.equal(result.intercept, true);
  });

  it("resolves pattern from target URL on continue", () => {
    assert.equal(
      resolvePattern("https://www.x.com/home", "x.com", BLOCKED),
      "x.com",
    );
  });

  it("uses the same allowance key for grant and navigation check", () => {
    const allowances = createAllowanceStore();
    const pattern = findBlockingPattern("mobile.twitter.com", BLOCKED);
    allowances.grant(TAB, pattern, -1);
    assert.equal(allowanceKey(TAB, pattern), allowanceKey(TAB, "twitter.com"));
    assert.equal(allowances.isAllowed(TAB, "mobile.twitter.com", BLOCKED), true);
  });
});

describe("session check-in — mindless staying", () => {
  it("keeps check-in session while tab stays on blocked host", () => {
    assert.equal(
      tabStillOnBlockedHost("https://x.com/home", "x.com", BLOCKED),
      true,
    );
    assert.equal(
      shouldClearCheckInSession("https://x.com/home", "x.com", BLOCKED),
      false,
    );
  });

  it("clears check-in session when tab leaves blocked host", () => {
    assert.equal(
      shouldClearCheckInSession("https://google.com", "x.com", BLOCKED),
      true,
    );
  });

  it("clears check-in session on extension intercept page without clearing entry allowance", () => {
    const allowances = createAllowanceStore();
    allowances.grant(TAB, "x.com", -1);
    assert.equal(
      tabStillOnBlockedHost(
        "chrome-extension://abc/intercept/intercept.html",
        "x.com",
        BLOCKED,
      ),
      false,
    );
    assert.equal(
      shouldClearCheckInSession(
        "chrome-extension://abc/intercept/intercept.html",
        "x.com",
        BLOCKED,
      ),
      true,
    );
    assert.equal(allowances.isAllowed(TAB, "x.com", BLOCKED), true);
  });

  it("does not clear check-in when navigating between subdomains of same pattern", () => {
    assert.equal(
      shouldClearCheckInSession(
        "https://mobile.twitter.com",
        "twitter.com",
        BLOCKED,
      ),
      false,
    );
  });
});

describe("paper interrupt URLs", () => {
  const SITES = [
    "x.com",
    "twitter.com",
    "instagram.com",
    "youtube.com",
    "m.youtube.com",
  ];

  it("shows the paper on Instagram, X, Twitter, and YouTube Shorts", () => {
    assert.equal(isInterruptUrl("https://www.instagram.com/", SITES), true);
    assert.equal(isInterruptUrl("https://x.com/home", SITES), true);
    assert.equal(isInterruptUrl("https://twitter.com/home", SITES), true);
    assert.equal(isInterruptUrl("https://www.youtube.com/shorts", SITES), true);
    assert.equal(
      isInterruptUrl("https://www.youtube.com/shorts/abc123", SITES),
      true,
    );
    assert.equal(
      isInterruptUrl("https://m.youtube.com/shorts/abc123", SITES),
      true,
    );
  });

  it("does not show the paper on regular YouTube", () => {
    assert.equal(isInterruptUrl("https://www.youtube.com/", SITES), false);
    assert.equal(
      isInterruptUrl("https://www.youtube.com/watch?v=abc", SITES),
      false,
    );
  });

  it("clears the session when leaving Shorts for a regular YouTube page", () => {
    assert.equal(
      tabStillOnInterruptUrl(
        "https://www.youtube.com/watch?v=abc",
        "youtube.com",
        SITES,
      ),
      false,
    );
    assert.equal(
      tabStillOnInterruptUrl(
        "https://www.youtube.com/shorts/abc",
        "youtube.com",
        SITES,
      ),
      true,
    );
  });
});

describe("allowance expiry semantics", () => {
  it("until-tab-close uses non-expiring allowance", () => {
    assert.equal(allowanceExpiry(-1), Number.MAX_SAFE_INTEGER);
  });

  it("zero minutes stores a one-shot pending allowance only", () => {
    const allowances = createAllowanceStore();
    allowances.grant(TAB, "x.com", 0);
    assert.equal(allowances._entries.size, 0);
    assert.equal(allowances._pending.size, 1);
    assert.equal(allowances.isAllowed(TAB, "x.com", BLOCKED), true);
    assert.equal(allowances._pending.size, 0);
    assert.equal(allowances.isAllowed(TAB, "x.com", BLOCKED), false);
  });
});
