export type TreasuryAsset = {
  code: string;
  name: string;
  imageSrc: string;
  issuer?: string;
  isNative?: boolean;
  contractId?: string; // SAC contract address
};

export type AssetsByNetwork = {
  testnet: TreasuryAsset[];
  mainnet: TreasuryAsset[];
  local: TreasuryAsset[];
};

// Stellar Asset Contract (SAC) addresses for different networks
export const TREASURY_ASSETS: AssetsByNetwork = {
  testnet: [
    {
      code: 'XLM',
      name: 'Lumens',
      imageSrc: '/assets/XLM.png',
      isNative: true,
      // Native XLM SAC address for testnet
      contractId: 'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC'
    },
    {
      code: 'USDC',
      name: 'USD Coin',
      imageSrc: '/assets/USDC.png',
      issuer: 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5',
      // Circle's USDC SAC on testnet
      contractId: 'CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA'
    },
    {
      code: 'EURC',
      name: 'Euro Coin',
      imageSrc: '/assets/EURC.png',
      issuer: 'GB3Q6QDZYTHWT7E5PVS3W7FUT5GVAFC5KSZFFLPU25GO7VTC3NM2ZTVO',
      contractId: 'CCUUDM434BMZMYWYDITHFXHDMIVTGGD6T2I5UKNX5BSLXLW7HVR4MCGZ'
    }
  ],
  mainnet: [
    {
      code: 'XLM',
      name: 'Lumens',
      imageSrc: '/assets/XLM.png',
      isNative: true,
      // Native XLM SAC address for mainnet
      contractId: 'CAS3J7GYLGXMF6TDJBBYYSE3HQ6BBSMLNUQ34T6TZMYMW2EVH34XOWMA'
    },
    {
      code: 'USDC',
      name: 'USD Coin',
      imageSrc: '/assets/USDC.png',
      issuer: 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN',
      // Circle's USDC SAC on mainnet
      contractId: 'CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7SJMI75'
    }
  ],
  local: [
    {
      code: 'XLM',
      name: 'Lumens',
      imageSrc: '/assets/XLM.png',
      isNative: true,
      // Native XLM SAC address for local network (using testnet address)
      contractId: 'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC'
    }
  ]
};

/**
 * Get the list of treasury assets for a specific network
 */
export function getTreasuryAssets(network: keyof AssetsByNetwork): TreasuryAsset[] {
  return TREASURY_ASSETS[network] || TREASURY_ASSETS.local;
}

/**
 * Find a specific asset by code and network
 */
export function findAsset(network: keyof AssetsByNetwork, assetCode: string): TreasuryAsset | undefined {
  const assets = getTreasuryAssets(network);
  return assets.find((asset) => asset.code === assetCode);
}
