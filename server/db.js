const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DATA_DIR = path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DB_PATH = path.join(DATA_DIR, 'tokens.db');
const db = new Database(DB_PATH);

// Enable WAL mode for better concurrent read performance
db.pragma('journal_mode = WAL');

// Initialize tables
db.exec(`
  CREATE TABLE IF NOT EXISTS requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp TEXT NOT NULL DEFAULT (datetime('now')),
    provider TEXT NOT NULL,
    model TEXT NOT NULL,
    prompt_tokens INTEGER NOT NULL DEFAULT 0,
    completion_tokens INTEGER NOT NULL DEFAULT 0,
    total_tokens INTEGER NOT NULL DEFAULT 0,
    estimated_cost REAL NOT NULL DEFAULT 0,
    endpoint TEXT,
    raw_data TEXT,
    request_id TEXT UNIQUE
  );

  CREATE TABLE IF NOT EXISTS daily_stats (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL,
    provider TEXT NOT NULL,
    model TEXT NOT NULL,
    total_requests INTEGER NOT NULL DEFAULT 0,
    total_tokens INTEGER NOT NULL DEFAULT 0,
    total_cost REAL NOT NULL DEFAULT 0,
    UNIQUE(date, provider, model)
  );

  CREATE INDEX IF NOT EXISTS idx_requests_timestamp ON requests(timestamp);
  CREATE INDEX IF NOT EXISTS idx_requests_provider ON requests(provider);
  CREATE INDEX IF NOT EXISTS idx_requests_model ON requests(model);
  CREATE INDEX IF NOT EXISTS idx_daily_stats_date ON daily_stats(date);
`);

// Migration: add new columns if they don't exist
const existingCols = db.prepare("PRAGMA table_info(requests)").all().map(c => c.name);
const migrations = [
  { col: 'cache_creation_tokens', def: 'INTEGER NOT NULL DEFAULT 0' },
  { col: 'cache_read_tokens', def: 'INTEGER NOT NULL DEFAULT 0' },
  { col: 'tool', def: "TEXT DEFAULT ''" },
  { col: 'session_id', def: "TEXT DEFAULT ''" },
];
for (const m of migrations) {
  if (!existingCols.includes(m.col)) {
    db.exec(`ALTER TABLE requests ADD COLUMN ${m.col} ${m.def}`);
    console.log(`[DB] Migrated: added column ${m.col}`);
  }
}

// Add index on tool column
db.exec(`CREATE INDEX IF NOT EXISTS idx_requests_tool ON requests(tool)`);

// Prepared statements
const insertRequestStmt = db.prepare(`
  INSERT OR IGNORE INTO requests (timestamp, provider, model, prompt_tokens, completion_tokens, total_tokens, estimated_cost, endpoint, raw_data, request_id, cache_creation_tokens, cache_read_tokens, tool, session_id)
  VALUES (@timestamp, @provider, @model, @prompt_tokens, @completion_tokens, @total_tokens, @estimated_cost, @endpoint, @raw_data, @request_id, @cache_creation_tokens, @cache_read_tokens, @tool, @session_id)
`);

const upsertDailyStatsStmt = db.prepare(`
  INSERT INTO daily_stats (date, provider, model, total_requests, total_tokens, total_cost)
  VALUES (@date, @provider, @model, @total_requests, @total_tokens, @total_cost)
  ON CONFLICT(date, provider, model)
  DO UPDATE SET
    total_requests = total_requests + @total_requests,
    total_tokens = total_tokens + @total_tokens,
    total_cost = total_cost + @total_cost
`);

function insertRequest(data) {
  const {
    provider, model, prompt_tokens = 0, completion_tokens = 0,
    endpoint, raw_data, request_id,
    cache_creation_tokens = 0, cache_read_tokens = 0,
    tool = '', session_id = '',
  } = data;
  const total_tokens = prompt_tokens + completion_tokens;
  const timestamp = data.timestamp || new Date().toISOString();
  const date = timestamp.split('T')[0];

  // Calculate estimated cost based on config
  const config = require('./config');
  const estimated_cost = data.cost || config.calculateCost(provider, model, prompt_tokens, completion_tokens);

  const result = insertRequestStmt.run({
    timestamp,
    provider,
    model,
    prompt_tokens,
    completion_tokens,
    total_tokens,
    estimated_cost,
    endpoint: endpoint || null,
    raw_data: raw_data ? JSON.stringify(raw_data) : null,
    request_id: request_id || null,
    cache_creation_tokens,
    cache_read_tokens,
    tool,
    session_id,
  });

  if (result.changes > 0) {
    // Update daily stats
    upsertDailyStatsStmt.run({
      date,
      provider,
      model,
      total_requests: 1,
      total_tokens,
      total_cost: estimated_cost,
    });
    return { inserted: true, id: result.lastInsertRowid, total_tokens, estimated_cost };
  }
  return { inserted: false };
}

