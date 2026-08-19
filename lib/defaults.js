// Canonical defaults — top level must not declare shared binding names.
(function (root) {
  root.IntentionalDefaults = {
    INTENTIONAL_DEFAULTS: {
      blockedSites: [
        "x.com",
        "twitter.com",
        "instagram.com",
        "youtube.com",
        "m.youtube.com",
      ],
      pauseSeconds: 0,
      // Once user clicks Continue, allow the site in the same tab before pausing
      // again. -1 = until tab closes, 0 = re-prompt on next navigation, >0 = minutes.
      allowGraceMinutes: -1,
      checkInMinutes: 10,
      // Fallback only if the page is not injectable yet. The paper
      // normally appears as soon as Instagram, Shorts, or X loads.
      checkInSeconds: 1,
      skipEntryGate: true,
    },
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = root.IntentionalDefaults;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
