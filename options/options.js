// Settings page logic.
// Loads/saves settings from chrome.storage.local and renders local stats.

const DEFAULTS = {
  blockedSites: ["x.com", "twitter.com"],
  pauseSeconds: 10,
  allowGraceMinutes: 5,
};

const CHART_DAYS = 14;
const TOP_SITES = 5;

const els = {
  pauseSeconds: document.getElementById("pause-seconds"),
  allowGrace: document.getElementById("allow-grace"),
  blockedSites: document.getElementById("blocked-sites"),
  saveBtn: document.getElementById("save-btn"),
  resetBtn: document.getElementById("reset-btn"),
  status: document.getElementById("status"),
  statIntercepted: document.getElementById("stat-intercepted"),
  statContinued: document.getElementById("stat-continued"),
  statCancelled: document.getElementById("stat-cancelled"),
  statCancelRate: document.getElementById("stat-cancel-rate"),
  chart: document.getElementById("chart"),
  chartSummary: document.getElementById("chart-summary"),
  topSites: document.getElementById("top-sites"),
  historyBody: document.getElementById("history-body"),
  historyCount: document.getElementById("history-count"),
  clearStatsBtn: document.getElementById("clear-stats-btn"),
  exportBtn: document.getElementById("export-btn"),
  importBtn: document.getElementById("import-btn"),
  importFile: document.getElementById("import-file"),
};

// ---------- helpers ----------

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

function setStatus(msg, kind = "ok") {
  els.status.textContent = msg;
  els.status.style.color = kind === "ok" ? "var(--accent)" : "var(--danger)";
  if (msg) {
    setTimeout(() => {
      if (els.status.textContent === msg) els.status.textContent = "";
    }, 2500);
  }
}

// ---------- settings ----------

async function loadSettings() {
  const stored = await chrome.storage.local.get([
    "blockedSites",
    "pauseSeconds",
    "allowGraceMinutes",
  ]);
  els.pauseSeconds.value = String(
    typeof stored.pauseSeconds === "number"
      ? stored.pauseSeconds
      : DEFAULTS.pauseSeconds,
  );
  els.allowGrace.value = String(
    typeof stored.allowGraceMinutes === "number"
      ? stored.allowGraceMinutes
      : DEFAULTS.allowGraceMinutes,
  );
  const sites = Array.isArray(stored.blockedSites)
    ? stored.blockedSites
    : DEFAULTS.blockedSites;
  els.blockedSites.value = sites.join("\n");
}

async function saveSettings() {
  const pauseSeconds = Math.max(
    0,
    Math.min(600, Number(els.pauseSeconds.value) || 0),
  );
  const allowGraceMinutes = Math.max(
    0,
    Math.min(240, Number(els.allowGrace.value) || 0),
  );
  const blockedSites = parseSites(els.blockedSites.value);

  await chrome.storage.local.set({
    pauseSeconds,
    allowGraceMinutes,
    blockedSites,
  });

  els.pauseSeconds.value = String(pauseSeconds);
  els.allowGrace.value = String(allowGraceMinutes);
  els.blockedSites.value = blockedSites.join("\n");

  setStatus("Saved.");
}

async function resetSettings() {
  await chrome.storage.local.set({
    pauseSeconds: DEFAULTS.pauseSeconds,
    allowGraceMinutes: DEFAULTS.allowGraceMinutes,
    blockedSites: DEFAULTS.blockedSites.slice(),
  });
  await loadSettings();
  setStatus("Reset to defaults.");
}

// ---------- stats ----------

async function loadStats() {
  const { stats = {}, history = [] } = await chrome.storage.local.get([
    "stats",
    "history",
  ]);
  const intercepted = stats.intercepted || 0;
  const continued = stats.continued || 0;
  const cancelled = stats.cancelled || 0;
  const decided = continued + cancelled;
  const rate = decided > 0 ? Math.round((cancelled / decided) * 100) : 0;

  els.statIntercepted.textContent = String(intercepted);
  els.statContinued.textContent = String(continued);
  els.statCancelled.textContent = String(cancelled);
  els.statCancelRate.textContent = `${rate}%`;

  renderChart(history);
  renderTopSites(history);
  renderHistory(history);
}

