/**
 * Tokens Monitor SDK - OpenAI Wrapper
 * 
 * 包装 OpenAI SDK，在每次 API 调用后自动上报 token 用量。
 * 
 * 使用方式：
 *   const OpenAI = require('openai');
 *   const { wrapOpenAI } = require('./sdk/openai');
 *   const client = wrapOpenAI(new OpenAI({ apiKey: 'sk-xxx' }));
 *   
 *   // 正常使用，token 用量会自动上报
 *   const response = await client.chat.completions.create({
 *     model: 'gpt-4o',
 *     messages: [{ role: 'user', content: 'Hello' }],
 *   });
 */

const { getDefaultReporter } = require('./reporter');

/**
 * 包装 OpenAI 客户端实例
 * @param {object} client - OpenAI 客户端实例
 * @param {object} [options] - 配置选项
 * @param {object} [options.reporter] - 自定义 Reporter 实例
 * @returns {object} - 包装后的客户端（Proxy）
 */
function wrapOpenAI(client, options = {}) {
  const reporter = options.reporter || getDefaultReporter();

  // Wrap chat.completions
  if (client.chat && client.chat.completions) {
    const originalCreate = client.chat.completions.create.bind(client.chat.completions);

    client.chat.completions.create = async function (...args) {
      const response = await originalCreate(...args);

      // Non-streaming response has usage directly
      if (response && response.usage) {
        const params = args[0] || {};
        reporter.reportFromUsage(response.usage, {
          provider: 'openai',
          model: params.model || response.model,
          endpoint: '/v1/chat/completions',
          request_id: response.id,
        });
      }

      return response;
    };
  }

  // Wrap completions (legacy)
  if (client.completions) {
    const originalCreate = client.completions.create.bind(client.completions);

    client.completions.create = async function (...args) {
      const response = await originalCreate(...args);

      if (response && response.usage) {
        const params = args[0] || {};
        reporter.reportFromUsage(response.usage, {
          provider: 'openai',
          model: params.model || response.model,
          endpoint: '/v1/completions',
          request_id: response.id,
        });
      }

      return response;
    };
  }

  // Wrap embeddings
  if (client.embeddings) {
    const originalCreate = client.embeddings.create.bind(client.embeddings);

    client.embeddings.create = async function (...args) {
      const response = await originalCreate(...args);

      if (response && response.usage) {
        const params = args[0] || {};
        reporter.reportFromUsage(response.usage, {
          provider: 'openai',
          model: params.model || 'text-embedding-3-small',
          endpoint: '/v1/embeddings',
          request_id: response.id,
        });
      }

      return response;
    };
  }

  // Wrap images.generate (no token usage, but track requests)
  if (client.images) {
    const originalGenerate = client.images.generate.bind(client.images);

    client.images.generate = async function (...args) {
      const response = await originalGenerate(...args);

      const params = args[0] || {};
      reporter.report({
        provider: 'openai',
        model: params.model || 'dall-e-3',
        prompt_tokens: 0,
        completion_tokens: 0,
        endpoint: '/v1/images/generations',
        metadata: { type: 'image', size: params.size, n: params.n || 1 },
      });

      return response;
    };
  }

  return client;
}

/**
 * 从 OpenAI API 响应中手动提取并上报
 * 适用于不使用官方 SDK 的场景（如直接 fetch 调用）
 */
function reportOpenAIResponse(response, options = {}) {
  const reporter = options.reporter || getDefaultReporter();

  if (response.usage) {
    return reporter.reportFromUsage(response.usage, {
      provider: 'openai',
      model: options.model || response.model,
      endpoint: options.endpoint || '/v1/chat/completions',
      request_id: response.id,
    });
  }
  return null;
}

module.exports = { wrapOpenAI, reportOpenAIResponse };
