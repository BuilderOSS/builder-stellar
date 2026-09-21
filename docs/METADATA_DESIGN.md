# MetadataRenderer Contract Design

## Overview

The **MetadataRenderer** contract is a **per-DAO instance** that generates pseudo-random Nouns-style artwork for each NFT token. Each DAO has its own MetadataRenderer with custom properties (traits) and items.

**Inspired by:** Nouns Builder `MetadataRenderer.sol`

**Core Responsibilities:**
1. Store dynamic properties/traits with variable items
2. Generate pseudo-random seeds on mint via `on_minted` hook
3. Use seeds to select items per property
4. Compose final image URL with query params for frontend renderer

---

## 1. Key Concepts

### Dynamic Properties & Items

Unlike hardcoded traits, properties are **user-defined**:

```
Property 0: "Background"
  - Item 0: "Cool"
  - Item 1: "Warm"

Property 1: "Body"
  - Item 0: "Pink"
  - Item 1: "Green"
  - Item 2: "Blue"

Property 2: "Glasses"
  - Item 0: "Square"
  - Item 1: "Round"
  - Item 2: "Aviator"
  - Item 3: "None"
```

### Pseudo-Random Seed Generation

On mint, MetadataRenderer generates an **unpredictable seed** using:

```rust
fn generate_seed(env: &Env, token_id: u32) -> u256 {
    let ledger_hash = env.ledger().sequence(); // or blockhash equivalent
    let timestamp = env.ledger().timestamp();
    let prev_random = env.prng().gen::<u64>(); // Soroban randomness

    env.crypto().keccak256(&(token_id, ledger_hash, timestamp, prev_random))
}
```

**Benefits:**
- Users cannot predict next token's artwork
- Fair distribution across all possible combinations
- Reproducible from stored seed

### Seed → Item Selection

For each property, use seed to select item index:

```rust
// For property i with N items:
let item_index = (seed >> (16 * i)) % num_items;
```

This means:
- Property 0 uses bits 0-15 of seed
- Property 1 uses bits 16-31 of seed
- ... and so on (supports up to 16 properties)

### IPFS Storage Structure

User uploads trait images to IPFS:

```
ipfs://QmXXXXXX/
├── Background/
│   ├── Cool.png
│   └── Warm.png
├── Body/
│   ├── Pink.png
│   ├── Green.png
│   └── Blue.png
├── Glasses/
    ├── Square.png
    ├── Round.png
    ├── Aviator.png
    └── None.png
```

**IPFSGroup** stores:
- `base_uri`: "ipfs://QmXXXXXX"
- `extension`: ".png"

### Final Image Composition

MetadataRenderer generates a URL with query params:

```
https://builder.stellar.org/render?contractAddress=CABC...&tokenId=42&images=ipfs://...Background/Cool.png&images=ipfs://...Body/Green.png&images=ipfs://...Glasses/Round.png
```

Frontend renderer:
1. Parses query params
2. Fetches each layer image
3. Composites them in order
4. Returns final PNG

---

## 2. Data Structures

### Settings

```rust
#[derive(Clone)]
pub struct Settings {
    pub token: Address,              // Associated token contract
    pub project_uri: String,         // DAO website
    pub description: String,         // Collection description
    pub contract_image: String,      // Collection image URL
    pub renderer_base: String,       // Base URL for rendering (e.g., https://builder.stellar.org/render)
}
```

### IPFSGroup

```rust
#[derive(Clone)]
pub struct IpfsGroup {
    pub base_uri: String,            // e.g., "ipfs://QmXXXXXX"
    pub extension: String,           // e.g., ".png"
}
```

### Item

```rust
#[derive(Clone)]
pub struct Item {
    pub name: String,                // e.g., "Cool", "Pink", "Square"
    pub reference_slot: u16,         // Index into ipfsData array
}
```

### Property

```rust
#[derive(Clone)]
pub struct Property {
    pub name: String,                // e.g., "Background", "Body", "Glasses"
    pub items: Vec<Item>,            // List of possible items for this property
}
```

### ItemParam (for adding items)

```rust
#[derive(Clone)]
pub struct ItemParam {
    pub property_id: u32,            // Which property this item belongs to
    pub name: String,                // Item name
    pub is_new_property: bool,       // If true, property_id is offset by current properties.len()
}
```

### TokenAttributes