function getRecentRequests(limit = 50, offset = 0, filters = {}) {
  let where = '1=1';
  const params = { limit, offset };

  if (filters.provider) {
    where += ' AND provider = @provider';
    params.provider = filters.provider;
  }
  if (filters.model) {
    where += ' AND model = @model';
    params.model = filters.model;
  }
  if (filters.startDate) {
    where += ' AND timestamp >= @startDate';
    params.startDate = filters.startDate;
  }
  if (filters.endDate) {
    where += ' AND timestamp <= @endDate';
    params.endDate = filters.endDate;
  }
  if (filters.tool) {
    where += ' AND tool = @tool';
    params.tool = filters.tool;
  }

  const stmt = db.prepare(`
    SELECT id, timestamp, provider, model, prompt_tokens, completion_tokens, total_tokens, estimated_cost, endpoint, cache_creation_tokens, cache_read_tokens, tool, session_id
    FROM requests
    WHERE ${where}
    ORDER BY timestamp DESC
    LIMIT @limit OFFSET @offset
  `);

  const countStmt = db.prepare(`SELECT COUNT(*) as total FROM requests WHERE ${where}`);
  const { total } = countStmt.get(params);

  return {
    requests: stmt.all(params),
    total,
    limit,
    offset,
  };
}

function getDailyStats(days = 7, filters = {}) {
  let where = "date >= date('now', '-' || @days || ' days')";
  const params = { days: String(days) };

  if (filters.provider) {
    where += ' AND provider = @provider';
    params.provider = filters.provider;
  }

  const stmt = db.prepare(`
    SELECT date, provider, model, total_requests, total_tokens, total_cost
    FROM daily_stats
    WHERE ${where}
    ORDER BY date DESC
  `);

  return stmt.all(params);
}

function getProviders() {
  const stmt = db.prepare(`
    SELECT DISTINCT provider FROM requests ORDER BY provider
  `);
  return stmt.all().map(r => r.provider);
}

function getTools() {
  const stmt = db.prepare(`
    SELECT DISTINCT tool FROM requests WHERE tool != '' ORDER BY tool
  `);
  return stmt.all().map(r => r.tool);
}

function getModels(provider = null) {
  let where = '1=1';
  const params = {};
  if (provider) {
    where = 'provider = @provider';
    params.provider = provider;
  }
  const stmt = db.prepare(`
    SELECT DISTINCT model, provider FROM requests WHERE ${where} ORDER BY model
  `);
  return stmt.all(params);
}

function getTodayStats() {
  const today = new Date().toISOString().split('T')[0];
  const stmt = db.prepare(`
    SELECT 
      COALESCE(SUM(total_tokens), 0) as total_tokens,
      COALESCE(SUM(total_cost), 0) as total_cost,
      COALESCE(SUM(total_requests), 0) as total_requests
    FROM daily_stats
    WHERE date = @today
  `);
  return stmt.get({ today });
}

function getProviderDistribution(days = 7) {
  const stmt = db.prepare(`
    SELECT provider,
      SUM(total_tokens) as tokens,
      SUM(total_cost) as cost,
      SUM(total_requests) as requests
    FROM daily_stats
    WHERE date >= date('now', '-' || @days || ' days')
    GROUP BY provider
    ORDER BY tokens DESC
  `);
  return stmt.all({ days: String(days) });
}

function getModelDistribution(days = 7) {
  const stmt = db.prepare(`
    SELECT model, provider,
      SUM(total_tokens) as tokens,
      SUM(total_cost) as cost,
      SUM(total_requests) as requests
    FROM daily_stats
    WHERE date >= date('now', '-' || @days || ' days')
    GROUP BY model, provider
    ORDER BY tokens DESC
    LIMIT 20
  `);
  return stmt.all({ days: String(days) });
}

function getTokenTrend(hours = 24) {
  const stmt = db.prepare(`
    SELECT 
      strftime('%Y-%m-%d %H:00', timestamp) as hour,
      provider,
      SUM(prompt_tokens) as prompt_tokens,
      SUM(completion_tokens) as completion_tokens,
      SUM(total_tokens) as total_tokens,
      COUNT(*) as request_count
    FROM requests
    WHERE timestamp >= datetime('now', '-' || @hours || ' hours')
    GROUP BY hour, provider
    ORDER BY hour ASC
  `);
  return stmt.all({ hours: String(hours) });
}

module.exports = {
  db,
  insertRequest,
  getRecentRequests,
  getDailyStats,
  getProviders,
  getModels,
  getTools,
  getTodayStats,
  getProviderDistribution,
  getModelDistribution,
  getTokenTrend,
};
