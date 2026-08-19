// Session check-in overlay — injected on blocked tabs.
// Shows the Batmaz et al. brain-rot paper as soon as you open the site.

if (!globalThis.__intentionalCheckinLoaded) {
  globalThis.__intentionalCheckinLoaded = true;
  bootCheckInOverlay();
}

const ROOT_ID = "intentional-checkin-root";

let elapsedTimer = 0;

function formatElapsed(ms) {
  const mins = Math.floor(ms / 60000);
  if (mins < 1) {
    const secs = Math.max(1, Math.floor(ms / 1000));
    return secs === 1 ? "1 second" : `${secs} seconds`;
  }
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
    <div class="brainrot-flash" aria-hidden="true"></div>
    <article class="brainrot-paper">
      <header class="brainrot-journal-bar">
        <div>
          <div class="brainrot-journal">Psychological Reports</div>
          <div class="brainrot-onlinefirst">OnlineFirst, May 5, 2026</div>
        </div>
        <div class="brainrot-sage">SAGE journals</div>
      </header>
      <p class="brainrot-doi">https://doi.org/10.1177/00332941261450856</p>
      <h1 class="brainrot-title" id="intentional-checkin-title">
        The Cognitive Cost of Brain Rot: Indirect Effects on Depression via Burnout, Stress, and Anxiety
      </h1>
      <p class="brainrot-authors">
        Hasan Batmaz, Cemile Büşra Özsağır, and Halise Arslan Şekkeli
      </p>
      <h2 class="brainrot-abstract-label">Abstract</h2>
      <p class="brainrot-abstract">
        In an era increasingly dominated by digital engagement, the concept of
        brain rot -defined by cognitive fatigue and mental exhaustion-has
        emerged as a critical psychological concern. Based on Cognitive Load
        Theory (CLT) and Conservation of Resources (COR) Theory, this study
        investigates the mechanism through which brain rot predicts depression.
        Specifically, a parallel-serial mediation model (Hayes Model 81) was
        tested to examine whether brain rot leads to depression via burnout
        (primary mediator) and subsequently through stress and anxiety
        (secondary parallel mediators), while controlling for emotional
        dysregulation. Data were collected from 439 participants
        (M<sub>age</sub> = 22.15, SD = 3.89). The results confirmed a full
        mediation model (β = .03, p &gt; .05; 95% CI [−.03, .08]).
        <mark class="brainrot-mark">Brain rot did not directly predict depression but triggered a “loss spiral” by first depleting resources (burnout), which then elevated stress and anxiety, ultimately precipitating depressive symptoms.</mark>
        Burnout emerged as a pivotal transitional factor, while emotional
        dysregulation significantly intensified all psychological outcomes.
        These findings suggest that, alongside clinical interventions targeting
        burnout and emotion regulation, preventive strategies promoting
        conscious digital consumption and media literacy are essential to
        forestall the onset of cognitive fatigue.
      </p>
    </article>
    <footer class="brainrot-footer">
      <p class="brainrot-hook" id="intentional-checkin-hook">
        Endless short-form scrolling triggers a cascade of burnout, stress and depression.
      </p>
      <p class="intentional-elapsed" id="intentional-checkin-elapsed"></p>
      <div class="intentional-actions">
        <button type="button" class="intentional-btn intentional-btn-close" id="intentional-checkin-close">
          Close tab
        </button>
        <button type="button" class="intentional-btn intentional-btn-extend" id="intentional-checkin-extend">
          Continue anyway
        </button>
      </div>
      <div class="intentional-shortcuts">
        <span><kbd>Esc</kbd> or <kbd>Enter</kbd> close tab</span>
        <span class="intentional-sep">·</span>
        <span><kbd>⌘</kbd><kbd>Enter</kbd> continue</span>
      </div>
    </footer>
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
  if (elapsedTimer) {
    clearInterval(elapsedTimer);
    elapsedTimer = 0;
  }
  const root = document.getElementById(ROOT_ID);
  if (!root) return;
  root.classList.add("intentional-hidden");
  root.classList.remove("brainrot-slamming");
}

function renderElapsed(root, host, startedAt) {
  const elapsedEl = root.querySelector("#intentional-checkin-elapsed");
  const elapsed = formatElapsed(Math.max(0, Date.now() - startedAt));
  elapsedEl.replaceChildren();
  elapsedEl.append("You've been on ");
  const hostEl = document.createElement("strong");
  hostEl.textContent = host || "this site";
  elapsedEl.append(hostEl, ` for ${elapsed}.`);
}

function slamRoot(root) {
  root.classList.remove("intentional-hidden");
  root.classList.remove("brainrot-slamming");
  const mark = root.querySelector(".brainrot-mark");
  if (mark) {
    mark.classList.remove("brainrot-mark-on");
    void mark.offsetWidth;
    mark.classList.add("brainrot-mark-on");
  }
  void root.offsetWidth;
  root.classList.add("brainrot-slamming");
}

function showOverlay(data, { report = false } = {}) {
  const root = ensureRoot();
  const { host, startedAt } = data;
  renderElapsed(root, host, startedAt);
  if (elapsedTimer) clearInterval(elapsedTimer);
  elapsedTimer = setInterval(() => renderElapsed(root, host, startedAt), 1000);
  setBusy(false);
  slamRoot(root);

  if (report) {
    chrome.runtime.sendMessage({ type: "CHECKIN_SHOWN" }).catch(() => {});
  }
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
  } catch {
    hideOverlay();
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

function watchYoutubeShorts() {
  let armedOnShorts = false;
  const ping = () => {
    const onShorts = location.pathname.startsWith("/shorts");
    if (!onShorts) {
      armedOnShorts = false;
      return;
    }
    if (isOverlayActive() || armedOnShorts) return;
    armedOnShorts = true;
    chrome.runtime.sendMessage({ type: "ARM_CURRENT" }).catch(() => {});
  };
  document.addEventListener("yt-navigate-finish", ping, true);
  document.addEventListener("yt-page-data-updated", ping, true);
  window.addEventListener("popstate", ping);
  ping();
}

function bootCheckInOverlay() {
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg?.type === "ARM_CHECKIN" || msg?.type === "SHOW_CHECKIN") {
      showOverlay(msg, { report: msg.type === "ARM_CHECKIN" });
      return;
    }
    if (msg?.type === "HIDE_CHECKIN") {
      hideOverlay();
    }
  });
  watchYoutubeShorts();
}
