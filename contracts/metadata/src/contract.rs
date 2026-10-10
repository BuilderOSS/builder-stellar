#![allow(clippy::too_many_arguments)] // constructors take every wired address/param explicitly

use soroban_sdk::{contract, contractimpl, Address, Bytes, BytesN, Env, String, Vec};

use crate::error::Error;
use crate::events::*;
use crate::storage::*;

/// Max items written by one `add_properties` call (bounds write entries).
pub const MAX_ITEMS_PER_CALL: u32 = 30;
/// Max page size for `get_items` and window for `bump_artwork_ttl`.
pub const MAX_PAGE: u32 = 50;

/// Metadata Contract
///
/// Manages metadata for Nouns-style artwork generation for each NFT token.
/// Each DAO has its own Metadata contract with custom properties and items.
#[contract]
pub struct MetadataContract;

#[contractimpl]
impl MetadataContract {
    /// One-shot, Manager-only launch handoff (Setup -> Live).
    ///
    /// Hands the admin (artwork, settings and upgrades) to `treasury`, marks
    /// the module live, and emits `MetadataLaunched`. A second call panics
    /// with `AlreadyLive`.
    pub fn launch(env: Env, treasury: Address) {
        let manager = Self::manager(&env);
        manager.require_auth();
        common::lifecycle::mark_live(&env);
        let wired: Option<Address> = env.storage().instance().get(&DataKey::Treasury);
        if wired != Some(treasury.clone()) {
            soroban_sdk::panic_with_error!(&env, Error::TreasuryMismatch);
        }
        common::admin::handoff(&env, &treasury);
        common::ttl::extend_instance(&env);
        emit_launched(&env, &treasury);
    }

    /// Initialize the metadata contract
    ///
    /// # Arguments
    ///
    /// * `token` - The associated ERC-721 token contract
    /// * `project_uri` - DAO website/project URL
    /// * `description` - Collection description
    /// * `contract_image` - Collection image URL
    /// * `renderer_base` - Base URL for image rendering service
    /// * `admin` - setup-phase admin (the launch admin); becomes the Treasury at launch
    /// * `treasury` - DAO treasury; `launch` must be called with exactly this address
    ///
    /// # Panics
    ///
    /// Panics with the underlying `Error` when the initial properties are
    /// invalid or a settings string exceeds `common::MAX_STRING_LENGTH`.
    pub fn __constructor(
        env: Env,
        token: Address,
        project_uri: String,
        description: String,
        contract_image: String,
        renderer_base: String,
        manager: Address,
        current_hash: BytesN<32>,
        admin: Address,
        treasury: Address,
        property_names: Vec<String>,
        items: Vec<ItemParam>,
        ipfs_group: IpfsGroup,
        version: String,
    ) {
        for value in [&project_uri, &description, &contract_image, &renderer_base] {
            if let Err(err) = Self::check_length(value) {
                soroban_sdk::panic_with_error!(&env, err);
            }
        }
        let settings = Settings {
            token: token.clone(),
            project_uri: project_uri.clone(),
            description: description.clone(),
            contract_image: contract_image.clone(),
            renderer_base: renderer_base.clone(),
        };

        set_settings(&env, &settings);
        if !property_names.is_empty() || !items.is_empty() {
            if let Err(err) = Self::_add_properties(&env, property_names, items, ipfs_group) {
                soroban_sdk::panic_with_error!(&env, err);
            }
        }
        env.storage().instance().set(&DataKey::Manager, &manager);
        common::admin::init(&env, &admin);
        env.storage().instance().set(&DataKey::Treasury, &treasury);
        common::upgrade::init(&env, &current_hash, &version, STORAGE_VERSION);

        emit_metadata_initialized(
            &env,
            &token,
            &renderer_base,
            &version,
            &admin,
            &project_uri,
            &description,
            &contract_image,
        );
    }

