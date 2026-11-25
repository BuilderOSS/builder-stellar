#![allow(clippy::too_many_arguments)] // constructors take every wired address/param explicitly

use soroban_sdk::{contract, contractimpl, Address, Bytes, BytesN, Env, Map, String, Vec};

use crate::error::Error;
use crate::events::*;
use crate::json::{data_uri, Writer, JSON_CAPACITY, URI_CAPACITY};
use crate::storage::*;

/// Max items written by one `add_properties` call (bounds write entries).
pub const MAX_ITEMS_PER_CALL: u32 = 30;
/// Max page size for `get_items`.
pub const MAX_PAGE: u32 = 50;

/// Metadata Contract
///
/// Holds one DAO's artwork (properties, items and IPFS groups), seeds each
/// token's trait selections when the Token mints it, and builds its SEP-50
/// `token_uri` document on-chain. Each DAO has its own Metadata contract.
#[contract]
pub struct MetadataContract;

#[contractimpl]
impl MetadataContract {
    /// One-shot launch handoff (Setup -> Live).
    ///
    /// Hands the admin (artwork, settings and upgrades) to `treasury`, marks
    /// the module Live, and emits `MetadataLaunched`. After an early
    /// `handoff` the admin is already the Treasury and does not move again.
    ///
    /// # Authorization
    ///
    /// The Manager wired at construction (`launch_dao` / `launch_when_ready`).
    ///
    /// # Panics
    ///
    /// * `AlreadyLive` - a second call
    /// * `TreasuryMismatch` - `treasury` is not the Treasury wired at construction
    pub fn launch(env: Env, treasury: Address) {
        Self::require_layout_or_panic(&env);
        let manager = Self::manager(&env);
        // Only the Manager launches, after its launch checks have passed.
        manager.require_auth();
        // One-shot: a second launch could not move the admin anywhere new,
        // but must not emit a second `MetadataLaunched`.
        common::lifecycle::mark_live(&env);
        let wired: Option<Address> = env
            .storage()
            .instance()
            .get(&common::ns(&env, DataKey::Treasury));
        // The admin may only move to this DAO's own Treasury.
        if wired != Some(treasury.clone()) {
            soroban_sdk::panic_with_error!(&env, Error::TreasuryMismatch);
        }
        common::admin::handoff_once(&env, &treasury);
        common::ttl::extend_instance(&env);
        emit_launched(&env, &treasury);
    }

    /// Early handoff for an assurance drive (`manager.open_assurance`): the
    /// admin moves to the Treasury and the contract stays in Setup. The
    /// Treasury cannot act before launch, so artwork and settings are frozen
    /// until then.
    ///
    /// # Authorization
    ///
    /// The Manager wired at construction.
    ///
    /// # Panics
    ///
    /// * `AlreadyLive` - the contract is already Live
    /// * `TreasuryMismatch` - `treasury` is not the Treasury wired at construction
    pub fn handoff(env: Env, treasury: Address) {
        Self::require_layout_or_panic(&env);
        // Only the Manager freezes Setup, as part of opening a drive.
        Self::manager(&env).require_auth();
        // After launch the admin is already the Treasury; nothing to hand off.
        common::lifecycle::require_setup(&env);
        let wired: Option<Address> = env
            .storage()
            .instance()
            .get(&common::ns(&env, DataKey::Treasury));
        // The admin may only move to this DAO's own Treasury.
        if wired != Some(treasury.clone()) {
            soroban_sdk::panic_with_error!(&env, Error::TreasuryMismatch);
        }
        common::admin::handoff_once(&env, &treasury);
        common::ttl::extend_instance(&env);
    }

