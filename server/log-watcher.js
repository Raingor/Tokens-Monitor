/**
 * Log Watcher Manager
 * 
 * Orchestrates all tool log parsers to automatically collect token usage data.
 * Integrates with the SDK reporter for unified data reporting.
 */

const { TokenReporter } = require('../sdk/reporter');
const ClaudeCodeParser = require('./parsers/claude-code');
const OpenCodeParser = require('./parsers/opencode');
const RooCodeParser = require('./parsers/roocode');
const db = require('./db');

class LogWatcher {
  constructor(options = {}) {
    this.reporter = new TokenReporter({
      endpoint: options.endpoint || 'http://localhost:3847/api/report',
      silent: true,
      async: true,
    });

    this.parsers = [];
    this.running = false;
  }

  start() {
    if (this.running) return;
    this.running = true;

    console.log('[LogWatcher] Starting all parsers...');

    // Initialize a reporter that directly writes to DB (bypasses HTTP)
    const dbReporter = {
      report: (data) => {
        const result = db.insertRequest(data);
        if (result.inserted) {
          console.log(`[LogWatcher] Inserted: ${data.tool} | ${data.model} | in:${data.prompt_tokens} out:${data.completion_tokens} cache_read:${data.cache_read_tokens || 0}`);
          // Return via broadcast if available
          if (this.broadcast) {
            this.broadcast({
              type: 'new_request',
              data: {
                ...data,
                total_tokens: result.total_tokens,
                estimated_cost: result.estimated_cost,
              },
            });
          }
        }
        return result;
      },
    };

    this.claudeParser = new ClaudeCodeParser(dbReporter);
    this.opencodeParser = new OpenCodeParser(dbReporter);
    this.rooParser = new RooCodeParser(dbReporter);

    this.parsers = [this.claudeParser, this.opencodeParser, this.rooParser];

    for (const parser of this.parsers) {
      try {
        parser.start();
        console.log(`[LogWatcher] Started parser: ${parser.name}`);
      } catch (err) {
        console.error(`[LogWatcher] Failed to start ${parser.name}:`, err.message);
      }
    }
  }

  stop() {
    this.running = false;
    for (const parser of this.parsers) {
      try {
        parser.stop();
      } catch (e) {
        // ignore
      }
    }
    console.log('[LogWatcher] Stopped');
  }

  getStatus() {
    return {
      running: this.running,
      parsers: this.parsers.map(p => p.name),
    };
  }

  setBroadcast(fn) {
    this.broadcast = fn;
  }
}

module.exports = LogWatcher;
