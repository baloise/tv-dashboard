#!/usr/bin/env node
// One-time setup for the TV CLI.
//
// What this does:
//   1. Tries to install the `tv` command globally via `npm link`, so teammates
//      can run `tv skip`, `tv show menu`, ... from any directory.
//   2. Pushes cli/default-config.json to the bridge so rotation is ready.
//   3. Prints next-step hints.
//
// Run it via `npm start` (or `npm run setup`). Safe to re-run.

const { spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const here = __dirname;

function run(cmd, args, opts = {}) {
  return spawnSync(cmd, args, { cwd: here, stdio: 'pipe', encoding: 'utf8', shell: process.platform === 'win32', ...opts });
}

function tryLinkGlobally() {
  console.log('-> Installing `tv` command globally (npm link)...');
  const r = run('npm', ['link']);
  if (r.status === 0) {
    console.log('   OK. You can now run `tv <cmd>` from any directory.');
    return true;
  }
  console.warn('   npm link failed. Output:');
  if (r.stdout) console.warn(r.stdout.trim().split('\n').map(l => '     ' + l).join('\n'));
  if (r.stderr) console.warn(r.stderr.trim().split('\n').map(l => '     ' + l).join('\n'));
  console.warn('   You can still use the CLI via `npm run <cmd>` (e.g. `npm run skip`).');
  return false;
}

function tvAvailable() {
  const which = process.platform === 'win32' ? 'where' : 'which';
  return run(which, ['tv']).status === 0;
}

async function pushDefaultConfig() {
  console.log('-> Syncing cli/default-config.json to the bridge...');
  const r = run('node', ['tv.js', 'sync']);
  const out = (r.stdout || '').trim();
  const err = (r.stderr || '').trim();
  if (r.status === 0) {
    console.log('   OK. Bridge now has the canonical rotation config.');
    if (err) console.log('   ' + err);
    return true;
  }
  console.warn('   Sync failed:');
  if (out) console.warn('     ' + out);
  if (err) console.warn('     ' + err);
  console.warn('   Check cli/config.json (bridgeUrl, token) and try `npm run sync` again.');
  return false;
}

(async () => {
  console.log('TV CLI setup\n');

  if (!fs.existsSync(path.join(here, 'config.json'))) {
    console.error('Missing cli/config.json (needs bridgeUrl + token). Aborting.');
    process.exit(1);
  }

  const linked = tryLinkGlobally();
  console.log('');

  await pushDefaultConfig();
  console.log('');

  console.log('Done.\n');

  const useGlobal = linked && tvAvailable();
  const commands = [
    ['status',        'tv status',          'npm run status',     'show what the TV is currently displaying'],
    ['skip',          'tv skip',            'npm run skip',       'advance to the next URL in the rotation'],
    ['reload',        'tv reload',          'npm run reload',     'reload the currently-displayed page'],
    ['menu',          'tv show menu',          'npm run menu',         'show the canteen menu'],
    ['depot',         'tv show depot',         'npm run depot',        'show the depot extractor dashboard'],
    ['mf-concierge',  'tv show mf-concierge',  'npm run mf-concierge', 'show the mf-concierge overview page'],
    ['coffee on',     'tv coffee on',       'npm run coffee:on',  'start coffee break (timer page)'],
    ['coffee off',    'tv coffee off',      'npm run coffee:off', 'end coffee break, resume rotation'],
    ['force <url>',   'tv force <url>',     '—',                  'pin a custom URL (overrides rotation)'],
    ['unforce',       'tv unforce',         'npm run unforce',    'clear pinned URL, resume rotation'],
    ['presets',       'tv presets',         'npm run presets',    'list preset names (menu, depot, overview, ...)'],
    ['sync',          'tv sync',            'npm run sync',       're-push cli/default-config.json to the bridge'],
  ];

  if (useGlobal) {
    console.log('You can run these from any directory:\n');
  } else {
    console.log('`tv` is not on PATH. Use these npm-script aliases from this directory:\n');
  }

  const cmdCol = useGlobal ? 1 : 2;
  const width = Math.max(...commands.map(r => r[cmdCol].length));
  for (const row of commands) {
    const cmd = row[cmdCol];
    if (cmd === '—') continue;
    console.log('  ' + cmd.padEnd(width + 2) + row[3]);
  }

  console.log('');
  console.log('To change what rotates on the TV, edit cli/default-config.json and run `' +
    (useGlobal ? 'tv sync' : 'npm run sync') + '`.');
})();
