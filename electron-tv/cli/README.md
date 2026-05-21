# TV CLI

Steer the team TV from your terminal.

## One-time setup

```bash
npm install
npm start
```

`npm start` does two things:

1. Installs `tv` as a global command (`npm link`) so you can run `tv <cmd>` from anywhere.
2. Pushes `default-config.json` to the bridge so the rotation is always ready.

If `npm link` fails on your machine (permissions, etc.), the npm-script aliases below still work from inside this folder.

## Daily use

| Want to...                    | Global command          | NPM-script fallback     |
|-------------------------------|-------------------------|-------------------------|
| See what the TV is showing    | `tv status`             | `npm run status`        |
| Skip to next URL              | `tv skip`               | `npm run skip`          |
| Reload current page           | `tv reload`             | `npm run reload`        |
| Show the canteen menu         | `tv show menu`          | `npm run menu`          |
| Show depot dashboard          | `tv show depot`         | `npm run depot`         |
| Show MF-Concierge overview    | `tv show MF-Concierge`  | `npm run mf-concierge`  |
| Start coffee break            | `tv coffee on`          | `npm run coffee:on`     |
| End coffee break              | `tv coffee off`         | `npm run coffee:off`    |
| Pin a custom URL              | `tv force <url>`        | —                       |
| Clear pinned URL              | `tv unforce`            | `npm run unforce`       |
| List presets                  | `tv presets`            | `npm run presets`       |
| Re-push canonical config      | `tv sync`               | `npm run sync`          |

## Config files

- **`default-config.json`** — canonical rotation (URLs, interval, schedule, coffee minutes). Edit this and run `npm run sync` to update the bridge.
- **`config.json`** — bridge URL, auth token, and preset name → URL mappings (used by `tv show <name>`).

## How auto-sync works

The bridge runs in the cloud and sometimes restarts with empty state. To avoid the old "ran `tv status`, urls are empty, have to manually push config" cycle, every CLI command first checks the bridge state. If the bridge has no `urls` configured, the CLI silently pushes `default-config.json` before sending your command. You'll see a one-line note when this happens.

If you want to force a re-sync at any time, run `tv sync`.