    /// Initialise the metadata contract. Runs once, when the Manager deploys
    /// it in `create_dao`; it needs no authorization.
    ///
    /// # Arguments
    ///
    /// * `token` - The associated NFT token contract; the only caller of the
    ///   mint hooks
    /// * `profile` - DAO profile JSON (description, links, image; 1 to
    ///   `common::MAX_PROFILE_LENGTH` bytes). Emitted in `ProfileUpdated`
    ///   (seq 0); only its hash is stored.
    /// * `renderer_base` - Base URL of the image compositor used by `token_uri`
    /// * `manager` - The Manager: the only caller of `launch` and `handoff`,
    ///   and the registry `upgrade` and `version` read
    /// * `current_hash` - The WASM hash this contract was deployed from
    /// * `admin` - setup-phase admin (the launch admin); becomes the Treasury at launch
    /// * `treasury` - DAO treasury; `launch` must be called with exactly this address
    /// * `property_names`, `items`, `ipfs_group` - Initial artwork, added as by
    ///   `add_properties`; both lists empty means no artwork yet
    ///
    /// # Panics
    ///
    /// Panics with the underlying `Error` when the profile, the renderer base
    /// or the initial properties are invalid.
    pub fn __constructor(
        env: Env,
        token: Address,
        profile: String,
        renderer_base: String,
        manager: Address,
        current_hash: BytesN<32>,
        admin: Address,
        treasury: Address,
        property_names: Vec<String>,
        items: Vec<ItemParam>,
        ipfs_group: IpfsGroup,
    ) {
        // The renderer base is copied verbatim into every token's JSON.
        if let Err(err) = Self::check_text(&renderer_base, common::MAX_STRING_LENGTH) {
            soroban_sdk::panic_with_error!(&env, err);
        }
        set_settings(
            &env,
            &Settings {
                token: token.clone(),
                renderer_base: renderer_base.clone(),
            },
        );
        if let Err(err) = Self::store_profile(&env, 0, &profile) {
            soroban_sdk::panic_with_error!(&env, err);
        }
        if !property_names.is_empty() || !items.is_empty() {
            if let Err(err) = Self::_add_properties(&env, property_names, items, ipfs_group) {
                soroban_sdk::panic_with_error!(&env, err);
            }
        }
        env.storage()
            .instance()
            .set(&common::ns(&env, DataKey::Manager), &manager);
        common::admin::init(&env, &admin);
        env.storage()
            .instance()
            .set(&common::ns(&env, DataKey::Treasury), &treasury);
        common::upgrade::init(&env, &current_hash, STORAGE_VERSION);

        emit_metadata_initialized(&env, &token, &renderer_base, &admin);
    }

    /// Replace this contract's code with `to_hash`.
    ///
    /// # Authorization
    ///
    /// The admin: the launch admin in Setup, the Treasury (by proposal) once
    /// Live. During an assurance drive the admin is the Treasury, which
    /// cannot act before launch, so upgrades are frozen.
    ///
    /// # Guarantees
    ///
    /// `from_hash` must be the running hash (`HashMismatch`) and the Manager
    /// registry must approve `from_hash -> to_hash` with a non-revoked target
    /// (`UpgradeNotApproved`); see `common::upgrade::apply`.
    pub fn upgrade(env: Env, from_hash: BytesN<32>, to_hash: BytesN<32>) {
        // Code changes are the DAO's decision, through its admin.
        common::admin::require_admin(&env);
        let manager = Self::manager(&env);
        common::upgrade::apply(&env, &manager, &from_hash, &to_hash);
    }

    /// Advance the storage layout after an upgrade (admin only). Panics
    /// `NothingToMigrate` unless the stored layout is older than this code's
    /// `STORAGE_VERSION`. Until it runs, every entry point that changes state
    /// fails `StorageVersionMismatch`. A governance upgrade runs `upgrade`
    /// and `migrate` in one proposal; the Treasury does not depend on this
    /// contract, so a skipped migration can always be completed by proposal.
    pub fn migrate(env: Env) {
        // Rewrites stored data, so only the admin who upgraded may run it.
        common::admin::require_admin(&env);
        common::upgrade::migrate(&env, STORAGE_VERSION);
    }

    /// Storage-layout version of the data held by this contract. While it
    /// differs from the code's `STORAGE_VERSION`, every entry point that
    /// changes state fails `StorageVersionMismatch`.
    pub fn storage_version(env: Env) -> u32 {
        common::upgrade::storage_version(&env)
    }

    /// Module admin: the launch admin during setup, the Treasury once live
    /// (or from an assurance drive's early `handoff`).
    pub fn admin(env: Env) -> Address {
        common::admin::admin(&env)
    }

