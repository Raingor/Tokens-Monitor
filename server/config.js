const fs = require('fs');
const path = require('path');

const CONFIG_PATH = path.join(__dirname, '..', 'config.json');

const DEFAULT_CONFIG = {
  server: {
    port: 3847,
    host: '0.0.0.0',
  },
  polling: {
    interval: 30000, // 30 seconds
    enabled: true,
  },
  providers: {
    openai: {
      enabled: false,
      apiKey: '',
      baseUrl: 'https://api.openai.com',
    },
    anthropic: {
      enabled: false,
      apiKey: '',
      baseUrl: 'https://api.anthropic.com',
    },
  },
  pricing: {
    // Price per 1M tokens (input / output)
    'openai': {
      'gpt-4o': { input: 2.50, output: 10.00 },
      'gpt-4o-mini': { input: 0.15, output: 0.60 },
      'gpt-4-turbo': { input: 10.00, output: 30.00 },
      'gpt-4': { input: 30.00, output: 60.00 },
      'gpt-3.5-turbo': { input: 0.50, output: 1.50 },
      'o1': { input: 15.00, output: 60.00 },
      'o1-mini': { input: 3.00, output: 12.00 },
      'o3': { input: 2.00, output: 8.00 },
      'o3-mini': { input: 1.50, output: 4.40 },
      'o4-mini': { input: 1.10, output: 4.40 },
      'default': { input: 2.50, output: 10.00 },
    },
    'anthropic': {
      'claude-sonnet-4-20250514': { input: 3.00, output: 15.00 },
      'claude-3-5-sonnet-20241022': { input: 3.00, output: 15.00 },
      'claude-3-5-haiku-20241022': { input: 0.80, output: 4.00 },
      'claude-3-opus-20240229': { input: 15.00, output: 75.00 },
      'default': { input: 3.00, output: 15.00 },
    },
    'google': {
      'gemini-2.5-pro': { input: 1.25, output: 10.00 },
      'gemini-2.5-flash': { input: 0.15, output: 0.60 },
      'gemini-2.0-flash': { input: 0.10, output: 0.40 },
      'default': { input: 0.50, output: 1.50 },
    },
    'default': {
      'default': { input: 2.00, output: 8.00 },
    },
  },
};

let config = null;

function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const raw = fs.readFileSync(CONFIG_PATH, 'utf-8');
      config = JSON.parse(raw);
    } else {
      config = DEFAULT_CONFIG;
      saveConfig();
    }
  } catch (e) {
    console.error('Failed to load config, using defaults:', e.message);
    config = DEFAULT_CONFIG;
  }
  return config;
}

function saveConfig() {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf-8');
}

function getConfig() {
  if (!config) loadConfig();
  return config;
}

function updateConfig(updates) {
  config = { ...getConfig(), ...updates };
  saveConfig();
  return config;
}

function calculateCost(provider, model, promptTokens, completionTokens) {
  const cfg = getConfig();
  const pricing = cfg.pricing;

  // Try to find exact model pricing
  const providerPricing = pricing[provider] || pricing['default'];
  const modelPricing = providerPricing[model] || providerPricing['default'] || pricing['default']['default'];

  if (!modelPricing) return 0;

  const inputCost = (promptTokens / 1_000_000) * modelPricing.input;
  const outputCost = (completionTokens / 1_000_000) * modelPricing.output;

  return Math.round((inputCost + outputCost) * 1_000_000) / 1_000_000; // round to 6 decimal places
}

module.exports = {
  loadConfig,
  saveConfig,
  getConfig,
  updateConfig,
  calculateCost,
};
