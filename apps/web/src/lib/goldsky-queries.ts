import useSWR from 'swr';

export type GoldskyActivityItem = {
  activity_id: string;
  contract_id: string;
  contract_role: string;
  kind: string;
  title: string;
  summary: string;
  proposal_id: string | null;
  proposal_number: string | null;
  actor: string | null;
  addresses: string | string[] | null;
  ledger_sequence: number;
  timestamp: string | number | null;
  transaction_hash: string | null;
};

export type GoldskyActivityResponse = {
  items: GoldskyActivityItem[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
  generatedAt: string;
  message?: string;
};

export type GoldskyTokenItem = {
  address: string;
  owned_token_count: string;
  delegated_to: string | null;
  voting_power: string;
  last_activity_ledger: number;
};

export type GoldskyTokenResponse = {
  items: GoldskyTokenItem[];
  total: number;
  totalSupply: string;
  limit: number;
  offset: number;
  hasMore: boolean;
  generatedAt: string;
  message?: string;
};

export type GoldskyMemberItem = {
  address: string;
  owned_token_count: string;
  delegated_to: string | null;
  voting_power: string;
  last_activity_ledger: number;
};

export type GoldskyMemberResponse = {
  items: GoldskyMemberItem[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
  generatedAt: string;
  message?: string;
};

export type GoldskyAuthority = {
  authority: string;
  enabled: boolean;
  last_updated_ledger: number;
};

export type GoldskyAuthorityResponse = {
  items: GoldskyAuthority[];
  total: number;
  generatedAt: string;
  message?: string;
};

export type GoldskyHealthResponse = {
  status: 'healthy' | 'unhealthy';
  latestLedger?: number;
  totalEvents?: number;
  lastIngestion?: string;
  generatedAt: string;
  error?: string;
};

async function fetchJson<T>(url: string) {
  const response = await fetch(url, { cache: 'no-store' });
  const json = (await response.json()) as T & { message?: string };
  if (!response.ok) throw new Error(json.message || 'Goldsky request failed');
  return json;
}

export function useGoldskyActivityFeed(limit = 12) {
  return useSWR<GoldskyActivityResponse>(`/api/activity-feed?limit=${limit}`, fetchJson, { keepPreviousData: true });
}

export function useGoldskyTokenInventory(limit = 100, offset = 0) {
  return useSWR<GoldskyTokenResponse>(`/api/tokens?limit=${limit}&offset=${offset}`, fetchJson, {
    keepPreviousData: true
  });
}

export function useGoldskyMemberList(limit = 100, offset = 0) {
  return useSWR<GoldskyMemberResponse>(`/api/members?limit=${limit}&offset=${offset}`, fetchJson, {
    keepPreviousData: true
  });
}

export function useGoldskyMintAuthorities() {
  return useSWR<GoldskyAuthorityResponse>('/api/authorities/mint', fetchJson, { keepPreviousData: true });
}

export function useGoldskyGovernorAuthorities() {
  return useSWR<GoldskyAuthorityResponse>('/api/authorities/governor', fetchJson, { keepPreviousData: true });
}

export function useGoldskyHealth() {
  return useSWR<GoldskyHealthResponse>('/api/goldsky/health', fetchJson, { keepPreviousData: true });
}
