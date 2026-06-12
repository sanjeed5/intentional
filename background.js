// Intentional - background service worker
// Intercepts navigation to user-defined sites and redirects to a pause page.

importScripts("lib/defaults.js", "lib/behavior.js");

const behavior = globalThis.IntentionalBehavior;
const behaviorResolvePattern = behavior.resolvePattern;
const behaviorShouldInterceptNavigation = behavior.shouldInterceptNavigation;
const behaviorCreateAllowanceStore = behavior.createAllowanceStore;
const behaviorTabStillOnBlockedHost = behavior.tabStillOnBlockedHost;
const behaviorCheckInCloseHistoryEntry = behavior.checkInCloseHistoryEntry;
const behaviorShouldRecordCheckInCloseOnTabRemoved =
  behavior.shouldRecordCheckInCloseOnTabRemoved;

const CHECKIN_RETRY_MS = 60 * 1000;

const EXT_DEFAULTS = globalThis.IntentionalDefaults.INTENTIONAL_DEFAULTS;

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
  ]);
  return {
    blockedSites: Array.isArray(stored.blockedSites)
      ? stored.blockedSites
      : EXT_DEFAULTS.blockedSites,
    pauseSeconds:
      typeof stored.pauseSeconds === "number" && stored.pauseSeconds >= 0
        ? stored.pauseSeconds
        : EXT_DEFAULTS.pauseSeconds,
    allowGraceMinutes:
      typeof stored.allowGraceMinutes === "number" &&
      stored.allowGraceMinutes >= -1
        ? stored.allowGraceMinutes
        : EXT_DEFAULTS.allowGraceMinutes,
    checkInMinutes:
      typeof stored.checkInMinutes === "number" && stored.checkInMinutes >= 1
        ? Math.min(240, stored.checkInMinutes)
        : EXT_DEFAULTS.checkInMinutes,
  };
}

function createChromeAllowanceStore() {
  const memory = behaviorCreateAllowanceStore();

  async function persistEntries() {
    const sessions = {};
    for (const [key, entry] of memory._entries) {
      sessions[key] = { expiresAt: entry.expiresAt };
    }
    await chrome.storage.session.set({ [ALLOW_KEY]: sessions });
  }

  return {
    async hydrate() {
      const { [ALLOW_KEY]: sessions = {} } = await chrome.storage.session.get(
        ALLOW_KEY,
      );
      memory._entries.clear();
      for (const [key, entry] of Object.entries(sessions)) {
        memory._entries.set(key, { expiresAt: entry.expiresAt });
      }
    },
    async grant(tabId, pattern, minutes) {
      memory.grant(tabId, pattern, minutes);
      if (minutes !== 0) await persistEntries();
    },
    isAllowed(tabId, host, blockedSites) {
      const entriesBefore = memory._entries.size;
      const allowed = memory.isAllowed(tabId, host, blockedSites);
      if (memory._entries.size !== entriesBefore) {
        persistEntries().catch(() => {});
      }
      return allowed;
    },
    async clearTab(tabId) {
      memory.clearTab(tabId);
      await persistEntries();
    },
  };
}

const allowanceStore = createChromeAllowanceStore();

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
  return behaviorTabStillOnBlockedHost(
    tab.url,
    session.pattern,
    settings.blockedSites,
  );
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
    checkInMinutes: settings.checkInMinutes,
  });
  await bumpStat("checkInShown");
  const sessions = await getTabSessions();
  const stored = sessions[tabId];
  if (stored) {
    stored.awaitingCheckIn = true;
    await setTabSessions(sessions);
  }
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
    // Alarm is one-shot; reschedule a short retry after transient injection failure.
    const retryAt = Date.now() + CHECKIN_RETRY_MS;
    session.nextCheckInAt = retryAt;
    sessions[tabId] = session;
    await setTabSessions(sessions);
    await scheduleCheckIn(tabId, retryAt);
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