```rust
// Stored per token_id
// attributes[token_id] = [num_properties, item_idx_0, item_idx_1, ..., item_idx_15]
pub type TokenAttributes = [u16; 16];

// Example for token with 3 properties:
// [3, 1, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
//  ^  ^  ^  ^
//  |  |  |  Property 2: selected item index 0
//  |  |  Property 1: selected item index 2
//  |  Property 0: selected item index 1
//  Number of properties (3)
```

---

## 3. Storage Layout

```rust
pub enum DataKey {
    Settings,                        // Settings struct
    Properties,                      // Vec<Property>
    IpfsData,                        // Vec<IpfsGroup>
    Attributes(u32),                 // token_id → TokenAttributes
    Initialized,                     // bool flag
}

// Storage structure:
//
// Instance storage:
//   Settings → Settings
//   Initialized → bool
//
// Persistent storage:
//   Properties → Vec<Property>
//   IpfsData → Vec<IpfsGroup>
//
// Temporary storage (per token):
//   Attributes(token_id) → [u16; 16]
```

---

## 4. Interface

### Initialization

```rust
/// Initialize the metadata renderer
/// - Called by Manager during DAO creation
/// - Can only be called once
/// - Emits MetadataRendererInitialized event
pub fn initialize(
    env: Env,
    token: Address,
    project_uri: String,
    description: String,
    contract_image: String,
    renderer_base: String,
) -> Result<(), Error>;
```

### Properties & Items Management

```rust
/// Add new properties and items
/// - Only callable by token owner (governance)
/// - Can add to existing properties or create new ones
/// - Validates at least 1 item per property
/// - Emits PropertyAdded and ItemsAdded events
pub fn add_properties(
    env: Env,
    names: Vec<String>,              // Property names
    items: Vec<ItemParam>,           // Items to add
    ipfs_group: IpfsGroup,           // IPFS data for these items
) -> Result<(), Error>;

/// Delete all properties and recreate
/// - Only callable by token owner (governance)
/// - WARNING: Can break existing token metadata if not careful
/// - Use only for major artwork updates
/// - Emits PropertiesReset event
pub fn delete_and_recreate_properties(
    env: Env,
    names: Vec<String>,
    items: Vec<ItemParam>,
    ipfs_group: IpfsGroup,
) -> Result<(), Error>;
```

### Seed Generation (Hook)

```rust
/// Called by Token contract on mint
/// - Generates pseudo-random seed
/// - Selects item indices for each property
/// - Stores attributes for token_id
/// - Emits SeedGenerated event
/// - Returns true on success
pub fn on_minted(
    env: Env,
    token_id: u32,
) -> Result<bool, Error>;
```

### Queries

```rust
/// Get metadata config
pub fn get_settings(env: Env) -> Settings;

/// Get number of properties
pub fn properties_count(env: Env) -> u32;

/// Get number of items in a property
pub fn items_count(env: Env, property_id: u32) -> u32;

/// Get number of IPFS groups
pub fn ipfs_data_count(env: Env) -> u32;

/// Get property by ID
pub fn get_property(env: Env, property_id: u32) -> Option<Property>;

/// Get all properties
pub fn get_properties(env: Env) -> Vec<Property>;

/// Get attributes for a token
/// - Returns (properties JSON string, query string for renderer)
pub fn get_attributes(
    env: Env,
    token_id: u32,
) -> Result<(String, String), Error>;

/// Generate token URI (full metadata JSON)
pub fn token_uri(
    env: Env,
    token_id: u32,
) -> Result<String, Error>;

/// Generate contract URI (collection metadata JSON)
pub fn contract_uri(env: Env) -> Result<String, Error>;
```

### Settings Updates

```rust
/// Update contract image
/// - Only callable by token owner (governance)
/// - Emits ContractImageUpdated event
pub fn update_contract_image(
    env: Env,
    new_contract_image: String,
) -> Result<(), Error>;

/// Update renderer base URL
/// - Only callable by token owner (governance)
/// - Emits RendererBaseUpdated event
pub fn update_renderer_base(
    env: Env,
    new_renderer_base: String,
) -> Result<(), Error>;

/// Update description
/// - Only callable by token owner (governance)
/// - Emits DescriptionUpdated event
pub fn update_description(
    env: Env,
    new_description: String,
) -> Result<(), Error>;

/// Update project URI
/// - Only callable by token owner (governance)
/// - Emits ProjectURIUpdated event
pub fn update_project_uri(
    env: Env,
    new_project_uri: String,
) -> Result<(), Error>;
```

