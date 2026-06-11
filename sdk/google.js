/**
 * Tokens Monitor SDK - Google Gemini Wrapper
 * 
 * 包装 Google Generative AI SDK，在每次 API 调用后自动上报 token 用量。
 * 
 * 使用方式：
 *   const { GoogleGenerativeAI } = require('@google/generative-ai');
 *   const { wrapGoogle } = require('./sdk/google');
 *   
 *   const genAI = new GoogleGenerativeAI('AIza-xxx');
 *   const wrappedGenAI = wrapGoogle(genAI);
 *   
 *   const model = wrappedGenAI.getGenerativeModel({ model: 'gemini-2.5-pro' });
 *   const result = await model.generateContent('Hello');
 */

const { getDefaultReporter } = require('./reporter');

/**
 * 包装 Google Generative AI 实例
 * @param {object} genAI - GoogleGenerativeAI 实例
 * @param {object} [options] - 配置选项
 * @returns {object} - 包装后的实例
 */
function wrapGoogle(genAI, options = {}) {
  const reporter = options.reporter || getDefaultReporter();
  const originalGetModel = genAI.getGenerativeModel.bind(genAI);

  genAI.getGenerativeModel = function (modelConfig, ...rest) {
    const model = originalGetModel(modelConfig, ...rest);
    const modelName = modelConfig?.model || 'unknown';

    // Wrap generateContent
    if (model.generateContent) {
      const originalGen = model.generateContent.bind(model);
      model.generateContent = async function (...args) {
        const response = await originalGen(...args);

        if (response && response.usageMetadata) {
          reporter.report({
            provider: 'google',
            model: modelName,
            prompt_tokens: response.usageMetadata.promptTokenCount || 0,
            completion_tokens: response.usageMetadata.candidatesTokenCount || 0,
            endpoint: 'generateContent',
            metadata: { total_tokens: response.usageMetadata.totalTokenCount },
          });
        }

        return response;
      };
    }

    // Wrap generateContentStream
    if (model.generateContentStream) {
      const originalStream = model.generateContentStream.bind(model);
      model.generateContentStream = async function (...args) {
        const response = await originalStream(...args);

        // Stream usage is tracked when stream is consumed
        // We try to report from the aggregated response
        if (response && response.response) {
          const aggregated = await response.response;
          if (aggregated && aggregated.usageMetadata) {
            reporter.report({
              provider: 'google',
              model: modelName,
              prompt_tokens: aggregated.usageMetadata.promptTokenCount || 0,
              completion_tokens: aggregated.usageMetadata.candidatesTokenCount || 0,
              endpoint: 'generateContentStream',
              metadata: { streaming: true },
            });
          }
        }

        return response;
      };
    }

    // Wrap countTokens
    if (model.countTokens) {
      const originalCount = model.countTokens.bind(model);
      model.countTokens = async function (...args) {
        const result = await originalCount(...args);
        // Just return, no need to report count-only calls
        return result;
      };
    }

    return model;
  };

  return genAI;
}

/**
 * 从 Google API 响应中手动提取并上报
 */
function reportGoogleResponse(response, options = {}) {
  const reporter = options.reporter || getDefaultReporter();

  if (response && response.usageMetadata) {
    return reporter.report({
      provider: 'google',
      model: options.model || 'unknown',
      prompt_tokens: response.usageMetadata.promptTokenCount || 0,
      completion_tokens: response.usageMetadata.candidatesTokenCount || 0,
      endpoint: options.endpoint || 'generateContent',
    });
  }
  return null;
}

module.exports = { wrapGoogle, reportGoogleResponse };