function renderChart(history) {
  const today = startOfDay(new Date());
  const days = [];
  for (let i = CHART_DAYS - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    days.push({ date: d, count: 0 });
  }
  const byKey = new Map(days.map((d) => [d.date.getTime(), d]));
  for (const entry of history) {
    const k = startOfDay(new Date(entry.at)).getTime();
    const day = byKey.get(k);
    if (day) day.count += 1;
  }
  const max = Math.max(1, ...days.map((d) => d.count));
  const total = days.reduce((a, b) => a + b.count, 0);
  els.chartSummary.textContent =
    total === 0 ? "no activity yet" : `${total} decisions`;

  const todayKey = today.getTime();
  const isWeekStart = (date) => date.getDay() === 1; // Monday

  els.chart.replaceChildren(
    ...days.map((d) => {
      const bar = document.createElement("div");
      bar.className = "bar";
      const pct = (d.count / max) * 100;
      const fill = document.createElement("div");
      if (d.count === 0) {
        fill.className = "bar-empty-fill";
      } else {
        fill.className = "bar-fill";
        fill.style.height = `${Math.max(4, pct)}%`;
      }
      const label = document.createElement("div");
      label.className = "bar-label";
      // Show the day-of-month only on Mondays and today to reduce noise.
      const isToday = d.date.getTime() === todayKey;
      label.textContent = isToday
        ? "today"
        : isWeekStart(d.date)
          ? d.date.toLocaleDateString([], { weekday: "short" })
          : "";
      if (isToday) bar.dataset.today = "true";
      bar.title =
        d.date.toLocaleDateString([], {
          weekday: "short",
          month: "short",
          day: "numeric",
        }) +
        " — " +
        (d.count === 1 ? "1 pause" : `${d.count} pauses`);
      bar.append(fill, label);
      return bar;
    }),
  );
}

function renderTopSites(history) {
  const counts = new Map();
  for (const entry of history) {
    const h = (entry.host || entry.pattern || "").toLowerCase();
    if (!h) continue;
    const rec = counts.get(h) || { total: 0, continued: 0, cancelled: 0 };
    rec.total += 1;
    if (entry.action === "continue") rec.continued += 1;
    else if (entry.action === "cancel") rec.cancelled += 1;
    counts.set(h, rec);
  }
  const top = Array.from(counts.entries())
    .sort((a, b) => b[1].total - a[1].total)
    .slice(0, TOP_SITES);

  if (top.length === 0) {
    const li = document.createElement("li");
    li.className = "empty";
    li.textContent = "No data yet.";
    els.topSites.replaceChildren(li);
    return;
  }

  els.topSites.replaceChildren(
    ...top.map(([hostName, rec]) => {
      const li = document.createElement("li");

      const hostEl = document.createElement("span");
      hostEl.className = "ts-host";
      hostEl.textContent = hostName;

      const meta = document.createElement("span");
      meta.className = "ts-meta";

      const pill = document.createElement("span");
      pill.className = "pill";
      pill.textContent = rec.total === 1 ? "1 pause" : `${rec.total} pauses`;

      const ratio = rec.continued + rec.cancelled;
      const cancelPct =
        ratio > 0 ? Math.round((rec.cancelled / ratio) * 100) : 0;
      const ratioSpan = document.createElement("span");
      ratioSpan.textContent = `${cancelPct}% cancelled`;

      meta.append(pill, ratioSpan);
      li.append(hostEl, meta);
      return li;
    }),
  );
}