    /// Release version of the running code, looked up in the Manager
    /// registry by `wasm_hash()`. Panics `ImplementationNotFound` if the
    /// registry has no record of it.
    pub fn version(env: Env) -> String {
        common::upgrade::version(&env, &Self::manager(&env))
    }

    /// The WASM hash this contract recorded at construction or its last
    /// `upgrade`. It is the contract's own record; the host's view of the
    /// running code is `Address::executable()`.
    pub fn wasm_hash(env: Env) -> BytesN<32> {
        common::upgrade::current_hash(&env)
    }

    /// The Manager wired at construction. Panics `ManagerNotSet` if absent.
    fn manager(env: &Env) -> Address {
        env.storage()
            .instance()
            .get(&common::ns(env, DataKey::Manager))
            .unwrap_or_else(|| {
                soroban_sdk::panic_with_error!(env, common::CommonError::ManagerNotSet)
            })
    }

    /// Add new properties and items. Items are appended to existing
    /// properties or to the new ones in `names`; all of them share
    /// `ipfs_group`, which is reused if it equals the last group stored.
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
    /// * `PropertyHasNoItems` - The call adds no items, or a new property gets none
    /// * `TooManyProperties` - Exceeds the `MAX_PROPERTIES` (16) limit
    /// * `InvalidPropertySelected` - Item references non-existent property
    /// * `TooManyItems` - more than `MAX_ITEMS_PER_CALL` (30) items in one call;
    ///   batch larger uploads across several calls (calls with the same
    ///   `ipfs_group` share one group)
    /// * `PropertyFull` - a property would exceed `MAX_ITEMS_PER_PROPERTY`
    /// * `TooManyIpfsGroups` - a new group beyond `MAX_IPFS_GROUPS`
    /// * `StringTooLong` / `InvalidName` - a name or the group's strings
    ///   break the caps or contain `"`, `\` or a control character
    pub fn add_properties(
        env: Env,
        names: Vec<String>,
        items: Vec<ItemParam>,
        ipfs_group: IpfsGroup,
    ) -> Result<(), Error> {
        Self::require_current_layout(&env)?;
        common::ttl::extend_instance(&env);
        // The artwork is the admin's: the launch admin in Setup, the
        // Treasury (by proposal) once Live.
        Self::require_admin(&env);

        Self::_add_properties(&env, names, items, ipfs_group)
    }

    /// Delete all properties and recreate with new ones. Tokens keep their
    /// stored selections; `token_uri` leaves out any trait whose property
    /// or item no longer exists, and an index that still exists now names
    /// the new item at that position.
    ///
    /// WARNING: This can break existing token metadata if properties change structure
    ///
    /// # Authorization
    ///
    /// Admin only.
    ///
    /// # Errors
    ///
    /// As `add_properties`, for the new artwork.
    pub fn delete_and_recreate_properties(
        env: Env,
        names: Vec<String>,
        items: Vec<ItemParam>,
        ipfs_group: IpfsGroup,
    ) -> Result<(), Error> {
        Self::require_current_layout(&env)?;
        common::ttl::extend_instance(&env);
        // Replacing the artwork is the admin's decision, as adding to it is.
        Self::require_admin(&env);

        // Reset the counts. Names, item pages and the IPFS group vector are
        // not deleted: every read is bounded by the counts, and appends start
        // a fresh vector or page at a count of zero, so stale entries are
        // never read and get overwritten as data is added. Reset is O(1).
        let old_count = get_property_count(&env);
        set_item_counts(&env, &Vec::new(&env));
        set_ipfs_group_count(&env, 0);

        emit_properties_reset(&env, old_count);

        Self::_add_properties(&env, names, items, ipfs_group)
    }

