// Claude Code JSONL Log Parser
// Watches ~/.claude/projects/ for new assistant messages with usage data.

const fs = require('fs');
const path = require('path');
const os = require('os');

const CLAUDE_DIR = path.join(os.homedir(), '.claude', 'projects');

class ClaudeCodeParser {
  constructor(reporter) {
    this.name = 'claude-code';
    this.reporter = reporter;
    this.filePositions = new Map(); // track read position per file
    this.watchers = [];
  }

  /**
   * Scan for existing JSONL files and start watching them
   */
  start() {
    if (!fs.existsSync(CLAUDE_DIR)) {
      console.log(`[ClaudeCode] Directory not found: ${CLAUDE_DIR}`);
      return;
    }

    // Find all JSONL files
    this._scanDir();

    // Watch for new files and changes
    try {
      const watcher = fs.watch(CLAUDE_DIR, { recursive: true }, (eventType, filename) => {
        if (filename && filename.endsWith('.jsonl')) {
          const fullPath = path.join(CLAUDE_DIR, filename);
          this._processFile(fullPath);
        }
      });
      this.watchers.push(watcher);
      console.log(`[ClaudeCode] Watching ${CLAUDE_DIR}`);
    } catch (err) {
      console.error('[ClaudeCode] Watch error:', err.message);
      // Fallback: poll every 5 seconds
      this._pollTimer = setInterval(() => this._scanDir(), 5000);
    }
  }

  stop() {
    this.watchers.forEach(w => w.close());
    if (this._pollTimer) clearInterval(this._pollTimer);
  }

  _scanDir() {
    try {
      this._walkDir(CLAUDE_DIR);
    } catch (err) {
      // ignore
    }
  }

  _walkDir(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        this._walkDir(fullPath);
      } else if (entry.isFile() && entry.name.endsWith('.jsonl')) {
        this._processFile(fullPath);
      }
    }
  }

  _processFile(filePath) {
    try {
      const stat = fs.statSync(filePath);
      const lastPos = this.filePositions.get(filePath) || 0;

      if (stat.size <= lastPos) return; // no new data

      const fd = fs.openSync(filePath, 'r');
      const buf = Buffer.alloc(stat.size - lastPos);
      fs.readSync(fd, buf, 0, buf.length, lastPos);
      fs.closeSync(fd);

      this.filePositions.set(filePath, stat.size);

      const newContent = buf.toString('utf-8');
      const lines = newContent.split('\n').filter(l => l.trim());

      for (const line of lines) {
        this._parseLine(line, filePath);
      }
    } catch (err) {
      // File might be locked or in use
    }
  }

  _parseLine(line, filePath) {
    try {
      const entry = JSON.parse(line);

      // Only process assistant messages with real usage data
      if (entry.type !== 'assistant' || !entry.message?.usage) return;

      const usage = entry.message.usage;
      const inputTokens = usage.input_tokens || 0;
      const outputTokens = usage.output_tokens || 0;

      // Skip entries with zero tokens (streaming partial messages)
      if (inputTokens === 0 && outputTokens === 0) return;

      const cacheCreation = usage.cache_creation_input_tokens || 0;
      const cacheRead = usage.cache_read_input_tokens || 0;
      const model = entry.message.model || 'unknown';

      this.reporter.report({
        provider: this._detectProvider(model),
        model: model,
        prompt_tokens: inputTokens,
        completion_tokens: outputTokens,
        cache_creation_tokens: cacheCreation,
        cache_read_tokens: cacheRead,
        endpoint: 'claude-code',
        timestamp: entry.timestamp || new Date().toISOString(),
        request_id: `claude-code-${entry.uuid || `${entry.sessionId}-${entry.timestamp}`}`,
        tool: 'claude-code',
        session_id: entry.sessionId || '',
      });
    } catch (e) {
      // skip malformed lines
    }
  }

  _detectProvider(model) {
    const m = model.toLowerCase();
    if (m.includes('deepseek')) return 'deepseek';
    if (m.includes('claude') || m.includes('anthropic')) return 'anthropic';
    if (m.includes('gpt') || m.includes('o1') || m.includes('o3') || m.includes('openai')) return 'openai';
    if (m.includes('gemini') || m.includes('google')) return 'google';
    if (m.includes('qwen')) return 'qwen';
    return 'other';
  }
}

module.exports = ClaudeCodeParser;