---

## 5. Core Algorithm: on_minted

### Step 1: Generate Seed

```rust
fn generate_seed(env: &Env, token_id: u32) -> U256 {
    let sequence = env.ledger().sequence();
    let timestamp = env.ledger().timestamp();

    // Use Soroban's PRNG for additional entropy
    let random_bytes = env.prng().gen::<[u8; 32]>();

    // Combine all sources
    let mut data = Vec::new(env);
    data.extend_from_slice(&token_id.to_le_bytes());
    data.extend_from_slice(&sequence.to_le_bytes());
    data.extend_from_slice(&timestamp.to_le_bytes());
    data.extend_from_slice(&random_bytes);

    // Hash to get final seed
    env.crypto().keccak256(&data)
}
```

### Step 2: Select Items per Property

```rust
pub fn on_minted(env: Env, token_id: u32) -> Result<bool, Error> {
    // 1. Verify caller is token contract
    require_token(&env)?;

    // 2. Generate seed
    let seed = generate_seed(&env, token_id);

    // 3. Load properties
    let properties = storage::get_properties(&env)?;
    let num_properties = properties.len();

    if num_properties == 0 {
        return Ok(false);
    }

    // 4. Initialize attributes array
    let mut attributes = [0u16; 16];
    attributes[0] = num_properties as u16;

    // 5. Select item for each property
    let mut seed_value = U256::from_be_bytes(&seed.to_array());

    for i in 0..num_properties {
        let property = &properties[i];
        let num_items = property.items.len() as u32;

        // Use seed to select item index
        let item_index = (seed_value.low_u64() as u32) % num_items;
        attributes[i + 1] = item_index as u16;

        // Shift seed for next property
        seed_value >>= 16;
    }

    // 6. Store attributes
    storage::set_attributes(&env, token_id, &attributes)?;

    // 7. Emit event
    events::emit_seed_generated(&env, token_id, &attributes);

    Ok(true)
}
```

---

## 6. get_attributes Implementation

```rust
pub fn get_attributes(
    env: Env,
    token_id: u32,
) -> Result<(String, String), Error> {
    // 1. Get stored attributes
    let attributes = storage::get_attributes(&env, token_id)?;
    let num_properties = attributes[0] as usize;

    if num_properties == 0 {
        return Err(Error::TokenNotMinted);
    }

    // 2. Load properties and IPFS data
    let properties = storage::get_properties(&env)?;
    let ipfs_data = storage::get_ipfs_data(&env)?;

    // 3. Build query string
    let contract_addr = env.current_contract_address();
    let mut query_string = format!(
        "?contractAddress={}&tokenId={}",
        contract_addr.to_string(),
        token_id
    );

    // 4. Build attributes JSON array
    let mut attrs_json = String::from("[");

    for i in 0..num_properties {
        let property = &properties[i];
        let item_idx = attributes[i + 1] as usize;
        let item = &property.items[item_idx];

        // Get IPFS URL for this item
        let ipfs_group = &ipfs_data[item.reference_slot as usize];
        let image_url = format!(
            "{}/{}/{}{}",
            ipfs_group.base_uri,
            property.name,
            item.name,
            ipfs_group.extension
        );

        // Add to query string (URL-encoded)
        query_string.push_str(&format!("&images={}", uri_encode(&image_url)));

        // Add to JSON attributes
        if i > 0 {
            attrs_json.push_str(",");
        }
        attrs_json.push_str(&format!(
            r#"{{"trait_type":"{}","value":"{}"}}"#,
            property.name,
            item.name
        ));
    }

    attrs_json.push_str("]");

    Ok((attrs_json, query_string))
}
```

---

## 7. token_uri Implementation

```rust
pub fn token_uri(env: Env, token_id: u32) -> Result<String, Error> {
    let settings = storage::get_settings(&env)?;
    let (attributes_json, query_string) = get_attributes(env.clone(), token_id)?;

    // Get token name from Token contract
    let token_name = get_token_name(&env, &settings.token)?;

    // Build full image URL
    let image_url = format!("{}{}", settings.renderer_base, query_string);

    // Build metadata JSON
    let metadata = format!(
        r#"{{"name":"{} #{}","description":"{}","image":"{}","attributes":{}}}"#,
        token_name,
        token_id,
        settings.description,
        image_url,
        attributes_json
    );

    // Base64 encode (data URI)
    let encoded = base64::encode(metadata.as_bytes());
    Ok(format!("data:application/json;base64,{}", encoded))
}
```

