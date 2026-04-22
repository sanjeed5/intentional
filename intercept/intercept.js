// Intercept page logic.
// Reads the target URL from the query string, runs a guided breathing pause,
// then asks the user for an intent before continuing or cancelling.

const params = new URLSearchParams(window.location.search);
const target = params.get("target") || "";
const host = params.get("host") || "";
const pattern = params.get("pattern") || "";

const RING_CIRCUMFERENCE = 339.292; // 2 * pi * 54, matches CSS dasharray
const MIN_INTENT_CHARS = 3;
const MAX_INTENT_CHARS = 500;
const RECENT_INTENT_COUNT = 3;

const els = {
  pauseStage: document.getElementById("pause-stage"),
  promptStage: document.getElementById("prompt-stage"),
  hostName: document.getElementById("host-name"),
  promptHost: document.getElementById("prompt-host"),
  countdown: document.getElementById("countdown"),
  breathLabel: document.getElementById("breath-label"),
  breathWrap: document.querySelector(".breath-wrap"),
  ringProgress: document.getElementById("ring-progress"),
  recentIntents: document.getElementById("recent-intents"),
  recentIntentsList: document.getElementById("recent-intents-list"),
  intent: document.getElementById("intent"),
  intentError: document.getElementById("intent-error"),
  intentCounter: document.getElementById("intent-counter"),
  continueBtn: document.getElementById("continue-btn"),
  cancelBtn: document.getElementById("cancel-btn"),
  settingsBtn: document.getElementById("settings-btn"),
};

const prefersReducedMotion = window.matchMedia(
  "(prefers-reduced-motion: reduce)",
).matches;

els.hostName.textContent = host;
els.promptHost.textContent = host ? `(${host})` : "";
document.title = host ? `Pause - ${host}` : "Pause - Intentional";
els.intent.maxLength = MAX_INTENT_CHARS;

// ---------- breathing + countdown ----------

function setRing(fraction) {
  els.ringProgress.style.strokeDashoffset = String(
    RING_CIRCUMFERENCE * (1 - fraction),
  );
}

// Decide a breathing plan for the given total seconds.
// - <4s: too short, skip animation.
// - <=14s: one full breath (40% inhale / 60% exhale).
// - >14s: loop 5s inhale / 7s exhale until time's up.
function computeBreathPlan(totalSec) {
  if (totalSec < 4) return null;
  if (totalSec <= 14) {
    return {
      mode: "single",
      inhale: +(totalSec * 0.4).toFixed(2),
      exhale: +(totalSec * 0.6).toFixed(2),
    };
  }
  return { mode: "loop", inhale: 5, exhale: 7 };
}

function startBreathing(plan) {
  if (!plan || prefersReducedMotion) {
    els.breathLabel.textContent = prefersReducedMotion ? "breathe" : "pause";
    return { stop: () => {} };
  }

  let cancelled = false;
  const timeouts = [];
  const schedule = (fn, ms) => {
    const t = setTimeout(() => {
      if (!cancelled) fn();
    }, ms);
    timeouts.push(t);
  };

  const easing = "cubic-bezier(0.37, 0, 0.63, 1)";
  function setPhase(phase, seconds) {
    for (const el of els.breathWrap.querySelectorAll(
      ".breath-aura, .breath-circle",
    )) {
      el.style.transition = `transform ${seconds}s ${easing}`;
    }
    if (phase === "in") {
      els.breathWrap.classList.add("inhaling");
      els.breathLabel.textContent = "breathe in";
    } else {
      els.breathWrap.classList.remove("inhaling");
      els.breathLabel.textContent = "breathe out";
    }
  }

  function inhale() {
    setPhase("in", plan.inhale);
    schedule(exhale, plan.inhale * 1000);
  }
  function exhale() {
    setPhase("out", plan.exhale);
    if (plan.mode === "loop") {
      schedule(inhale, plan.exhale * 1000);
    }
  }

  // Kick off on next frame so the transition engages.
  requestAnimationFrame(inhale);

  return {
    stop: () => {
      cancelled = true;
      timeouts.forEach(clearTimeout);
    },
  };
}

