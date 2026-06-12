// Canonical defaults — top level must not declare shared binding names.
(function (root) {
  root.IntentionalDefaults = {
    INTENTIONAL_DEFAULTS: {
      blockedSites: ["x.com", "twitter.com"],
      pauseSeconds: 10,
      // Once user clicks Continue, allow the site in the same tab before pausing
      // again. -1 = until tab closes, 0 = re-prompt on next navigation, >0 = minutes.
      allowGraceMinutes: 0,
      checkInMinutes: 10,
    },
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = root.IntentionalDefaults;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