    pub fn upgrade(env: Env, from_hash: BytesN<32>, to_hash: BytesN<32>) {
        common::admin::require_admin(&env);
        let manager = Self::manager(&env);
        common::upgrade::apply(&env, &manager, &from_hash, &to_hash);
    }

    /// Advance the storage layout after an upgrade (admin only).
    pub fn migrate(env: Env) {
        common::admin::require_admin(&env);
        common::upgrade::migrate(&env, STORAGE_VERSION);
    }

    /// Storage-layout version of the data held by this contract.
    pub fn storage_version(env: Env) -> u32 {
        common::upgrade::storage_version(&env)
    }

    /// Module admin: the launch admin during setup, the Treasury once live.
    pub fn admin(env: Env) -> Address {
        common::admin::admin(&env)
    }

    pub fn version(env: Env) -> String {
        common::upgrade::version(&env)
    }

    pub fn wasm_hash(env: Env) -> BytesN<32> {
        common::upgrade::current_hash(&env)
    }

    pub fn sync_version(env: Env) {
        common::admin::require_admin(&env);
        let manager = Self::manager(&env);
        common::upgrade::sync_version(&env, &manager);
    }

    fn manager(env: &Env) -> Address {
        env.storage()
            .instance()
            .get(&DataKey::Manager)
            .unwrap_or_else(|| {
                soroban_sdk::panic_with_error!(env, common::CommonError::ManagerNotSet)
            })
    }

    /// Add new properties and items
    ///
    /// # Arguments
    ///
    /// * `names` - Property names to add
    /// * `items` - Items to add to properties
    /// * `ipfs_group` - IPFS base URI and extension for these items
    ///
    /// # Authorization
    ///
    /// Admin only (the launch admin in setup, the Treasury once live).
    ///
    /// # Errors
    ///
    /// * `OnePropertyAndItemRequired` - First addition must have at least 1 property and 1 item
    /// * `PropertyHasNoItems` - Property created without items
    /// * `TooManyProperties` - Exceeds 16 property limit
    /// * `InvalidPropertySelected` - Item references non-existent property
    /// * `TooManyItems` - more than `MAX_ITEMS_PER_CALL` (30) items in one call;
    ///   batch larger uploads across several calls (each adds its own IPFS group)
    pub fn add_properties(
        env: Env,
        names: Vec<String>,
        items: Vec<ItemParam>,
        ipfs_group: IpfsGroup,
    ) -> Result<(), Error> {
        common::ttl::extend_instance(&env);
        // Check authorization
        Self::require_admin(&env);

        Self::_add_properties(&env, names, items, ipfs_group)
    }

    /// Delete all properties and recreate with new ones
    ///
    /// WARNING: This can break existing token metadata if properties change structure
    ///
    /// # Authorization
    ///
    /// Admin only.
    pub fn delete_and_recreate_properties(
        env: Env,
        names: Vec<String>,
        items: Vec<ItemParam>,
        ipfs_group: IpfsGroup,
    ) -> Result<(), Error> {
        common::ttl::extend_instance(&env);
        // Check authorization
        Self::require_admin(&env);

        // Reset the counts and drop the (<= 16) property headers. Item and
        // IPFS group entries are not deleted: every getter is bounded by the
        // counts/headers, so they are unreachable and get overwritten as new
        // data is added. Reset is therefore O(#properties), not O(#items).
        let old_count = get_property_count(&env);
        for i in 0..old_count {
            remove_stored_property(&env, i);
        }
        set_property_count(&env, 0);
        set_ipfs_group_count(&env, 0);

        emit_properties_reset(&env, old_count);

        Self::_add_properties(&env, names, items, ipfs_group)
    }