    /// Generate seed for a token upon mint (hook called by Token contract)
    ///
    /// Writes the token's selections (an empty record when no properties
    /// exist yet) and emits `SeedGenerated` when it seeds.
    ///
    /// # Arguments
    ///
    /// * `token_id` - The token ID being minted
    ///
    /// # Returns
    ///
    /// Returns `true` if seed was generated successfully, `false` if no properties exist
    ///
    /// # Authorization
    ///
    /// Only the Token wired at construction (its auth is required).
    ///
    /// # Errors
    ///
    /// * `NotInitialized` - settings missing
    /// * `StorageVersionMismatch` - a migration is due; the Token ignores the
    ///   failure, so the token stays unseeded until `regenerate`
    pub fn on_minted(env: Env, token_id: u32) -> Result<bool, Error> {
        Self::require_current_layout(&env)?;
        common::ttl::extend_instance(&env);
        // Only the Token's mint path may seed: this overwrites the token's
        // selections, so any other caller could re-roll its traits.
        Self::require_token(&env)?;

        let counts = Self::item_counts(&env);
        let num_properties = counts.len();
        if num_properties == 0 {
            // An empty record, so every minted token's page exists and a
            // client can tell an archived page from an unwritten one.
            set_attributes(&env, token_id, &Vec::new(&env));
            return Ok(false);
        }

        let selections = Self::seed_token(&env, &counts, token_id);
        set_attributes(&env, token_id, &selections);
        emit_seed_generated(&env, token_id, num_properties, &selections);
        Ok(true)
    }

    /// Seed a token that was minted before artwork existed (or whose
    /// `on_minted` hook failed). Admin only. A token that already has
    /// selections is never re-seeded, so the admin cannot re-roll traits.
    ///
    /// # Errors
    ///
    /// * `TokenNotMinted` - the token does not exist
    /// * `AlreadySeeded` - the token already has attributes
    /// * `NoProperties` - no properties are configured yet
    pub fn regenerate(env: Env, token_id: u32) -> Result<(), Error> {
        Self::require_current_layout(&env)?;
        common::ttl::extend_instance(&env);
        // A repair for the DAO's own tokens, so the admin's.
        Self::require_admin(&env);

        let settings = get_settings(&env)?;
        // Existence by the id counter, not `owner_of`: a holder's ownership
        // entry may have archived, which would fail the whole call. A future
        // id is seeded by its own mint.
        if token_id >= common::clients::NftClient::new(&env, &settings.token).minted() {
            return Err(Error::TokenNotMinted);
        }
        // Seeded traits are final: re-seeding would let the admin grind them.
        if !get_attributes(&env, token_id).is_empty() {
            return Err(Error::AlreadySeeded);
        }
        let counts = Self::item_counts(&env);
        let num_properties = counts.len();
        if num_properties == 0 {
            return Err(Error::NoProperties);
        }
        let selections = Self::seed_token(&env, &counts, token_id);
        set_attributes(&env, token_id, &selections);
        emit_seed_generated(&env, token_id, num_properties, &selections);
        Ok(())
    }

    /// Batch variant of `on_minted` for the contiguous range
    /// `[first_token_id, first_token_id + count)`.
    ///
    /// Authorizes the token and loads the properties once for the whole range
    /// instead of once per token. Emits a single `SeedsGenerated` event for
    /// the whole range rather than one `SeedGenerated` per token.
    ///
    /// # Authorization
    ///
    /// Only the Token wired at construction (its auth is required).
    ///
    /// # Errors
    ///
    /// * `NotInitialized` - settings missing
    pub fn on_minted_batch(env: Env, first_token_id: u32, count: u32) -> Result<bool, Error> {
        Self::require_current_layout(&env)?;
        common::ttl::extend_instance(&env);
        // As `on_minted`: only the Token may write selections.
        Self::require_token(&env)?;

        let counts = Self::item_counts(&env);
        let num_properties = counts.len();
        if num_properties == 0 {
            // Empty records: see `on_minted`.
            let mut empty = Vec::new(&env);
            for _ in 0..count {
                empty.push_back(Vec::new(&env));
            }
            set_attributes_range(&env, first_token_id, &empty);
            return Ok(false);
        }

        let mut selections = Vec::new(&env);
        for i in 0..count {
            selections.push_back(Self::seed_token(&env, &counts, first_token_id + i));
        }
        // One write per touched attributes page (a batch may span two).
        set_attributes_range(&env, first_token_id, &selections);
        emit_seeds_generated(&env, first_token_id, count, num_properties, &selections);
        Ok(true)
    }

    /// Number of properties (at most `MAX_PROPERTIES`). Anyone may read it.
    pub fn properties_count(env: Env) -> u32 {
        get_property_count(&env)
    }

