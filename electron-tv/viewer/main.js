const { app, BrowserWindow } = require('electron');
const WebSocket = require('ws');
const path = require('path');
const fs = require('fs');

const cfgPath = path.join(__dirname, 'config.json');
const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));

const BRIDGE_URL = process.env.TV_BRIDGE_URL || cfg.bridgeWss;
const TOKEN      = process.env.TV_TOKEN      || cfg.token;

let mainWindow = null;
let ws = null;
let reconnectMs = 1000;

let state = {
  config: { urls: [], rotationIntervalSeconds: 300, schedule: [], coffeeBreakMinutes: 15 },
  forceUrl: null,
  coffeeBreak: false,
};
let currentIdx = 0;
let rotationTimer = null;
let scheduleCheckTimer = null;
let coffeeAutoOffTimer = null;
let lastLoadedUrl = null;

app.commandLine.appendSwitch('auth-server-allowlist', '*.baloisenet.com');
app.commandLine.appendSwitch('auth-negotiate-delegate-allowlist', '*.baloisenet.com');

app.whenReady().then(() => {
  mainWindow = new BrowserWindow({
    width: 1920,
    height: 1080,
    kiosk: !!cfg.kiosk,
    fullscreen: !!cfg.fullscreen,
    autoHideMenuBar: true,
    webPreferences: { sandbox: true },
  });
  if (cfg.defaultUrl) loadUrl(cfg.defaultUrl);
  connectBridge();
  scheduleCheckTimer = setInterval(render, 30 * 1000);
});

app.on('window-all-closed', () => app.quit());

function loadUrl(url) {
  if (!mainWindow) return;
  if (url === lastLoadedUrl) return;
  lastLoadedUrl = url;
  mainWindow.loadURL(url).catch((e) => console.error('loadURL failed', e));
  console.log('[viewer] loaded', url);
}

function getActiveScheduledUrl() {
  const now = new Date();
  const mins = now.getHours() * 60 + now.getMinutes();
  for (const e of (state.config.schedule || [])) {
    const [sh, sm] = e.startTime.split(':').map(Number);
    const [eh, em] = e.endTime.split(':').map(Number);
    if (mins >= sh * 60 + sm && mins < eh * 60 + em) return e.url;
  }
  return null;
}

function render() {
  if (state.coffeeBreak) {
    loadUrl('file://' + path.join(__dirname, 'coffee.html'));
    stopRotation();
    return;
  }
  if (state.forceUrl) {
    loadUrl(state.forceUrl);
    stopRotation();
    return;
  }
  const sched = getActiveScheduledUrl();
  if (sched) {
    loadUrl(sched);
    stopRotation();
    return;
  }
  const urls = state.config.urls || [];
  if (!urls.length) return;
  if (currentIdx >= urls.length) currentIdx = 0;
  loadUrl(urls[currentIdx]);
  startRotation();
}

function startRotation() {
  stopRotation();
  const interval = (state.config.rotationIntervalSeconds || 300) * 1000;
  rotationTimer = setInterval(() => {
    const urls = state.config.urls || [];
    if (!urls.length) return;
    currentIdx = (currentIdx + 1) % urls.length;
    render();
  }, interval);
}

function stopRotation() {
  if (rotationTimer) { clearInterval(rotationTimer); rotationTimer = null; }
}

function armCoffeeAutoOff() {
  if (coffeeAutoOffTimer) { clearTimeout(coffeeAutoOffTimer); coffeeAutoOffTimer = null; }
  if (state.coffeeBreak && state.config.coffeeBreakMinutes) {
    coffeeAutoOffTimer = setTimeout(() => {
      state.coffeeBreak = false;
      render();
    }, state.config.coffeeBreakMinutes * 60 * 1000);
  }
}

function applyServerMessage(msg) {
  switch (msg.type) {
    case 'state_snapshot':
      state = msg.state;
      currentIdx = 0;
      armCoffeeAutoOff();
      render();
      break;
    case 'set_config':
      state.config = { ...state.config, ...msg.payload };
      currentIdx = 0;
      render();
      break;
    case 'force_url':
      state.forceUrl = msg.payload.url;
      render();
      break;
    case 'clear_force':
      state.forceUrl = null;
      render();
      break;
    case 'coffee_break':
      state.coffeeBreak = msg.payload.on;
      armCoffeeAutoOff();
      render();
      break;
    case 'skip': {
      const urls = state.config.urls || [];
      if (urls.length) {
        currentIdx = (currentIdx + 1) % urls.length;
        render();
      }
      break;
    }
    case 'reload':
      if (mainWindow) mainWindow.reload();
      break;
  }
}

function connectBridge() {
  const url = `${BRIDGE_URL}/?token=${encodeURIComponent(TOKEN)}`;
  ws = new WebSocket(url);
  ws.on('open', () => {
    console.log('[bridge] connected');
    reconnectMs = 1000;
  });
  ws.on('message', (data) => {
    try {
      applyServerMessage(JSON.parse(data.toString()));
    } catch (e) {
      console.error('[bridge] bad message', e);
    }
  });
  ws.on('close', (code) => {
    console.log(`[bridge] disconnected (${code}), retrying in ${reconnectMs}ms`);
    setTimeout(connectBridge, reconnectMs);
    reconnectMs = Math.min(reconnectMs * 2, 30000);
  });
  ws.on('error', () => {});
}
