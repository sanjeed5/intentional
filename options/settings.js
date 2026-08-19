// Settings page — configure pause, grace, check-in, and blocked sites.

const els = {
  pauseSeconds: document.getElementById("pause-seconds"),
  allowGraceMode: document.getElementById("allow-grace-mode"),
  allowGraceRow: document.getElementById("allow-grace-row"),
  allowGrace: document.getElementById("allow-grace"),
  checkInSeconds: document.getElementById("check-in-seconds"),
  skipEntryGate: document.getElementById("skip-entry-gate"),
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
    "checkInSeconds",
    "skipEntryGate",
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
  els.checkInSeconds.value = String(
    typeof stored.checkInSeconds === "number"
      ? stored.checkInSeconds
      : INTENTIONAL_DEFAULTS.checkInSeconds,
  );
  els.skipEntryGate.checked =
    typeof stored.skipEntryGate === "boolean"
      ? stored.skipEntryGate
      : INTENTIONAL_DEFAULTS.skipEntryGate;
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

  const checkInResult = readWholeNumber(els.checkInSeconds.value, {
    min: 1,
    max: 3600,
    label: "Paper interrupt",
  });
  if (!checkInResult.ok) {
    setStatus(checkInResult.error, "err");
    els.checkInSeconds.focus();
    return;
  }

  const pauseSeconds = pauseResult.value;
  const checkInSeconds = checkInResult.value;
  const skipEntryGate = els.skipEntryGate.checked;
  const blockedSites = parseSites(els.blockedSites.value);

  await chrome.storage.local.set({
    pauseSeconds,
    allowGraceMinutes,
    checkInSeconds,
    skipEntryGate,
    blockedSites,
  });

  els.pauseSeconds.value = String(pauseSeconds);
  els.checkInSeconds.value = String(checkInSeconds);
  els.skipEntryGate.checked = skipEntryGate;
  applyGraceModeUI(els, graceResult.value);
  els.blockedSites.value = blockedSites.join("\n");

  setStatus("Saved.");
}

async function resetSettings() {
  await chrome.storage.local.set({
    pauseSeconds: INTENTIONAL_DEFAULTS.pauseSeconds,
    allowGraceMinutes: INTENTIONAL_DEFAULTS.allowGraceMinutes,
    checkInMinutes: INTENTIONAL_DEFAULTS.checkInMinutes,
    checkInSeconds: INTENTIONAL_DEFAULTS.checkInSeconds,
    skipEntryGate: INTENTIONAL_DEFAULTS.skipEntryGate,
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
    changes.checkInMinutes ||
    changes.checkInSeconds ||
    changes.skipEntryGate
  ) {
    loadSettings();
  }
});

loadSettings();
