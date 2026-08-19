// Pure behavioral logic for Intentional — testable without Chrome APIs.
(function (root) {
  const DEFAULT_BLOCKED =
    typeof module !== "undefined" && module.exports
      ? require("./defaults.js").INTENTIONAL_DEFAULTS.blockedSites
      : root.IntentionalDefaults.INTENTIONAL_DEFAULTS.blockedSites;

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
        const key = allowanceKey(tabId, pattern);
        if (minutes === 0) {
          // One-shot pending only — allows the immediate post-continue navigation.
          pending.add(key);
          return;
        }
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
        // Pending without a stored entry is a one-shot (zero grace) or a continue
        // race before storage is visible — allow once, then consume.
        if (pending.has(key)) {
          pending.delete(key);
          return true;
        }
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

  function isYoutubeHost(host) {
    const h = normalizeHost(host);
    return h === "youtube.com" || h === "m.youtube.com" || h.endsWith(".youtube.com");
  }

  function isShortsPath(pathname) {
    return pathname === "/shorts" || pathname.startsWith("/shorts/");
  }

  function isInterruptUrl(urlString, blockedSites = DEFAULT_BLOCKED) {
    let url;
    try {
      url = new URL(urlString || "");
    } catch {
      return false;
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") return false;
    const match = findBlockingPattern(url.hostname, blockedSites);
    if (!match) return false;
    if (isYoutubeHost(url.hostname)) return isShortsPath(url.pathname);
    return true;
  }

  function tabStillOnBlockedHost(
    tabUrl,
    sessionPattern,
    blockedSites = DEFAULT_BLOCKED,
  ) {
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

  function tabStillOnInterruptUrl(
    tabUrl,
    sessionPattern,
    blockedSites = DEFAULT_BLOCKED,
  ) {
    if (!isInterruptUrl(tabUrl, blockedSites)) return false;
    return tabStillOnBlockedHost(tabUrl, sessionPattern, blockedSites);
  }

  function shouldClearCheckInSession(
    tabUrl,
    sessionPattern,
    blockedSites = DEFAULT_BLOCKED,
  ) {
    if (!sessionPattern) return false;
    return !tabStillOnBlockedHost(tabUrl, sessionPattern, blockedSites);
  }

  function checkInCloseHistoryEntry(session, at = Date.now()) {
    return {
      action: "checkin_close",
      host: session.host || "",
      pattern: session.pattern || "",
      intent: session.intent || "",
      checkInCount: session.checkInCount ?? 0,
      at,
    };
  }

  function shouldRecordCheckInCloseOnTabRemoved(session) {
    return Boolean(session?.awaitingCheckIn);
  }

  const behaviorLib = {
    DEFAULT_BLOCKED,
    normalizeHost,
    hostMatches,
    findBlockingPattern,
    isYoutubeHost,
    isShortsPath,
    isInterruptUrl,
    allowanceKey,
    resolvePattern,
    allowanceExpiry,
    createAllowanceStore,
    shouldInterceptNavigation,
    tabStillOnBlockedHost,
    tabStillOnInterruptUrl,
    shouldClearCheckInSession,
    checkInCloseHistoryEntry,
    shouldRecordCheckInCloseOnTabRemoved,
  };

  root.IntentionalBehavior = behaviorLib;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = behaviorLib;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
