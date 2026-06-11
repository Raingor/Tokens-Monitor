/**
 * Tokens Monitor SDK - 使用示例
 * 
 * 运行前确保监控面板已启动：npm run dev
 * 
 * 运行示例：node sdk/examples.js
 */

const {
  TokenReporter,
  wrapOpenAI,
  wrapAnthropic,
  wrapFetch,
  reportResponse,
} = require('./index');

// ============================================================
// 示例 1：手动上报（无需真实 API Key）
// ============================================================
async function example1_manualReport() {
  console.log('\n--- 示例 1：手动上报 ---');

  const reporter = new TokenReporter({
    endpoint: 'http://localhost:3847/api/report',
    appName: 'my-demo-app',
  });

  // 模拟上报一次 OpenAI 调用
  reporter.report({
    provider: 'openai',
    model: 'gpt-4o',
    prompt_tokens: 1200,
    completion_tokens: 450,
    endpoint: '/v1/chat/completions',
  });

  // 模拟上报一次 Anthropic 调用
  reporter.report({
    provider: 'anthropic',
    model: 'claude-sonnet-4-20250514',
    prompt_tokens: 3000,
    completion_tokens: 1800,
    endpoint: '/v1/messages',
  });

  // 模拟上报一次 Google 调用
  reporter.report({
    provider: 'google',
    model: 'gemini-2.5-pro',
    prompt_tokens: 2500,
    completion_tokens: 1000,
  });

  await reporter.flush();
  console.log('手动上报完成！打开 http://localhost:5173 查看面板');
}

// ============================================================
// 示例 2：包装 OpenAI SDK
// ============================================================
async function example2_wrapOpenAI() {
  console.log('\n--- 示例 2：OpenAI SDK 包装 ---');
  console.log('（需要安装 openai 包：npm install openai）');

  /*
  const OpenAI = require('openai');
  
  // 创建客户端并用 wrapOpenAI 包装
  const client = wrapOpenAI(new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  }));

  // 正常使用，token 用量会自动上报到监控面板
  const response = await client.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: 'You are a helpful assistant.' },
      { role: 'user', content: 'What is the meaning of life?' },
    ],
  });

  console.log('回复:', response.choices[0].message.content);
  console.log('Token 用量已自动上报！');

  // Embeddings 也会自动追踪
  const embedding = await client.embeddings.create({
    model: 'text-embedding-3-small',
    input: 'Hello world',
  });
  */

  console.log('取消注释上面的代码并配置 API Key 即可测试');
}

// ============================================================
// 示例 3：包装 Anthropic SDK
// ============================================================
async function example3_wrapAnthropic() {
  console.log('\n--- 示例 3：Anthropic SDK 包装 ---');
  console.log('（需要安装：npm install @anthropic-ai/sdk）');

  /*
  const Anthropic = require('@anthropic-ai/sdk');
  
  const client = wrapAnthropic(new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
  }));

  // 普通调用
  const message = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1024,
    messages: [{ role: 'user', content: 'Hello Claude!' }],
  });

  console.log('回复:', message.content[0].text);

  // 流式调用也会自动追踪
  const stream = client.messages.stream({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1024,
    messages: [{ role: 'user', content: 'Tell me a story' }],
  });
  */

  console.log('取消注释上面的代码并配置 API Key 即可测试');
}

// ============================================================
// 示例 4：包装原生 fetch
// ============================================================
async function example4_wrapFetch() {
  console.log('\n--- 示例 4：原生 fetch 包装 ---');
  console.log('（需要有效的 API Key）');

  /*
  const trackedFetch = wrapFetch(fetch);

  const response = await trackedFetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: 'Hi' }],
    }),
  });

  const data = await response.json();
  console.log('回复:', data.choices[0].message.content);
  // token 用量已自动从响应中提取并上报！
  */

  console.log('取消注释上面的代码并配置 API Key 即可测试');
}

// ============================================================
// 示例 5：手动解析响应并上报
// ============================================================
async function example5_reportResponse() {
  console.log('\n--- 示例 5：手动解析响应上报 ---');

  // 模拟一个 API 响应 JSON
  const fakeApiResponse = {
    id: 'chatcmpl-abc123',
    model: 'gpt-4o',
    choices: [{ message: { content: 'Hello!' } }],
    usage: {
      prompt_tokens: 800,
      completion_tokens: 200,
      total_tokens: 1000,
    },
  };

  // 一行代码提取 usage 并上报
  reportResponse(fakeApiResponse, {
    provider: 'openai',
    model: 'gpt-4o',
    endpoint: '/v1/chat/completions',
  });

  console.log('响应已解析并上报！');

  // 等待异步上报完成
  const { getDefaultReporter } = require('./reporter');
  await getDefaultReporter().flush();
}

// ============================================================
// 示例 6：自定义 Reporter 配置
// ============================================================
async function example6_customReporter() {
  console.log('\n--- 示例 6：自定义 Reporter ---');

  const reporter = new TokenReporter({
    endpoint: 'http://localhost:3847/api/report',  // 监控面板地址
    appName: 'my-production-app',                   // 应用标识
    silent: true,                                    // 上报失败不报错
    async: true,                                     // 异步上报不阻塞
  });

  // 使用自定义 reporter 包装
  // const OpenAI = require('openai');
  // const client = wrapOpenAI(new OpenAI(), { reporter });

  // 或直接用自定义 reporter 上报
  reporter.report({
    provider: 'openai',
    model: 'gpt-4o-mini',
    prompt_tokens: 500,
    completion_tokens: 300,
    metadata: { conversation_id: 'conv-001', user_id: 'user-42' },
  });

  await reporter.flush();
  console.log('自定义上报完成！');
}

// ============================================================
// 运行示例
// ============================================================
async function main() {
  console.log('=== Tokens Monitor SDK 使用示例 ===');
  console.log('确保监控面板已启动：npm run server');

  // 运行不需要 API Key 的示例
  await example1_manualReport();
  await example5_reportResponse();
  await example6_customReporter();

  // 以下示例需要 API Key，只打印说明
  await example2_wrapOpenAI();
  await example3_wrapAnthropic();
  await example4_wrapFetch();

  console.log('\n=== 所有示例执行完毕 ===');
  console.log('打开 http://localhost:5173 查看监控面板');
}

main().catch(console.error);
