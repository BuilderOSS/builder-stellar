# Stellar Render API Codebase Exploration

## 1. Metadata Renderer Contract Location & Requirements

### Contract Bindings Package
**Location:** `/Users/dan13ram/code/nouns/stellar-builder-worktrees/render-api/packages/metadata-bindings/`

### Contract Client Interface
**File:** `packages/metadata-bindings/src/client.ts`

The metadata contract client provides these key methods:

- `get_settings()` - Returns metadata settings including contract image, description, project URI, and renderer base
- `get_properties()` - Returns array of all Property objects
- `get_ipfs_data()` - Returns array of IpfsGroup objects
- `get_attributes({ token_id })` - Returns artwork selections for a minted token
- `add_properties({ names, items, ipfs_group })` - Add new artwork properties and items
- `initialize()` - Initialize contract with initial properties and items

### Core Type Definitions
**File:** `packages/metadata-bindings/src/types.ts`

```typescript
// Item in a property
interface Item {
  name: string;              // Item name
  reference_slot: number;    // Index into IPFS groups array
}

// Property (trait/category)
interface Property {
  items: Array<Item>;        // Array of items in this property
  name: string;              // Property name
}

// Settings
interface Settings {
  contract_image: string;    // Collection image URL
  description: string;       // Collection description
  project_uri: string;       // DAO project URL
  renderer_base: string;     // Base URL for token rendering
  token: string;             // Associated token contract address
}

// IPFS storage configuration
interface IpfsGroup {
  base_uri: string;          // Base IPFS URI or gateway URL
  extension: string;         // File extension (e.g., ".png")
}

// Item parameter for adding properties
interface ItemParam {
  is_new_property: boolean;  // Whether this starts a new property
  name: string;              // Item name
  property_id: number;       // Which property this belongs to
}
```

### Contract Requirements for Artwork
- **Maximum Properties:** 16 (enforced by limit `MAX_LAYERS = 16` in render API)
- **Item Structure:** Each item references a property and has a unique IPFS group slot
- **IPFS Groups:** Multiple IPFS configurations can exist, each with base URI and extension

## 2. Current Artwork Structure

### Frontend Artwork Configuration
**Location:** `apps/web/src/stores/create-dao-store.ts`

```typescript
// Artwork configuration stored in Zustand
export type ArtworkProperty = {
  name: string;              // Property name (e.g., "0-backgrounds")
  items: string[];           // Array of item names (e.g., ["bg-cool", "bg-warm"])
};

type ArtworkConfig = {
  ipfs: {
    baseUri: string;         // Base IPFS URI or gateway URL
    extension: string;       // File extension (e.g., ".png")
  };
  properties: ArtworkProperty[];  // Array of properties
};
```

### Artwork Property Validation
**File:** `apps/web/src/lib/validation.ts`

```typescript
// Property validation requirements:
// - Property name must not be empty
// - Property must have at least one item
// - No empty items allowed
// - Item names must be non-empty strings
// - Maximum 16 properties

export function validateArtworkProperty(property: { name: string; items: string[] }): string | null
export function hasDuplicates<T>(array: T[], keyFn: (item: T) => string): boolean
```

### Artwork UI Component
**Location:** `apps/web/src/components/create-dao/ArtworkStep.tsx`

