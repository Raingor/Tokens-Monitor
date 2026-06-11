/**
 * Generic collector that handles manually reported token usage data.
 * This is the primary way to receive data from tools/apps that push their usage.
 * 
 * Usage: POST to /api/report with JSON body:
 * {
 *   "provider": "openai" | "anthropic" | "google" | "custom",
 *   "model": "gpt-4o",
 *   "prompt_tokens": 100,
 *   "completion_tokens": 50,
 *   "endpoint": "/v1/chat/completions",  (optional)
 *   "timestamp": "2024-01-01T00:00:00Z"  (optional, defaults to now)
 * }
 */

class GenericCollector {
  constructor() {
    this.name = 'generic';
    this.pendingReports = [];
  }

  isEnabled() {
    return true; // Always enabled for manual reporting
  }

  /**
   * Queue a report for processing
   */
  addReport(data) {
    const report = {
      provider: data.provider || 'unknown',
      model: data.model || 'unknown',
      prompt_tokens: parseInt(data.prompt_tokens) || 0,
      completion_tokens: parseInt(data.completion_tokens) || 0,
      timestamp: data.timestamp || new Date().toISOString(),
      endpoint: data.endpoint || '/api/report',
      request_id: data.request_id || `report-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      raw_data: data.raw_data || data,
    };

    this.pendingReports.push(report);
    return report;
  }

  /**
   * Collect and clear pending reports
   */
  async collect() {
    const reports = [...this.pendingReports];
    this.pendingReports = [];
    return reports;
  }

  getPendingCount() {
    return this.pendingReports.length;
  }
}

module.exports = GenericCollector;