    /// Paginated items of a property (`limit` <= `MAX_PAGE`). Returns an empty
    /// vec when `property_id` is out of range or `start` is past the end.
    ///
    /// # Errors
    ///
    /// * `LimitTooHigh` - `limit` above `MAX_PAGE`
    pub fn get_items(
        env: Env,
        property_id: u32,
        start: u32,
        limit: u32,
    ) -> Result<Vec<Item>, Error> {
        // Bounds the pages one read loads.
        if limit > MAX_PAGE {
            return Err(Error::LimitTooHigh);
        }
        let mut out = Vec::new(&env);
        let Some(count) = get_item_count(&env, property_id) else {
            return Ok(out);
        };
        let end = start.saturating_add(limit).min(count);
        let mut loaded: Option<(u32, Vec<Item>)> = None;
        for j in start..end {
            let page = j / ITEMS_PER_PAGE;
            let items = match &loaded {
                Some((p, items)) if *p == page => items.clone(),
                _ => {
                    let items = get_item_page(&env, property_id, page);
                    loaded = Some((page, items.clone()));
                    items
                }
            };
            if let Some(item) = items.get(j % ITEMS_PER_PAGE) {
                out.push_back(item);
            }
        }
        Ok(out)
    }

    /// A single IPFS group by absolute index (the `reference_slot` of items).
    pub fn get_ipfs_group(env: Env, index: u32) -> Option<IpfsGroup> {
        get_ipfs_group(&env, index)
    }

    /// Item count of a property, 0 when it does not exist.
    pub fn items_count(env: Env, property_id: u32) -> u32 {
        get_item_count(&env, property_id).unwrap_or(0)
    }

    /// Every property's name and item count (at most 16), without items:
    /// enough for a client to resume artwork setup from chain state alone.
    pub fn property_headers(env: Env) -> Vec<PropertyHeader> {
        let counts = get_item_counts(&env);
        let names = get_property_names(&env);
        let mut out = Vec::new(&env);
        for (i, name) in names.iter().enumerate() {
            out.push_back(PropertyHeader {
                name,
                item_count: counts.get(i as u32).unwrap(),
            });
        }
        out
    }

    /// Number of IPFS groups in use (at most `MAX_IPFS_GROUPS`).
    pub fn ipfs_data_count(env: Env) -> u32 {
        get_ipfs_group_count(&env)
    }

    /// A property with all of its items, or `None` when it does not exist.
    /// Reads every item page of the property (at most `MAX_ITEM_PAGES`).
    pub fn get_property(env: Env, property_id: u32) -> Option<Property> {
        assemble_property(&env, property_id)
    }

    /// Get all properties. O(total items): may exceed read limits on large
    /// collections; prefer `get_property`/`get_items` pagination.
    pub fn get_properties(env: Env) -> Vec<Property> {
        get_properties(&env)
    }

    /// The generated item selections for a token, as
    /// `[num_properties, item_index..]`.
    ///
    /// # Errors
    ///
    /// * `TokenNotMinted` - the token has no selections: it does not exist,
    ///   or it was minted before any artwork
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

    /// The token and renderer base. `NotInitialized` if never set.
    pub fn get_settings(env: Env) -> Result<Settings, Error> {
        get_settings(&env)
    }

    /// The Token this contract serves (the only caller of the mint hooks).
    pub fn token(env: Env) -> Result<Address, Error> {
        Ok(get_settings(&env)?.token)
    }

    /// Base URL of the image compositor `token_uri` points `image` at.
    pub fn renderer_base(env: Env) -> Result<String, Error> {
        Ok(get_settings(&env)?.renderer_base)
    }

    /// Update renderer base URL (admin only). Emits `RendererBaseUpdated`.
    ///
    /// # Errors
    ///
    /// * `StringTooLong` / `InvalidName` - longer than
    ///   `common::MAX_STRING_LENGTH`, or contains `"`, `\` or a control character
    pub fn update_renderer_base(env: Env, new_renderer_base: String) -> Result<(), Error> {
        Self::require_current_layout(&env)?;
        common::ttl::extend_instance(&env);
        // Where every token's image points is the admin's setting.
        Self::require_admin(&env);
        // Copied verbatim into every token's JSON.
        Self::check_text(&new_renderer_base, common::MAX_STRING_LENGTH)?;

        let mut settings = get_settings(&env)?;
        let old_base = settings.renderer_base.clone();

        settings.renderer_base = new_renderer_base.clone();
        set_settings(&env, &settings);

        emit_renderer_base_updated(&env, &old_base, &new_renderer_base);

        Ok(())
    }

