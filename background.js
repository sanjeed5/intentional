// Intentional - background service worker
// Intercepts navigation to user-defined sites and redirects to a pause page.

importScripts("lib/behavior.js");

const {
  normalizeHost,
  hostMatches,
  findBlockingPattern,
  allowanceKey,
  resolvePattern,
  tabStillOnBlockedHost: tabOnBlockedHost,
} = globalThis.IntentionalBehavior;

const PENDING_ALLOWANCES = new Set();

const DEFAULTS = {
  blockedSites: ["x.com", "twitter.com"],
  pauseSeconds: 10,
  // Once user clicks Continue, allow the site in the same tab before pausing
  // again. -1 = until tab closes, 0 = every navigation, >0 = minutes.
  allowGraceMinutes: -1,
  checkInMinutes: 15,
  checkInExtendMinutes: 10,
};

const ALLOW_KEY = "allowedSessions";
const TAB_SESSIONS_KEY = "tabSessions";
const STATS_KEY = "stats";
const HISTORY_KEY = "history";
const HISTORY_LIMIT = 200;

// ---------- helpers ----------

async function getSettings() {
  const stored = await chrome.storage.local.get([
    "blockedSites",
    "pauseSeconds",
    "allowGraceMinutes",
    "checkInMinutes",
    "checkInExtendMinutes",
  ]);
  return {
    blockedSites: Array.isArray(stored.blockedSites)
      ? stored.blockedSites
      : DEFAULTS.blockedSites,
    pauseSeconds:
      typeof stored.pauseSeconds === "number" && stored.pauseSeconds >= 0
        ? stored.pauseSeconds
        : DEFAULTS.pauseSeconds,
    allowGraceMinutes:
      typeof stored.allowGraceMinutes === "number" &&
      stored.allowGraceMinutes >= -1
        ? stored.allowGraceMinutes
        : DEFAULTS.allowGraceMinutes,
    checkInMinutes:
      typeof stored.checkInMinutes === "number" && stored.checkInMinutes >= 1
        ? Math.min(240, stored.checkInMinutes)
        : DEFAULTS.checkInMinutes,
    checkInExtendMinutes:
      typeof stored.checkInExtendMinutes === "number" &&
      stored.checkInExtendMinutes >= 1
        ? Math.min(120, stored.checkInExtendMinutes)
        : DEFAULTS.checkInExtendMinutes,
  };
}

async function isAllowed(tabId, host, patterns) {
  const match = findBlockingPattern(host, patterns);
  if (!match) return false;

  const key = allowanceKey(tabId, match);
  const { [ALLOW_KEY]: sessions = {} } = await chrome.storage.session.get(
    ALLOW_KEY,
  );
  const entry = sessions[key];
  if (entry) {
    if (Date.now() > entry.expiresAt) {
      delete sessions[key];
      PENDING_ALLOWANCES.delete(key);
      await chrome.storage.session.set({ [ALLOW_KEY]: sessions });
      return false;
    }
    PENDING_ALLOWANCES.delete(key);
    return true;
  }
  if (PENDING_ALLOWANCES.has(key)) return true;
  return false;
}

async function allowTabPattern(tabId, pattern, minutes) {
  if (minutes === 0) return;

  const key = allowanceKey(tabId, pattern);
  PENDING_ALLOWANCES.add(key);

  const { [ALLOW_KEY]: sessions = {} } = await chrome.storage.session.get(
    ALLOW_KEY,
  );
  const expiresAt =
    minutes < 0
      ? Number.MAX_SAFE_INTEGER
      : Date.now() + minutes * 60 * 1000;
  sessions[key] = { expiresAt };
  await chrome.storage.session.set({ [ALLOW_KEY]: sessions });
}

async function clearTabAllowances(tabId) {
  const { [ALLOW_KEY]: sessions = {} } = await chrome.storage.session.get(
    ALLOW_KEY,
  );
  let changed = false;
  for (const key of Object.keys(sessions)) {
    if (key.startsWith(`${tabId}:`)) {
      delete sessions[key];
      changed = true;
    }
  }
  if (changed) await chrome.storage.session.set({ [ALLOW_KEY]: sessions });
  for (const key of PENDING_ALLOWANCES) {
    if (key.startsWith(`${tabId}:`)) PENDING_ALLOWANCES.delete(key);
  }
}

// ---------- session check-in (Layer 2) ----------

function checkInAlarmName(tabId) {
  return `checkin:${tabId}`;
}

async function getTabSessions() {
  const { [TAB_SESSIONS_KEY]: sessions = {} } =
    await chrome.storage.session.get(TAB_SESSIONS_KEY);
  return sessions;
}

async function setTabSessions(sessions) {
  await chrome.storage.session.set({ [TAB_SESSIONS_KEY]: sessions });
}

async function scheduleCheckIn(tabId, atMs) {
  const name = checkInAlarmName(tabId);
  await chrome.alarms.clear(name);
  await chrome.alarms.create(name, { when: atMs });
}