- Accepts IPFS base URI (ipfs:// or HTTPS gateway URL)
- Accepts file extension (e.g., ".png")
- Manages up to 16 properties
- Each property has a name and array of items
- Supports adding/removing properties and items

## 3. IPFS Gateway URL Handling

### IPFS Gateway Configuration
**File:** `apps/web/src/lib/ipfs-gateway.ts`

```typescript
// Default gateway
const DEFAULT_PINATA_GATEWAY = 'nouns-builder.mypinata.cloud';

// Configured gateways (in priority order)
export const IPFS_GATEWAYS = [
  process.env.NEXT_PUBLIC_PINATA_GATEWAY || DEFAULT_PINATA_GATEWAY,  // Custom/default
  'ipfs.io',
  'magic.decentralized-content.com',
  'dweb.link',
  'gateway.pinata.cloud',
  'w3s.link',
  'ipfs.decentralized-content.com'
].map((gateway) => `https://${gateway.replace(/^https?:\/\//, '').replace(/\/$/, '')}`);
```

### URL Processing Functions

**`assertSafeRemoteUrl(value: string, allowIpfsGateway = false)`**
- Validates URL uses HTTPS
- Rejects URLs with credentials
- Checks hostname is in approved IPFS gateways list (if `allowIpfsGateway = true`)
- Performs DNS lookup and validates resolved IP addresses are public (not private)
- Returns array of resolved IP addresses

**`normalizeIpfsUri(uri: string)`**
- Accepts `ipfs://` URIs, CIDs, or gateway URLs
- Converts all to `ipfs://` format
- Pattern: `/^(Qm[1-9A-HJ-NP-Za-km-z]{44}|ba[A-Za-z0-9]{50,})$/` for CID validation

**`ipfsGatewayUrls(uri: string)`**
- Takes normalized IPFS URI
- Returns URLs for all configured gateways with the IPFS path
- Format: `${gateway}/ipfs/${path}`

**`getFetchableUrls(uri: string)`**
- Returns array of URLs to try for fetching
- Supports IPFS URIs (converts to gateway URLs) and direct HTTPS URLs

### Token Metadata Resolution
**File:** `apps/web/src/lib/onchain-token-metadata.ts`

```typescript
export type ResolvedArtwork = {
  property: string;        // Property name
  item: string;           // Item name
  url: string;            // Full URL to artwork file
};

export type OnchainTokenMetadata = {
  name: string;
  description: string;
  image: string;          // Token image URL
  attributes: Array<{ trait_type: string; value: string }>;
  artwork: ResolvedArtwork[];  // Array of resolved artwork layers
};

// URL construction logic
function joinUrl(base: string, property: string, item: string, extension: string) {
  return `${base.replace(/\/$/, '')}/${property}/${item}${extension}`;
}
```

## 4. Render API Implementation

### Render Endpoint
**Location:** `apps/web/src/app/api/render/[daoId]/[tokenId]/route.ts`

**Key Constants:**
```typescript
const REQUEST_TIMEOUT_MS = 45_000;       // 45 second timeout
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;        // 10 MB per layer
const MAX_TOTAL_IMAGE_BYTES = 32 * 1024 * 1024; // 32 MB total
const MAX_LAYERS = 16;                          // Max artwork layers
const MAX_CONCURRENT_LAYER_FETCHES = 4;         // Parallel fetch limit
const MAX_REDIRECTS = 3;                        // HTTP redirect limit
const MAX_INPUT_PIXELS = 16_777_216;            // 4096x4096
const SIZE = 1080;                              // Output size
const ALLOWED_IMAGE_FORMATS = new Set(['png', 'jpeg', 'webp']);
```

**Rendering Process:**
1. Parse token ID from URL
2. Get DAO config by daoId (token contract address)
3. Resolve on-chain metadata for token
4. Extract artwork layers (array of URLs)
5. Fetch each layer with:
   - DNS pinning for IPFS gateways
   - Undici Agent with custom lookup function
   - Redirect handling (up to 3 redirects)
   - Size validation per layer
6. Composite layers using Sharp:
   - Base layer resized to 1080x1080
   - Overlay layers composited on top
   - Output as WebP with quality=85
7. Cache headers: `public, s-maxage=300, stale-while-revalidate=600`
8. Fallback: Return SVG "Artwork unavailable" on error

**DNS Pinning Implementation:**
- Resolves hostname to IP address
- Creates Undici Agent with custom lookup function
- Forces all requests through resolved IP
- Prevents TOCTOU attacks on gateway resolution

## 5. Environment Variables

### Application Configuration
**File:** `apps/web/.env.example`

```
# Multi-Tenant Configuration
# Generated by the web predev/prebuild hook from deploys/*-manager.json

# Network Selection
NEXT_PUBLIC_NETWORK=testnet|public|local

# Database
APP_DATABASE_URL=postgres://user:pass@host/db?sslmode=require

# Server Configuration
APP_URL=http://localhost:4242
IRON_PASSWORD=<32+ char secret>

# WalletConnect
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=

# SEP-10 Auth
STELLAR_WEB_AUTH_SECRET=<funded account secret>
STELLAR_HOME_DOMAIN=localhost
STELLAR_WEB_AUTH_DOMAIN=localhost
AUTH_APP_NAME=Stellar DAOs
```

### Custom IPFS Gateway
```
NEXT_PUBLIC_PINATA_GATEWAY=nouns-builder.mypinata.cloud
```
- Optional override for default Pinata gateway
- Falls back to `nouns-builder.mypinata.cloud` if not set
- Other gateways tried as fallbacks if this gateway fails

### Legacy Configuration (for reference)
**File:** `.env.example`

```
NEXT_PUBLIC_DAO_NETWORK=testnet
NEXT_PUBLIC_DAO_LABEL=builder
MANAGER_DEPLOYMENT_FILE=deploys/builder-testnet-manager.json
APP_DATABASE_URL=postgres://...
```

## 6. DAO & Token Configuration

### DAO Configuration Lookup
**File:** `apps/web/src/lib/dao-config.ts`

```typescript
export type DaoNetworkConfig = {
  name: NetworkName;
  label: string;
  rpcUrl: string;
  passphrase: string;
  tokenName: string;
  tokenSymbol: string;
  tokenDescription: string;
  adminAddress: string;
  tokenContractId: string;
  metadataContractId: string;        // Key for resolving artwork
  governorContractId: string;
  treasuryContractId: string;
  auctionContractId: string;
  auctionEnabled: boolean | null;
};

// Fetched from database (Goldsky) for each DAO
export async function getDaoNetworkConfigById(daoId: string): Promise<DaoNetworkConfig>
```

### Token Configuration
**File:** `apps/web/src/lib/token-config.ts`

- Default token name: `'Token'`
- Default token symbol: `'TKN'`
- Default description: `'Decentralized Autonomous Organization Token'`
- Actual values come from DaoNetworkConfig (database)

## 7. DAO Creation Parameters

### Form Data to Contract Parameters
**File:** `apps/web/src/lib/dao-creation-params.ts`

```typescript
export type CreateDaoFormData = {
  basicInfo: {
    tokenName: string;
    tokenSymbol: string;
    tokenUri: string;
    projectUri: string;
    description: string;
    contractImage: string;
    rendererBase: string;  // Base URL for render API
  };
  artwork: {
    ipfs: {
      baseUri: string;
      extension: string;
    };
    properties: ArtworkProperty[];
  };
  // ... other configs
};

// Transformation to contract parameters
function formDataToCreationParams(
  formData: CreateDaoFormData,
  deployer: string,
  nonce: bigint
): DaoCreationParams {
  // Artwork items are flattened:
  // - propertyNames: string[] (one per property)
  // - artworkItems: ArtworkItem[] (one per item across all properties)
  // - artworkIpfs: { base_uri, extension }
}
```

## 8. Key Integration Points

### Metadata Contract Calls (in `onchain-token-metadata.ts`)
1. `metadata.get_settings()` - Get collection metadata
2. `metadata.get_properties()` - Get all properties and items
3. `metadata.get_ipfs_data()` - Get IPFS configurations
4. `metadata.get_attributes({ token_id })` - Get token's artwork selections

### Artwork URL Construction
```
URL = ${ipfsGroup.base_uri}/${property.name}/${item.name}${ipfsGroup.extension}
```

### Example Artwork Metadata
```
Property: "0-backgrounds"
Items: ["bg-cool", "bg-warm"]
IPFS Base: "ipfs://bafybeihcsfjvnjmzivm4gxgt75zwajtfxumyxd7j6ibvloykpg4sx47uca/"
Extension: ".png"

Resulting URLs:
- ipfs://bafybeihcsfjvnjmzivm4gxgt75zwajtfxumyxd7j6ibvloykpg4sx47uca/0-backgrounds/bg-cool.png
- ipfs://bafybeihcsfjvnjmzivm4gxgt75zwajtfxumyxd7j6ibvloykpg4sx47uca/0-backgrounds/bg-warm.png
```

## 9. Safety & Security Features

### IPFS Gateway Security
- DNS resolution with private IP filtering (IPv4 & IPv6)
- Private ranges blocked: 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, etc.
- HTTPS-only enforcement
- No credential URLs allowed

### Render API Security
- DNS pinning via Undici custom lookup
- Size limits per layer and total
- Input pixel limits (prevent decompression bombs)
- Redirect limit enforcement (max 3)
- Format whitelist: png, jpeg, webp only
- Fallback SVG on any error (no crash)

### Rate Limiting & Caching
- Per-layer fetch concurrency limited to 4
- 45-second timeout for entire render
- CDN cache: 5 minutes, stale-while-revalidate 10 minutes

---

## Summary Files & Absolute Paths

| Component | File Path |
|-----------|-----------|
| Metadata Contract Types | `/Users/dan13ram/code/nouns/stellar-builder-worktrees/render-api/packages/metadata-bindings/src/types.ts` |
| Metadata Contract Client | `/Users/dan13ram/code/nouns/stellar-builder-worktrees/render-api/packages/metadata-bindings/src/client.ts` |
| IPFS Gateway Utils | `/Users/dan13ram/code/nouns/stellar-builder-worktrees/render-api/apps/web/src/lib/ipfs-gateway.ts` |
| Metadata Resolution | `/Users/dan13ram/code/nouns/stellar-builder-worktrees/render-api/apps/web/src/lib/onchain-token-metadata.ts` |
| Render API Endpoint | `/Users/dan13ram/code/nouns/stellar-builder-worktrees/render-api/apps/web/src/app/api/render/[daoId]/[tokenId]/route.ts` |
| DAO Config | `/Users/dan13ram/code/nouns/stellar-builder-worktrees/render-api/apps/web/src/lib/dao-config.ts` |
| Artwork UI | `/Users/dan13ram/code/nouns/stellar-builder-worktrees/render-api/apps/web/src/components/create-dao/ArtworkStep.tsx` |
| Artwork Store | `/Users/dan13ram/code/nouns/stellar-builder-worktrees/render-api/apps/web/src/stores/create-dao-store.ts` |
| Validation | `/Users/dan13ram/code/nouns/stellar-builder-worktrees/render-api/apps/web/src/lib/validation.ts` |
| DAO Creation Params | `/Users/dan13ram/code/nouns/stellar-builder-worktrees/render-api/apps/web/src/lib/dao-creation-params.ts` |
| Env Config (Web) | `/Users/dan13ram/code/nouns/stellar-builder-worktrees/render-api/apps/web/.env.example` |
| Env Config (Root) | `/Users/dan13ram/code/nouns/stellar-builder-worktrees/render-api/.env.example` |