    /// Generate seed for a token upon mint (hook called by Token contract)
    ///
    /// # Arguments
    ///
    /// * `token_id` - The token ID being minted
    ///
    /// # Returns
    ///
    /// Returns `true` if seed was generated successfully, `false` if no properties exist
    ///
    /// # Errors
    ///
    /// Only the token contract may call this (its auth is required).
    pub fn on_minted(env: Env, token_id: u32) -> Result<bool, Error> {
        common::ttl::extend_instance(&env);
        // Verify caller is token contract
        Self::require_token(&env)?;

        let num_properties = get_property_count(&env);
        if num_properties == 0 {
            return Ok(false);
        }

        let counts = Self::item_counts(&env, num_properties);
        Self::seed_token(&env, &counts, token_id);
        Ok(true)
    }

    /// Re-seed a token that was minted before artwork existed (or whose
    /// `on_minted` hook failed). Admin only.
    ///
    /// # Errors
    ///
    /// * `TokenNotMinted` - the token does not exist
    /// * `AlreadySeeded` - the token already has attributes
    /// * `NoProperties` - no properties are configured yet
    pub fn regenerate(env: Env, token_id: u32) -> Result<(), Error> {
        common::ttl::extend_instance(&env);
        Self::require_admin(&env);

        let settings = get_settings(&env)?;
        let exists = matches!(
            common::clients::NftClient::new(&env, &settings.token).try_owner_of(&token_id),
            Ok(Ok(_))
        );
        if !exists {
            return Err(Error::TokenNotMinted);
        }
        if !get_attributes(&env, token_id).is_empty() {
            return Err(Error::AlreadySeeded);
        }
        let num_properties = get_property_count(&env);
        if num_properties == 0 {
            return Err(Error::NoProperties);
        }
        let counts = Self::item_counts(&env, num_properties);
        Self::seed_token(&env, &counts, token_id);
        Ok(())
    }

    /// Batch variant of `on_minted` for the contiguous range
    /// `[first_token_id, first_token_id + count)`.
    ///
    /// Authorizes the token and loads the properties once for the whole range
    /// instead of once per token. Emits one `SeedGenerated` event per token,
    /// same as `on_minted`.
    ///
    /// # Errors
    ///
    /// Only the token contract may call this (its auth is required).
    pub fn on_minted_batch(env: Env, first_token_id: u32, count: u32) -> Result<bool, Error> {
        common::ttl::extend_instance(&env);
        Self::require_token(&env)?;

        let num_properties = get_property_count(&env);
        if num_properties == 0 {
            return Ok(false);
        }

        let counts = Self::item_counts(&env, num_properties);
        for i in 0..count {
            Self::seed_token(&env, &counts, first_token_id + i);
        }
        Ok(true)
    }

    /// Get properties count
    pub fn properties_count(env: Env) -> u32 {
        get_property_count(&env)
    }

    /// Paginated items of a property (`limit` <= `MAX_PAGE`). Returns an empty
    /// vec when `property_id` is out of range or `start` is past the end.
    pub fn get_items(
        env: Env,
        property_id: u32,
        start: u32,
        limit: u32,
    ) -> Result<Vec<Item>, Error> {
        if limit > MAX_PAGE {
            return Err(Error::LimitTooHigh);
        }
        let mut out = Vec::new(&env);
        let Some(header) = get_stored_property(&env, property_id) else {
            return Ok(out);
        };
        let end = start.saturating_add(limit).min(header.item_count);
        for j in start..end {
            if let Some(item) = get_item_raw(&env, property_id, j) {
                out.push_back(item);
            }
        }
        Ok(out)
    }

    /// A single IPFS group by absolute index (the `reference_slot` of items).
    pub fn get_ipfs_group(env: Env, index: u32) -> Option<IpfsGroup> {
        get_ipfs_group(&env, index)
    }