    /// Replace the DAO profile (admin only). `expected_seq` must equal the
    /// current `profile_seq()`, so an update written against a stale copy of
    /// the profile (for example one proposed before another edit executed)
    /// fails with `ProfileSeqMismatch` instead of overwriting newer fields.
    /// Emits `ProfileUpdated` with the next seq; only the hash is stored.
    ///
    /// # Errors
    ///
    /// * `ProfileSeqMismatch` - `expected_seq` is not the current seq
    /// * `InvalidProfile` - empty or longer than `common::MAX_PROFILE_LENGTH`
    pub fn update_profile(env: Env, expected_seq: u32, profile: String) -> Result<(), Error> {
        Self::require_current_layout(&env)?;
        common::ttl::extend_instance(&env);
        // The DAO's public profile is the admin's to change.
        Self::require_admin(&env);
        let state = get_profile_state(&env)?;
        // Optimistic concurrency: refuse an edit based on an older profile.
        if expected_seq != state.seq {
            return Err(Error::ProfileSeqMismatch);
        }
        Self::store_profile(&env, state.seq + 1, &profile)
    }

    /// SHA-256 of the latest profile bytes, to verify an indexed copy.
    pub fn profile_hash(env: Env) -> Result<BytesN<32>, Error> {
        Ok(get_profile_state(&env)?.hash)
    }

    /// Number of profile updates since creation (0 = the initial profile).
    pub fn profile_seq(env: Env) -> Result<u32, Error> {
        Ok(get_profile_state(&env)?.seq)
    }

    /// SEP-50 token metadata, built on-chain: a `data:application/json;base64`
    /// URI of `{"name", "image", "attributes"}`, where `name` is
    /// `<token_name> #<id>`. The token's own `token_uri` calls this with its
    /// collection name (Soroban forbids calling back into the token). `image` is
    /// `<renderer_base>?contract=<token>&token=<id>`; a compositor derives the
    /// layers from `get_attributes`, `property_headers`, `get_items` and
    /// `get_ipfs_group`. Traits whose property or item no longer exists (after
    /// a reset) are left out.
    ///
    /// Anyone may call it; it only reads.
    ///
    /// # Errors
    ///
    /// * `NotSeeded` - the token has no attributes yet (minted before
    ///   artwork, or not minted: existence is not checked here)
    /// * `StringTooLong` / `InvalidName` - `token_name` is longer than
    ///   `common::MAX_STRING_LENGTH` or contains `"`, `\` or a control character
    /// * `TokenUriTooLong` - the document would not fit its buffer
    pub fn token_uri(env: Env, token_id: u32, token_name: String) -> Result<String, Error> {
        let attributes = get_attributes(&env, token_id);
        if attributes.is_empty() {
            return Err(Error::NotSeeded);
        }
        // The token passes its validated name; a direct caller is held to the
        // same rule so the document is always valid JSON.
        Self::check_text(&token_name, common::MAX_STRING_LENGTH)?;
        let settings = get_settings(&env)?;
        let counts = get_item_counts(&env);

        let mut json: Writer<JSON_CAPACITY> = Writer::new();
        json.push(b"{\"name\":\"");
        json.push_string(&token_name);
        json.push(b" #");
        json.push_u32(token_id);
        json.push(b"\",\"image\":\"");
        json.push_string(&settings.renderer_base);
        json.push(b"?contract=");
        json.push_string(&settings.token.to_string());
        json.push(b"&token=");
        json.push_u32(token_id);
        json.push(b"\",\"attributes\":[");
        let num_properties = attributes.get(0).unwrap_or(0);
        let names = get_property_names(&env);
        let mut first = true;
        for i in 0..num_properties {
            let Some(index) = attributes.get(i + 1) else {
                break;
            };
            if index >= counts.get(i).unwrap_or(0) {
                continue;
            }
            let (Some(property), Some(item)) = (names.get(i), get_item_name(&env, i, index)) else {
                continue;
            };
            if !first {
                json.push(b",");
            }
            first = false;
            json.push(b"{\"trait_type\":\"");
            json.push_string(&property);
            json.push(b"\",\"value\":\"");
            json.push_string(&item);
            json.push(b"\"}");
        }
        json.push(b"]}");

        let raw = json.bytes().ok_or(Error::TokenUriTooLong)?;
        let mut uri: Writer<URI_CAPACITY> = Writer::new();
        data_uri(raw, &mut uri);
        let encoded = uri.bytes().ok_or(Error::TokenUriTooLong)?;
        Ok(String::from_bytes(&env, encoded))
    }

