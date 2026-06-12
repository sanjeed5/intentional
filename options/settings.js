// Settings page — configure pause, grace, check-in, and blocked sites.

const els = {
  pauseSeconds: document.getElementById("pause-seconds"),
  allowGraceMode: document.getElementById("allow-grace-mode"),
  allowGraceRow: document.getElementById("allow-grace-row"),
  allowGrace: document.getElementById("allow-grace"),
  checkInMinutes: document.getElementById("check-in-minutes"),
  blockedSites: document.getElementById("blocked-sites"),
  saveBtn: document.getElementById("save-btn"),
  resetBtn: document.getElementById("reset-btn"),
  status: document.getElementById("status"),
};

function setStatus(msg, kind = "ok") {
  flashStatus(els.status, msg, kind);
}

async function loadSettings() {
  const stored = await chrome.storage.local.get([
    "blockedSites",
    "pauseSeconds",
    "allowGraceMinutes",
    "checkInMinutes",
  ]);

  els.pauseSeconds.value = String(
    typeof stored.pauseSeconds === "number"
      ? stored.pauseSeconds
      : INTENTIONAL_DEFAULTS.pauseSeconds,
  );
  applyGraceModeUI(
    els,
    typeof stored.allowGraceMinutes === "number"
      ? stored.allowGraceMinutes
      : INTENTIONAL_DEFAULTS.allowGraceMinutes,
  );
  els.checkInMinutes.value = String(
    typeof stored.checkInMinutes === "number"
      ? stored.checkInMinutes
      : INTENTIONAL_DEFAULTS.checkInMinutes,
  );
  const sites = Array.isArray(stored.blockedSites)
    ? stored.blockedSites
    : INTENTIONAL_DEFAULTS.blockedSites;
  els.blockedSites.value = sites.join("\n");
}

async function saveSettings() {
  const pauseResult = readWholeNumber(els.pauseSeconds.value, {
    min: 0,
    max: 600,
    label: "Pause length",
  });
  if (!pauseResult.ok) {
    setStatus(pauseResult.error, "err");
    els.pauseSeconds.focus();
    return;
  }

  const graceResult = readGraceModeMinutes(els);
  if (!graceResult.ok) {
    setStatus(graceResult.error, "err");
    els.allowGrace.focus();
    return;
  }
  const allowGraceMinutes = graceResult.value;

  const checkInResult = readWholeNumber(els.checkInMinutes.value, {
    min: 1,
    max: 240,
    label: "Check-in interval",
  });
  if (!checkInResult.ok) {
    setStatus(checkInResult.error, "err");
    els.checkInMinutes.focus();
    return;
  }

  const pauseSeconds = pauseResult.value;
  const checkInMinutes = checkInResult.value;
  const blockedSites = parseSites(els.blockedSites.value);

  await chrome.storage.local.set({
    pauseSeconds,
    allowGraceMinutes,
    checkInMinutes,
    blockedSites,
  });

  els.pauseSeconds.value = String(pauseSeconds);
  els.checkInMinutes.value = String(checkInMinutes);
  applyGraceModeUI(els, graceResult.value);
  els.blockedSites.value = blockedSites.join("\n");

  setStatus("Saved.");
}

async function resetSettings() {
  await chrome.storage.local.set({
    pauseSeconds: INTENTIONAL_DEFAULTS.pauseSeconds,
    allowGraceMinutes: INTENTIONAL_DEFAULTS.allowGraceMinutes,
    checkInMinutes: INTENTIONAL_DEFAULTS.checkInMinutes,
    blockedSites: INTENTIONAL_DEFAULTS.blockedSites.slice(),
  });
  await loadSettings();
  setStatus("Reset to defaults.");
}

els.allowGraceMode.addEventListener("change", () => {
  const showMinutes = els.allowGraceMode.value === "minutes";
  els.allowGraceRow.classList.toggle("hidden", !showMinutes);
});

els.saveBtn.addEventListener("click", saveSettings);
els.resetBtn.addEventListener("click", resetSettings);

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  if (
    changes.blockedSites ||
    changes.pauseSeconds ||
    changes.allowGraceMinutes ||
    changes.checkInMinutes
  ) {
    loadSettings();
  }
});

loadSettings();