    /// Permissionless TTL renewal for artwork entries.
    ///
    /// The flat space is every item `(property, item)` in order, followed by
    /// every IPFS group. Extends entries in `[start, start + limit)` (plus the
    /// property headers walked and the instance) and returns the next start,
    /// or `total` when done. Callers loop until the returned value equals the
    /// total. `limit` must be <= `MAX_PAGE` (`LimitTooHigh`).
    ///
    /// Note: the network clamps `extend_to` to its max entry TTL (~180 days),
    /// so the effective lifetime after a write or bump is ~180 days, not the
    /// nominal 365; call this periodically to renew.
    pub fn bump_artwork_ttl(env: Env, start: u32, limit: u32) -> Result<u32, Error> {
        if limit > MAX_PAGE {
            return Err(Error::LimitTooHigh);
        }
        bump_instance(&env);
        let end = start.saturating_add(limit);
        let mut offset = 0u32;
        let num_properties = get_property_count(&env);
        for p in 0..num_properties {
            let Some(header) = get_stored_property(&env, p) else {
                continue;
            };
            let next = offset + header.item_count;
            if next > start && offset < end {
                bump_key(&env, &DataKey::Property(p));
                let from = start.max(offset) - offset;
                let to = end.min(next) - offset;
                for j in from..to {
                    bump_key(&env, &DataKey::Item(p, j));
                }
            }
            offset = next;
        }
        let groups = get_ipfs_group_count(&env);
        let total = offset + groups;
        if end > offset && start < total {
            let from = start.max(offset) - offset;
            let to = end.min(total) - offset;
            for g in from..to {
                bump_key(&env, &DataKey::IpfsGroup(g));
            }
        }
        Ok(end.min(total))
    }

    /// Get items count for a property
    pub fn items_count(env: Env, property_id: u32) -> u32 {
        get_stored_property(&env, property_id)
            .map(|p| p.item_count)
            .unwrap_or(0)
    }

    /// Get IPFS data count
    pub fn ipfs_data_count(env: Env) -> u32 {
        get_ipfs_group_count(&env)
    }

    /// Get property by ID
    pub fn get_property(env: Env, property_id: u32) -> Option<Property> {
        assemble_property(&env, property_id)
    }

    /// Get all properties. O(total items): may exceed read limits on large
    /// collections; prefer `get_property`/`get_items` pagination.
    pub fn get_properties(env: Env) -> Vec<Property> {
        get_properties(&env)
    }

    /// Get the generated item selections for a minted token.
    pub fn get_attributes(env: Env, token_id: u32) -> Result<Vec<u32>, Error> {
        let attributes = get_attributes(&env, token_id);
        if attributes.is_empty() {
            return Err(Error::TokenNotMinted);
        }
        Ok(attributes)
    }

    /// Get IPFS groups used by artwork items. O(#groups): prefer `get_ipfs_group`.
    pub fn get_ipfs_data(env: Env) -> Vec<IpfsGroup> {
        get_ipfs_data(&env)
    }

    /// Get settings
    pub fn get_settings(env: Env) -> Result<Settings, Error> {
        get_settings(&env)
    }

    /// Get token address
    pub fn token(env: Env) -> Result<Address, Error> {
        Ok(get_settings(&env)?.token)
    }

    /// Get renderer base URL
    pub fn renderer_base(env: Env) -> Result<String, Error> {
        Ok(get_settings(&env)?.renderer_base)
    }

    /// Get description
    pub fn description(env: Env) -> Result<String, Error> {
        Ok(get_settings(&env)?.description)
    }

    /// Get contract image
    pub fn contract_image(env: Env) -> Result<String, Error> {
        Ok(get_settings(&env)?.contract_image)
    }

    /// Get project URI
    pub fn project_uri(env: Env) -> Result<String, Error> {
        Ok(get_settings(&env)?.project_uri)
    }

    /// Update contract image
    pub fn update_contract_image(env: Env, new_contract_image: String) -> Result<(), Error> {
        common::ttl::extend_instance(&env);
        Self::require_admin(&env);
        Self::check_length(&new_contract_image)?;

        let mut settings = get_settings(&env)?;
        let old_image = settings.contract_image.clone();

        settings.contract_image = new_contract_image.clone();
        set_settings(&env, &settings);

        emit_contract_image_updated(&env, &old_image, &new_contract_image);

        Ok(())
    }