    // Internal helpers

    fn _add_properties(
        env: &Env,
        names: Vec<String>,
        items: Vec<ItemParam>,
        ipfs_group: IpfsGroup,
    ) -> Result<(), Error> {
        let mut counts = get_item_counts(env);
        let num_stored_properties = counts.len();
        let num_new_properties = names.len();
        let num_new_items = items.len();

        // If this is the first time adding metadata
        if num_stored_properties == 0 && (num_new_properties == 0 || num_new_items == 0) {
            return Err(Error::OnePropertyAndItemRequired);
        }

        // Every call must add at least one item, and new properties need items.
        if num_new_items == 0 {
            return Err(Error::PropertyHasNoItems);
        }

        // Bounds the entries one call writes (see `MAX_ITEMS_PER_CALL`).
        if num_new_items > MAX_ITEMS_PER_CALL {
            return Err(Error::TooManyItems);
        }

        // Each property takes two bytes of the 32-byte seed, and a record
        // holds at most `MAX_PROPERTIES` indexes.
        if num_stored_properties + num_new_properties > MAX_PROPERTIES {
            return Err(Error::TooManyProperties);
        }

        // Names are copied verbatim into the token JSON; the group's
        // strings are capped to keep their entry small.
        Self::check_length_max(&ipfs_group.base_uri, common::MAX_STRING_LENGTH)?;
        Self::check_length_max(&ipfs_group.extension, common::MAX_EXTENSION_LENGTH)?;
        for name in names.iter() {
            Self::check_name(&name)?;
        }
        for item in items.iter() {
            Self::check_name(&item.name)?;
        }

        let reference_slot = Self::append_ipfs_group(env, &ipfs_group)?;

        if num_new_properties > 0 {
            let mut stored_names = get_property_names(env);
            for i in 0..num_new_properties {
                let name = names.get(i).unwrap();
                let index = num_stored_properties + i;
                counts.push_back(0);
                stored_names.push_back(name.clone());
                emit_property_added(env, index, &name);
            }
            set_property_names(env, &stored_names);
        }
        let total_properties = counts.len();

        // Touched pages are held in memory and each is written once.
        let mut pages: Map<(u32, u32), Vec<Item>> = Map::new(env);
        for item_param in items.iter() {
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

            let count = counts.get(property_id).unwrap();
            // Keeps every item index within the two bytes a stored
            // selection holds, and the pages per property bounded.
            if count >= MAX_ITEMS_PER_PROPERTY {
                return Err(Error::PropertyFull);
            }
            let page = count / ITEMS_PER_PAGE;
            let slot = count % ITEMS_PER_PAGE;
            let mut page_items = match pages.get((property_id, page)) {
                Some(page_items) => page_items,
                // A fresh page never reads stale entries left by a reset.
                None if slot == 0 => Vec::new(env),
                None => get_item_page(env, property_id, page).slice(0..slot),
            };
            page_items.push_back(Item {
                name: item_param.name,
                reference_slot,
            });
            pages.set((property_id, page), page_items);
            counts.set(property_id, count + 1);
        }

        // Validate all newly-added properties have at least one item
        for i in num_stored_properties..total_properties {
            if counts.get(i).unwrap() == 0 {
                return Err(Error::PropertyHasNoItems);
            }
        }

        for ((property_id, page), page_items) in pages.iter() {
            set_item_page(env, property_id, page, &page_items);
        }
        set_item_counts(env, &counts);

        Ok(())
    }

