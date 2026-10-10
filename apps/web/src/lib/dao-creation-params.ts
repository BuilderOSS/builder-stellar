import type { DaoCreationParams } from '@builder-stellar/manager-bindings';

import { decimalToStroops } from './auction-values';
import {
  configuredCreationNetwork,
  type CreateDaoFormData,
  createDaoSchema,
  type CreationNetwork,
  validateCreationAssets
} from './create-dao-schema';
export type { CreateDaoFormData } from './create-dao-schema';

export function formDataToCreationParams(
  input: CreateDaoFormData,
  deployer: string,
  nonce: bigint,
  network: CreationNetwork = configuredCreationNetwork()
): DaoCreationParams {
  const data = createDaoSchema.parse(input);
  validateCreationAssets(data, network);
  if (data.launchAdmin !== deployer) throw new Error('Launch admin must match the deployer');
  if (nonce < 0n || nonce > (1n << 64n) - 1n) throw new Error('Nonce is outside u64 bounds');
  return {
    deployer,
    nonce,
    launch_admin: data.launchAdmin,
    initial_config: {
      token_name: data.basicInfo.tokenName,
      token_symbol: data.basicInfo.tokenSymbol,
      token_uri: data.basicInfo.tokenUri,
      project_uri: data.basicInfo.projectUri,
      description: data.basicInfo.description,
      contract_image: data.basicInfo.contractImage,
      renderer_base: data.basicInfo.rendererBase,
      slug: data.basicInfo.slug,
      // Disabled modules still require valid initialization. Enablement happens only at launch.
      auction: {
        duration: BigInt(data.auction.duration),
        reserve_price: decimalToStroops(data.auction.reservePrice)!,
        time_buffer: BigInt(data.auction.timeBuffer),
        payment_asset: data.auction.paymentAsset
      },
      marketplace: {
        payment_asset: data.marketplace.paymentAsset,
        secondary_fee_bps: data.marketplace.secondaryFeeBps
      },
      governance: {
        voting_delay: data.governance.votingDelay,
        voting_period: data.governance.votingPeriod,
        queue_delay: data.governance.queueDelay,
        quorum_bps: data.governance.quorumBps,
        proposal_threshold: BigInt(data.governance.proposalThreshold)
      }
    }
  };
}
export function generateNonce(): bigint {
  const bytes = new Uint32Array(2);
  crypto.getRandomValues(bytes);
  return (BigInt(bytes[0]) << 32n) | BigInt(bytes[1]);
}
