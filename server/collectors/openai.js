const fetch = require('node-fetch');

class OpenAICollector {
  constructor(config) {
    this.name = 'openai';
    this.config = config;
    this.lastPollDate = null;
  }

  isEnabled() {
    return this.config.enabled && !!this.config.apiKey;
  }

  async collect() {
    if (!this.isEnabled()) return [];

    try {
      const today = new Date().toISOString().split('T')[0];
      // OpenAI usage API requires a start_date (and optional end_date)
      // Returns per-day usage breakdown
      const url = `${this.config.baseUrl}/v1/organization/usage?start_date=${today}&end_date=${today}&bucket_width=1d`;

      const resp = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${this.config.apiKey}`,
          'Content-Type': 'application/json',
        },
      });

      if (!resp.ok) {
        // Fallback: try the simpler /v1/models endpoint to verify key works
        console.warn(`[OpenAI] Usage API returned ${resp.status}, trying models endpoint...`);
        return await this.collectFromModels();
      }

      const data = await resp.json();
      return this.parseUsageData(data, today);
    } catch (err) {
      console.error('[OpenAI] Collection error:', err.message);
      return [];
    }
  }

  async collectFromModels() {
    // This is a fallback that just verifies connectivity
    // Real usage data requires the organization usage endpoint
    try {
      const resp = await fetch(`${this.config.baseUrl}/v1/models`, {
        headers: {
          'Authorization': `Bearer ${this.config.apiKey}`,
        },
      });

      if (resp.ok) {
        console.log('[OpenAI] API key valid, but usage endpoint requires organization access');
      }
    } catch (e) {
      // ignore
    }
    return [];
  }

  parseUsageData(data, date) {
    const results = [];

    if (data && data.data) {
      for (const bucket of data.data) {
        // Each bucket has results grouped by model
        if (bucket.results) {
          for (const result of bucket.results) {
            results.push({
              provider: 'openai',
              model: result.model || 'unknown',
              prompt_tokens: result.input_tokens || result.prompt_tokens || 0,
              completion_tokens: result.output_tokens || result.completion_tokens || 0,
              timestamp: new Date(bucket.start_time * 1000).toISOString(),
              request_id: `openai-${date}-${result.model}`,
              endpoint: '/v1/organization/usage',
              raw_data: result,
            });
          }
        }
      }
    }

    return results;
  }
}

module.exports = OpenAICollector;
