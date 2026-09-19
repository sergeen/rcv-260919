const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { WebSocketServer, WebSocket } = require('ws');
const SerialManager = require('./serial_manager');
const LedEngine = require('./led_engine');

const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, '..', 'data', 'scenes_state.json');

// Initialize Serial Manager
const serialManager = new SerialManager({
  baudRate: 250000,
  autoConnect: true
});

// Initialize Server-side LED Engine for zero-latency real-time WS2812B streaming
let appState = null;
const ledEngine = new LedEngine(serialManager, () => appState);
function loadState() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const data = fs.readFileSync(DATA_FILE, 'utf8');
      appState = JSON.parse(data);
    }
  } catch (err) {
    console.error('[Server] Error loading scenes_state.json:', err.message);
  }

  if (!appState) {
    appState = {
      activeSceneId: '~',
      scenes: {
        '~': { isCustomized: true, segments: [], circles: [] }
      },
      predefinedCircles: [],
      selectedElementIds: [],
      segmentsLocked: false
    };
  }
}

function saveState() {
  try {
    const dir = path.dirname(DATA_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(DATA_FILE, JSON.stringify(appState, null, 2), 'utf8');
  } catch (err) {
    console.error('[Server] Error saving scenes_state.json:', err.message);
  }
}

let saveTimeout = null;
function debouncedSaveState(delay = 400) {
  if (saveTimeout) clearTimeout(saveTimeout);
  saveTimeout = setTimeout(() => {
    saveState();
  }, delay);
}

loadState();

// Express App setup
const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

// REST APIs
app.get('/api/status', (req, res) => {
  res.json({
    ok: true,
    serial: serialManager.getStatus(),
    wifiIp: getLocalIpAddress(),
    port: PORT
  });
});

app.get('/api/state', (req, res) => {
  res.json(appState);
});

app.post('/api/state', (req, res) => {
  if (req.body && typeof req.body === 'object') {
    appState = req.body;
    saveState();
    ledEngine.triggerLiveUpdate();
    // Broadcast state update to all other connected clients
    broadcast({ type: 'STATE_UPDATE', state: appState });
    res.json({ ok: true });
  } else {
    res.status(400).json({ error: 'Invalid state body' });
  }
});

app.get('/api/ports', async (req, res) => {
  const ports = await serialManager.listAvailablePorts();
  res.json(ports);
});

app.post('/api/ports/connect', (req, res) => {
  const { path: portPath } = req.body;
  if (!portPath) return res.status(400).json({ error: 'Path required' });
  const ok = serialManager.connect(portPath);
  res.json({ ok, serial: serialManager.getStatus() });
});

// HTTP & WebSocket Server
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

function broadcast(data, excludeWs = null) {
  const msg = typeof data === 'string' ? data : JSON.stringify(data);
  wss.clients.forEach(client => {
    if (client !== excludeWs && client.readyState === WebSocket.OPEN) {
      client.send(msg);
    }
  });
}

wss.on('connection', (ws) => {
  // Send initial state & serial status on connect
  ws.send(JSON.stringify({
    type: 'INIT',
    state: appState,
    serial: serialManager.getStatus(),
    wifiIp: getLocalIpAddress()
  }));

  // Throttle tracking for drag broadcast to secondary clients
  let lastDragBroadcast = 0;

  ws.on('message', (message, isBinary) => {
    if (isBinary) {
      // Binary frames from client are no longer accepted; server LedEngine is the sole frame producer
      return;
    }

    try {
      const data = JSON.parse(message.toString());

      if (data.type === 'SYNC_STATE') {
        appState = data.state;
        debouncedSaveState(300);
        ledEngine.triggerLiveUpdate();
        broadcast({ type: 'STATE_UPDATE', state: appState }, ws);
      } else if (data.type === 'DRAG_UPDATE') {
        // Lightweight delta: only update moved circles' x,y positions
        if (appState.scenes && appState.scenes[data.sceneId]) {
          const scene = appState.scenes[data.sceneId];
          for (const upd of data.circles) {
            const target = scene.circles.find(c => c.id === upd.id);
            if (target) {
              target.x = upd.x;
              target.y = upd.y;
            }
          }
        }
        ledEngine.triggerLiveUpdate();
        // Throttled broadcast to secondary clients (~20 FPS max)
        const now = Date.now();
        if (now - lastDragBroadcast > 50) {
          lastDragBroadcast = now;
          broadcast({ type: 'DRAG_UPDATE', sceneId: data.sceneId, circles: data.circles }, ws);
        }
      } else if (data.type === 'SEGMENT_DRAG_UPDATE') {
        // Lightweight delta: only update moved segment's endpoints
        if (appState.scenes && appState.scenes[data.sceneId]) {
          const scene = appState.scenes[data.sceneId];
          const seg = scene.segments.find(s => s.id === data.segId);
          if (seg) {
            seg.p1 = data.p1;
            seg.p2 = data.p2;
          }
        }
        ledEngine.triggerLiveUpdate();
        const now = Date.now();
        if (now - lastDragBroadcast > 50) {
          lastDragBroadcast = now;
          broadcast({ type: 'SEGMENT_DRAG_UPDATE', sceneId: data.sceneId, segId: data.segId, p1: data.p1, p2: data.p2 }, ws);
        }
      } else if (data.type === 'STAGE_LIVE_UPDATE') {
        if (appState.scenes && appState.scenes[data.sceneId]) {
          appState.scenes[data.sceneId].segments = data.segments;
          appState.scenes[data.sceneId].circles = data.circles;
        }
        // Force immediate render to physical WS2812B strip as circle moves
        ledEngine.triggerLiveUpdate();
        broadcast({
          type: 'STAGE_LIVE_UPDATE',
          sceneId: data.sceneId,
          segments: data.segments,
          circles: data.circles
        }, ws);
      } else if (data.type === 'MODIFIER_LIVE_UPDATE') {
        if (appState.scenes && appState.scenes[data.sceneId]) {
          appState.scenes[data.sceneId].segments = data.segments;
          appState.scenes[data.sceneId].circles = data.circles;
        }
        // Force immediate render to physical WS2812B strip
        ledEngine.triggerLiveUpdate();
        broadcast({
          type: 'MODIFIER_LIVE_UPDATE',
          sceneId: data.sceneId,
          segments: data.segments,
          circles: data.circles,
          prop: data.prop,
          value: data.value
        }, ws);
      } else if (data.type === 'SCENE_CHANGE') {
        appState.activeSceneId = data.sceneId;
        saveState();
        ledEngine.triggerLiveUpdate();
        broadcast({ type: 'SCENE_CHANGED', sceneId: data.sceneId }, ws);
      } else if (data.type === 'SEGMENTS_LOCK_UPDATE') {
        appState.segmentsLocked = !!data.isLocked;
        saveState();
        broadcast({ type: 'SEGMENTS_LOCK_UPDATE', isLocked: appState.segmentsLocked }, ws);
      } else if (data.type === 'PING') {
        ws.send(JSON.stringify({ type: 'PONG', time: Date.now() }));
      }
    } catch (e) {
      console.error('[WS] Error processing message:', e.message);
    }
  });
});

// Relay serial status changes to web clients
serialManager.on('status', (status) => {
  broadcast({ type: 'SERIAL_STATUS', serial: status });
});

// Helper: detect local IPv4 address for Wi-Fi / LAN
function getLocalIpAddress() {
  const interfaces = os.networkInterfaces();
  let wifiIp = 'localhost';

  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        // Prioritize Wi-Fi or Wireless adapters
        const lower = name.toLowerCase();
        if (lower.includes('wi-fi') || lower.includes('wireless') || lower.includes('wlan')) {
          return iface.address;
        }
        if (wifiIp === 'localhost') {
          wifiIp = iface.address;
        }
      }
    }
  }
  return wifiIp;
}

// Start Server
server.listen(PORT, '0.0.0.0', () => {
  const ip = getLocalIpAddress();
  console.log('\n============================================================');
  console.log('   REQUIEM CABARET VOLTAIRE 2026 - LED STAGE CONTROLLER   ');
  console.log('============================================================');
  console.log(` > Local Computer:    http://localhost:${PORT}`);
  console.log(` > Phone / Wi-Fi URL: http://${ip}:${PORT}`);
  console.log(` > Serial Status:     ${serialManager.isConnected ? `Connected (${serialManager.portPath})` : 'Simulated / Disconnected'}`);
  console.log('============================================================\n');
});
