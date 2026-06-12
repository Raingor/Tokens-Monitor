# Tokens Monitor

LLM API Token 用量实时监控面板，支持 OpenAI / Anthropic / Google 等主流模型服务商。

![Dashboard](https://img.shields.io/badge/status-active-brightgreen) ![License](https://img.shields.io/badge/license-ISC-blue)

## 功能特性

- **实时推送** — WebSocket 连接，新数据自动刷新面板，无需手动刷新
- **多 Provider** — 内置 OpenAI / Anthropic / Google 采集器，支持自定义扩展
- **自动解析** — 自动监控 Claude Code / OpenCode / Roo Code / Kilo Code 等工具的本地日志文件，零配置即可采集 Token 数据
- **费用估算** — 内置主流模型单价配置，自动计算每次请求和每日总费用
- **暗色主题** — 精心设计的 Dashboard UI，包含趋势图、饼图、柱状图和请求列表
- **灵活上报** — REST API + SDK 包装器双模式，任何工具/脚本都可以上报 token 用量
- **缓存统计** — 支持缓存写入（Cache Creation）和缓存读取（Cache Read）token 统计
- **多工具标识** — 每条记录标注来源工具（Claude Code / OpenCode / Roo Code / 自定义）
- **本地存储** — SQLite 数据库，零配置，数据完全留在本地

## 快速开始

### 安装

```bash
# 克隆仓库
git clone https://github.com/Raingor/Tokens-Monitor.git
cd Tokens-Monitor

# 安装所有依赖（后端 + 前端）
npm run install:all
```

### 启动

```bash
# 一键启动前后端
npm run dev

# 或分别启动
npm run server   # 后端 API 服务 (http://localhost:3847)
npm run client   # 前端开发面板 (http://localhost:5173)
```

启动后访问 **http://localhost:5173** 打开监控面板。

## 上报数据

### 通过 API 上报

任何工具或脚本都可以向 `/api/report` 发送 token 用量数据：

```bash
curl -X POST http://localhost:3847/api/report \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "openai",
    "model": "gpt-4o",
    "prompt_tokens": 1500,
    "completion_tokens": 800,
    "endpoint": "/v1/chat/completions"
  }'
```

**请求参数：**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `provider` | string | 是 | 服务商名称（deepseek / openai / anthropic / google / 自定义） |
| `model` | string | 是 | 模型名称 |
| `prompt_tokens` | number | 否 | 输入 token 数量 |
| `completion_tokens` | number | 否 | 输出 token 数量 |
| `cache_creation_tokens` | number | 否 | 缓存写入 token 数量 |
| `cache_read_tokens` | number | 否 | 缓存读取 token 数量 |
| `tool` | string | 否 | 来源工具名称（claude-code / opencode / roocode / 自定义） |
| `session_id` | string | 否 | 会话标识，用于关联同一对话的多条记录 |
| `endpoint` | string | 否 | 请求的 API 端点 |
| `timestamp` | string | 否 | ISO 时间戳，默认当前时间 |

### 自动日志解析（推荐）

系统会自动监控你本机安装的 AI 编程工具的日志文件，无需任何配置即可采集 Token 数据：

| 工具 | 数据源 | 采集方式 |
|------|--------|---------|
| **Claude Code** | `~/.claude/projects/` 下的 JSONL 文件 | `fs.watch` 实时监控 + 5s 轮询回退 |
| **OpenCode** | `~/.local/share/opencode/opencode.db` (SQLite) | 每 10 秒轮询增量更新 |
| **Roo Code** | VSCode/Cursor globalStorage 的 `tasks/_index.json` | 每 10 秒轮询增量更新 |
| **Kilo Code** | VSCode globalStorage 的 `tasks/_index.json` | 每 10 秒轮询增量更新 |

只需正常使用这些工具，系统会自动从日志中解析以下信息：
- 输入 Token（prompt_tokens）
- 输出 Token（completion_tokens）
- 缓存写入 Token（cache_creation_tokens）
- 缓存读取 Token（cache_read_tokens）
- 模型名称
- 请求耗时
- 关联会话 ID

解析器位于 `server/parsers/` 目录，支持轻松扩展更多工具。

### 自动轮询采集

在 `config.json` 中配置 Provider 的 API Key，可启用自动轮询采集：

```json
{
  "providers": {
    "openai": {
      "enabled": true,
      "apiKey": "sk-xxx",
      "baseUrl": "https://api.openai.com"
    }
  },
  "polling": {
    "interval": 30000,
    "enabled": true
  }
}
```

## API 接口

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/api/stats` | 获取汇总统计（今日概览、Provider 分布、模型分布、趋势） |
| `GET` | `/api/requests` | 获取请求列表（支持分页、筛选、工具过滤） |
| `GET` | `/api/providers` | 获取已记录的 Provider 和模型列表 |
| `GET` | `/api/tools` | 获取已检测到的工具列表 |
| `POST` | `/api/report` | 上报 token 用量数据 |
| `GET` | `/api/config` | 获取当前配置 |
| `POST` | `/api/config` | 更新配置 |
| `GET` | `/api/collector/status` | 获取采集器状态 |
| `GET` | `/api/health` | 健康检查 |

**请求列表示例：**

```
GET /api/requests?limit=20&offset=0&provider=openai&model=gpt-4o&tool=claude-code
GET /api/tools
```

## 配置

项目根目录的 `config.json` 包含所有可配置项：

```json
{
  "server": {
    "port": 3847,
    "host": "0.0.0.0"
  },
  "polling": {
    "interval": 30000,
    "enabled": true
  },
  "providers": {
    "openai": { "enabled": false, "apiKey": "", "baseUrl": "https://api.openai.com" },
    "anthropic": { "enabled": false, "apiKey": "", "baseUrl": "https://api.anthropic.com" }
  },
  "pricing": {
    "openai": {
      "gpt-4o": { "input": 2.50, "output": 10.00 },
      "gpt-4o-mini": { "input": 0.15, "output": 0.60 }
    },
    "anthropic": {
      "claude-sonnet-4-20250514": { "input": 3.00, "output": 15.00 }
    },
    "google": {
      "gemini-2.5-pro": { "input": 1.25, "output": 10.00 }
    }
  }
}
```

- **pricing** 中的价格单位为 **美元 / 百万 Token**
- 未配置的模型会使用对应 Provider 下的 `default` 价格
- 未配置的 Provider 会使用顶层 `default` 价格

## 项目结构

```
Tokens-Monitor/
├── server/
│   ├── index.js              # Express + WebSocket 主服务
│   ├── db.js                 # SQLite 数据层（含自动迁移）
│   ├── config.js             # 配置管理
│   ├── collector-manager.js  # 采集器管理器
│   ├── log-watcher.js        # 日志解析器协调管理器
│   ├── collectors/
│   │   ├── openai.js         # OpenAI 用量采集
│   │   ├── anthropic.js      # Anthropic 用量采集
│   │   └── generic.js        # 通用上报采集
│   └── parsers/              # 工具日志解析器（自动采集）
│       ├── claude-code.js    # Claude Code JSONL 解析器
│       ├── opencode.js       # OpenCode SQLite 解析器
│       └── roocode.js        # Roo Code / Kilo Code 解析器
├── client/
│   └── src/
│       ├── App.tsx           # 主面板组件
│       ├── api.ts            # API 客户端
│       ├── useWebSocket.ts   # WebSocket Hook
│       ├── types.ts          # TypeScript 类型
│       └── index.css         # 全局样式
├── sdk/                      # SDK 包装器（自动上报）
│   ├── index.js              # SDK 入口
│   ├── reporter.js           # 核心上报模块
│   ├── openai.js             # OpenAI SDK 包装
│   ├── anthropic.js          # Anthropic SDK 包装
│   ├── google.js             # Google Gemini SDK 包装
│   ├── fetch.js              # 通用 fetch/axios 包装
│   └── examples.js           # 使用示例
├── config.json               # 配置文件
└── package.json
```

## 技术栈

- **后端：** Node.js + Express + ws (WebSocket) + better-sqlite3
- **前端：** React + TypeScript + Vite + Recharts + Lucide Icons
- **存储：** SQLite (WAL 模式)
- **实时通信：** WebSocket (自动重连)

## 截图

启动后点击侧边栏的「模拟上报」按钮可快速生成测试数据，面板将展示：

- 今日概览卡片（请求数 / Token 总量 / 费用 / 最常用模型）
- Token 用量趋势图（输入/输出分时折线）
- Provider 分布饼图
- 模型使用排行柱状图
- 请求记录列表（支持分页、Provider 筛选）

## SDK 集成指南

SDK 位于 `sdk/` 目录，提供 4 种集成方式，让你的 LLM 调用自动上报 token 用量。

### 方式 1：OpenAI SDK 包装（最简集成）

```js
const OpenAI = require('openai');
const { wrapOpenAI } = require('./sdk');

// 只需包装一行，之后所有调用自动上报
const client = wrapOpenAI(new OpenAI({ apiKey: 'sk-xxx' }));

const response = await client.chat.completions.create({
  model: 'gpt-4o',
  messages: [{ role: 'user', content: 'Hello' }],
});
// token 用量已自动上报到监控面板！
```

### 方式 2：Anthropic SDK 包装

```js
const Anthropic = require('@anthropic-ai/sdk');
const { wrapAnthropic } = require('./sdk');

const client = wrapAnthropic(new Anthropic({ apiKey: 'sk-ant-xxx' }));

const message = await client.messages.create({
  model: 'claude-sonnet-4-20250514',
  max_tokens: 1024,
  messages: [{ role: 'user', content: 'Hello' }],
});
```

### 方式 3：Google Gemini SDK 包装

```js
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { wrapGoogle } = require('./sdk');

const genAI = wrapGoogle(new GoogleGenerativeAI('AIza-xxx'));
const model = genAI.getGenerativeModel({ model: 'gemini-2.5-pro' });

const result = await model.generateContent('Hello');
```

### 方式 4：通用 fetch / axios 包装

适用于不使用官方 SDK、直接 HTTP 调用的项目：

```js
const { wrapFetch } = require('./sdk');
const trackedFetch = wrapFetch(fetch);

const resp = await trackedFetch('https://api.openai.com/v1/chat/completions', {
  method: 'POST',
  headers: { 'Authorization': 'Bearer sk-xxx', 'Content-Type': 'application/json' },
  body: JSON.stringify({ model: 'gpt-4o', messages: [...] }),
});
// 自动从响应中解析 usage 并上报
```

也支持 axios：

```js
const axios = require('axios');
const { wrapAxios } = require('./sdk');
const client = wrapAxios(axios.create());
```

### 自定义 Reporter

```js
const { TokenReporter, wrapOpenAI } = require('./sdk');

const reporter = new TokenReporter({
  endpoint: 'http://your-server:3847/api/report',
  appName: 'my-app',
  silent: true,   // 上报失败不影响主业务
  async: true,    // 异步上报不阻塞
});

const client = wrapOpenAI(new OpenAI(), { reporter });
```

### 环境变量

- `TOKENS_MONITOR_URL` — 上报地址（默认 `http://localhost:3847/api/report`）
- `APP_NAME` — 应用名称标识

运行完整示例：`node sdk/examples.js`

## License

ISC
