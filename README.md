# Tokens Monitor

LLM API Token 用量实时监控面板，支持 OpenAI / Anthropic / Google 等主流模型服务商。

![Dashboard](https://img.shields.io/badge/status-active-brightgreen) ![License](https://img.shields.io/badge/license-ISC-blue)

## 功能特性

- **实时推送** — WebSocket 连接，新数据自动刷新面板，无需手动刷新
- **多 Provider** — 内置 OpenAI / Anthropic / Google 采集器，支持自定义扩展
- **费用估算** — 内置主流模型单价配置，自动计算每次请求和每日总费用
- **暗色主题** — 精心设计的 Dashboard UI，包含趋势图、饼图、柱状图和请求列表
- **灵活上报** — REST API 接口，任何工具/脚本都可以通过 POST 请求上报 token 用量
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
| `provider` | string | 是 | 服务商名称（openai / anthropic / google / 自定义） |
| `model` | string | 是 | 模型名称 |
| `prompt_tokens` | number | 否 | 输入 token 数量 |
| `completion_tokens` | number | 否 | 输出 token 数量 |
| `endpoint` | string | 否 | 请求的 API 端点 |
| `timestamp` | string | 否 | ISO 时间戳，默认当前时间 |

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
| `GET` | `/api/requests` | 获取请求列表（支持分页和筛选） |
| `GET` | `/api/providers` | 获取已记录的 Provider 和模型列表 |
| `POST` | `/api/report` | 上报 token 用量数据 |
| `GET` | `/api/config` | 获取当前配置 |
| `POST` | `/api/config` | 更新配置 |
| `GET` | `/api/collector/status` | 获取采集器状态 |
| `GET` | `/api/health` | 健康检查 |

**请求列表示例：**

```
GET /api/requests?limit=20&offset=0&provider=openai&model=gpt-4o
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
│   ├── db.js                 # SQLite 数据层
│   ├── config.js             # 配置管理
│   ├── collector-manager.js  # 采集器管理器
│   └── collectors/
│       ├── openai.js         # OpenAI 用量采集
│       ├── anthropic.js      # Anthropic 用量采集
│       └── generic.js        # 通用上报采集
├── client/
│   └── src/
│       ├── App.tsx           # 主面板组件
│       ├── api.ts            # API 客户端
│       ├── useWebSocket.ts   # WebSocket Hook
│       ├── types.ts          # TypeScript 类型
│       └── index.css         # 全局样式
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

## License

ISC
