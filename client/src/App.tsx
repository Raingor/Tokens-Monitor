import { useState, useEffect, useCallback } from 'react';
import {
  Activity, Zap, DollarSign, BarChart3, TrendingUp,
  RefreshCw, Send,
} from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, BarChart, Bar,
  AreaChart, Area, Legend,
} from 'recharts';
import { api } from './api';
import { useWebSocket } from './useWebSocket';
import type {
  StatsResponse, RequestRecord, WSMessage, ProvidersResponse,
} from './types';
import './index.css';

const PROVIDER_COLORS: Record<string, string> = {
  openai: '#10b981',
  anthropic: '#8b5cf6',
  google: '#3b82f6',
  deepseek: '#f59e0b',
  meta: '#f59e0b',
  mistral: '#ef4444',
  openrouter: '#ec4899',
  qwen: '#06b6d4',
  default: '#06b6d4',
};

const TOOL_LABELS: Record<string, string> = {
  'claude-code': 'Claude Code',
  'opencode': 'OpenCode',
  'roocode': 'Roo Code',
  'kilocode': 'Kilo Code',
  'cline': 'Cline',
};

const TOOL_COLORS: Record<string, string> = {
  'claude-code': '#d97706',
  'opencode': '#059669',
  'roocode': '#7c3aed',
  'kilocode': '#dc2626',
  'cline': '#2563eb',
};