    /// Append `group` and return its absolute index. A group equal to the
    /// last one is reused, so an upload split across several calls from one
    /// IPFS folder occupies one slot.
    fn append_ipfs_group(env: &Env, group: &IpfsGroup) -> Result<u32, Error> {
        let mut groups = get_ipfs_data(env);
        let count = groups.len();
        if count > 0 && groups.get(count - 1).as_ref() == Some(group) {
            return Ok(count - 1);
        }
        // An item stores its group index in one byte, and every group sits
        // in one entry, so the count stays bounded.
        if count >= MAX_IPFS_GROUPS {
            return Err(Error::TooManyIpfsGroups);
        }
        groups.push_back(group.clone());
        set_ipfs_data(env, &groups);
        Ok(count)
    }

    /// Mint-path seeding: reads only the instance `ItemCounts`. Never reads
    /// names or items.
    fn item_counts(env: &Env) -> Vec<u32> {
        let mut counts = Vec::new(env);
        for n in get_item_counts(env).iter() {
            counts.push_back(n.max(1));
        }
        counts
    }

    /// Derives `token_id`'s attributes (`[num_properties, idx...]`). Callers
    /// store them and emit the seed event.
    fn seed_token(env: &Env, counts: &Vec<u32>, token_id: u32) -> Vec<u32> {
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

        attr_vec
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

    /// `StorageVersionMismatch` unless the stored data layout is the one this
    /// code expects, so this code never writes data in a layout it does not
    /// know. The first check of every entry point that changes state;
    /// `upgrade`, `migrate` and the views stay outside it.
    fn require_current_layout(env: &Env) -> Result<(), Error> {
        if common::upgrade::is_current_layout(env, STORAGE_VERSION) {
            Ok(())
        } else {
            Err(Error::StorageVersionMismatch)
        }
    }

    /// `require_current_layout` for the entry points that panic instead of
    /// returning an error (`launch`, `handoff`).
    fn require_layout_or_panic(env: &Env) {
        if let Err(err) = Self::require_current_layout(env) {
            soroban_sdk::panic_with_error!(env, err);
        }
    }

    /// Require the module admin's authorization (`common::admin`).
    fn require_admin(env: &Env) {
        common::admin::require_admin(env);
    }

    /// Strings are capped so the entries that hold them stay small (the
    /// settings sit in the instance entry, loaded on every mint hook).
    fn check_length_max(value: &String, max: u32) -> Result<(), Error> {
        if value.len() > max {
            return Err(Error::StringTooLong);
        }
        Ok(())
    }

    /// Artwork names are copied verbatim into the on-chain token JSON, so
    /// they are capped and may not contain `"`, `\` or control characters.
    fn check_name(value: &String) -> Result<(), Error> {
        Self::check_text(value, common::MAX_ARTWORK_NAME_LENGTH)
    }

    /// A string copied verbatim into the token JSON: at most `max` bytes
    /// (`max` <= `MAX_STRING_LENGTH`), no `"`, `\` or control characters.
    fn check_text(value: &String, max: u32) -> Result<(), Error> {
        Self::check_length_max(value, max)?;
        let len = value.len() as usize;
        let mut buf = [0u8; common::MAX_STRING_LENGTH as usize];
        value.copy_into_slice(&mut buf[..len]);
        if buf[..len]
            .iter()
            .any(|b| *b == b'"' || *b == b'\\' || *b < 0x20)
        {
            return Err(Error::InvalidName);
        }
        Ok(())
    }

    /// Store the profile fingerprint at `seq` and emit the profile text.
    fn store_profile(env: &Env, seq: u32, profile: &String) -> Result<(), Error> {
        let len = profile.len();
        // The text is event-only; the cap bounds the event's size.
        if len == 0 || len > common::MAX_PROFILE_LENGTH {
            return Err(Error::InvalidProfile);
        }
        let hash: BytesN<32> = env.crypto().sha256(&profile.to_bytes()).into();
        set_profile_state(
            env,
            &ProfileState {
                hash: hash.clone(),
                seq,
            },
        );
        emit_profile_updated(env, seq, &hash, profile);
        Ok(())
    }

    /// Require the authorization of the Token wired at construction.
    fn require_token(env: &Env) -> Result<(), Error> {
        let settings = get_settings(env)?;
        settings.token.require_auth();
        Ok(())
    }
}
