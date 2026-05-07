const express = require('express');
const http = require('http');
const { WebSocketServer } = require('ws');

const COMMAND_TYPES = Object.freeze({
  SET_CONFIG:   'set_config',
  FORCE_URL:    'force_url',
  CLEAR_FORCE:  'clear_force',
  COFFEE_BREAK: 'coffee_break',
  SKIP:         'skip',
  RELOAD:       'reload',
});

function validateCommand(cmd) {
  if (!cmd || typeof cmd !== 'object') return 'command must be an object';
  if (!Object.values(COMMAND_TYPES).includes(cmd.type)) return `unknown type: ${cmd.type}`;
  if (cmd.type === COMMAND_TYPES.SET_CONFIG) {
    if (!cmd.payload || !Array.isArray(cmd.payload.urls)) return 'payload.urls must be array';
  }
  if (cmd.type === COMMAND_TYPES.FORCE_URL) {
    if (typeof cmd.payload?.url !== 'string') return 'payload.url required';
  }
  if (cmd.type === COMMAND_TYPES.COFFEE_BREAK) {
    if (typeof cmd.payload?.on !== 'boolean') return 'payload.on must be boolean';
  }
  return null;
}

const TOKEN = process.env.SHARED_TOKEN || '';
const PORT = parseInt(process.env.PORT || '8080', 10);

if (!TOKEN) {
  console.error('SHARED_TOKEN env var is required');
  process.exit(1);
}

const state = {
  config: { urls: [], rotationIntervalSeconds: 300, schedule: [], coffeeBreakMinutes: 15 },
  forceUrl: null,
  coffeeBreak: false,
  lastUpdated: Date.now(),
};

function applyCommand(cmd) {
  switch (cmd.type) {
    case COMMAND_TYPES.SET_CONFIG:
      state.config = { ...state.config, ...cmd.payload };
      break;
    case COMMAND_TYPES.FORCE_URL:
      state.forceUrl = cmd.payload.url;
      break;
    case COMMAND_TYPES.CLEAR_FORCE:
      state.forceUrl = null;
      break;
    case COMMAND_TYPES.COFFEE_BREAK:
      state.coffeeBreak = cmd.payload.on;
      break;
  }
  state.lastUpdated = Date.now();
}

const viewers = new Set();

function broadcast(msg) {
  const data = JSON.stringify(msg);
  for (const ws of viewers) {
    if (ws.readyState === ws.OPEN) ws.send(data);
  }
}

const app = express();
app.use(express.json());

app.get('/health', (req, res) => {
  res.json({ ok: true, viewers: viewers.size });
});

app.get('/state', (req, res) => {
  if (req.headers.authorization !== `Bearer ${TOKEN}`) return res.status(401).end();
  res.json(state);
});

app.post('/command', (req, res) => {
  if (req.headers.authorization !== `Bearer ${TOKEN}`) return res.status(401).end();
  const err = validateCommand(req.body);
  if (err) return res.status(400).json({ error: err });
  applyCommand(req.body);
  broadcast(req.body);
  console.log(`[cmd] ${req.body.type}`, req.body.payload || '');
  res.json({ ok: true, state });
});

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

wss.on('connection', (ws, req) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (url.searchParams.get('token') !== TOKEN) {
    ws.close(1008, 'unauthorized');
    return;
  }
  viewers.add(ws);
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });
  console.log(`[viewer] connected (total ${viewers.size})`);
  ws.send(JSON.stringify({ type: 'state_snapshot', state }));
  ws.on('close', () => {
    viewers.delete(ws);
    console.log(`[viewer] disconnected (total ${viewers.size})`);
  });
  ws.on('error', (e) => console.error('[viewer] error', e.message));
});

setInterval(() => {
  for (const ws of viewers) {
    if (ws.isAlive === false) {
      viewers.delete(ws);
      ws.terminate();
      continue;
    }
    ws.isAlive = false;
    ws.ping();
  }
}, 30 * 1000);

server.listen(PORT, () => {
  console.log(`tv-bridge listening on ${PORT}`);
});