async function recordCheckInClose(session) {
  await bumpStat("checkInClosed");
  await recordHistory(behaviorCheckInCloseHistoryEntry(session));
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
  const interceptUrl = chrome.runtime.getURL("intercept/intercept.html");

  await allowanceStore.hydrate();
  const result = behaviorShouldInterceptNavigation({
    tabId: details.tabId,
    host: url.hostname,
    blockedSites: settings.blockedSites,
    allowances: allowanceStore,
    isExtensionUrl: details.url.startsWith(interceptUrl),
  });
  if (result === false) return;

  await bumpStat("intercepted");

  const redirect =
    interceptUrl +
    "?target=" +
    encodeURIComponent(details.url) +
    "&host=" +
    encodeURIComponent(url.hostname) +
    "&pattern=" +
    encodeURIComponent(result.pattern);

  try {
    await chrome.tabs.update(details.tabId, { url: redirect });
  } catch (e) {
    // Tab might have been closed; ignore.
  }
});

// Clean up allowances and check-in sessions when tab closes
chrome.tabs.onRemoved.addListener((tabId) => {
  (async () => {
    const sessions = await getTabSessions();
    const session = sessions[tabId];
    if (behaviorShouldRecordCheckInCloseOnTabRemoved(session)) {
      await recordCheckInClose(session);
    }
    await allowanceStore.clearTab(tabId);
    await clearTabSession(tabId);
  })();
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

const messageHandlers = {
  GET_SETTINGS: async () => getSettings(),

  CONTINUE: async (msg, sender) => {
    const tabId = sender.tab?.id;
    if (!tabId) return { ok: false, error: "no tab" };
    const { target, host, pattern, intent } = msg;
    const settings = await getSettings();
    const matchedPattern = behaviorResolvePattern(
      target,
      pattern,
      settings.blockedSites,
    );
    if (!matchedPattern) return { ok: false, error: "invalid target" };
    await allowanceStore.grant(
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
    } catch {
      // ignore
    }
    return { ok: true };
  },

  CHECKIN_CONTINUE: async (_msg, sender) => {
    const tabId = sender.tab?.id;
    if (!tabId) return { ok: false, error: "no tab" };
    const sessions = await getTabSessions();
    const session = sessions[tabId];
    if (!session) return { ok: false, error: "no session" };
    const settings = await getSettings();
    const now = Date.now();
      session.nextCheckInAt = now + settings.checkInMinutes * 60 * 1000;
    session.checkInCount += 1;
    session.awaitingCheckIn = false;
    await setTabSessions(sessions);
    await scheduleCheckIn(tabId, session.nextCheckInAt);
    await bumpStat("checkInExtended");
    await recordHistory({
      action: "checkin_extend",
      host: session.host,
      pattern: session.pattern,
      intent: session.intent,
      checkInCount: session.checkInCount,
      at: now,
    });
    try {
      await chrome.tabs.sendMessage(tabId, { type: "HIDE_CHECKIN" });
    } catch {}
    return { ok: true };
  },

  CHECKIN_CLOSE: async (_msg, sender) => {
    const tabId = sender.tab?.id;
    if (tabId) {
      const sessions = await getTabSessions();
      const session = sessions[tabId];
      if (session) {
        await recordCheckInClose(session);
      }
      await clearTabSession(tabId);
      await closeTab(tabId);
    }
    return { ok: true };
  },

  CANCEL: async (msg, sender) => {
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
    return { ok: true };
  },
};

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  const handler = messageHandlers[msg?.type];
  if (!handler) return;
  (async () => {
    sendResponse(await handler(msg, sender));
  })();
  return true;
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
  ]);
  const patch = {};
  if (!Array.isArray(stored.blockedSites))
    patch.blockedSites = EXT_DEFAULTS.blockedSites;
  if (typeof stored.pauseSeconds !== "number")
    patch.pauseSeconds = EXT_DEFAULTS.pauseSeconds;
  if (typeof stored.allowGraceMinutes !== "number")
    patch.allowGraceMinutes = EXT_DEFAULTS.allowGraceMinutes;
  if (typeof stored.checkInMinutes !== "number")
    patch.checkInMinutes = EXT_DEFAULTS.checkInMinutes;
  if (Object.keys(patch).length) await chrome.storage.local.set(patch);
});