---

## 8. Events

```rust
#[event(name = "metadata_renderer_initialized")]
pub struct MetadataRendererInitialized {
    pub token: Address,
    pub renderer_base: String,
}

#[event(name = "property_added")]
pub struct PropertyAdded {
    pub property_id: u32,
    pub name: String,
}

#[event(name = "items_added")]
pub struct ItemsAdded {
    pub property_id: u32,
    pub count: u32,
}

#[event(name = "seed_generated")]
pub struct SeedGenerated {
    pub token_id: u32,
    pub num_properties: u16,
    pub selections: Vec<u16>,       // Item indices per property
}

#[event(name = "contract_image_updated")]
pub struct ContractImageUpdated {
    pub old_image: String,
    pub new_image: String,
}

#[event(name = "renderer_base_updated")]
pub struct RendererBaseUpdated {
    pub old_base: String,
    pub new_base: String,
}

#[event(name = "description_updated")]
pub struct DescriptionUpdated {
    pub old_description: String,
    pub new_description: String,
}

#[event(name = "project_uri_updated")]
pub struct ProjectURIUpdated {
    pub old_uri: String,
    pub new_uri: String,
}

#[event(name = "properties_reset")]
pub struct PropertiesReset {
    pub num_properties: u32,
}
```

---

## 9. Error Handling

```rust
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub enum Error {
    // Initialization
    AlreadyInitialized,
    OnlyManager,

    // Properties
    OnePropertyAndItemRequired,      // First add needs at least 1 property & 1 item
    PropertyHasNoItems,              // Property must have items to prevent division by zero
    TooManyProperties,               // Max 16 properties (limited by seed bit-shifting)
    InvalidPropertySelected,         // Item references non-existent property

    // Minting
    OnlyToken,                       // Only token contract can call on_minted
    TokenNotMinted,                  // Querying unminted token

    // Authorization
    Unauthorized,                    // Not token owner

    // Data
    InvalidTokenId,
    NotInitialized,
}
```

---

## 10. Integration with Token Contract

### Token Contract Changes

```rust
// In Token contract storage
metadata_renderer: Address

// In Token.mint()
pub fn mint(env: Env, to: Address) -> Result<u32, Error> {
    // 1. Get next token ID
    let token_id = get_next_token_id(&env);

    // 2. Mint NFT
    Base::_mint(&env, &to, token_id);

    // 3. Call MetadataRenderer hook
    let metadata_renderer = storage::get_metadata_renderer(&env)?;
    let client = MetadataRendererClient::new(&env, &metadata_renderer);
    client.on_minted(&token_id)?;

    // 4. Auto-delegate
    Votes::set_delegate(&env, &to, &to)?;

    emit_token_minted(&env, &to, token_id);
    Ok(token_id)
}

// In Token.token_uri()
pub fn token_uri(env: Env, token_id: u32) -> String {
    let metadata_renderer = storage::get_metadata_renderer(&env)?;
    let client = MetadataRendererClient::new(&env, &metadata_renderer);
    client.token_uri(&token_id)
}
```

---

## 11. Frontend Renderer Service

### Endpoint: `/render`

```typescript
// https://builder.stellar.org/render?contractAddress=CABC...&tokenId=42&images=...&images=...

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  const contractAddress = searchParams.get('contractAddress');
  const tokenId = searchParams.get('tokenId');
  const imageUrls = searchParams.getAll('images');

  // 1. Fetch all layer images
  const layers = await Promise.all(
    imageUrls.map(url => fetch(url).then(r => r.arrayBuffer()))
  );

  // 2. Composite images using sharp/canvas
  const composite = await compositeImages(layers);

  // 3. Return PNG
  return new Response(composite, {
    headers: { 'Content-Type': 'image/png' }
  });
}
```

---

## 12. Tests Needed

### Initialization
- [ ] Initialize with valid params
- [ ] Initialize twice fails
- [ ] Only Manager can initialize
- [ ] Settings stored correctly

### Properties & Items
- [ ] Add first property and items
- [ ] Add items to existing property
- [ ] Add new property
- [ ] Add multiple properties in one call
- [ ] Adding 17 properties fails (max 16)
- [ ] Property with no items fails
- [ ] Invalid property ID fails
- [ ] Only governance can add properties
- [ ] Delete and recreate properties
- [ ] Properties count accurate
- [ ] Items count per property accurate