    /// Update renderer base URL
    pub fn update_renderer_base(env: Env, new_renderer_base: String) -> Result<(), Error> {
        common::ttl::extend_instance(&env);
        Self::require_admin(&env);
        Self::check_length(&new_renderer_base)?;

        let mut settings = get_settings(&env)?;
        let old_base = settings.renderer_base.clone();

        settings.renderer_base = new_renderer_base.clone();
        set_settings(&env, &settings);

        emit_renderer_base_updated(&env, &old_base, &new_renderer_base);

        Ok(())
    }

    /// Update description
    pub fn update_description(env: Env, new_description: String) -> Result<(), Error> {
        common::ttl::extend_instance(&env);
        Self::require_admin(&env);
        Self::check_length(&new_description)?;

        let mut settings = get_settings(&env)?;
        let old_description = settings.description.clone();

        settings.description = new_description.clone();
        set_settings(&env, &settings);

        emit_description_updated(&env, &old_description, &new_description);

        Ok(())
    }

    /// Update project URI
    pub fn update_project_uri(env: Env, new_project_uri: String) -> Result<(), Error> {
        common::ttl::extend_instance(&env);
        Self::require_admin(&env);
        Self::check_length(&new_project_uri)?;

        let mut settings = get_settings(&env)?;
        let old_uri = settings.project_uri.clone();

        settings.project_uri = new_project_uri.clone();
        set_settings(&env, &settings);

        emit_project_uri_updated(&env, &old_uri, &new_project_uri);

        Ok(())
    }

    // Internal helpers

    fn _add_properties(
        env: &Env,
        names: Vec<String>,
        items: Vec<ItemParam>,
        ipfs_group: IpfsGroup,
    ) -> Result<(), Error> {
        let num_stored_properties = get_property_count(env);
        let num_new_properties = names.len();
        let num_new_items = items.len();

        // If this is the first time adding metadata
        if num_stored_properties == 0 && (num_new_properties == 0 || num_new_items == 0) {
            return Err(Error::OnePropertyAndItemRequired);
        }

        // Every call must add at least one item (also rejects an empty call
        // that would only append an empty IPFS group), and new properties
        // need items.
        if num_new_items == 0 {
            return Err(Error::PropertyHasNoItems);
        }

        if num_new_items > MAX_ITEMS_PER_CALL {
            return Err(Error::TooManyItems);
        }

        // Check if not too many properties
        if num_stored_properties + num_new_properties > 16 {
            return Err(Error::TooManyProperties);
        }

        // Append the IPFS group; its absolute index is stable forever.
        let data_length = get_ipfs_group_count(env);
        set_ipfs_group(env, data_length, &ipfs_group);
        set_ipfs_group_count(env, data_length + 1);

        // Property headers (<= 16) are held in memory while items are appended.
        let total_properties = num_stored_properties + num_new_properties;
        let mut headers: Vec<StoredProperty> = Vec::new(env);
        let mut dirty: Vec<bool> = Vec::new(env);
        for i in 0..num_stored_properties {
            headers.push_back(get_stored_property(env, i).ok_or(Error::InvalidPropertySelected)?);
            dirty.push_back(false);
        }
        for i in 0..num_new_properties {
            let name = names.get(i).unwrap();
            headers.push_back(StoredProperty {
                name: name.clone(),
                item_count: 0,
            });
            dirty.push_back(true);
            emit_property_added(env, num_stored_properties + i, &name);
        }

        for i in 0..num_new_items {
            let item_param = items.get(i).unwrap();

            let mut property_id = item_param.property_id;

            // Offset the id if the item is for a new property
            if item_param.is_new_property {
                property_id = property_id
                    .checked_add(num_stored_properties)
                    .ok_or(Error::InvalidPropertySelected)?;
            }

            // Ensure the item is for a valid property
            if property_id >= total_properties {
                return Err(Error::InvalidPropertySelected);
            }

            let mut header = headers.get(property_id).unwrap();
            let item = Item {
                name: item_param.name,
                reference_slot: data_length,
            };
            set_item(env, property_id, header.item_count, &item);
            header.item_count += 1;
            headers.set(property_id, header);
            dirty.set(property_id, true);
        }

        // Validate all newly-added properties have at least one item
        for i in num_stored_properties..total_properties {
            if headers.get(i).unwrap().item_count == 0 {
                return Err(Error::PropertyHasNoItems);
            }
        }

        // Persist only headers that are new or whose item count changed.
        for i in 0..total_properties {
            if dirty.get(i).unwrap() {
                set_stored_property(env, i, &headers.get(i).unwrap());
            }
        }
        set_property_count(env, total_properties);

        Ok(())
    }

