/**
 * Tokens Monitor SDK
 * 
 * 让你的 LLM API 调用自动上报 token 用量到监控面板。
 * 
 * 支持：
 * - OpenAI SDK 包装
 * - Anthropic SDK 包装
 * - Google Gemini SDK 包装
 * - 通用 fetch/axios 包装
 * - 手动上报
 * 
 * @example
 *   const { wrapOpenAI } = require('tokens-monitor/sdk');
 *   const OpenAI = require('openai');
 *   const client = wrapOpenAI(new OpenAI());
 *   // 之后的每次调用都会自动上报 token 用量
 */

const { TokenReporter, getDefaultReporter } = require('./reporter');
const { wrapOpenAI, reportOpenAIResponse } = require('./openai');
const { wrapAnthropic, reportAnthropicResponse } = require('./anthropic');
const { wrapGoogle, reportGoogleResponse } = require('./google');
const { wrapFetch, reportResponse, wrapAxios, extractUsage, detectProvider } = require('./fetch');

module.exports = {
  // Core
  TokenReporter,
  getDefaultReporter,

  // OpenAI
  wrapOpenAI,
  reportOpenAIResponse,

  // Anthropic
  wrapAnthropic,
  reportAnthropicResponse,

  // Google
  wrapGoogle,
  reportGoogleResponse,

  // Generic
  wrapFetch,
  reportResponse,
  wrapAxios,
  extractUsage,
  detectProvider,
};