### Seed Generation
- [ ] on_minted generates seed
- [ ] Only token contract can call on_minted
- [ ] Attributes stored correctly
- [ ] Different tokens get different seeds
- [ ] Seed selections within bounds (0 to num_items-1)
- [ ] Seed generated event emitted
- [ ] Works with 1 property
- [ ] Works with 16 properties
- [ ] Fails with 0 properties

### Attributes & URIs
- [ ] get_attributes returns correct JSON and query string
- [ ] Query string URL-encoded correctly
- [ ] token_uri returns valid data URI
- [ ] contract_uri returns collection metadata
- [ ] Unminted token fails gracefully
- [ ] Attributes survive property additions

### Settings Updates
- [ ] Update contract image
- [ ] Update renderer base
- [ ] Update description
- [ ] Update project URI
- [ ] Only governance can update settings
- [ ] Events emitted on updates

### Edge Cases
- [ ] Empty strings handled
- [ ] Very long strings work
- [ ] IPFS CID formats validated
- [ ] Large token IDs work
- [ ] Property/item names with special chars
- [ ] Multiple IPFS groups

---

## 13. Storage Considerations

**Per-DAO Instance:**
- Settings: ~500 bytes
- Each Property: ~100 bytes + items
- Each Item: ~50 bytes
- Each TokenAttributes: 32 bytes
- Each IPFSGroup: ~100 bytes

**Example (DAO with 5 properties, 10 items each, 1000 tokens):**
- Settings: 500 bytes
- Properties: 5 × 100 = 500 bytes
- Items: 50 × 50 = 2,500 bytes
- TokenAttributes: 1000 × 32 = 32 KB
- IPFSGroups: 1 × 100 = 100 bytes
- **Total: ~35.6 KB per DAO**

---

## 14. Security Considerations

1. **Pseudo-Random Only** - Uses ledger data + PRNG (not user-controllable)
2. **Unpredictable** - Users cannot predict next token artwork
3. **Immutable Seeds** - Once generated, seeds never change
4. **Governance Control** - Only governance can modify properties
5. **Property Validation** - Division by zero prevented (items > 0)
6. **Max 16 Properties** - Prevents storage bloat and maintains performance

---

## 15. Future Enhancements

1. **Rarity Weights** - Weighted randomness for rare traits
2. **Seed Overrides** - Governance can override specific token seeds
3. **Layered Rendering** - Z-index control for trait composition
4. **Animated Traits** - Support for GIF/video layers
5. **SVG Support** - On-chain SVG generation
6. **Metadata Versioning** - Track property changes over time
7. **Batch Updates** - Update multiple properties atomically

---

## 16. Manager Contract Integration

### DaoCreationParams Update

```rust
pub struct DaoCreationParams {
    // ... other fields ...

    // MetadataRenderer initialization
    pub project_uri: String,
    pub description: String,
    pub contract_image: String,
    pub renderer_base: String,

    // Initial properties (optional - can be added later via governance)
    pub initial_properties: Option<InitialProperties>,
}

pub struct InitialProperties {
    pub names: Vec<String>,
    pub items: Vec<ItemParam>,
    pub ipfs_group: IpfsGroup,
}
```

### Manager Deployment Flow Update

```rust
// Step 5: Initialize MetadataRenderer
MetadataRenderer.initialize(
    token_addr,
    params.project_uri,
    params.description,
    params.contract_image,
    params.renderer_base,
)?;

// Step 5b: Add initial properties if provided
if let Some(props) = params.initial_properties {
    MetadataRenderer.add_properties(
        props.names,
        props.items,
        props.ipfs_group,
    )?;
}

// Step 6: Initialize Token with metadata_renderer reference
Token.initialize(
    name,
    symbol,
    metadata_renderer_addr,  // <-- Pass reference
    auction_addr,
    governor_addr,
    treasury_addr,
)?;
```

---

## Complete!

This design mirrors Nouns Builder's `MetadataRenderer.sol` with adaptations for Soroban:

✅ Dynamic properties/traits (not hardcoded)
✅ Pseudo-random seed generation (unpredictable)
✅ `on_minted` hook pattern
✅ Stores property names and item counts
✅ Generates image URL with query params
✅ Frontend renderer composes final image
✅ Governance-controlled artwork updates
✅ Supports up to 16 properties

Ready to implement!
