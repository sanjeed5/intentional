# Intentional

A small browser extension that puts a calm pause between you and distracting
sites. Before the page loads, you see a guided breath, then a single question:

> Why do you want to open this?

Type a short, honest reason. Then **Continue** opens the site, or **Cancel**
closes the tab.

- No accounts.
- No analytics service.
- No tracking.
- No network calls.
- Everything stays on your computer (in `chrome.storage.local`).

It ships pre-configured to pause on `x.com` and `twitter.com`. You can change
the blocked sites and the pause length on the settings page.

## Features

- **Guided breathing animation** — a soft circle expands on the inhale and
  settles on the exhale, synced to the countdown. For pauses up to 14s it's
  one full breath; longer pauses loop a calming 5s-in / 7s-out rhythm.
- **Intent prompt** — must be at least a few real characters. Shows your last
  3 reasons for the same site so you can notice patterns.
- **Keyboard-first** — <kbd>⌘</kbd><kbd>Enter</kbd> to continue,
  <kbd>Esc</kbd> to cancel.
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

The extension is now installed. Pin it from the puzzle-piece menu if you want a
quick way back to settings — clicking the toolbar icon opens the settings page.

## Test it

1. Open a new tab and go to `https://x.com` or `https://twitter.com`.
2. You should be redirected to a calm pause screen with a breathing circle
   and a countdown.
3. After the countdown, type a reason (at least three real characters).
4. Click **Continue** — the original URL loads, and the same site stays open
   in that tab without re-pausing for the next few minutes (configurable).
5. Or click **Cancel** — the tab closes (or goes blank if it's the only tab).

To see your settings:

- Click the Intentional toolbar icon, **or**
- Right-click the icon → **Options**, **or**
- Open `chrome://extensions`, find Intentional, click **Details → Extension
  options**.

## Settings

- **Pause length (seconds)** — how long the breath runs before the prompt.
  Default `10`. Set to `0` to skip the breath and go straight to the prompt.
- **Grace window (minutes)** — after you click Continue, the same site stays
  unblocked in that tab for this many minutes. Default `5`. Set to `0` to be
  prompted on every navigation.
- **Blocked sites** — one hostname per line. Subdomains match automatically:
  `twitter.com` also catches `mobile.twitter.com`.

## Local stats

The settings page shows, all stored locally:

- **Pauses shown** — total times the pause page intercepted a navigation.
- **Continued** / **Cancelled** — what you chose.
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
  background.js          # Service worker: intercepts navigations
  intercept/
    intercept.html       # Pause + prompt UI
    intercept.css
    intercept.js
  options/
    options.html         # Settings + stats UI
    options.css
    options.js
  icons/                 # 16/48/128 px toolbar icons
```

## Uninstall

`chrome://extensions` → Intentional → **Remove**. All local data is removed
with the extension.
