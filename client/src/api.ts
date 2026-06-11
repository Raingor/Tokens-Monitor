import type { StatsResponse, RequestsResponse, ProvidersResponse } from './types';

const BASE_URL = '/api';

async function fetchJson<T>(url: string): Promise<T> {
  const resp = await fetch(`${BASE_URL}${url}`);
  if (!resp.ok) {
    throw new Error(`API error: ${resp.status} ${resp.statusText}`);
  }
  return resp.json();
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const resp = await fetch(`${BASE_URL}${url}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    throw new Error(`API error: ${resp.status} ${resp.statusText}`);
  }
  return resp.json();
}

export const api = {
  getStats: (hours = 24): Promise<StatsResponse> =>
    fetchJson(`/stats?hours=${hours}`),

  getRequests: (params: {
    limit?: number;
    offset?: number;
    provider?: string;
    model?: string;
    startDate?: string;
    endDate?: string;
  }): Promise<RequestsResponse> => {
    const searchParams = new URLSearchParams();
    if (params.limit) searchParams.set('limit', String(params.limit));
    if (params.offset) searchParams.set('offset', String(params.offset));
    if (params.provider) searchParams.set('provider', params.provider);
    if (params.model) searchParams.set('model', params.model);
    if (params.startDate) searchParams.set('startDate', params.startDate);
    if (params.endDate) searchParams.set('endDate', params.endDate);
    return fetchJson(`/requests?${searchParams}`);
  },

  getProviders: (): Promise<ProvidersResponse> =>
    fetchJson('/providers'),

  reportUsage: (data: {
    provider: string;
    model: string;
    prompt_tokens: number;
    completion_tokens: number;
    endpoint?: string;
    timestamp?: string;
  }) => postJson('/report', data),

  getHealth: () => fetchJson('/health'),
};
