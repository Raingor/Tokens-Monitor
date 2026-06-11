const OpenAICollector = require('./collectors/openai');
const AnthropicCollector = require('./collectors/anthropic');
const GenericCollector = require('./collectors/generic');
const db = require('./db');

class CollectorManager {
  constructor(config, broadcast) {
    this.config = config;
    this.broadcast = broadcast; // WebSocket broadcast function
    this.collectors = [];
    this.timer = null;
    this.running = false;

    // Initialize collectors
    const cfg = config.getConfig();

    this.openaiCollector = new OpenAICollector(cfg.providers?.openai || {});
    this.anthropicCollector = new AnthropicCollector(cfg.providers?.anthropic || {});
    this.genericCollector = new GenericCollector();

    this.collectors = [
      this.openaiCollector,
      this.anthropicCollector,
      this.genericCollector,
    ];
  }

  start() {
    if (this.running) return;
    this.running = true;

    const cfg = this.config.getConfig();
    const interval = cfg.polling?.interval || 30000;

    console.log(`[CollectorManager] Starting with ${interval}ms interval`);

    // Initial collection
    this.collectAll();

    // Set up periodic collection
    this.timer = setInterval(() => {
      this.collectAll();
    }, interval);
  }

  stop() {
    this.running = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    console.log('[CollectorManager] Stopped');
  }

  async collectAll() {
    for (const collector of this.collectors) {
      if (!collector.isEnabled()) continue;

      try {
        const results = await collector.collect();
        for (const data of results) {
          const result = db.insertRequest(data);
          if (result.inserted && this.broadcast) {
            // Broadcast new data to all connected WebSocket clients
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
      } catch (err) {
        console.error(`[CollectorManager] Error in ${collector.name}:`, err.message);
      }
    }
  }

  /**
   * Accept a manual report via API
   */
  report(data) {
    const report = this.genericCollector.addReport(data);
    // Immediately process it
    const result = db.insertRequest(report);
    if (result.inserted && this.broadcast) {
      this.broadcast({
        type: 'new_request',
        data: {
          ...report,
          total_tokens: result.total_tokens,
          estimated_cost: result.estimated_cost,
        },
      });
    }
    return result;
  }

  getStatus() {
    return {
      running: this.running,
      collectors: this.collectors.map(c => ({
        name: c.name,
        enabled: c.isEnabled(),
      })),
    };
  }
}

module.exports = CollectorManager;
