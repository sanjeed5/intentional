// Session check-in overlay — injected on blocked tabs after the grace period.
// Shows the original intent and offers to close or extend.

if (!globalThis.__intentionalCheckinLoaded) {
  globalThis.__intentionalCheckinLoaded = true;
  bootCheckInOverlay();
}

const ROOT_ID = "intentional-checkin-root";

function formatElapsed(ms) {
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return "less than a minute";
  if (mins === 1) return "1 minute";
  if (mins < 60) return `${mins} minutes`;
  const hours = Math.floor(mins / 60);
  const rem = mins % 60;
  if (rem === 0) return hours === 1 ? "1 hour" : `${hours} hours`;
  return `${hours}h ${rem}m`;
}

function ensureRoot() {
  let root = document.getElementById(ROOT_ID);
  if (root) return root;

  root = document.createElement("div");
  root.id = ROOT_ID;
  root.className = "intentional-hidden";
  root.setAttribute("role", "dialog");
  root.setAttribute("aria-modal", "true");
  root.setAttribute("aria-labelledby", "intentional-checkin-title");
  root.innerHTML = `
    <div class="intentional-card">
      <div class="intentional-brand">
        <span class="intentional-brand-dot" aria-hidden="true"></span>
        Intentional
      </div>
      <h2 class="intentional-title" id="intentional-checkin-title">Still here?</h2>
      <p class="intentional-subtitle">A gentle check-in — no judgment.</p>
      <blockquote class="intentional-intent" id="intentional-checkin-intent"></blockquote>
      <p class="intentional-elapsed" id="intentional-checkin-elapsed"></p>
      <div class="intentional-actions">
        <button type="button" class="intentional-btn intentional-btn-close" id="intentional-checkin-close">
          Close tab
        </button>
        <button type="button" class="intentional-btn intentional-btn-extend" id="intentional-checkin-extend">
          Continue 10 more min
        </button>
      </div>
      <div class="intentional-shortcuts">
        <span><kbd>Esc</kbd> or <kbd>Enter</kbd> close tab</span>
        <span class="intentional-sep">·</span>
        <span><kbd>⌘</kbd><kbd>Enter</kbd> continue</span>
      </div>
    </div>
  `;
  document.documentElement.appendChild(root);

  root.querySelector("#intentional-checkin-close").addEventListener("click", onClose);
  root.querySelector("#intentional-checkin-extend").addEventListener("click", onExtend);

  document.addEventListener("keydown", onKeydown, true);

  return root;
}

function setBusy(busy) {
  const root = document.getElementById(ROOT_ID);
  if (!root) return;
  root.querySelector("#intentional-checkin-close").disabled = busy;
  root.querySelector("#intentional-checkin-extend").disabled = busy;
}

function hideOverlay() {
  const root = document.getElementById(ROOT_ID);
  if (root) root.classList.add("intentional-hidden");
}

function showOverlay(data) {
  const root = ensureRoot();
  const { intent, host, startedAt, extendMinutes = 10 } = data;
  const elapsed = formatElapsed(Math.max(0, Date.now() - startedAt));

  root.querySelector("#intentional-checkin-intent").textContent =
    intent || "(no reason recorded)";

  const elapsedEl = root.querySelector("#intentional-checkin-elapsed");
  elapsedEl.replaceChildren();
  elapsedEl.append("You've been on ");
  const hostEl = document.createElement("strong");
  hostEl.textContent = host || "this site";
  elapsedEl.append(hostEl, ` for ${elapsed}.`);
  root.querySelector("#intentional-checkin-extend").textContent =
    extendMinutes === 1
      ? "Continue 1 more min"
      : `Continue ${extendMinutes} more min`;

  setBusy(false);
  root.classList.remove("intentional-hidden");
}

async function onClose() {
  setBusy(true);
  try {
    await chrome.runtime.sendMessage({ type: "CHECKIN_CLOSE" });
  } catch {
    hideOverlay();
  }
}

async function onExtend() {
  setBusy(true);
  try {
    await chrome.runtime.sendMessage({ type: "CHECKIN_CONTINUE" });
    hideOverlay();
  } catch {
    setBusy(false);
  }
}

function isOverlayActive() {
  const root = document.getElementById(ROOT_ID);
  return root && !root.classList.contains("intentional-hidden");
}

function onKeydown(e) {
  if (!isOverlayActive()) return;
  const root = document.getElementById(ROOT_ID);
  if (root.querySelector("#intentional-checkin-close").disabled) return;

  if (e.key === "Escape") {
    e.preventDefault();
    e.stopPropagation();
    onClose();
    return;
  }

  if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
    e.preventDefault();
    e.stopPropagation();
    onExtend();
    return;
  }

  if (
    e.key === "Enter" &&
    !e.metaKey &&
    !e.ctrlKey &&
    !e.shiftKey &&
    !e.altKey
  ) {
    e.preventDefault();
    e.stopPropagation();
    onClose();
  }
}

function bootCheckInOverlay() {
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg?.type === "SHOW_CHECKIN") {
      showOverlay(msg);
      return;
    }
    if (msg?.type === "HIDE_CHECKIN") {
      hideOverlay();
    }
  });
}
