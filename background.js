// Intentional - background service worker
// Intercepts navigation to user-defined sites and redirects to a pause page.

const DEFAULTS = {
  blockedSites: ["x.com", "twitter.com"],
  pauseSeconds: 10,
  // Once user clicks Continue, allow the site for this many minutes
  // in the same tab before pausing again.
  allowGraceMinutes: 5,
};

const ALLOW_KEY = "allowedSessions";
const STATS_KEY = "stats";
const HISTORY_KEY = "history";
const HISTORY_LIMIT = 200;

// ---------- helpers ----------

async function getSettings() {
  const stored = await chrome.storage.local.get([
    "blockedSites",
    "pauseSeconds",
    "allowGraceMinutes",
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
      stored.allowGraceMinutes >= 0
        ? stored.allowGraceMinutes
        : DEFAULTS.allowGraceMinutes,
  };
}

function normalizeHost(host) {
  if (!host) return "";
  return host.toLowerCase().replace(/^www\./, "");
}

function hostMatches(host, pattern) {
  const h = normalizeHost(host);
  const p = normalizeHost(pattern);
  if (!h || !p) return false;
  return h === p || h.endsWith("." + p);
}

function findBlockingPattern(host, patterns) {
  return patterns.find((p) => hostMatches(host, p)) || null;
}

async function isAllowed(tabId, host) {
  const { [ALLOW_KEY]: sessions = {} } = await chrome.storage.session.get(
    ALLOW_KEY,
  );
  const key = `${tabId}:${normalizeHost(host)}`;
  const entry = sessions[key];
  if (!entry) return false;
  if (Date.now() > entry.expiresAt) {
    delete sessions[key];
    await chrome.storage.session.set({ [ALLOW_KEY]: sessions });
    return false;
  }
  return true;
}

async function allowTabHost(tabId, host, minutes) {
  const { [ALLOW_KEY]: sessions = {} } = await chrome.storage.session.get(
    ALLOW_KEY,
  );
  const key = `${tabId}:${normalizeHost(host)}`;
  sessions[key] = { expiresAt: Date.now() + minutes * 60 * 1000 };
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

  if (await isAllowed(details.tabId, url.hostname)) return;

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

// Clean up allowances when tab closes
chrome.tabs.onRemoved.addListener((tabId) => {
  clearTabAllowances(tabId);
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
      await allowTabHost(tabId, host, settings.allowGraceMinutes);
      await bumpStat("continued");
      await recordHistory({
        action: "continue",
        host,
        pattern,
        target,
        intent: (intent || "").slice(0, 500),
        at: Date.now(),
      });
      try {
        await chrome.tabs.update(tabId, { url: target });
      } catch (e) {
        // ignore
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
        intent: (intent || "").slice(0, 500),
        at: Date.now(),
      });
      if (tabId) {
        try {
          await chrome.tabs.remove(tabId);
        } catch (e) {
          try {
            await chrome.tabs.update(tabId, { url: "about:blank" });
          } catch {}
        }
      }
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

// Open the options page when the toolbar icon is clicked.
chrome.action.onClicked.addListener(() => {
  chrome.runtime.openOptionsPage();
});

// Seed defaults on install
chrome.runtime.onInstalled.addListener(async () => {
  const stored = await chrome.storage.local.get([
    "blockedSites",
    "pauseSeconds",
    "allowGraceMinutes",
  ]);
  const patch = {};
  if (!Array.isArray(stored.blockedSites))
    patch.blockedSites = DEFAULTS.blockedSites;
  if (typeof stored.pauseSeconds !== "number")
    patch.pauseSeconds = DEFAULTS.pauseSeconds;
  if (typeof stored.allowGraceMinutes !== "number")
    patch.allowGraceMinutes = DEFAULTS.allowGraceMinutes;
  if (Object.keys(patch).length) await chrome.storage.local.set(patch);
});
