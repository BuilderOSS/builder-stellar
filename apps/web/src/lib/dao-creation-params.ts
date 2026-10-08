// lib/dao-creation-params.ts
// Note: This file contains legacy DAO creation params transformation.
// The new creation flow uses a different structure and is handled by the UI components.

import type { DaoCreationParams } from '@builder-stellar/manager-bindings';

import { getTreasuryAssets } from './assets-config';
import { decimalToStroops } from './auction-values';
import type { CreateDaoFormData } from './create-dao-schema';

// Legacy artwork item type (no longer exported from manager-bindings)
interface ArtworkItem {
  property_id: number;
  name: string;
  is_new_property: boolean;
}

export type { CreateDaoFormData } from './create-dao-schema';

/**
 * Transform form data to Manager contract creation parameters
 * @deprecated This function is for legacy flow. The new creation flow should use BuildDaoService.
 */
export function formDataToCreationParams(
  formData: CreateDaoFormData & {
    auction?: { enabled: boolean; duration: number; reservePrice: string; timeBuffer: number; paymentAsset: string };
    artwork?: { ipfs: { baseUri: string; extension: string }; properties: Array<{ name: string; items: string[] }> };
    founders?: Array<{ address: string; amount: number }>;
  },
  deployer: string,
  nonce: bigint
): DaoCreationParams {
  const network = (process.env.NEXT_PUBLIC_NETWORK || 'testnet') as 'testnet' | 'public' | 'local';

  // Provide defaults if legacy fields are not present
  const paymentAsset =
    formData.auction?.paymentAsset || getTreasuryAssets(network).find((asset) => asset.isNative)?.contractId;

  if (!paymentAsset) {
    throw new Error(`No default payment asset configured for network: ${network}`);
  }

  const reservePrice = formData.auction?.reservePrice ? decimalToStroops(formData.auction.reservePrice) : null;
  if (!reservePrice) {
    throw new Error('Invalid auction reserve price.');
  }

  // Build artwork items array
  const artworkItems: ArtworkItem[] = [];
  const propertyNames: string[] = [];

  if (formData.artwork?.properties) {
    formData.artwork.properties.forEach((property, propertyIndex) => {
      propertyNames.push(property.name);

      property.items.forEach((itemName) => {
        artworkItems.push({
          property_id: propertyIndex,
          name: itemName,
          is_new_property: false // All items belong to properties we're creating
        });
      });
    });
  }

  return {
    deployer,
    nonce,
    launch_admin: formData.launchAdmin,
    initial_config: {
      // Token info
      token_name: formData.basicInfo.tokenName,
      token_symbol: formData.basicInfo.tokenSymbol,
      token_uri: formData.basicInfo.tokenUri,

      // Metadata
      project_uri: formData.basicInfo.projectUri,
      description: formData.basicInfo.description,
      contract_image: formData.basicInfo.contractImage,
      renderer_base: formData.basicInfo.rendererBase,

      // Auction config
      auction: {
        duration: BigInt(formData.auction?.duration || 86400),
        reserve_price: reservePrice,
        time_buffer: BigInt(formData.auction?.timeBuffer || 900),
        payment_asset: paymentAsset
      },

      // Governance config
      governance: {
        voting_delay: formData.governance.votingDelay,
        voting_period: formData.governance.votingPeriod,
        quorum_bps: formData.governance.quorumBps,
        proposal_threshold: BigInt(formData.governance.proposalThreshold),
        queue_delay: 3600 // Default value (contract bound: 300..=2_592_000)
      },

      // Marketplace config
      marketplace: {
        payment_asset: paymentAsset,
        secondary_fee_bps: 500 // 5% default secondary fee
      }
    }
  };
}

/**
 * Generate a unique nonce for DAO creation
 * Uses current timestamp + random component
 */
export function generateNonce(): bigint {
  const timestamp = BigInt(Date.now());
  const random = BigInt(Math.floor(Math.random() * 1000));
  return timestamp * 1000n + random;
}
