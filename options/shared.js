// Shared helpers for Settings and Insights pages.

const INTENTIONAL_DEFAULTS = {
  blockedSites: ["x.com", "twitter.com"],
  pauseSeconds: 10,
  allowGraceMinutes: -1,
  checkInMinutes: 15,
  checkInExtendMinutes: 10,
};

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

function countHosts(history) {
  const counts = new Map();
  for (const entry of history) {
    const host = entryHost(entry);
    if (!host) continue;
    const rec = counts.get(host) || { total: 0, continued: 0, cancelled: 0 };
    rec.total += 1;
    if (entry.action === "continue") rec.continued += 1;
    else if (entry.action === "cancel") rec.cancelled += 1;
    counts.set(host, rec);
  }
  return counts;
}

function insightRows(insights) {
  const rows = [];
  if (insights.recentDecisions > 0 && insights.recentCancelRate !== null) {
    rows.push({
      label: "Last 7 days",
      value: `${insights.recentDecisions} decisions, ${insights.recentCancelRate}% cancelled`,
    });
  }
  if (insights.busiestHour) {
    const n = insights.busiestHour.count;
    rows.push({
      label: "Busiest time",
      value: `${insights.busiestHour.label} (${n} pause${n === 1 ? "" : "s"})`,
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
    els.allowGraceMode.value = "0";
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
  if (els.allowGraceMode.value === "0") return { ok: true, value: 0 };
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