function getProviderColor(provider: string): string {
  return PROVIDER_COLORS[provider.toLowerCase()] || PROVIDER_COLORS.default;
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function formatCost(n: number): string {
  if (n < 0.01) return `$${n.toFixed(4)}`;
  return `$${n.toFixed(2)}`;
}

function formatTime(ts: string): string {
  const d = new Date(ts);
  return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
}

function formatDateTime(ts: string): string {
  const d = new Date(ts);
  return d.toLocaleString('zh-CN', {
    month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
}

export default function App() {
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [requests, setRequests] = useState<RequestRecord[]>([]);
  const [requestsTotal, setRequestsTotal] = useState(0);
  const [providers, setProviders] = useState<ProvidersResponse | null>(null);
  const [selectedProvider, setSelectedProvider] = useState<string>('all');
  const [page, setPage] = useState(0);
  const [refreshKey, setRefreshKey] = useState(0);
  const pageSize = 20;

  const { connected } = useWebSocket({
    onMessage: useCallback((msg: WSMessage) => {
      if (msg.type === 'new_request') {
        setRefreshKey(k => k + 1);
      }
    }, []),
  });

  // Fetch data
  useEffect(() => {
    api.getStats(24).then(setStats).catch(console.error);
    api.getProviders().then(setProviders).catch(console.error);
  }, [refreshKey]);

  // Fetch requests
  useEffect(() => {
    const params: Record<string, unknown> = {
      limit: pageSize,
      offset: page * pageSize,
    };
    if (selectedProvider !== 'all') params.provider = selectedProvider;

    api.getRequests(params as { limit: number; offset: number; provider?: string })
      .then((res) => {
        setRequests(res.requests);
        setRequestsTotal(res.total);
      })
      .catch(console.error);
  }, [refreshKey, selectedProvider, page]);

  // Auto refresh every 30s
  useEffect(() => {
    const interval = setInterval(() => setRefreshKey(k => k + 1), 30000);
    return () => clearInterval(interval);
  }, []);

  const todayStats = stats?.today || { total_tokens: 0, total_cost: 0, total_requests: 0 };
  const topModel = stats?.modelDistribution?.[0]?.model || '-';

  // Prepare chart data
  const trendData = (stats?.tokenTrend || []).map(t => ({
    time: t.hour.split(' ')[1] || t.hour,
    tokens: t.total_tokens,
    prompt: t.prompt_tokens,
    completion: t.completion_tokens,
    provider: t.provider,
  }));

  const pieData = (stats?.providerDistribution || []).map(p => ({
    name: p.provider,
    value: p.tokens,
    color: getProviderColor(p.provider),
  }));

  const barData = (stats?.modelDistribution || []).slice(0, 8).map(m => ({
    name: m.model.length > 20 ? m.model.slice(0, 18) + '...' : m.model,
    tokens: m.tokens,
    cost: m.cost,
    color: getProviderColor(m.provider),
  }));

  const handleManualReport = async () => {
    const data = {
      provider: 'openai',
      model: 'gpt-4o',
      prompt_tokens: Math.floor(Math.random() * 2000) + 100,
      completion_tokens: Math.floor(Math.random() * 1000) + 50,
    };
    await api.reportUsage(data);
  };

  return (
    <div className="app">
      {/* Sidebar */}
      <aside className="sidebar">
        <div className="sidebar-logo">
          <div className="logo-icon"><Zap size={16} /></div>
          <h1>Tokens Monitor</h1>
        </div>

        <div className="sidebar-section">
          <div className="sidebar-section-title">Provider</div>
          <div
            className={`sidebar-item ${selectedProvider === 'all' ? 'active' : ''}`}
            onClick={() => { setSelectedProvider('all'); setPage(0); }}
          >
            <div className="dot" style={{ background: '#94a3b8' }} />
            全部
          </div>
          {(providers?.providers || []).map(p => (
            <div
              key={p}
              className={`sidebar-item ${selectedProvider === p ? 'active' : ''}`}
              onClick={() => { setSelectedProvider(p); setPage(0); }}
            >
              <div className="dot" style={{ background: getProviderColor(p) }} />
              {p}
            </div>
          ))}
          {(providers?.providers || []).length === 0 && (
            <div className="sidebar-item" style={{ color: 'var(--text-muted)', cursor: 'default' }}>
              暂无数据
            </div>
          )}
        </div>

        <div className="sidebar-section" style={{ marginTop: 'auto' }}>
          <div className="sidebar-section-title">快速操作</div>
          <div className="sidebar-item" onClick={handleManualReport}>
            <Send size={14} />
            模拟上报
          </div>
          <div className="sidebar-item" onClick={() => setRefreshKey(k => k + 1)}>
            <RefreshCw size={14} />
            刷新数据
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="main-content">
        {/* Header */}
        <header className="header">
          <div className="header-left">
            <h2 className="header-title">Token 用量监控</h2>
            <div className={`connection-badge ${connected ? 'connected' : 'disconnected'}`}>
              <div className="pulse" />
              {connected ? '实时连接' : '已断开'}
            </div>
          </div>
          <div className="header-actions">
            <button className="header-btn" onClick={handleManualReport}>
              <Send size={12} /> 模拟上报
            </button>
            <button className="header-btn" onClick={() => setRefreshKey(k => k + 1)}>
              <RefreshCw size={12} /> 刷新
            </button>
          </div>
        </header>

        {/* Dashboard */}
        <div className="dashboard">
          {/* Stats Cards */}
          <div className="stats-row">
            <div className="stat-card">
              <div className="stat-card-header">
                <span className="stat-card-label">今日请求</span>
                <div className="stat-card-icon" style={{ background: 'rgba(59,130,246,0.15)', color: 'var(--accent-blue)' }}>
                  <Activity size={16} />
                </div>
              </div>
              <div className="stat-card-value">{formatNumber(todayStats.total_requests)}</div>
              <div className="stat-card-sub">API 调用次数</div>
            </div>

            <div className="stat-card">
              <div className="stat-card-header">
                <span className="stat-card-label">今日 Token</span>
                <div className="stat-card-icon" style={{ background: 'rgba(139,92,246,0.15)', color: 'var(--accent-purple)' }}>
                  <Zap size={16} />
                </div>
              </div>
              <div className="stat-card-value">{formatNumber(todayStats.total_tokens)}</div>
              <div className="stat-card-sub">输入 + 输出</div>
            </div>

            <div className="stat-card">
              <div className="stat-card-header">
                <span className="stat-card-label">预估费用</span>
                <div className="stat-card-icon" style={{ background: 'rgba(16,185,129,0.15)', color: 'var(--accent-green)' }}>
                  <DollarSign size={16} />
                </div>
              </div>
              <div className="stat-card-value">{formatCost(todayStats.total_cost)}</div>
              <div className="stat-card-sub">基于模型单价估算</div>
            </div>

            <div className="stat-card">
              <div className="stat-card-header">
                <span className="stat-card-label">最常用模型</span>
                <div className="stat-card-icon" style={{ background: 'rgba(245,158,11,0.15)', color: 'var(--accent-orange)' }}>
                  <BarChart3 size={16} />
                </div>
              </div>
              <div className="stat-card-value" style={{ fontSize: '18px' }}>{topModel}</div>
              <div className="stat-card-sub">按 token 用量排序</div>
            </div>
          </div>

          {/* Charts */}
          <div className="charts-grid">
            {/* Token Trend */}
            <div className="chart-card">
              <div className="chart-card-title">
                <TrendingUp size={16} />
                Token 用量趋势
                <span className="badge">24h</span>
              </div>
              <ResponsiveContainer width="100%" height={260}>
                <AreaChart data={trendData}>
                  <defs>
                    <linearGradient id="gradientPrompt" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="gradientCompletion" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(42,58,84,0.3)" />
                  <XAxis dataKey="time" stroke="#64748b" fontSize={11} />
                  <YAxis stroke="#64748b" fontSize={11} tickFormatter={formatNumber} />
                  <Tooltip
                    contentStyle={{
                      background: '#1a2234',
                      border: '1px solid #2a3a54',
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                    labelStyle={{ color: '#94a3b8' }}
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Area type="monotone" dataKey="prompt" name="输入" stroke="#3b82f6" fill="url(#gradientPrompt)" />
                  <Area type="monotone" dataKey="completion" name="输出" stroke="#8b5cf6" fill="url(#gradientCompletion)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            {/* Provider Distribution */}
            <div className="chart-card">
              <div className="chart-card-title">Provider 分布</div>
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={90}
                    paddingAngle={3}
                    dataKey="value"
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                    labelLine={{ stroke: '#64748b' }}
                  >
                    {pieData.map((entry, idx) => (
                      <Cell key={idx} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      background: '#1a2234',
                      border: '1px solid #2a3a54',
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                    formatter={(value: number) => formatNumber(value)}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Model Bar Chart */}
          <div className="chart-card" style={{ marginBottom: 24 }}>
            <div className="chart-card-title">
              <BarChart3 size={16} />
              模型使用排行
              <span className="badge">Top 8</span>
            </div>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={barData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(42,58,84,0.3)" />
                <XAxis type="number" stroke="#64748b" fontSize={11} tickFormatter={formatNumber} />
                <YAxis type="category" dataKey="name" stroke="#64748b" fontSize={11} width={160} />
                <Tooltip
                  contentStyle={{
                    background: '#1a2234',
                    border: '1px solid #2a3a54',
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                  formatter={(value: number) => formatNumber(value)}
                />
                <Bar dataKey="tokens" name="Tokens" radius={[0, 4, 4, 0]}>
                  {barData.map((entry, idx) => (
                    <Cell key={idx} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Requests Table */}
          <div className="requests-table">
            <div className="table-header">
              <div className="table-title">请求记录 ({requestsTotal})</div>
              <div className="table-filters">
                <select
                  className="table-filter"
                  value={selectedProvider}
                  onChange={(e) => { setSelectedProvider(e.target.value); setPage(0); }}
                >
                  <option value="all">全部 Provider</option>
                  {(providers?.providers || []).map(p => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="table-container">
              {requests.length > 0 ? (
                <table>
                  <thead>
                    <tr>
                      <th>时间</th>
                      <th>工具</th>
                      <th>Provider</th>
                      <th>模型</th>
                      <th>输入</th>
                      <th>输出</th>
                      <th>缓存读</th>
                      <th>缓存写</th>
                      <th>总计</th>
                      <th>费用</th>
                    </tr>
                  </thead>
                  <tbody>
                    {requests.map(req => (
                      <tr key={req.id}>
                        <td style={{ color: 'var(--text-muted)' }}>{formatDateTime(req.timestamp)}</td>
                        <td>
                          {req.tool ? (
                            <span style={{
                              fontSize: 11,
                              padding: '2px 6px',
                              borderRadius: 4,
                              background: `${TOOL_COLORS[req.tool] || '#64748b'}22`,
                              color: TOOL_COLORS[req.tool] || '#94a3b8',
                              fontWeight: 500,
                            }}>
                              {TOOL_LABELS[req.tool] || req.tool}
                            </span>
                          ) : <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>-</span>}
                        </td>
                        <td>
                          <span className={`provider-badge ${req.provider.toLowerCase()}`}>
                            <span className="dot" style={{ background: getProviderColor(req.provider), width: 6, height: 6, borderRadius: '50%' }} />
                            {req.provider}
                          </span>
                        </td>
                        <td><span className="model-name">{req.model}</span></td>
                        <td className="token-value">{formatNumber(req.prompt_tokens)}</td>
                        <td className="token-value">{formatNumber(req.completion_tokens)}</td>
                        <td className="token-value" style={{ color: '#06b6d4' }}>
                          {req.cache_read_tokens ? formatNumber(req.cache_read_tokens) : '-'}
                        </td>
                        <td className="token-value" style={{ color: '#f59e0b' }}>
                          {req.cache_creation_tokens ? formatNumber(req.cache_creation_tokens) : '-'}
                        </td>
                        <td className="token-value" style={{ fontWeight: 600 }}>{formatNumber(req.total_tokens)}</td>
                        <td className="cost-value">{formatCost(req.estimated_cost)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="empty-state">
                  <div className="empty-state-icon"><Zap size={48} /></div>
                  <div className="empty-state-title">暂无请求记录</div>
                  <div className="empty-state-desc">
                    通过 API 上报 token 用量数据，或配置 Provider API Key 自动轮询采集。
                    点击左侧「模拟上报」可快速添加测试数据。
                  </div>
                  <div className="empty-state-code">
                    {`curl -X POST http://localhost:3847/api/report \\
  -H "Content-Type: application/json" \\
  -d '{"provider":"openai","model":"gpt-4o",
       "prompt_tokens":1500,"completion_tokens":800}'`}
                  </div>
                </div>
              )}
            </div>

            {requestsTotal > pageSize && (
              <div className="table-footer">
                <span>显示 {page * pageSize + 1}-{Math.min((page + 1) * pageSize, requestsTotal)} / {requestsTotal}</span>
                <div className="pagination">
                  <button className="page-btn" disabled={page === 0} onClick={() => setPage(p => p - 1)}>
                    上一页
                  </button>
                  <button
                    className="page-btn"
                    disabled={(page + 1) * pageSize >= requestsTotal}
                    onClick={() => setPage(p => p + 1)}
                  >
                    下一页
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
