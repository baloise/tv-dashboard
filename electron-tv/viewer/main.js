const { app, BrowserWindow, session } = require('electron');
const WebSocket = require('ws');
const path = require('path');
const fs = require('fs');

const PROXY = process.env.HTTPS_PROXY || process.env.https_proxy || process.env.HTTP_PROXY || process.env.http_proxy || null;
let proxyAgent = null;
if (PROXY) {
  const { HttpsProxyAgent } = require('https-proxy-agent');
  proxyAgent = new HttpsProxyAgent(PROXY);
}

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
app.commandLine.appendSwitch('ignore-certificate-errors');
const PROXY_BYPASS = '*.baloise.com,*.baloisenet.com,*.balgroupit.com,*.bvch.ch,*.baloise.ch,*.baloise.app,localhost,127.0.0.1';

app.whenReady().then(async () => {
  if (process.platform === 'win32') {
    await session.defaultSession.setProxy({ mode: 'system' });
    console.log('[chromium] using Windows system proxy (PAC)');
  } else if (PROXY) {
    const proxyHost = PROXY.replace(/^https?:\/\//, '');
    await session.defaultSession.setProxy({
      proxyRules: `http=${proxyHost};https=${proxyHost}`,
      proxyBypassRules: PROXY_BYPASS,
    });
    console.log('[chromium] proxy configured', proxyHost, 'bypass:', PROXY_BYPASS);
  } else {
    await session.defaultSession.setProxy({ proxyRules: 'direct://' });
  }

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
  if (urls.length) {
    if (currentIdx >= urls.length) currentIdx = 0;
    loadUrl(urls[currentIdx]);
    startRotation();
    return;
  }
  if (cfg.defaultUrl) {
    loadUrl(cfg.defaultUrl);
    stopRotation();
  }
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
  ws = new WebSocket(url, proxyAgent ? { agent: proxyAgent } : undefined);
  if (PROXY) console.log('[bridge] using proxy', PROXY);
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
