/**
 * Tokens Monitor SDK - Anthropic Wrapper
 * 
 * 包装 Anthropic SDK，在每次 API 调用后自动上报 token 用量。
 * 
 * 使用方式：
 *   const Anthropic = require('@anthropic-ai/sdk');
 *   const { wrapAnthropic } = require('./sdk/anthropic');
 *   const client = wrapAnthropic(new Anthropic({ apiKey: 'sk-ant-xxx' }));
 *   
 *   const message = await client.messages.create({
 *     model: 'claude-sonnet-4-20250514',
 *     max_tokens: 1024,
 *     messages: [{ role: 'user', content: 'Hello' }],
 *   });
 */

const { getDefaultReporter } = require('./reporter');

/**
 * 包装 Anthropic 客户端实例
 * @param {object} client - Anthropic 客户端实例
 * @param {object} [options] - 配置选项
 * @param {object} [options.reporter] - 自定义 Reporter 实例
 * @returns {object} - 包装后的客户端
 */
function wrapAnthropic(client, options = {}) {
  const reporter = options.reporter || getDefaultReporter();

  if (client.messages) {
    const originalCreate = client.messages.create.bind(client.messages);

    client.messages.create = async function (...args) {
      const response = await originalCreate(...args);

      // Anthropic response has usage: { input_tokens, output_tokens }
      if (response && response.usage) {
        const params = args[0] || {};
        reporter.report({
          provider: 'anthropic',
          model: params.model || response.model || 'unknown',
          prompt_tokens: response.usage.input_tokens || 0,
          completion_tokens: response.usage.output_tokens || 0,
          endpoint: '/v1/messages',
          request_id: response.id,
        });
      }

      return response;
    };

    // Also wrap stream method if available
    if (client.messages.stream) {
      const originalStream = client.messages.stream.bind(client.messages);

      client.messages.stream = function (...args) {
        const stream = originalStream(...args);
        const params = args[0] || {};

        // Listen for final message to get usage
        stream.on('finalMessage', (message) => {
          if (message && message.usage) {
            reporter.report({
              provider: 'anthropic',
              model: params.model || message.model || 'unknown',
              prompt_tokens: message.usage.input_tokens || 0,
              completion_tokens: message.usage.output_tokens || 0,
              endpoint: '/v1/messages',
              request_id: message.id,
              metadata: { streaming: true },
            });
          }
        });

        return stream;
      };
    }
  }

  return client;
}

/**
 * 从 Anthropic API 响应中手动提取并上报
 */
function reportAnthropicResponse(response, options = {}) {
  const reporter = options.reporter || getDefaultReporter();

  if (response && response.usage) {
    return reporter.report({
      provider: 'anthropic',
      model: options.model || response.model,
      prompt_tokens: response.usage.input_tokens || 0,
      completion_tokens: response.usage.output_tokens || 0,
      endpoint: options.endpoint || '/v1/messages',
      request_id: response.id,
    });
  }
  return null;
}

module.exports = { wrapAnthropic, reportAnthropicResponse };
