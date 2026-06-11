export interface RequestRecord {
  id: number;
  timestamp: string;
  provider: string;
  model: string;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  estimated_cost: number;
  endpoint: string | null;
}

export interface TodayStats {
  total_tokens: number;
  total_cost: number;
  total_requests: number;
}

export interface ProviderDistribution {
  provider: string;
  tokens: number;
  cost: number;
  requests: number;
}

export interface ModelDistribution {
  model: string;
  provider: string;
  tokens: number;
  cost: number;
  requests: number;
}

export interface TokenTrend {
  hour: string;
  provider: string;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  request_count: number;
}

export interface StatsResponse {
  today: TodayStats;
  providerDistribution: ProviderDistribution[];
  modelDistribution: ModelDistribution[];
  tokenTrend: TokenTrend[];
}

export interface RequestsResponse {
  requests: RequestRecord[];
  total: number;
  limit: number;
  offset: number;
}

export interface ProvidersResponse {
  providers: string[];
  models: { model: string; provider: string }[];
}

export interface WSMessage {
  type: 'connected' | 'new_request';
  data: unknown;
}

export type TimeRange = '1h' | '6h' | '24h' | '7d' | '30d';
