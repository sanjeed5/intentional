## Learned User Preferences

- Solo personal use only — backward compatibility and migration logic are not needed.
- Both problems matter: mindless opening (autopilot entry) and mindless staying (rabbit holes after a good reason).
- Entry gate should stay light; do not solve session drift by making the entry prompt heavier or more frequent.
- Session check-in should be a lighter in-page overlay, not a repeat of the full intercept page.
- Close tab should be the emphasized/default action at check-in, not Continue.

## Learned Workspace Facts

- Plain JS Chrome MV3 extension, no build step. Files: `background.js`, `intercept/`, `checkin/`, `options/`.
- Options split: `options.html` (settings) + `insights.html` (stats/patterns/backup). Shared nav in header. Toolbar icon opens Insights; `options_ui` and intercept Settings link open Settings.
- Two-layer model: Layer 1 entry gate (`webNavigation.onBeforeNavigate` → `intercept/`), Layer 2 session check-in (`chrome.alarms` + `chrome.scripting` overlay in `checkin/`).
- Entry allowances stored in `chrome.storage.session` keyed by `tabId:blockingPattern` (not exact hostname) so subdomains share state.
- Session check-in state also in `chrome.storage.session` (`tabSessions`), keyed by `tabId`, with alarms named `checkin:${tabId}`.
- Default entry grace: until tab closes (`allowGraceMinutes: -1`). `0` = every navigation, `>0` = fixed minutes.
- Default check-in: 15 min first delay, 10 min per extension.
- `x.com` and `twitter.com` are separate blocked patterns and separate session/allowance keys.
- Layer 2 must be time-based, not navigation-based — SPAs like X/Twitter scroll without firing `onBeforeNavigate`.
- Stats/history in `chrome.storage.local` only. No network calls.
