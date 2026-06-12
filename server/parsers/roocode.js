/**
 * Roo Code / Kilo Code Task Index Parser
 * 
 * Monitors VSCode extension globalStorage for Roo Code (and Kilo Code) task data.
 * Reads tasks/_index.json which has per-task token stats:
 *   tokensIn, tokensOut, cacheWrites, cacheReads, totalCost, apiConfigName
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

// Known VSCode/Cursor extension storage paths
const EXTENSION_DIRS = [
  // VSCode
  path.join(os.homedir(), 'Library', 'Application Support', 'Code', 'User', 'globalStorage'),
  // Cursor
  path.join(os.homedir(), 'Library', 'Application Support', 'Cursor', 'User', 'globalStorage'),
  // VS Code Insiders
  path.join(os.homedir(), 'Library', 'Application Support', 'Code - Insiders', 'User', 'globalStorage'),
];

// Extension identifiers for Roo-like tools
const EXTENSION_IDS = [
  'rooveterinaryinc.roo-cline',  // Roo Code
  'kilocode.Kilo-Code',          // Kilo Code
  'saoudrizwan.claude-dev',      // Cline (original)
];

class RooCodeParser {
  constructor(reporter) {
    this.name = 'roocode';
    this.reporter = reporter;
    this.lastTaskData = new Map();
    this._timer = null;
  }

  start() {
    const found = this._scan();
    if (!found) {
      console.log('[RooCode] No extension data found');
    }
    // Poll every 10 seconds
    this._timer = setInterval(() => this._scan(), 10000);
  }

  stop() {
    if (this._timer) clearInterval(this._timer);
  }

  _scan() {
    let found = false;

    for (const storageDir of EXTENSION_DIRS) {
      if (!fs.existsSync(storageDir)) continue;

      for (const extId of EXTENSION_IDS) {
        const indexFile = path.join(storageDir, extId, 'tasks', '_index.json');
        if (fs.existsSync(indexFile)) {
          found = true;
          const toolName = this._getToolName(extId);
          this._processIndex(indexFile, toolName);
        }
      }

      // Also scan for any extension with tasks/_index.json pattern
      try {
        const entries = fs.readdirSync(storageDir, { withFileTypes: true });
        for (const entry of entries) {
          if (!entry.isDirectory()) continue;
          const indexFile = path.join(storageDir, entry.name, 'tasks', '_index.json');
          if (fs.existsSync(indexFile) && !EXTENSION_IDS.some(id => entry.name.includes(id))) {
            // Check if it has task-like data
            this._processIndex(indexFile, entry.name.split('.')[1] || entry.name);
          }
        }
      } catch (e) {
        // ignore
      }
    }

    return found;
  }

  _processIndex(indexFile, toolName) {
    try {
      const raw = fs.readFileSync(indexFile, 'utf-8');
      const data = JSON.parse(raw);
      const entries = data.entries || [];

      for (const task of entries) {
        const key = `${toolName}-${task.id}`;
        const lastData = this.lastTaskData.get(key);

        // Skip if data hasn't changed
        if (lastData &&
            lastData.tokensIn === task.tokensIn &&
            lastData.tokensOut === task.tokensOut) {
          continue;
        }

        this.lastTaskData.set(key, {
          tokensIn: task.tokensIn || 0,
          tokensOut: task.tokensOut || 0,
        });

        // Skip tasks with no token data
        if (!task.tokensIn && !task.tokensOut) continue;

        const provider = this._detectProvider(task.apiConfigName || '');

        this.reporter.report({
          provider,
          model: this._extractModel(task) || 'unknown',
          prompt_tokens: task.tokensIn || 0,
          completion_tokens: task.tokensOut || 0,
          cache_creation_tokens: task.cacheWrites || 0,
          cache_read_tokens: task.cacheReads || 0,
          endpoint: toolName,
          timestamp: new Date(task.ts || Date.now()).toISOString(),
          request_id: `${toolName}-${task.id}`,
          tool: toolName,
          session_id: task.id,
          cost: task.totalCost || undefined,
          raw_data: {
            workspace: task.workspace,
            mode: task.mode,
            apiConfigName: task.apiConfigName,
            task: typeof task.task === 'string' ? task.task.slice(0, 100) : '',
          },
        });
      }
    } catch (err) {
      // File might be locked during write
    }
  }

  _getToolName(extId) {
    if (extId.includes('roo-cline') || extId.includes('rooveterinary')) return 'roocode';
    if (extId.includes('kilo')) return 'kilocode';
    if (extId.includes('claude-dev') || extId.includes('cline')) return 'cline';
    return extId;
  }

  _detectProvider(apiConfigName) {
    const name = (apiConfigName || '').toLowerCase();
    if (name.includes('deepseek')) return 'deepseek';
    if (name.includes('openai')) return 'openai';
    if (name.includes('anthropic') || name.includes('claude')) return 'anthropic';
    if (name.includes('google') || name.includes('gemini')) return 'google';
    if (name.includes('openrouter')) return 'openrouter';
    if (name.includes('mistral')) return 'mistral';
    if (name.includes('qwen')) return 'qwen';
    return apiConfigName || 'other';
  }

  _extractModel(task) {
    // Model might be in various fields depending on the extension
    return task.model || task.modelId || task.apiConfigName || null;
  }
}

module.exports = RooCodeParser;