function renderHistory(history) {
  els.historyCount.textContent =
    history.length === 1 ? "1 entry" : `${history.length} entries`;

  if (history.length === 0) {
    const tr = document.createElement("tr");
    tr.className = "empty";
    const td = document.createElement("td");
    td.colSpan = 4;
    td.textContent = "No history yet.";
    tr.appendChild(td);
    els.historyBody.replaceChildren(tr);
    return;
  }

  const rows = history.map((entry) => {
    const tr = document.createElement("tr");

    const tdWhen = document.createElement("td");
    tdWhen.textContent = formatTime(entry.at);

    const tdHost = document.createElement("td");
    tdHost.textContent = entry.host || entry.pattern || "";

    const tdIntent = document.createElement("td");
    tdIntent.className = "intent";
    tdIntent.textContent = entry.intent || "—";

    const tdAction = document.createElement("td");
    const badge = document.createElement("span");
    badge.className =
      "badge " +
      (entry.action === "continue" ? "badge-continue" : "badge-cancel");
    badge.textContent = entry.action === "continue" ? "Continued" : "Cancelled";
    tdAction.appendChild(badge);

    tr.append(tdWhen, tdHost, tdIntent, tdAction);
    return tr;
  });

  els.historyBody.replaceChildren(...rows);
}

async function clearStats() {
  if (!confirm("Clear all local stats and intent history?")) return;
  await chrome.storage.local.set({ stats: {}, history: [] });
  await loadStats();
  setStatus("Stats cleared.");
}

// ---------- export / import ----------

async function exportData() {
  const data = await chrome.storage.local.get(null);
  const payload = {
    _meta: {
      app: "intentional",
      version: 1,
      exportedAt: new Date().toISOString(),
    },
    blockedSites: data.blockedSites ?? DEFAULTS.blockedSites,
    pauseSeconds: data.pauseSeconds ?? DEFAULTS.pauseSeconds,
    allowGraceMinutes: data.allowGraceMinutes ?? DEFAULTS.allowGraceMinutes,
    stats: data.stats ?? {},
    history: data.history ?? [],
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `intentional-backup-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  setStatus("Exported.");
}

async function importData(file) {
  let parsed;
  try {
    const text = await file.text();
    parsed = JSON.parse(text);
  } catch {
    setStatus("Couldn't read that file.", "err");
    return;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    setStatus("Not a valid backup file.", "err");
    return;
  }
  if (
    !confirm(
      "This will replace your current settings, stats, and history. Continue?",
    )
  )
    return;

  const toSet = {};
  if (Array.isArray(parsed.blockedSites))
    toSet.blockedSites = parseSites(parsed.blockedSites.join("\n"));
  if (typeof parsed.pauseSeconds === "number")
    toSet.pauseSeconds = Math.max(0, Math.min(600, parsed.pauseSeconds));
  if (typeof parsed.allowGraceMinutes === "number")
    toSet.allowGraceMinutes = Math.max(
      0,
      Math.min(240, parsed.allowGraceMinutes),
    );
  if (parsed.stats && typeof parsed.stats === "object")
    toSet.stats = parsed.stats;
  if (Array.isArray(parsed.history))
    toSet.history = parsed.history.slice(0, 1000);

  await chrome.storage.local.clear();
  await chrome.storage.local.set(toSet);
  await loadSettings();
  await loadStats();
  setStatus("Imported.");
}

// ---------- wiring ----------

els.saveBtn.addEventListener("click", saveSettings);
els.resetBtn.addEventListener("click", resetSettings);
els.clearStatsBtn.addEventListener("click", clearStats);

els.exportBtn.addEventListener("click", exportData);
els.importBtn.addEventListener("click", () => els.importFile.click());
els.importFile.addEventListener("change", async () => {
  const file = els.importFile.files?.[0];
  els.importFile.value = "";
  if (file) await importData(file);
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  if (changes.stats || changes.history) loadStats();
  if (changes.blockedSites || changes.pauseSeconds || changes.allowGraceMinutes)
    loadSettings();
});

loadSettings();
loadStats();