    /// Mint-path seeding: reads only the property count and each property's
    /// header (item count). Never reads individual items.
    fn item_counts(env: &Env, num_properties: u32) -> Vec<u32> {
        let mut counts = Vec::new(env);
        for i in 0..num_properties {
            let n = get_stored_property(env, i)
                .map(|p| p.item_count)
                .unwrap_or(0)
                .max(1);
            counts.push_back(n);
        }
        counts
    }

    fn seed_token(env: &Env, counts: &Vec<u32>, token_id: u32) {
        let num_properties = counts.len();
        let seed = Self::generate_seed(env, token_id);

        // First element stores number of properties
        let mut attr_vec = Vec::new(env);
        attr_vec.push_back(num_properties);

        for i in 0..num_properties {
            let num_items = counts.get(i).unwrap();

            // Use a distinct two-byte chunk for each property. The 32-byte
            // hash supports the contract's maximum of 16 properties.
            let offset = i * 2;
            let low = seed.get(offset).unwrap_or(0) as u64;
            let high = seed.get(offset + 1).unwrap_or(0) as u64;
            let item_index = ((low | (high << 8)) % (num_items as u64)) as u32;
            attr_vec.push_back(item_index);
        }

        set_attributes(env, token_id, &attr_vec);
        emit_seed_generated(env, token_id, num_properties, &attr_vec);
    }

    /// Derive the 32-byte artwork seed for `token_id`.
    ///
    /// LIMITATION (documented, no mitigation): the seed is
    /// `keccak256(token_id, ledger sequence, ledger timestamp, host PRNG u64)`.
    /// Every input is ledger data or the host PRNG, so whoever chooses when the
    /// mint happens (which ledger/transaction, or whether to submit at all after
    /// simulating the result) can grind for preferred traits. Treat trait
    /// outcomes as pseudo-random, not manipulation-resistant.
    fn generate_seed(env: &Env, token_id: u32) -> Bytes {
        // Gather entropy sources
        let sequence = env.ledger().sequence();
        let timestamp = env.ledger().timestamp();

        // Use Soroban's PRNG for additional entropy
        let random = env.prng().gen::<u64>();

        // Combine all sources
        let mut data = Bytes::new(env);
        data.append(&Bytes::from_array(env, &token_id.to_le_bytes()));
        data.append(&Bytes::from_array(env, &sequence.to_le_bytes()));
        data.append(&Bytes::from_array(env, &timestamp.to_le_bytes()));
        data.append(&Bytes::from_array(env, &random.to_le_bytes()));

        // Hash to get final seed - keccak256 returns BytesN<32>
        let hash = env.crypto().keccak256(&data);
        // Convert BytesN to Bytes
        Bytes::from_array(env, &hash.to_array())
    }

    fn require_admin(env: &Env) {
        common::admin::require_admin(env);
    }

    /// Settings strings are bounded so the instance entry (loaded on every
    /// mint hook) stays small.
    fn check_length(value: &String) -> Result<(), Error> {
        if value.len() > common::MAX_STRING_LENGTH {
            return Err(Error::StringTooLong);
        }
        Ok(())
    }

    fn require_token(env: &Env) -> Result<(), Error> {
        let settings = get_settings(env)?;
        settings.token.require_auth();
        Ok(())
    }
}
