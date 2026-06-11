// Pure behavioral logic for Intentional — testable without Chrome APIs.

const DEFAULT_BLOCKED = ["x.com", "twitter.com"];

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

function findBlockingPattern(host, patterns = DEFAULT_BLOCKED) {
  return patterns.find((p) => hostMatches(host, p)) || null;
}

function allowanceKey(tabId, pattern) {
  return `${tabId}:${normalizeHost(pattern)}`;
}

function resolvePattern(target, pattern, blockedSites) {
  try {
    const url = new URL(target);
    return findBlockingPattern(url.hostname, blockedSites) || pattern;
  } catch {
    return pattern;
  }
}

function allowanceExpiry(minutes, now = Date.now()) {
  if (minutes === 0) return null;
  if (minutes < 0) return Number.MAX_SAFE_INTEGER;
  return now + minutes * 60 * 1000;
}

function createAllowanceStore(now = () => Date.now()) {
  const entries = new Map();
  const pending = new Set();

  return {
    grant(tabId, pattern, minutes) {
      if (minutes === 0) return;
      const key = allowanceKey(tabId, pattern);
      const expiresAt = allowanceExpiry(minutes, now());
      if (expiresAt === null) return;
      pending.add(key);
      entries.set(key, { expiresAt });
    },
    isAllowed(tabId, host, blockedSites) {
      const match = findBlockingPattern(host, blockedSites);
      if (!match) return false;
      const key = allowanceKey(tabId, match);
      const entry = entries.get(key);
      if (entry) {
        if (now() > entry.expiresAt) {
          entries.delete(key);
          pending.delete(key);
          return false;
        }
        pending.delete(key);
        return true;
      }
      // Synchronous guard when storage is not visible yet (continue race).
      if (pending.has(key)) return true;
      return false;
    },
    clearTab(tabId) {
      const prefix = `${tabId}:`;
      for (const key of [...entries.keys(), ...pending]) {
        if (key.startsWith(prefix)) {
          entries.delete(key);
          pending.delete(key);
        }
      }
    },
    _entries: entries,
    _pending: pending,
  };
}

function shouldInterceptNavigation({
  tabId,
  host,
  blockedSites = DEFAULT_BLOCKED,
  allowances,
  isExtensionUrl = false,
}) {
  if (isExtensionUrl) return false;
  const match = findBlockingPattern(host, blockedSites);
  if (!match) return false;
  if (allowances.isAllowed(tabId, host, blockedSites)) return false;
  return { intercept: true, pattern: match };
}

function tabStillOnBlockedHost(tabUrl, sessionPattern, blockedSites = DEFAULT_BLOCKED) {
  let url;
  try {
    url = new URL(tabUrl || "");
  } catch {
    return false;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return false;
  const match = findBlockingPattern(url.hostname, blockedSites);
  if (!match) return false;
  return normalizeHost(match) === normalizeHost(sessionPattern);
}

function shouldClearCheckInSession(tabUrl, sessionPattern, blockedSites = DEFAULT_BLOCKED) {
  if (!sessionPattern) return false;
  return !tabStillOnBlockedHost(tabUrl, sessionPattern, blockedSites);
}

const api = {
  DEFAULT_BLOCKED,
  normalizeHost,
  hostMatches,
  findBlockingPattern,
  allowanceKey,
  resolvePattern,
  allowanceExpiry,
  createAllowanceStore,
  shouldInterceptNavigation,
  tabStillOnBlockedHost,
  shouldClearCheckInSession,
};

if (typeof module !== "undefined" && module.exports) {
  module.exports = api;
}
if (typeof globalThis !== "undefined") {
  globalThis.IntentionalBehavior = api;
}
