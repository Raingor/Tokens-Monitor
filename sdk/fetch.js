/**
 * Tokens Monitor SDK - Generic Fetch Wrapper
 * 
 * 适用于直接使用 fetch/axios/http 调用 LLM API 的场景。
 * 包装你的 HTTP 请求函数，自动解析响应中的 token 用量并上报。
 * 
 * 使用方式 1 - 包装整个 fetch 函数：
 *   const { wrapFetch } = require('./sdk/fetch');
 *   const trackedFetch = wrapFetch(fetch);
 *   const resp = await trackedFetch('https://api.openai.com/v1/chat/completions', { ... });
 * 
 * 使用方式 2 - 手动上报响应：
 *   const { reportResponse } = require('./sdk/fetch');
 *   reportResponse(responseJson, { provider: 'openai', model: 'gpt-4o' });
 */

const { getDefaultReporter } = require('./reporter');

/**
 * 自动检测 Provider（根据 URL）
 */
function detectProvider(url) {
  const u = typeof url === 'string' ? url : url.toString();
  if (u.includes('openai.com') || u.includes('openai')) return 'openai';
  if (u.includes('anthropic.com') || u.includes('anthropic')) return 'anthropic';
  if (u.includes('generativelanguage.googleapis.com') || u.includes('google')) return 'google';
  if (u.includes('mistral.ai') || u.includes('mistral')) return 'mistral';
  if (u.includes('api.deepseek.com') || u.includes('deepseek')) return 'deepseek';
  return 'custom';
}

/**
 * 从响应 JSON 中自动提取 usage 数据
 * 支持多种 API 响应格式
 */
function extractUsage(json) {
  if (!json) return null;

  // OpenAI / Deepseek / Mistral format
  if (json.usage && (json.usage.prompt_tokens !== undefined || json.usage.completion_tokens !== undefined)) {
    return {
      prompt_tokens: json.usage.prompt_tokens || 0,
      completion_tokens: json.usage.completion_tokens || 0,
    };
  }

  // Anthropic format
  if (json.usage && (json.usage.input_tokens !== undefined || json.usage.output_tokens !== undefined)) {
    return {
      prompt_tokens: json.usage.input_tokens || 0,
      completion_tokens: json.usage.output_tokens || 0,
    };
  }

  // Google format
  if (json.usageMetadata) {
    return {
      prompt_tokens: json.usageMetadata.promptTokenCount || 0,
      completion_tokens: json.usageMetadata.candidatesTokenCount || 0,
    };
  }

  // Token usage at top level (some APIs)
  if (json.prompt_tokens !== undefined || json.input_tokens !== undefined) {
    return {
      prompt_tokens: json.prompt_tokens || json.input_tokens || 0,
      completion_tokens: json.completion_tokens || json.output_tokens || 0,
    };
  }

  return null;
}

/**
 * 包装 fetch 函数，自动追踪 LLM API 调用
 * @param {Function} fetchFn - 原始 fetch 函数
 * @param {object} [options] - 配置选项
 * @param {object} [options.reporter] - 自定义 Reporter
 * @param {string} [options.provider] - 强制指定 provider（否则自动检测）
 * @returns {Function} - 包装后的 fetch 函数
 */
function wrapFetch(fetchFn, options = {}) {
  const reporter = options.reporter || getDefaultReporter();

  return async function trackedFetch(url, fetchOptions = {}) {
    const response = await fetchFn(url, fetchOptions);

    // Try to extract usage from the response
    try {
      const cloned = response.clone();
      const json = await cloned.json();

      const usage = extractUsage(json);
      if (usage) {
        const provider = options.provider || detectProvider(url);
        const model = json.model || extractModelFromBody(fetchOptions.body) || 'unknown';
        const endpoint = typeof url === 'string' ? new URL(url).pathname : url.pathname || '';

        reporter.report({
          provider,
          model,
          prompt_tokens: usage.prompt_tokens,
          completion_tokens: usage.completion_tokens,
          endpoint,
          request_id: json.id || undefined,
        });
      }
    } catch (e) {
      // Response might not be JSON (e.g., streaming), silently ignore
    }

    return response;
  };
}

/**
 * 从请求 body 中提取 model 字段
 */
function extractModelFromBody(body) {
  try {
    if (typeof body === 'string') {
      const parsed = JSON.parse(body);
      return parsed.model || null;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * 手动上报 API 响应中的 token 用量
 * @param {object} responseJson - API 响应的 JSON 对象
 * @param {object} context - 上下文信息
 * @param {string} context.provider - Provider 名称
 * @param {string} context.model - 模型名称
 */
function reportResponse(responseJson, context = {}) {
  const reporter = context.reporter || getDefaultReporter();
  const usage = extractUsage(responseJson);

  if (usage) {
    return reporter.report({
      provider: context.provider || detectProvider(''),
      model: context.model || responseJson.model || 'unknown',
      prompt_tokens: usage.prompt_tokens,
      completion_tokens: usage.completion_tokens,
      endpoint: context.endpoint || '',
      request_id: responseJson.id || undefined,
    });
  }
  return null;
}

/**
 * 创建 axios 拦截器（适用于 axios 用户）
 * @param {object} axiosInstance - axios 实例
 * @param {object} [options] - 配置选项
 */
function wrapAxios(axiosInstance, options = {}) {
  const reporter = options.reporter || getDefaultReporter();

  axiosInstance.interceptors.response.use((response) => {
    try {
      const json = response.data;
      const usage = extractUsage(json);

      if (usage) {
        const url = response.config?.url || '';
        const provider = options.provider || detectProvider(url);
        const bodyData = typeof response.config?.data === 'string'
          ? JSON.parse(response.config.data) : response.config?.data || {};

        reporter.report({
          provider,
          model: bodyData.model || json.model || 'unknown',
          prompt_tokens: usage.prompt_tokens,
          completion_tokens: usage.completion_tokens,
          endpoint: url,
          request_id: json.id || undefined,
        });
      }
    } catch (e) {
      // Silently ignore
    }
    return response;
  });

  return axiosInstance;
}

module.exports = { wrapFetch, reportResponse, wrapAxios, extractUsage, detectProvider };
