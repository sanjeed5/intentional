// Insights page — local stats, patterns, history preview, AI prompt, backup.

const CHART_DAYS = 14;
const TOP_SITES = 5;
const HISTORY_PREVIEW = 15;
const ANALYSIS_EXPORT_FILENAME = "intentional-export.json";

const els = {
  status: document.getElementById("status"),
  statIntercepted: document.getElementById("stat-intercepted"),
  statContinued: document.getElementById("stat-continued"),
  statCancelled: document.getElementById("stat-cancelled"),
  statCancelRate: document.getElementById("stat-cancel-rate"),
  chart: document.getElementById("chart"),
  chartSummary: document.getElementById("chart-summary"),
  topSites: document.getElementById("top-sites"),
  insights: document.getElementById("insights"),
  historyBody: document.getElementById("history-body"),
  historyCount: document.getElementById("history-count"),
  historyNote: document.getElementById("history-note"),
  analysisPrompt: document.getElementById("analysis-prompt"),
  exportAnalysisBtn: document.getElementById("export-analysis-btn"),
  copyPromptBtn: document.getElementById("copy-prompt-btn"),
  copyPromptStatus: document.getElementById("copy-prompt-status"),
  clearStatsBtn: document.getElementById("clear-stats-btn"),
  exportBtn: document.getElementById("export-btn"),
  importBtn: document.getElementById("import-btn"),
  importFile: document.getElementById("import-file"),
};

function setStatus(msg, kind = "ok") {
  flashStatus(els.status, msg, kind);
}

function cancelRate(cancelled, total) {
  return total > 0 ? Math.round((cancelled / total) * 100) : 0;
}

async function loadStats() {
  const { stats = {}, history = [] } = await chrome.storage.local.get([
    "stats",
    "history",
  ]);
  const intercepted = stats.intercepted || 0;
  const continued = stats.continued || 0;
  const cancelled = stats.cancelled || 0;
  const decided = continued + cancelled;
  const rate = cancelRate(cancelled, decided);

  els.statIntercepted.textContent = String(intercepted);
  els.statContinued.textContent = String(continued);
  els.statCancelled.textContent = String(cancelled);
  els.statCancelRate.textContent = `${rate}%`;

  const insights = computeInsights(history);
  renderChart(history);
  renderTopSites(history);
  renderInsights(insights);
  renderHistory(history);
  renderAnalysisPrompt(history);
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
    const day = byKey.get(startOfDay(new Date(entry.at)).getTime());
    if (day) day.count += 1;
  }
  const max = Math.max(1, ...days.map((d) => d.count));
  const total = days.reduce((sum, d) => sum + d.count, 0);
  els.chartSummary.textContent =
    total === 0 ? "no activity yet" : `${total} decisions`;

  const todayKey = today.getTime();

  els.chart.replaceChildren(
    ...days.map((d) => {
      const bar = document.createElement("div");
      bar.className = "bar";
      const fill = document.createElement("div");
      if (d.count === 0) {
        fill.className = "bar-empty-fill";
      } else {
        fill.className = "bar-fill";
        fill.style.height = `${Math.max(4, (d.count / max) * 100)}%`;
      }
      const label = document.createElement("div");
      label.className = "bar-label";
      const isToday = d.date.getTime() === todayKey;
      label.textContent = isToday
        ? "today"
        : d.date.getDay() === 1
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
  const top = Array.from(countHosts(history).entries())
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
      const ratioSpan = document.createElement("span");
      ratioSpan.textContent = `${cancelRate(rec.cancelled, rec.continued + rec.cancelled)}% cancelled`;
      meta.append(pill, ratioSpan);
      li.append(hostEl, meta);
      return li;
    }),
  );
}

function computeInsights(history) {
  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const recent = history.filter((e) => e.at >= weekAgo);
  const recentDecided = recent.filter(
    (e) => e.action === "continue" || e.action === "cancel",
  );
  const recentCancelled = recent.filter((e) => e.action === "cancel").length;

  const intentCounts = new Map();
  for (const entry of history) {
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
    repeatedIntents,
    busiestHour,
  };
}

function renderInsights(insights) {
  const rows = insightRows(insights);
  if (rows.length === 0) {
    const li = document.createElement("li");
    li.className = "empty";
    li.textContent =
      "No patterns yet — more data will surface repeats and peak times.";
    els.insights.replaceChildren(li);
    return;
  }

  els.insights.replaceChildren(
    ...rows.map(({ label, value }) => {
      const li = document.createElement("li");
      const labelEl = document.createElement("span");
      labelEl.className = "insight-label";
      labelEl.textContent = label;
      const valueEl = document.createElement("span");
      valueEl.className = "insight-value";
      valueEl.textContent = value;
      li.append(labelEl, valueEl);
      return li;
    }),
  );
}

function buildAnalysisPrompt() {
  return `I'm using Intentional, a browser extension that pauses before distracting sites and asks me to type why I want to visit. I then choose to continue or cancel.

I've attached ${ANALYSIS_EXPORT_FILENAME} from my Downloads folder. Analyze it and look for:
1. Recurring intent patterns — vague or repeated excuses ("just checking", "bored", "quick look")
2. Time-of-day patterns — when am I most vulnerable?
3. Cancel rate — am I getting better at closing tabs instead of continuing?
4. Site-specific habits — which sites have the worst cancel rates?
5. Concrete suggestions — 2–3 specific changes based on MY data, not generic advice`;
}

