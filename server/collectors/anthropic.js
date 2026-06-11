const fetch = require('node-fetch');

class AnthropicCollector {
  constructor(config) {
    this.name = 'anthropic';
    this.config = config;
  }

  isEnabled() {
    return this.config.enabled && !!this.config.apiKey;
  }

  async collect() {
    // Anthropic doesn't have a public usage API endpoint like OpenAI
    // Usage data is typically available in response headers from API calls
    // This collector is mainly a placeholder for manual reporting
    if (!this.isEnabled()) return [];
    
    // Verify API key by making a lightweight request
    try {
      const resp = await fetch(`${this.config.baseUrl}/v1/messages`, {
        method: 'POST',
        headers: {
          'x-api-key': this.config.apiKey,
          'anthropic-version': '2023-06-01',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'claude-3-haiku-20240307',
          max_tokens: 1,
          messages: [{ role: 'user', content: '.' }],
        }),
      });

      if (resp.ok) {
        const data = await resp.json();
        if (data.usage) {
          return [{
            provider: 'anthropic',
            model: data.model || 'claude-3-haiku-20240307',
            prompt_tokens: data.usage.input_tokens || 0,
            completion_tokens: data.usage.output_tokens || 0,
            timestamp: new Date().toISOString(),
            request_id: `anthropic-verify-${Date.now()}`,
            endpoint: '/v1/messages',
            raw_data: data.usage,
          }];
        }
      }
    } catch (err) {
      // This is expected to be rate-limited or fail
      // Real usage tracking happens through the report API
    }

    return [];
  }
}

module.exports = AnthropicCollector;