async function clearTabSession(tabId) {
  const sessions = await getTabSessions();
  if (!sessions[tabId]) return;
  delete sessions[tabId];
  await setTabSessions(sessions);
  await chrome.alarms.clear(checkInAlarmName(tabId));
}

async function startTabSession(tabId, { pattern, host, intent }) {
  const settings = await getSettings();
  const now = Date.now();
  const nextCheckInAt = now + settings.checkInMinutes * 60 * 1000;
  const sessions = await getTabSessions();
  sessions[tabId] = {
    tabId,
    pattern,
    host,
    intent: (intent || "").slice(0, 500),
    startedAt: now,
    nextCheckInAt,
    checkInCount: 0,
  };
  await setTabSessions(sessions);
  await scheduleCheckIn(tabId, nextCheckInAt);
}

function tabStillOnBlockedHost(tab, session, settings) {
  return tabOnBlockedHost(tab.url, session.pattern, settings.blockedSites);
}

async function injectCheckInOverlay(tabId, session) {
  const settings = await getSettings();
  const target = { tabId };

  try {
    await chrome.scripting.insertCSS({
      target,
      files: ["checkin/checkin.css"],
    });
  } catch {
    // CSS may already be present on repeat check-ins.
  }

  try {
    await chrome.scripting.executeScript({
      target,
      files: ["checkin/checkin.js"],
    });
  } catch {
    // Script may already be injected in SPA tabs.
  }

  await chrome.tabs.sendMessage(tabId, {
    type: "SHOW_CHECKIN",
    intent: session.intent,
    host: session.host,
    startedAt: session.startedAt,
    checkInCount: session.checkInCount,
    extendMinutes: settings.checkInExtendMinutes,
  });
}

async function handleCheckInAlarm(tabId) {
  const sessions = await getTabSessions();
  const session = sessions[tabId];
  if (!session) return;

  let tab;
  try {
    tab = await chrome.tabs.get(tabId);
  } catch {
    await clearTabSession(tabId);
    return;
  }

  const settings = await getSettings();
  if (!tabStillOnBlockedHost(tab, session, settings)) {
    await clearTabSession(tabId);
    return;
  }

  try {
    await injectCheckInOverlay(tabId, session);
  } catch {
    // Tab may have become unavailable; leave session for a future alarm retry
    // or cleanup on tab events.
  }
}

function sliceIntent(intent) {
  return (intent || "").slice(0, 500);
}

async function closeTab(tabId) {
  try {
    await chrome.tabs.remove(tabId);
  } catch {
    try {
      await chrome.tabs.update(tabId, { url: "about:blank" });
    } catch {}
  }
}

// ---------- analytics ----------

async function bumpStat(field) {
  const { [STATS_KEY]: stats = {} } = await chrome.storage.local.get(STATS_KEY);
  stats[field] = (stats[field] || 0) + 1;
  await chrome.storage.local.set({ [STATS_KEY]: stats });
}

async function recordHistory(entry) {
  const { [HISTORY_KEY]: history = [] } =
    await chrome.storage.local.get(HISTORY_KEY);
  history.unshift(entry);
  if (history.length > HISTORY_LIMIT) history.length = HISTORY_LIMIT;
  await chrome.storage.local.set({ [HISTORY_KEY]: history });
}

// ---------- navigation interception ----------

chrome.webNavigation.onBeforeNavigate.addListener(async (details) => {
  // Only intercept top-level frames
  if (details.frameId !== 0) return;
  if (details.tabId < 0) return;

  let url;
  try {
    url = new URL(details.url);
  } catch {
    return;
  }

  // Only http/https
  if (url.protocol !== "http:" && url.protocol !== "https:") return;

  const settings = await getSettings();
  const match = findBlockingPattern(url.hostname, settings.blockedSites);
  if (!match) return;

  // Don't intercept ourselves
  const interceptUrl = chrome.runtime.getURL("intercept/intercept.html");
  if (details.url.startsWith(interceptUrl)) return;

  if (await isAllowed(details.tabId, url.hostname, settings.blockedSites))
    return;

  await bumpStat("intercepted");

  const redirect =
    interceptUrl +
    "?target=" +
    encodeURIComponent(details.url) +
    "&host=" +
    encodeURIComponent(url.hostname) +
    "&pattern=" +
    encodeURIComponent(match);

  try {
    await chrome.tabs.update(details.tabId, { url: redirect });
  } catch (e) {
    // Tab might have been closed; ignore.
  }
});

// Clean up allowances and check-in sessions when tab closes
chrome.tabs.onRemoved.addListener((tabId) => {
  clearTabAllowances(tabId);
  clearTabSession(tabId);
});

