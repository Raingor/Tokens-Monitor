/**
 * Tokens Monitor SDK - Reporter
 * 
 * 核心上报模块，负责将 token 用量数据发送到 Tokens Monitor 面板。
 * 支持同步/异步上报，失败时静默处理不影响主业务。
 */

const http = require('http');
const https = require('https');

class TokenReporter {
  /**
   * @param {object} options
   * @param {string} [options.endpoint='http://localhost:3847/api/report'] - 监控面板上报地址
   * @param {boolean} [options.silent=true] - 上报失败时是否抛出错误
   * @param {boolean} [options.async=true] - 是否异步上报（不阻塞主流程）
   * @param {string} [options.appName] - 应用名称标识（可选）
   */
  constructor(options = {}) {
    this.endpoint = options.endpoint || process.env.TOKENS_MONITOR_URL || 'http://localhost:3847/api/report';
    this.silent = options.silent !== false;
    this.async = options.async !== false;
    this.appName = options.appName || process.env.APP_NAME || '';
    this._queue = [];
    this._flushing = false;
  }

  /**
   * 上报 token 用量
   * @param {object} data
   * @param {string} data.provider - 服务商 (openai/anthropic/google/自定义)
   * @param {string} data.model - 模型名称
   * @param {number} [data.prompt_tokens=0] - 输入 token 数
   * @param {number} [data.completion_tokens=0] - 输出 token 数
   * @param {string} [data.endpoint] - 调用的 API 端点
   * @param {string} [data.timestamp] - ISO 时间戳
   * @param {object} [data.metadata] - 额外元数据
   */
  report(data) {
    const payload = {
      provider: data.provider || 'unknown',
      model: data.model || 'unknown',
      prompt_tokens: data.prompt_tokens || data.input_tokens || 0,
      completion_tokens: data.completion_tokens || data.output_tokens || 0,
      endpoint: data.endpoint || '',
      timestamp: data.timestamp || new Date().toISOString(),
      request_id: data.request_id || undefined,
    };

    if (this.appName) {
      payload.raw_data = { app: this.appName, ...data.metadata };
    } else if (data.metadata) {
      payload.raw_data = data.metadata;
    }

    if (this.async) {
      this._queue.push(payload);
      this._scheduleFlush();
    } else {
      this._send(payload);
    }

    return payload;
  }

  /**
   * 从 API 响应的 usage 对象中提取并上报
   * 自动适配不同 Provider 的 usage 格式
   */
  reportFromUsage(usage, context = {}) {
    if (!usage) return null;

    // OpenAI format: { prompt_tokens, completion_tokens, total_tokens }
    // Anthropic format: { input_tokens, output_tokens }
    // Google format: { promptTokenCount, candidatesTokenCount }

    const promptTokens = usage.prompt_tokens
      || usage.input_tokens
      || usage.promptTokenCount
      || 0;

    const completionTokens = usage.completion_tokens
      || usage.output_tokens
      || usage.candidatesTokenCount
      || 0;

    return this.report({
      provider: context.provider || 'unknown',
      model: context.model || usage.model || 'unknown',
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      endpoint: context.endpoint || '',
      request_id: context.request_id || usage.id || undefined,
      metadata: context.metadata,
    });
  }

  _scheduleFlush() {
    if (this._flushTimer) return;
    this._flushTimer = setTimeout(() => {
      this._flush();
      this._flushTimer = null;
    }, 100); // Batch within 100ms window
  }

  async _flush() {
    if (this._flushing || this._queue.length === 0) return;
    this._flushing = true;

    const batch = this._queue.splice(0);
    for (const payload of batch) {
      await this._send(payload);
    }

    this._flushing = false;
  }

  _send(payload) {
    return new Promise((resolve) => {
      try {
        const url = new URL(this.endpoint);
        const isHttps = url.protocol === 'https:';
        const transport = isHttps ? https : http;

        const body = JSON.stringify(payload);
        const options = {
          hostname: url.hostname,
          port: url.port || (isHttps ? 443 : 80),
          path: url.pathname,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(body),
          },
          timeout: 3000,
        };

        const req = transport.request(options, (res) => {
          res.resume(); // Drain response
          resolve(true);
        });

        req.on('error', (err) => {
          if (!this.silent) {
            console.error('[TokensMonitor] Report failed:', err.message);
          }
          resolve(false);
        });

        req.on('timeout', () => {
          req.destroy();
          resolve(false);
        });

        req.write(body);
        req.end();
      } catch (err) {
        if (!this.silent) {
          console.error('[TokensMonitor] Send error:', err.message);
        }
        resolve(false);
      }
    });
  }

  /**
   * 立即刷新队列中的所有待上报数据
   */
  async flush() {
    await this._flush();
  }

  /**
   * 获取队列中待上报的数量
   */
  get pendingCount() {
    return this._queue.length;
  }
}

// 全局单例
let defaultReporter = null;

function getDefaultReporter(options) {
  if (!defaultReporter) {
    defaultReporter = new TokenReporter(options);
  }
  return defaultReporter;
}

module.exports = { TokenReporter, getDefaultReporter };
