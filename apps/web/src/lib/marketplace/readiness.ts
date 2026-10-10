import { Asset, BASE_FEE, Horizon } from '@stellar/stellar-sdk';

import type { NetworkName } from '@/config/networks';
import { getTreasuryAssets, type TreasuryAsset } from '@/lib/assets-config';

import { parseMarketplaceAmount } from './amount';
import { MarketplaceError } from './query';
import type { MarketplaceAccountReadiness } from './types';

export function marketplaceAsset(network: NetworkName, contractId: string): TreasuryAsset | undefined {
  // Local asset ids must be derived for the actual passphrase, not the shared testnet placeholder.
  if (network === 'local') {
    const id = Asset.native().contractId('Standalone Network ; February 2017');
    return contractId === id
      ? { code: 'XLM', name: 'Lumens', imageSrc: '/assets/XLM.png', isNative: true, contractId: id }
      : undefined;
  }
  return getTreasuryAssets(network).find((a) => a.contractId === contractId && ['XLM', 'USDC'].includes(a.code));
}

export type ReadinessAccount = {
  subentry_count: number;
  num_sponsoring?: number;
  num_sponsored?: number;
  balances: Array<{
    asset_type: string;
    asset_code?: string;
    asset_issuer?: string;
    balance: string;
    selling_liabilities?: string;
    buying_liabilities?: string;
    limit?: string;
    is_authorized?: boolean;
  }>;
};

export function accountReadiness(
  account: ReadinessAccount,
  reserve: bigint,
  address: string,
  network: NetworkName,
  paymentAsset: string
): MarketplaceAccountReadiness {
  const asset = marketplaceAsset(network, paymentAsset);
  if (!asset) throw new MarketplaceError('This payment asset is not a supported 7-decimal XLM or USDC SAC.');
  const native = account.balances.find((b) => b.asset_type === 'native');
  const units = (v?: string) => parseMarketplaceAmount(v ?? '0', true);
  const minimum =
    BigInt(2 + account.subentry_count + (account.num_sponsoring ?? 0) - (account.num_sponsored ?? 0)) * reserve;
  const nativeAvailable = units(native?.balance) - units(native?.selling_liabilities) - minimum;
  const balance = asset.isNative
    ? native
    : account.balances.find((b) => b.asset_code === asset.code && b.asset_issuer === asset.issuer);
  const available = asset.isNative ? nativeAvailable : units(balance?.balance) - units(balance?.selling_liabilities);
  const authorized = asset.isNative || balance?.is_authorized === true;
  const capacity = asset.isNative
    ? null
    : units(balance?.limit) - units(balance?.balance) - units(balance?.buying_liabilities);
  const issues = [
    ...(!balance ? [`Add a ${asset.code} trustline before trading.`] : []),
    ...(balance && !authorized ? [`The ${asset.code} issuer has not authorized this trustline.`] : []),
    ...(nativeAvailable <= 0n ? ['Add XLM above the account reserve to pay network fees.'] : [])
  ];
  return {
    address,
    paymentAsset,
    assetCode: asset.code,
    balance: units(balance?.balance).toString(),
    available: (available > 0n ? available : 0n).toString(),
    nativeAvailable: (nativeAvailable > 0n ? nativeAvailable : 0n).toString(),
    receivable: capacity === null ? null : (capacity > 0n ? capacity : 0n).toString(),
    trustline: Boolean(balance),
    authorized,
    issues,
    canAddTrustline: !balance && !asset.isNative && nativeAvailable >= reserve + BigInt(BASE_FEE)
  };
}

export function marketplaceHorizon(network: NetworkName) {
  return new Horizon.Server(
    network === 'public'
      ? 'https://horizon.stellar.org'
      : network === 'testnet'
        ? 'https://horizon-testnet.stellar.org'
        : 'http://localhost:8000',
    { allowHttp: network === 'local' }
  );
}

export async function marketplaceReadiness(address: string, network: NetworkName, paymentAsset: string) {
  const horizon = marketplaceHorizon(network);
  try {
    const [account, ledgers] = await Promise.all([
      horizon.loadAccount(address),
      horizon.ledgers().order('desc').limit(1).call()
    ]);
    const reserve = ledgers.records[0]?.base_reserve_in_stroops;
    if (reserve === undefined) throw new Error('Reserve is unavailable');
    return accountReadiness(account, BigInt(reserve), address, network, paymentAsset);
  } catch (error) {
    if (error instanceof MarketplaceError) throw error;
    throw new MarketplaceError(
      'Unable to verify account balances. Fund your account on this network, then retry.',
      503
    );
  }
}
