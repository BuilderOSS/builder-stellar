// lib/dao-creation-params.ts

import type { ArtworkItem, DaoCreationParams } from '@builder-stellar/manager-bindings';

import { getTreasuryAssets } from './assets-config';
import type { CreateDaoFormData } from './create-dao-schema';

export type { CreateDaoFormData } from './create-dao-schema';

/**
 * Transform form data to Manager contract creation parameters
 */
export function formDataToCreationParams(
  formData: CreateDaoFormData,
  deployer: string,
  nonce: bigint
): DaoCreationParams {
  const network = (process.env.NEXT_PUBLIC_NETWORK || 'testnet') as 'testnet' | 'public' | 'local';
  const paymentAsset =
    formData.auction.paymentAsset || getTreasuryAssets(network).find((asset) => asset.isNative)?.contractId;

  if (!paymentAsset) {
    throw new Error(`No default payment asset configured for network: ${network}`);
  }

  // Build artwork items array
  const artworkItems: ArtworkItem[] = [];
  const propertyNames: string[] = [];

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

  return {
    deployer,
    nonce,

    // Token info
    token_name: formData.basicInfo.tokenName,
    token_symbol: formData.basicInfo.tokenSymbol,
    token_uri: formData.basicInfo.tokenUri,

    // Metadata
    project_uri: formData.basicInfo.projectUri,
    description: formData.basicInfo.description,
    contract_image: formData.basicInfo.contractImage,
    renderer_base: formData.basicInfo.rendererBase,

    // Artwork
    artwork_property_names: propertyNames,
    artwork_items: artworkItems,
    artwork_ipfs: {
      base_uri: formData.artwork.ipfs.baseUri,
      extension: formData.artwork.ipfs.extension
    },

    // Auction (convert to bigint)
    auction_duration: BigInt(formData.auction.duration),
    reserve_price: BigInt(formData.auction.reservePrice),
    time_buffer: BigInt(formData.auction.timeBuffer),
    payment_asset: paymentAsset,

    // Governance (convert to bigint)
    voting_delay: BigInt(formData.governance.votingDelay),
    voting_period: BigInt(formData.governance.votingPeriod),
    quorum_bps: formData.governance.quorumBps,
    proposal_threshold_bps: formData.governance.proposalThresholdBps,

    // Founders
    founders: formData.founders.map((f) => ({
      address: f.address,
      amount: f.amount
    })),

    // Admin
    launch_admin: formData.launchAdmin
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
