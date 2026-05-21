#!/usr/bin/env node
const { Command } = require('commander');
const path = require('path');
const fs = require('fs');

const PROXY = process.env.HTTPS_PROXY || process.env.https_proxy || process.env.HTTP_PROXY || process.env.http_proxy;
if (PROXY) {
  const { setGlobalDispatcher, ProxyAgent } = require('undici');
  setGlobalDispatcher(new ProxyAgent(PROXY));
}

const cfgPath = path.join(__dirname, 'config.json');
const fileCfg = fs.existsSync(cfgPath) ? JSON.parse(fs.readFileSync(cfgPath, 'utf8')) : {};

const defaultCfgPath = path.join(__dirname, 'default-config.json');
const defaultCfg = fs.existsSync(defaultCfgPath) ? JSON.parse(fs.readFileSync(defaultCfgPath, 'utf8')) : null;

const BRIDGE_URL = process.env.TV_BRIDGE_URL || fileCfg.bridgeUrl;
const TOKEN      = process.env.TV_TOKEN      || fileCfg.token;

if (!BRIDGE_URL || !TOKEN || BRIDGE_URL.includes('CHANGEME') || TOKEN === 'CHANGEME') {
  console.error('Bridge URL or token missing/placeholder.');
  console.error('Set env vars TV_BRIDGE_URL and TV_TOKEN, or edit cli/config.json.');
  process.exit(1);
}

async function getState() {
  const r = await fetch(`${BRIDGE_URL}/state`, {
    headers: { 'Authorization': `Bearer ${TOKEN}` },
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

async function postCommand(type, payload) {
  const body = payload === undefined ? { type } : { type, payload };
  const r = await fetch(`${BRIDGE_URL}/command`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    throw new Error(`HTTP ${r.status}: ${await r.text()}`);
  }
}

// Push the canonical default config from default-config.json.
// Returns true if pushed, false if no default-config.json exists.
async function pushDefaultConfig() {
  if (!defaultCfg) return false;
  await postCommand('set_config', defaultCfg);
  return true;
}

// If the bridge has no urls configured (cold start, fresh deploy, etc.),
// silently push the canonical default-config.json so commands always have
// a rotation to work with. Skip when there's no default-config.json or
// the user explicitly invoked `sync`/`status`/`config`.
async function ensureBridgeConfigured() {
  if (!defaultCfg) return;
  try {
    const state = await getState();
    const urls = state?.config?.urls;
    if (!Array.isArray(urls) || urls.length === 0) {
      await pushDefaultConfig();
      console.error('(bridge had no rotation config — pushed cli/default-config.json)');
    }
  } catch {
    // Network/auth errors will surface on the actual command — don't double-report here.
  }
}

async function send(type, payload, { autoSync = true } = {}) {
  if (autoSync) await ensureBridgeConfigured();
  try {
    await postCommand(type, payload);
    console.log('OK');
  } catch (e) {
    console.error(`Failed: ${e.message}`);
    process.exit(1);
  }
}

async function status() {
  try {
    const state = await getState();
    console.log(JSON.stringify(state, null, 2));
    const urls = state?.config?.urls;
    if (!Array.isArray(urls) || urls.length === 0) {
      console.error('');
      console.error('Note: bridge has no rotation config. Run `tv sync` (or `npm run sync`) to push cli/default-config.json.');
    }
  } catch (e) {
    console.error(`Failed: ${e.message}`);
    process.exit(1);
  }
}

const program = new Command();
program.name('tv').description('Control the TV dashboard via the remote bridge');

program
  .command('force <url>')
  .description('Pin a URL on the TV (overrides rotation)')
  .action((url) => send('force_url', { url }));

program
  .command('unforce')
  .description('Clear forced URL, resume rotation')
  .action(() => send('clear_force'));

program
  .command('coffee <state>')
  .description('Toggle coffee break: on | off')
  .action((s) => {
    if (s !== 'on' && s !== 'off') {
      console.error("state must be 'on' or 'off'");
      process.exit(1);
    }
    send('coffee_break', { on: s === 'on' });
  });

program
  .command('skip')
  .description('Advance to the next URL in rotation')
  .action(() => send('skip'));

program
  .command('reload')
  .description('Reload the currently-displayed page')
  .action(() => send('reload'));

program
  .command('config [jsonFile]')
  .description('Push a rotation config (defaults to cli/default-config.json)')
  .action(async (p) => {
    const filePath = p ? path.resolve(p) : defaultCfgPath;
    if (!fs.existsSync(filePath)) {
      console.error(`Config file not found: ${filePath}`);
      process.exit(1);
    }
    const cfg = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    await send('set_config', cfg, { autoSync: false });
  });

program
  .command('sync')
  .description('Push cli/default-config.json to the bridge (re-syncs canonical config)')
  .action(async () => {
    if (!defaultCfg) {
      console.error('cli/default-config.json not found. Nothing to sync.');
      process.exit(1);
    }
    await send('set_config', defaultCfg, { autoSync: false });
  });

program
  .command('show <name>')
  .description('Force display of a named preset (menu, depot, overview, ...)')
  .action((name) => {
    const presets = fileCfg.presets || {};
    const url = presets[name];
    if (!url) {
      console.error(`Unknown preset '${name}'. Available: ${Object.keys(presets).join(', ') || '(none)'}`);
      process.exit(1);
    }
    send('force_url', { url });
  });

program
  .command('presets')
  .description('List available preset names')
  .action(() => {
    const presets = fileCfg.presets || {};
    if (!Object.keys(presets).length) {
      console.log('(no presets configured in cli/config.json)');
      return;
    }
    for (const [name, url] of Object.entries(presets)) {
      console.log(`  ${name.padEnd(12)} ${url}`);
    }
  });

program
  .command('status')
  .description('Show current bridge state')
  .action(status);

program.parse();
