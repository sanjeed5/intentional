// Shared helpers for Settings and Insights pages.

const INTENTIONAL_DEFAULTS =
  typeof module !== "undefined" && module.exports
    ? require("../lib/defaults.js").INTENTIONAL_DEFAULTS
    : globalThis.IntentionalDefaults.INTENTIONAL_DEFAULTS;

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function readWholeNumber(value, { min, max, label }) {
  const trimmed = String(value).trim();
  if (!trimmed) {
    return { ok: false, error: `${label} is required.` };
  }
  const n = Number(trimmed);
  if (!Number.isFinite(n) || !Number.isInteger(n)) {
    return { ok: false, error: `${label} must be a whole number.` };
  }
  if (n < min || n > max) {
    return {
      ok: false,
      error: `${label} must be between ${min} and ${max}.`,
    };
  }
  return { ok: true, value: n };
}

function parseSites(text) {
  return text
    .split(/\r?\n|,/)
    .map((s) =>
      s
        .trim()
        .toLowerCase()
        .replace(/^https?:\/\//, "")
        .replace(/^\*\./, "")
        .replace(/^www\./, "")
        .split("/")[0],
    )
    .filter(Boolean)
    .filter((v, i, a) => a.indexOf(v) === i);
}

function formatTime(ts) {
  const d = new Date(ts);
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  if (sameDay) {
    return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  }
  return (
    d.toLocaleDateString([], { month: "short", day: "numeric" }) +
    " " +
    d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
  );
}

function startOfDay(d) {
  const copy = new Date(d);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function formatHourRange(hour) {
  const fmt = (h) => {
    const suffix = h >= 12 ? "pm" : "am";
    const h12 = h % 12 || 12;
    return `${h12}${suffix}`;
  };
  return `${fmt(hour)}–${fmt((hour + 1) % 24)}`;
}

function entryHost(entry) {
  return (entry.host || entry.pattern || "").toLowerCase();
}

function entrySiteKey(entry) {
  return (entry.pattern || entry.host || "").toLowerCase();
}

function countHosts(history) {
  const counts = new Map();
  for (const entry of history) {
    const host = entrySiteKey(entry);
    if (!host) continue;
    const rec = counts.get(host) || {
      total: 0,
      continued: 0,
      cancelled: 0,
      checkInClosed: 0,
      checkInExtended: 0,
    };
    if (entry.action === "continue") {
      rec.total += 1;
      rec.continued += 1;
    } else if (entry.action === "cancel") {
      rec.total += 1;
      rec.cancelled += 1;
    } else if (entry.action === "checkin_close") {
      rec.checkInClosed += 1;
    } else if (entry.action === "checkin_extend") {
      rec.checkInExtended += 1;
    }
    counts.set(host, rec);
  }
  return counts;
}

function historyActionBadge(entry) {
  switch (entry.action) {
    case "continue":
      return { className: "badge badge-continue", label: "Continued" };
    case "cancel":
      return { className: "badge badge-cancel", label: "Cancelled" };
    case "checkin_close":
      return { className: "badge badge-cancel", label: "Closed at check-in" };
    case "checkin_extend":
      return { className: "badge badge-extend", label: "Extended" };
    default:
      return { className: "badge", label: entry.action || "—" };
  }
}

function cancelRate(cancelled, total) {
  return total > 0 ? Math.round((cancelled / total) * 100) : 0;
}

function computeInsights(history) {
  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const recent = history.filter((e) => e.at >= weekAgo);
  const recentDecided = recent.filter(
    (e) => e.action === "continue" || e.action === "cancel",
  );
  const recentCancelled = recent.filter((e) => e.action === "cancel").length;
  const recentCheckInDecided = recent.filter(
    (e) => e.action === "checkin_close" || e.action === "checkin_extend",
  );
  const recentCheckInClosed = recent.filter(
    (e) => e.action === "checkin_close",
  ).length;

  const intentCounts = new Map();
  for (const entry of history) {
    if (entry.action !== "continue" && entry.action !== "cancel") continue;
    const intent = (entry.intent || "").trim().toLowerCase();
    if (intent.length < 3) continue;
    intentCounts.set(intent, (intentCounts.get(intent) || 0) + 1);
  }
  const repeatedIntents = Array.from(intentCounts.entries())
    .filter(([, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([intent, count]) => ({ intent, count }));

  const hourCounts = new Array(24).fill(0);
  for (const entry of history) {
    hourCounts[new Date(entry.at).getHours()] += 1;
  }
  const peakHour = hourCounts.indexOf(Math.max(...hourCounts));
  const peakCount = hourCounts[peakHour];
  const busiestHour =
    history.length > 0 && peakCount > 0
      ? { label: formatHourRange(peakHour), count: peakCount }
      : null;

  return {
    recentDecisions: recentDecided.length,
    recentCancelRate:
      recentDecided.length > 0
        ? cancelRate(recentCancelled, recentDecided.length)
        : null,
    recentCheckInDecisions: recentCheckInDecided.length,
    checkInCloseRate:
      recentCheckInDecided.length > 0
        ? cancelRate(recentCheckInClosed, recentCheckInDecided.length)
        : null,
    repeatedIntents,
    busiestHour,
  };
}

function insightRows(insights) {
  const rows = [];
  if (insights.recentDecisions > 0 && insights.recentCancelRate !== null) {
    rows.push({
      label: "Entry cancel rate (7 days)",
      value: `${insights.recentDecisions} decisions, ${insights.recentCancelRate}% cancelled`,
    });
  }
  if (insights.recentCheckInDecisions > 0 && insights.checkInCloseRate !== null) {
    rows.push({
      label: "Check-in close rate (7 days)",
      value: `${insights.recentCheckInDecisions} check-ins, ${insights.checkInCloseRate}% closed`,
    });
  }
  if (insights.busiestHour) {
    const n = insights.busiestHour.count;
    rows.push({
      label: "Busiest time",
      value: `${insights.busiestHour.label} (${n} event${n === 1 ? "" : "s"})`,
    });
  }
  for (const { intent, count } of insights.repeatedIntents) {
    rows.push({
      label: "Repeated reason",
      value: `"${intent}" (${count}×)`,
    });
  }
  return rows;
}

function applyGraceModeUI(els, minutes) {
  if (minutes === 0) {
    els.allowGraceMode.value = "continue";
    els.allowGraceRow.classList.add("hidden");
    return;
  }
  if (minutes < 0) {
    els.allowGraceMode.value = "tab";
    els.allowGraceRow.classList.add("hidden");
    return;
  }
  els.allowGraceMode.value = "minutes";
  els.allowGrace.value = String(minutes);
  els.allowGraceRow.classList.remove("hidden");
}

function readGraceModeMinutes(els) {
  if (els.allowGraceMode.value === "tab") return { ok: true, value: -1 };
  if (els.allowGraceMode.value === "continue") return { ok: true, value: 0 };
  return readWholeNumber(els.allowGrace.value, {
    min: 1,
    max: 240,
    label: "Fixed window",
  });
}

function flashStatus(el, msg, kind = "ok") {
  if (!el) return;
  el.textContent = msg;
  el.style.color = kind === "ok" ? "var(--accent)" : "var(--danger)";
  if (msg) {
    setTimeout(() => {
      if (el.textContent === msg) el.textContent = "";
    }, 2500);
  }
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    INTENTIONAL_DEFAULTS,
    cancelRate,
    computeInsights,
    countHosts,
    historyActionBadge,
    insightRows,
    entryHost,
    entrySiteKey,
    formatHourRange,
  };
}
