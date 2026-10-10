import useSWR from 'swr';

export type GoldskyActivityItem = {
  activity_id: string;
  contract_id: string;
  contract_role: string;
  kind: string;
  title: string;
  summary: string;
  event_name: string | null;
  topics: string | null;
  args: string | null;
  proposal_id: string | null;
  token_id: string | null;
  amount: string | null;
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
  tokenId: number;
  owner: string;
  ledger: number;
  timestamp: number;
  txHash: string;
  contractId: string;
};

export type GoldskyTokenResponse = {
  items: GoldskyTokenItem[];
  total: number;
  totalSupply: string;
  votingSupply?: string | null;
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

export type GoldskyMemberLookupResponse = {
  item: GoldskyMemberItem | null;
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
};

export type DashboardDao = {
  dao_id: string;
  /** Claimed URL slug, once launched. */
  slug?: string | null;
  token_name: string | null;
  token_symbol: string | null;
  token_description: string | null;
  contract_image: string | null;
  status: string;
};

export type DashboardFeedItem = {
  activity_id: string;
  dao_id: string;
  contract_role: string;
  kind: string;
  title: string;
  summary: string;
  event_name: string | null;
  topics: string | null;
  args: string | null;
  proposal_id: string | null;
  token_id: string | null;
  amount: string | null;
  actor: string | null;
  ledger_sequence: number;
  timestamp: string | number | null;
  transaction_hash: string | null;
  token_name: string | null;
  token_symbol: string | null;
};

export type DashboardResponse = {
  myDaos: DashboardDao[];
  feed: {
    items: DashboardFeedItem[];
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
  };
  generatedAt: string;
  message?: string;
};

async function fetchJson<T>(url: string) {
  const response = await fetch(url, { cache: 'no-store' });
  const json = (await response.json()) as T & { message?: string };
  if (!response.ok) throw new Error(json.message || 'Goldsky request failed');
  return json;
}

export function useGoldskyActivityFeed(daoId: string, limit = 12) {
  return useSWR<GoldskyActivityResponse>(
    `/api/dao/${encodeURIComponent(daoId)}/activity-feed?limit=${limit}`,
    fetchJson,
    {
      keepPreviousData: true
    }
  );
}

export function useGoldskyMemberList(daoTokenAddress: string, limit = 100, offset = 0) {
  return useSWR<GoldskyMemberResponse>(
    `/api/dao/${encodeURIComponent(daoTokenAddress)}/members?limit=${limit}&offset=${offset}`,
    fetchJson,
    {
      keepPreviousData: true
    }
  );
}

export function useGoldskyMember(daoTokenAddress: string, address: string) {
  return useSWR<GoldskyMemberLookupResponse>(
    daoTokenAddress && address
      ? `/api/dao/${encodeURIComponent(daoTokenAddress)}/members?address=${encodeURIComponent(address)}`
      : null,
    fetchJson,
    {}
  );
}

export function useGoldskyMintAuthorities(daoTokenAddress: string) {
  return useSWR<GoldskyAuthorityResponse>(
    `/api/dao/${encodeURIComponent(daoTokenAddress)}/authorities/mint`,
    fetchJson,
    { keepPreviousData: true }
  );
}

export function useGoldskyHealth(_daoId: string) {
  return useSWR<GoldskyHealthResponse>('/api/goldsky/health', fetchJson, { keepPreviousData: true });
}

export function useDashboardData(address: string) {
  return useSWR<DashboardResponse>(address ? `/api/dashboard?wallet=${encodeURIComponent(address)}` : null, fetchJson, {
    keepPreviousData: false
  });
}
