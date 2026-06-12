/**
 * OpenCode SQLite Database Parser
 * 
 * Monitors ~/.local/share/opencode/opencode.db
 * Session table has: tokens_input, tokens_output, tokens_cache_read, tokens_cache_write, cost, model
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const Database = require('better-sqlite3');

const DB_PATHS = [
  path.join(os.homedir(), '.local', 'share', 'opencode', 'opencode.db'),
  path.join(os.homedir(), 'Library', 'Application Support', 'ai.opencode.desktop', 'opencode', 'opencode.db'),
];

class OpenCodeParser {
  constructor(reporter) {
    this.name = 'opencode';
    this.reporter = reporter;
    this.db = null;
    this.lastCheck = {};
    this._timer = null;
  }

  start() {
    const dbPath = DB_PATHS.find(p => fs.existsSync(p));
    if (!dbPath) {
      console.log('[OpenCode] Database not found');
      return;
    }

    try {
      this.db = new Database(dbPath, { readonly: true });
      console.log(`[OpenCode] Watching ${dbPath}`);

      // Initial scan
      this._poll();

      // Poll every 10 seconds
      this._timer = setInterval(() => this._poll(), 10000);
    } catch (err) {
      console.error('[OpenCode] Failed to open DB:', err.message);
    }
  }

  stop() {
    if (this._timer) clearInterval(this._timer);
    if (this.db) this.db.close();
  }

  _poll() {
    try {
      const sessions = this.db.prepare(`
        SELECT id, model, cost, tokens_input, tokens_output, tokens_reasoning,
               tokens_cache_read, tokens_cache_write, time_created, time_updated
        FROM session
        WHERE tokens_input > 0 OR tokens_output > 0
        ORDER BY time_updated DESC
        LIMIT 100
      `).all();

      for (const session of sessions) {
        const key = session.id;
        const lastUpdated = this.lastCheck[key];

        if (lastUpdated && lastUpdated >= session.time_updated) continue;

        this.lastCheck[key] = session.time_updated;

        // Parse model info
        const modelInfo = this._parseModel(session.model);

        this.reporter.report({
          provider: modelInfo.provider,
          model: modelInfo.model,
          prompt_tokens: session.tokens_input || 0,
          completion_tokens: session.tokens_output || 0,
          cache_creation_tokens: session.tokens_cache_write || 0,
          cache_read_tokens: session.tokens_cache_read || 0,
          endpoint: 'opencode',
          timestamp: new Date(session.time_updated).toISOString(),
          request_id: `opencode-${session.id}`,
          tool: 'opencode',
          session_id: session.id,
          cost: session.cost || undefined,
        });
      }
    } catch (err) {
      // DB might be locked
    }
  }

  _parseModel(modelStr) {
    if (!modelStr) return { provider: 'unknown', model: 'unknown' };

    // OpenCode may store model as JSON object: {"id":"deepseek-v4-flash","providerID":"opencode-go","variant":"high"}
    let actualModel = modelStr;
    let jsonProvider = null;
    try {
      const parsed = JSON.parse(modelStr);
      if (parsed && typeof parsed === 'object') {
        actualModel = parsed.id || parsed.model || modelStr;
        jsonProvider = parsed.providerID || parsed.provider || null;
      }
    } catch (e) {
      // Not JSON, use as-is
    }

    // OpenCode model format: "providerID/modelID" or just "modelID"
    const parts = actualModel.split('/');
    if (parts.length >= 2) {
      return { provider: parts[0], model: parts.slice(1).join('/') };
    }

    // Use provider from JSON if available
    if (jsonProvider) {
      return { provider: jsonProvider, model: actualModel };
    }

    // Try to detect from model name
    const m = actualModel.toLowerCase();
    if (m.includes('deepseek')) return { provider: 'deepseek', model: actualModel };
    if (m.includes('claude')) return { provider: 'anthropic', model: actualModel };
    if (m.includes('gpt') || m.includes('o1') || m.includes('o3')) return { provider: 'openai', model: actualModel };
    if (m.includes('gemini')) return { provider: 'google', model: actualModel };
    if (m.includes('qwen')) return { provider: 'qwen', model: actualModel };
    return { provider: 'other', model: actualModel };
  }
}

module.exports = OpenCodeParser;