function renderAnalysisPrompt(history) {
  els.analysisPrompt.value =
    history.length === 0
      ? "No history yet. Use Intentional a few times, then export your data and copy this prompt."
      : buildAnalysisPrompt();
}

async function buildExportPayload() {
  const data = await chrome.storage.local.get(null);
  return {
    _meta: {
      app: "intentional",
      version: 1,
      exportedAt: new Date().toISOString(),
    },
    blockedSites: data.blockedSites ?? INTENTIONAL_DEFAULTS.blockedSites,
    pauseSeconds: data.pauseSeconds ?? INTENTIONAL_DEFAULTS.pauseSeconds,
    allowGraceMinutes:
      data.allowGraceMinutes ?? INTENTIONAL_DEFAULTS.allowGraceMinutes,
    checkInMinutes: data.checkInMinutes ?? INTENTIONAL_DEFAULTS.checkInMinutes,
    checkInExtendMinutes:
      data.checkInExtendMinutes ?? INTENTIONAL_DEFAULTS.checkInExtendMinutes,
    stats: data.stats ?? {},
    history: data.history ?? [],
  };
}

function downloadJson(payload, filename) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function renderHistory(history) {
  els.historyCount.textContent =
    history.length === 1 ? "1 entry" : `${history.length} entries`;

  if (history.length === 0) {
    els.historyNote.textContent = "";
    const tr = document.createElement("tr");
    tr.className = "empty";
    const td = document.createElement("td");
    td.colSpan = 4;
    td.textContent = "No history yet.";
    tr.appendChild(td);
    els.historyBody.replaceChildren(tr);
    return;
  }

  const preview = history.slice(0, HISTORY_PREVIEW);
  els.historyNote.textContent =
    history.length > HISTORY_PREVIEW
      ? `Showing the latest ${HISTORY_PREVIEW} of ${history.length}. Export for the full history.`
      : "";

  els.historyBody.replaceChildren(
    ...preview.map((entry) => {
      const tr = document.createElement("tr");
      const tdWhen = document.createElement("td");
      tdWhen.textContent = formatTime(entry.at);
      const tdHost = document.createElement("td");
      tdHost.textContent = entryHost(entry);
      const tdIntent = document.createElement("td");
      tdIntent.className = "intent";
      tdIntent.textContent = entry.intent || "—";
      const tdAction = document.createElement("td");
      const badge = document.createElement("span");
      const continued = entry.action === "continue";
      badge.className = "badge " + (continued ? "badge-continue" : "badge-cancel");
      badge.textContent = continued ? "Continued" : "Cancelled";
      tdAction.appendChild(badge);
      tr.append(tdWhen, tdHost, tdIntent, tdAction);
      return tr;
    }),
  );
}

async function clearStats() {
  if (!confirm("Clear all local stats and intent history?")) return;
  await chrome.storage.local.set({ stats: {}, history: [] });
  await loadStats();
  setStatus("Stats cleared.");
}

async function exportData() {
  const payload = await buildExportPayload();
  downloadJson(
    payload,
    `intentional-backup-${new Date().toISOString().slice(0, 10)}.json`,
  );
  setStatus("Exported.");
}

async function exportForAnalysis() {
  const { history = [] } = await chrome.storage.local.get("history");
  if (history.length === 0) {
    flashStatus(els.copyPromptStatus, "No history to export yet.", "err");
    return;
  }
  const payload = await buildExportPayload();
  downloadJson(payload, ANALYSIS_EXPORT_FILENAME);
  flashStatus(
    els.copyPromptStatus,
    "Find it in Downloads, attach to your AI chat, then copy the prompt.",
  );
}

async function importData(file) {
  let parsed;
  try {
    parsed = JSON.parse(await file.text());
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
    toSet.pauseSeconds = clamp(parsed.pauseSeconds, 0, 600);
  if (typeof parsed.allowGraceMinutes === "number")
    toSet.allowGraceMinutes = clamp(parsed.allowGraceMinutes, -1, 240);
  if (typeof parsed.checkInMinutes === "number")
    toSet.checkInMinutes = clamp(parsed.checkInMinutes, 1, 240);
  if (typeof parsed.checkInExtendMinutes === "number")
    toSet.checkInExtendMinutes = clamp(parsed.checkInExtendMinutes, 1, 120);
  if (parsed.stats && typeof parsed.stats === "object")
    toSet.stats = parsed.stats;
  if (Array.isArray(parsed.history))
    toSet.history = parsed.history.slice(0, 1000);

  await chrome.storage.local.clear();
  await chrome.storage.local.set(toSet);
  await loadStats();
  setStatus("Imported.");
}

async function copyAnalysisPrompt() {
  const text = els.analysisPrompt.value.trim();
  if (!text || text.startsWith("No history yet")) {
    flashStatus(els.copyPromptStatus, "Nothing to copy yet.", "err");
    return;
  }
  try {
    await navigator.clipboard.writeText(text);
    flashStatus(els.copyPromptStatus, "Copied.");
  } catch {
    els.analysisPrompt.focus();
    els.analysisPrompt.select();
    flashStatus(els.copyPromptStatus, "Select and copy manually.", "err");
  }
}

els.exportAnalysisBtn.addEventListener("click", exportForAnalysis);
els.copyPromptBtn.addEventListener("click", copyAnalysisPrompt);
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
});

loadStats();
