const express = require('express');
const cors = require('cors');
const { WebSocketServer } = require('ws');
const http = require('http');
const config = require('./config');
const db = require('./db');
const CollectorManager = require('./collector-manager');
const LogWatcher = require('./log-watcher');

// Load config
config.loadConfig();
const cfg = config.getConfig();

const app = express();
const server = http.createServer(app);

// Middleware
app.use(cors());
app.use(express.json());

// WebSocket setup
const wss = new WebSocketServer({ server, path: '/ws' });
const clients = new Set();

function broadcast(message) {
  const data = JSON.stringify(message);
  for (const client of clients) {
    if (client.readyState === 1) { // OPEN
      client.send(data);
    }
  }
}

wss.on('connection', (ws) => {
  clients.add(ws);
  console.log(`[WebSocket] Client connected. Total: ${clients.size}`);

  // Send initial data
  ws.send(JSON.stringify({
    type: 'connected',
    data: {
      todayStats: db.getTodayStats(),
      providers: db.getProviders(),
    },
  }));

  ws.on('close', () => {
    clients.delete(ws);
    console.log(`[WebSocket] Client disconnected. Total: ${clients.size}`);
  });

  ws.on('error', (err) => {
    console.error('[WebSocket] Error:', err.message);
    clients.delete(ws);
  });
});

// Initialize collector manager
const collectorManager = new CollectorManager(config, broadcast);

// ============ REST API Routes ============

// GET /api/stats - Summary statistics
app.get('/api/stats', (req, res) => {
  try {
    const todayStats = db.getTodayStats();
    const providerDist = db.getProviderDistribution(req.query.days ? parseInt(req.query.days) : 7);
    const modelDist = db.getModelDistribution(req.query.days ? parseInt(req.query.days) : 7);
    const tokenTrend = db.getTokenTrend(req.query.hours ? parseInt(req.query.hours) : 24);

    res.json({
      today: todayStats,
      providerDistribution: providerDist,
      modelDistribution: modelDist,
      tokenTrend: tokenTrend,
    });
  } catch (err) {
    console.error('[API] /api/stats error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/requests - Request list with pagination and filters
app.get('/api/requests', (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);
    const offset = parseInt(req.query.offset) || 0;
    const filters = {
      provider: req.query.provider || null,
      model: req.query.model || null,
      startDate: req.query.startDate || null,
      endDate: req.query.endDate || null,
    };

    const result = db.getRecentRequests(limit, offset, filters);
    res.json(result);
  } catch (err) {
    console.error('[API] /api/requests error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/providers - List of active providers
app.get('/api/providers', (req, res) => {
  try {
    const providers = db.getProviders();
    const models = db.getModels();
    res.json({ providers, models });
  } catch (err) {
    console.error('[API] /api/providers error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/report - Manual token usage report
app.post('/api/report', (req, res) => {
  try {
    const { provider, model, prompt_tokens, completion_tokens, endpoint, timestamp } = req.body;

    if (!provider || !model) {
      return res.status(400).json({ error: 'provider and model are required' });
    }

    const result = collectorManager.report({
      provider,
      model,
      prompt_tokens: prompt_tokens || 0,
      completion_tokens: completion_tokens || 0,
      endpoint,
      timestamp,
    });

    res.json({
      success: true,
      ...result,
    });
  } catch (err) {
    console.error('[API] /api/report error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/config - Get current config
app.get('/api/config', (req, res) => {
  try {
    const currentConfig = config.getConfig();
    // Don't expose API keys
    const safeConfig = {
      ...currentConfig,
      providers: Object.fromEntries(
        Object.entries(currentConfig.providers || {}).map(([key, val]) => [
          key,
          { ...val, apiKey: val.apiKey ? '***configured***' : '' },
        ])
      ),
    };
    res.json(safeConfig);
  } catch (err) {
    console.error('[API] /api/config error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/config - Update config
app.post('/api/config', (req, res) => {
  try {
    const updated = config.updateConfig(req.body);
    res.json({ success: true, config: updated });
  } catch (err) {
    console.error('[API] /api/config update error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/collector/status - Collector manager status
app.get('/api/collector/status', (req, res) => {
  res.json(collectorManager.getStatus());
});

// POST /api/collector/collect - Trigger manual collection
app.post('/api/collector/collect', async (req, res) => {
  try {
    await collectorManager.collectAll();
    res.json({ success: true, message: 'Collection triggered' });
  } catch (err) {
    console.error('[API] /api/collector/collect error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/tools - List of detected tools
app.get('/api/tools', (req, res) => {
  try {
    const tools = db.getTools();
    res.json({ tools });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime(), clients: clients.size });
});

// ============ Start Server ============

const PORT = cfg.server?.port || 3847;
const HOST = cfg.server?.host || '0.0.0.0';

server.listen(PORT, HOST, () => {
  console.log(`[Server] Tokens Monitor running at http://${HOST}:${PORT}`);
  console.log(`[Server] WebSocket at ws://${HOST}:${PORT}/ws`);
  console.log(`[Server] Dashboard at http://localhost:${PORT}`);

  // Start collector manager
  collectorManager.start();

  // Start log watcher (monitors Claude Code, OpenCode, Roo Code, etc.)
  const logWatcher = new LogWatcher();
  logWatcher.setBroadcast(broadcast);
  logWatcher.start();
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n[Server] Shutting down...');
  collectorManager.stop();
  if (typeof logWatcher !== 'undefined') logWatcher.stop();
  wss.close();
  server.close();
  db.db.close();
  process.exit(0);
});

process.on('SIGTERM', () => {
  collectorManager.stop();
  if (typeof logWatcher !== 'undefined') logWatcher.stop();
  wss.close();
  server.close();
  db.db.close();
  process.exit(0);
});
