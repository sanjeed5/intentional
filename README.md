# Intentional

**This branch (`demo/brain-rot-interrupt`) is a recording demo.** It is not
for the Chrome Web Store. `main` stays the real product.

On Instagram, YouTube Shorts, X, or Twitter, the Batmaz et al.
*Psychological Reports* paper covers the page as soon as you arrive.
Sound is record-scratch then vine boom from Myinstants, stored locally
under `sounds/` and not committed. Demo only. Do not ship.

## Record the clip

1. Open `brave://extensions` (or `chrome://extensions`).
2. Developer mode on. **Load unpacked** → `~/projects/intentional`.
   If Intentional is already loaded, click **Reload**, then **Reset to
   defaults** on the Settings page so Instagram, Shorts, and X are in
   the site list.
3. Pin the toolbar icon.
4. Open `https://x.com`. Refresh the tab after reloading the extension.
   Do not start the screen recording yet if you still need to log in.
5. Start recording, then open Instagram, YouTube Shorts, or X. The paper
   should cover the page on arrival. Click the toolbar icon if you want
   to cue it by hand.
6. Unmute the tab / system audio so the sting is in the clip.

Toolbar icon on a blocked tab = show the paper now. On any other tab it
still opens Insights.

---

A small browser extension that makes distracting sites **opt-in instead of
autopilot**. It targets two problems:

1. **Mindless opening** — you reach for a tab before you've decided to be there.
2. **Mindless staying** — you opened for a good reason, then lost an hour scrolling.

Intentional handles these with two layers:

- **Entry gate** — before the page loads, a guided breath and one question:
  > Why do you want to open this?
- **Session check-in** — after you've been on the site a while, a gentle
  in-page overlay asks whether you're still there for the reason you gave.

Type a short, honest reason at the gate. **Continue** opens the site; **Cancel**
closes the tab. At check-in, **Close tab** is the primary action; **Continue**
grants more time.

- No accounts.
- No analytics service.
- No tracking.
- No network calls.
- Everything stays on your computer (in `chrome.storage.local` and
  `chrome.storage.session`).

It ships pre-configured to pause on `x.com` and `twitter.com`. You can change
the blocked sites and timing on the settings page.

## Features

- **Guided breathing animation** — a soft circle expands on the inhale and
  settles on the exhale, synced to the countdown. For pauses up to 14s it's
  one full breath; longer pauses loop a calming 5s-in / 7s-out rhythm.
- **Intent prompt** — must be at least a few real characters. Shows your last
  3 reasons for the same site so you can notice patterns.
- **Keyboard-first** — <kbd>Esc</kbd> or <kbd>Enter</kbd> to close the tab
  during the breath; <kbd>⌘</kbd><kbd>Enter</kbd> to continue at the prompt;
  <kbd>Esc</kbd> to cancel at the prompt. At check-in: <kbd>Esc</kbd> or
  <kbd>Enter</kbd> closes the tab; <kbd>⌘</kbd><kbd>Enter</kbd> extends the
  session.
- **Session check-in** — after you continue past the entry gate, a gentle
  in-page overlay appears once your session time is up (default 10 minutes).
  It shows your original intent and elapsed time. **Close tab** is the primary
  action; **Continue** grants another window (default 10 minutes) before the
  next check-in. Works on SPAs like X/Twitter without navigation.
- **Local-only analytics** — pauses shown, continue/cancel counts, cancel
  rate, 14-day bar chart, top sites, and the last 200 reasons you typed.
- **Dark mode** and **reduced motion** are honored from your OS settings.
- **Backup** — export/import a JSON file with settings, stats, and history.

## Install (Chrome / Brave / Edge / Arc — any Chromium browser)

1. Open `chrome://extensions` (or `brave://extensions`, `edge://extensions`,
   etc.).
2. Turn on **Developer mode** (top-right toggle).
3. Click **Load unpacked**.
4. Pick the folder `~/projects/intentional`.

The extension is now installed. Pin it from the puzzle-piece menu. On this
demo branch, the toolbar icon shows the paper on a blocked tab, or opens
**Insights** otherwise. **Settings** is one click away via the nav.

## Test it

### Entry gate (Layer 1)

1. Open a new tab and go to `https://x.com` or `https://twitter.com`.
2. You should be redirected to a calm pause screen with a breathing circle
   and a countdown.
3. After the countdown, type a reason (at least three real characters).
4. Click **Continue** — the original URL loads, and the same site stays open
   in that tab without re-pausing until your next navigation (configurable).
5. Or click **Cancel** — the tab closes (or goes blank if it's the only tab).

### Session check-in (Layer 2)

1. After continuing, stay on the blocked site for the check-in interval
   (default 10 min — shorten it in settings for faster testing).
2. Scroll around without navigating — the overlay should still appear on
   SPAs like X/Twitter.
3. The overlay shows your intent and elapsed time.
4. **Close tab** closes the tab; **Continue N more min** hides the overlay and
   schedules the next check-in.
5. Navigate away from the blocked host — the session clears and no overlay
   appears.

To open pages:

- **Insights** (stats, patterns, AI prompt) — click the toolbar icon
- **Settings** (pause, blocked sites) — nav link on either page, pause screen
  **Settings** button, or right-click icon → **Options**

## Settings

- **Pause length (seconds)** — how long the breath runs before the prompt.
  Default `10`. Set to `0` to skip the breath and go straight to the prompt.
- **After you continue** — controls when the entry gate appears again in the
  same tab. Default: ask again after you continue (re-prompt on the next
  navigation). You can also stay unblocked until you close the tab, or choose
  a fixed window (1–240 minutes). Subdomains count as the same site.
- **Paper interrupt (seconds)** — fallback only if the page was not ready
  yet. The paper normally appears on arrival. Default `1` on this branch.
- **Skip the entry gate** — default on. Open blocked sites normally; only
  the paper interrupt runs.
- **Blocked sites** — one hostname per line. Defaults: `x.com`,
  `twitter.com`, `instagram.com`, `youtube.com`, `m.youtube.com`. YouTube
  only triggers on `/shorts`.

## Local stats

The settings page shows, all stored locally:

- **Pauses shown** — total times the pause page intercepted a navigation.
- **Continued** / **Cancelled** — what you chose at the entry gate.
- **Cancel rate** — `cancelled / (continued + cancelled)`.
- **Last 14 days** — a small bar chart of daily decisions; today is
  highlighted.
- **Top sites** — your five most-paused hosts, each with its cancel rate.
- **Recent intents** — the last 200 reasons you typed, with site, timestamp,
  and outcome.

Use **Clear stats & history** to wipe everything. **Export** and **Import**
under the Backup section let you save or move your data as JSON.

## File layout

```
intentional/
  manifest.json          # MV3 manifest
  background.js          # Service worker: intercepts navigations, sessions, alarms
  checkin/
    checkin.js           # In-page session check-in overlay
    checkin.css
  intercept/
    intercept.html       # Entry gate: pause + prompt UI
    intercept.css
    intercept.js
  options/
    options.html         # Settings UI
    insights.html        # Stats, patterns, AI prompt, backup
    options.css
    shared.js            # Shared helpers
    settings.js
    insights.js
  icons/                 # 16/48/128 px toolbar icons
```

## Uninstall

`chrome://extensions` → Intentional → **Remove**. All local data is removed
with the extension.