async function startCountdown() {
  const settings = await chrome.runtime.sendMessage({ type: "GET_SETTINGS" });
  const total = Math.max(0, Math.floor(settings?.pauseSeconds ?? 10));

  if (total === 0) {
    setRing(1);
    els.countdown.textContent = "0";
    els.breathLabel.textContent = "ready";
    showPrompt();
    return;
  }

  els.countdown.textContent = String(total);
  els.ringProgress.style.transition = "none";
  setRing(0);

  const breath = startBreathing(computeBreathPlan(total));

  // Enable the smooth ring fill next frame.
  requestAnimationFrame(() => {
    els.ringProgress.style.transition = prefersReducedMotion
      ? "none"
      : `stroke-dashoffset ${total}s linear`;
    setRing(1);
  });

  let remaining = total;
  const interval = setInterval(() => {
    remaining -= 1;
    els.countdown.textContent = String(Math.max(0, remaining));
    if (remaining <= 0) {
      clearInterval(interval);
      breath.stop();
      showPrompt();
    }
  }, 1000);
}

// ---------- prompt ----------

function showPrompt() {
  els.pauseStage.classList.add("fading");
  // Pre-load recent intents while the pause fades out.
  loadRecentIntents();
  setTimeout(() => {
    els.pauseStage.classList.add("hidden");
    els.promptStage.classList.add("fading");
    els.promptStage.classList.remove("hidden");
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        els.promptStage.classList.remove("fading");
        els.intent.focus();
      });
    });
  }, 280);
}

function normalizeHost(h) {
  return (h || "").toLowerCase().replace(/^www\./, "");
}

function relativeTime(ts) {
  const diff = Date.now() - ts;
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(ts).toLocaleDateString([], { month: "short", day: "numeric" });
}

async function loadRecentIntents() {
  try {
    const { history = [] } = await chrome.storage.local.get("history");
    const needle = normalizeHost(host);
    if (!needle) return;
    const matches = history
      .filter(
        (h) =>
          normalizeHost(h.host) === needle &&
          h.intent &&
          h.intent.trim().length > 0,
      )
      .slice(0, RECENT_INTENT_COUNT);

    if (matches.length === 0) return;

    els.recentIntentsList.replaceChildren(
      ...matches.map((entry) => {
        const li = document.createElement("li");
        const bullet = document.createElement("span");
        bullet.className = "bullet";
        bullet.textContent = "—";
        const text = document.createElement("span");
        text.className = "text";
        text.textContent = entry.intent;
        text.title = entry.intent;
        const when = document.createElement("span");
        when.className = "when";
        when.textContent = relativeTime(entry.at);
        li.append(bullet, text, when);
        return li;
      }),
    );
    els.recentIntents.classList.remove("hidden");
  } catch {
    // Non-fatal; silently skip.
  }
}

function getIntent() {
  return els.intent.value.trim();
}

function isValidIntent(text) {
  if (text.length < MIN_INTENT_CHARS) return false;
  // Require at least one letter or digit, not just punctuation.
  return /[\p{L}\p{N}]/u.test(text);
}

function updateCounter() {
  const len = els.intent.value.length;
  els.intentCounter.textContent = `${len} / ${MAX_INTENT_CHARS}`;
  els.intentCounter.classList.toggle(
    "near-limit",
    len >= MAX_INTENT_CHARS - 20,
  );
  if (getIntent() && isValidIntent(getIntent())) {
    els.intentError.classList.add("hidden");
  }
}

async function onContinue() {
  const intent = getIntent();
  if (!isValidIntent(intent)) {
    els.intentError.classList.remove("hidden");
    els.intent.focus();
    return;
  }
  els.intentError.classList.add("hidden");
  els.continueBtn.disabled = true;
  els.cancelBtn.disabled = true;
  try {
    await chrome.runtime.sendMessage({
      type: "CONTINUE",
      target,
      host,
      pattern,
      intent,
    });
  } catch {
    // The background will have already navigated the tab; ignore.
  }
}

async function onCancel() {
  const intent = getIntent();
  els.continueBtn.disabled = true;
  els.cancelBtn.disabled = true;
  try {
    await chrome.runtime.sendMessage({
      type: "CANCEL",
      target,
      host,
      pattern,
      intent,
    });
  } catch {
    // Tab may have already been removed.
  }
  // Fallback if the tab wasn't closed (e.g. last tab in the window).
  setTimeout(() => {
    window.location.replace("about:blank");
  }, 250);
}

// ---------- wiring ----------

els.continueBtn.addEventListener("click", onContinue);
els.cancelBtn.addEventListener("click", onCancel);
els.settingsBtn.addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: "OPEN_OPTIONS" });
});

els.intent.addEventListener("input", updateCounter);

els.intent.addEventListener("keydown", (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
    e.preventDefault();
    onContinue();
  }
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    // Only let Escape cancel once the prompt is visible.
    if (!els.promptStage.classList.contains("hidden")) {
      e.preventDefault();
      onCancel();
    }
  }
});

updateCounter();
startCountdown();
