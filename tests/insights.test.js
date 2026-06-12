const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const {
  cancelRate,
  computeInsights,
  countHosts,
  historyActionBadge,
  insightRows,
  entrySiteKey,
  formatHourRange,
} = require("../options/shared.js");

const {
  checkInCloseHistoryEntry,
  shouldRecordCheckInCloseOnTabRemoved,
} = require("../lib/behavior.js");

function atHour(hour, daysAgo = 0) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  d.setHours(hour, 0, 0, 0);
  return d.getTime();
}

describe("cancelRate", () => {
  it("returns 0 when total is 0", () => {
    assert.equal(cancelRate(0, 0), 0);
    assert.equal(cancelRate(5, 0), 0);
  });

  it("rounds to nearest percent", () => {
    assert.equal(cancelRate(1, 3), 33);
    assert.equal(cancelRate(2, 4), 50);
  });
});

describe("computeInsights", () => {
  it("returns empty insights for empty history", () => {
    const insights = computeInsights([]);
    assert.deepEqual(insights, {
      recentDecisions: 0,
      recentCancelRate: null,
      recentCheckInDecisions: 0,
      checkInCloseRate: null,
      repeatedIntents: [],
      busiestHour: null,
    });
  });

  it("keeps entry cancel rate separate from check-in close rate", () => {
    const now = Date.now();
    const history = [
      { action: "continue", intent: "work", at: now },
      { action: "cancel", intent: "bored", at: now },
      { action: "checkin_close", intent: "work", at: now },
      { action: "checkin_extend", intent: "work", at: now },
    ];
    const insights = computeInsights(history);
    assert.equal(insights.recentDecisions, 2);
    assert.equal(insights.recentCancelRate, 50);
    assert.equal(insights.recentCheckInDecisions, 2);
    assert.equal(insights.checkInCloseRate, 50);
  });

  it("counts repeated intents only from continue/cancel, not check-in extend", () => {
    const now = Date.now();
    const history = [
      { action: "continue", intent: "quick look", at: now },
      { action: "cancel", intent: "quick look", at: now },
      { action: "checkin_extend", intent: "quick look", at: now },
      { action: "checkin_extend", intent: "quick look", at: now },
      { action: "continue", intent: "other", at: now },
    ];
    const insights = computeInsights(history);
    assert.deepEqual(insights.repeatedIntents, [
      { intent: "quick look", count: 2 },
    ]);
  });

  it("busiest hour includes all event types", () => {
    const history = [
      { action: "continue", intent: "a", at: atHour(9) },
      { action: "cancel", intent: "b", at: atHour(9) },
      { action: "checkin_close", intent: "c", at: atHour(9) },
      { action: "checkin_extend", intent: "d", at: atHour(14) },
    ];
    const insights = computeInsights(history);
    assert.equal(insights.busiestHour.count, 3);
    assert.equal(insights.busiestHour.label, formatHourRange(9));
  });

  it("ignores history older than 7 days for recent rates", () => {
    const now = Date.now();
    const history = [
      { action: "cancel", intent: "old", at: now - 8 * 24 * 60 * 60 * 1000 },
      { action: "continue", intent: "new", at: now },
    ];
    const insights = computeInsights(history);
    assert.equal(insights.recentDecisions, 1);
    assert.equal(insights.recentCancelRate, 0);
  });
});

describe("insights helpers", () => {
  it("aggregates top sites by blocked pattern, not host subdomain", () => {
    const history = [
      { action: "continue", host: "www.x.com", pattern: "x.com", at: 1 },
      { action: "cancel", host: "mobile.x.com", pattern: "x.com", at: 2 },
      {
        action: "checkin_close",
        host: "x.com",
        pattern: "x.com",
        at: 3,
      },
    ];
    const counts = countHosts(history);
    assert.equal(counts.size, 1);
    const rec = counts.get("x.com");
    assert.equal(rec.total, 2);
    assert.equal(rec.continued, 1);
    assert.equal(rec.cancelled, 1);
    assert.equal(rec.checkInClosed, 1);
  });

  it("prefers pattern over host for site keys", () => {
    assert.equal(
      entrySiteKey({ host: "www.twitter.com", pattern: "twitter.com" }),
      "twitter.com",
    );
    assert.equal(entrySiteKey({ host: "www.x.com" }), "www.x.com");
  });

  it("maps history actions to badges", () => {
    assert.deepEqual(historyActionBadge({ action: "checkin_close" }), {
      className: "badge badge-cancel",
      label: "Closed at check-in",
    });
    assert.deepEqual(historyActionBadge({ action: "checkin_extend" }), {
      className: "badge badge-extend",
      label: "Extended",
    });
  });

  it("includes check-in close rate row when check-in decisions exist", () => {
    const rows = insightRows({
      recentDecisions: 4,
      recentCancelRate: 25,
      recentCheckInDecisions: 3,
      checkInCloseRate: 67,
      repeatedIntents: [],
      busiestHour: null,
    });
    assert.equal(rows.length, 2);
    assert.match(rows[1].label, /Check-in close rate/);
    assert.match(rows[1].value, /67% closed/);
  });
});

describe("check-in close recording", () => {
  it("builds a checkin_close history entry from session state", () => {
    const entry = checkInCloseHistoryEntry(
      {
        host: "x.com",
        pattern: "x.com",
        intent: "quick look",
        checkInCount: 2,
      },
      123,
    );
    assert.deepEqual(entry, {
      action: "checkin_close",
      host: "x.com",
      pattern: "x.com",
      intent: "quick look",
      checkInCount: 2,
      at: 123,
    });
  });

  it("records manual tab close only when a check-in is awaiting response", () => {
    assert.equal(
      shouldRecordCheckInCloseOnTabRemoved({ awaitingCheckIn: true }),
      true,
    );
    assert.equal(
      shouldRecordCheckInCloseOnTabRemoved({ awaitingCheckIn: false }),
      false,
    );
    assert.equal(shouldRecordCheckInCloseOnTabRemoved(null), false);
  });
});
