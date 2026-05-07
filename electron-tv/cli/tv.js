#!/usr/bin/env node
const { Command } = require('commander');
const path = require('path');
const fs = require('fs');

const cfgPath = path.join(__dirname, 'config.json');
const fileCfg = fs.existsSync(cfgPath) ? JSON.parse(fs.readFileSync(cfgPath, 'utf8')) : {};

const BRIDGE_URL = process.env.TV_BRIDGE_URL || fileCfg.bridgeUrl;
const TOKEN      = process.env.TV_TOKEN      || fileCfg.token;

if (!BRIDGE_URL || !TOKEN || BRIDGE_URL.includes('CHANGEME') || TOKEN === 'CHANGEME') {
  console.error('Bridge URL or token missing/placeholder.');
  console.error('Set env vars TV_BRIDGE_URL and TV_TOKEN, or edit cli/config.json.');
  process.exit(1);
}

async function send(type, payload) {
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
    console.error(`Failed: HTTP ${r.status}: ${await r.text()}`);
    process.exit(1);
  }
  console.log('OK');
}

async function status() {
  const r = await fetch(`${BRIDGE_URL}/state`, {
    headers: { 'Authorization': `Bearer ${TOKEN}` },
  });
  if (!r.ok) { console.error(`HTTP ${r.status}`); process.exit(1); }
  console.log(JSON.stringify(await r.json(), null, 2));
}

const program = new Command();
program.name('tv').description('Control the TV dashboard via the fly.io bridge');

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
  .command('config <jsonFile>')
  .description('Push a new rotation config (path to local JSON file)')
  .action((p) => {
    const cfg = JSON.parse(fs.readFileSync(p, 'utf8'));
    send('set_config', cfg);
  });

program
  .command('status')
  .description('Show current bridge state')
  .action(status);

program.parse();
