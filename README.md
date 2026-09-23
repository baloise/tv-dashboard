# TV Dashboard Controller

A small browser-based controller that rotates a list of dashboard URLs in a second browser window on a configurable interval. Supports time-of-day schedule overrides, a forced/pinned URL, and a coffee-break mode. Configuration lives in [config.json](config.json).

The controller (this page) is the small UI with Start/Stop/Skip/Coffee buttons. The dashboards are shown in a separate popup window (`displayWin`) that the controller opens and navigates.

## Running on a TV (kiosk mode)

To get a true chrome-free fullscreen on the TV (no tab strip, no address bar, no taskbar), launch Edge in kiosk mode pointing at the controller URL:

```
"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" --kiosk "https://baloise.github.io/tv-dashboard/index.html" --edge-kiosk-type=fullscreen --user-data-dir="%LOCALAPPDATA%\edge-kiosk" --no-first-run --disable-features=TranslateUI
```

Notes:

- `--kiosk` combined with `--edge-kiosk-type=fullscreen` puts Edge into single-app fullscreen. Popups opened from the kiosk page (the rotating `displayWin`) inherit the chrome-free frame.
- **`--user-data-dir` is required** if Edge is already running. Without it, the kiosk command just opens a tab in the existing Edge process and `--kiosk` is silently ignored — you'd then have to press F11 manually. The separate user-data dir forces a fresh Edge process where the flags actually take effect.
- **Allow popups** for the controller's origin the first time you load it — otherwise `displayWin` is blocked and the controller logs `Popup blocked!`.
- Manual fallback if you don't want to use kiosk mode: press **F11** once on the `displayWin` after it opens.
- Exit kiosk mode with `Alt+F4` (or `Ctrl+W`).

`requestFullscreen()` cannot be triggered on `displayWin` from the controller, because the rotation URLs are cross-origin and the Fullscreen API requires a user gesture in the target window. Kiosk launch is the only reliable path.

## Auto-start on boot (optional)

To make the TV resume the dashboard after a reboot, create a Windows Startup shortcut whose target is the kiosk command above. Place the shortcut in `shell:startup` (Win+R → `shell:startup`). Make sure the TV box is configured to auto-login.

## Configuration

The controller fetches [config.json](config.json) on load and re-fetches it every 60s while running. Recognized keys:

| Key | Purpose |
|---|---|
| `defaultUrls` (array) / `defaultUrl` (string) | Rotation queue. |
| `rotationIntervalSeconds` | Seconds between rotations. Default `300`. |
| `forceUrl` | If set, pins display to this URL and bypasses the rotation queue. |
| `schedule` | Array of `{ url, startTime, endTime }` (24h `HH:MM`) time-of-day overrides. |
| `coffeeBreak` | Boolean remote toggle for coffee-break mode. |
| `coffeeBreakMinutes` | Auto-dismiss timer for coffee-break mode. |

## Menu page (`menu.html`)

`menu.html` renders today's "Mittagsmenü Nord" (Baloise Basel) from the qnips / SV-Gastronomie
backend: an anonymous qnips identity is exchanged for a Firebase token, the week's menu document is
read from Firestore, and the kitchen's daily photos plus allergen icons are loaded from
`files.qnips.com`. It is served as-is from this repo's GitHub Pages:
`https://baloise.github.io/tv-dashboard/menu.html`.

**Always show it through the catproxy worker**, not directly:

```
https://catproxy.culmat.workers.dev/https://baloise.github.io/tv-dashboard/menu.html
```

Why: the TVs sit behind Zscaler, which authenticates the browser *per destination domain* via a
Microsoft SSO redirect. A top-level page load survives that redirect, but `<img>` and `fetch()`
sub-requests to `files.qnips.com`, `firestore.googleapis.com` etc. cannot follow it, so once a
domain's cookie expires the images silently disappear until someone opens that domain by hand.
[catproxy](https://github.com/baloise/catcast/tree/main/workers/catproxy) (a generic Cloudflare
Worker in the catcast repo) serves the page and rewrites every URL through itself, so the browser
talks to exactly one origin. The page itself knows nothing about the proxy.

The page refreshes every 10 minutes and, if a refresh fails, keeps the last good board and retries
with backoff; the small "Stand HH:MM" in the header shows when it last succeeded.