// Clear check-in session when the tab leaves a blocked host
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (!changeInfo.url && changeInfo.status !== "complete") return;

  const interceptUrl = chrome.runtime.getURL("intercept/intercept.html");
  if ((tab.url || "").startsWith(interceptUrl)) return;

  const sessions = await getTabSessions();
  const session = sessions[tabId];
  if (!session) return;

  const settings = await getSettings();
  if (!tabStillOnBlockedHost(tab, session, settings)) {
    await clearTabSession(tabId);
    try {
      await chrome.tabs.sendMessage(tabId, { type: "HIDE_CHECKIN" });
    } catch {}
  }
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (!alarm.name.startsWith("checkin:")) return;
  const tabId = Number(alarm.name.slice("checkin:".length));
  if (!Number.isFinite(tabId)) return;
  handleCheckInAlarm(tabId);
});

// ---------- messaging from intercept page ----------

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    if (msg?.type === "GET_SETTINGS") {
      sendResponse(await getSettings());
      return;
    }

    if (msg?.type === "CONTINUE") {
      const tabId = sender.tab?.id;
      if (!tabId) {
        sendResponse({ ok: false, error: "no tab" });
        return;
      }
      const { target, host, pattern, intent } = msg;
      const settings = await getSettings();
      const matchedPattern = resolvePattern(
        target,
        pattern,
        settings.blockedSites,
      );
      if (!matchedPattern) {
        sendResponse({ ok: false, error: "invalid target" });
        return;
      }
      await allowTabPattern(
        tabId,
        matchedPattern,
        settings.allowGraceMinutes,
      );
      await bumpStat("continued");
      await recordHistory({
        action: "continue",
        host,
        pattern,
        target,
        intent: sliceIntent(intent),
        at: Date.now(),
      });
      await startTabSession(tabId, {
        pattern: matchedPattern,
        host: host || "",
        intent: sliceIntent(intent),
      });
      try {
        await chrome.tabs.update(tabId, { url: target });
      } catch (e) {
        // ignore
      }
      sendResponse({ ok: true });
      return;
    }

    if (msg?.type === "CHECKIN_CONTINUE") {
      const tabId = sender.tab?.id;
      if (!tabId) {
        sendResponse({ ok: false, error: "no tab" });
        return;
      }
      const sessions = await getTabSessions();
      const session = sessions[tabId];
      if (!session) {
        sendResponse({ ok: false, error: "no session" });
        return;
      }
      const settings = await getSettings();
      const now = Date.now();
      session.nextCheckInAt =
        now + settings.checkInExtendMinutes * 60 * 1000;
      session.checkInCount += 1;
      await setTabSessions(sessions);
      await scheduleCheckIn(tabId, session.nextCheckInAt);
      try {
        await chrome.tabs.sendMessage(tabId, { type: "HIDE_CHECKIN" });
      } catch {}
      sendResponse({ ok: true });
      return;
    }

    if (msg?.type === "CHECKIN_CLOSE") {
      const tabId = sender.tab?.id;
      if (tabId) {
        await clearTabSession(tabId);
        await closeTab(tabId);
      }
      sendResponse({ ok: true });
      return;
    }

    if (msg?.type === "CANCEL") {
      const tabId = sender.tab?.id;
      const { host, pattern, intent, target } = msg;
      await bumpStat("cancelled");
      await recordHistory({
        action: "cancel",
        host,
        pattern,
        target,
        intent: sliceIntent(intent),
        at: Date.now(),
      });
      if (tabId) await closeTab(tabId);
      sendResponse({ ok: true });
      return;
    }

    if (msg?.type === "OPEN_INSIGHTS") {
      try {
        await chrome.tabs.create({
          url: chrome.runtime.getURL("options/insights.html"),
        });
      } catch {}
      sendResponse({ ok: true });
      return;
    }

    if (msg?.type === "OPEN_OPTIONS") {
      try {
        await chrome.runtime.openOptionsPage();
      } catch {}
      sendResponse({ ok: true });
      return;
    }
  })();
  return true; // keep the message channel open for async sendResponse
});

// Toolbar icon opens Insights; intercept page links open Insights or Settings.
chrome.action.onClicked.addListener(() => {
  chrome.tabs.create({
    url: chrome.runtime.getURL("options/insights.html"),
  });
});

// Seed defaults on install
chrome.runtime.onInstalled.addListener(async () => {
  const stored = await chrome.storage.local.get([
    "blockedSites",
    "pauseSeconds",
    "allowGraceMinutes",
    "checkInMinutes",
    "checkInExtendMinutes",
  ]);
  const patch = {};
  if (!Array.isArray(stored.blockedSites))
    patch.blockedSites = DEFAULTS.blockedSites;
  if (typeof stored.pauseSeconds !== "number")
    patch.pauseSeconds = DEFAULTS.pauseSeconds;
  if (typeof stored.allowGraceMinutes !== "number")
    patch.allowGraceMinutes = DEFAULTS.allowGraceMinutes;
  if (typeof stored.checkInMinutes !== "number")
    patch.checkInMinutes = DEFAULTS.checkInMinutes;
  if (typeof stored.checkInExtendMinutes !== "number")
    patch.checkInExtendMinutes = DEFAULTS.checkInExtendMinutes;
  if (Object.keys(patch).length) await chrome.storage.local.set(patch);
});
