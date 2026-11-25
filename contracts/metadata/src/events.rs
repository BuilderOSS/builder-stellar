#![allow(clippy::too_many_arguments)] // emit helpers mirror the event fields 1:1

use soroban_sdk::{contractevent, Address, BytesN, Env, String, Vec};

/// Emitted once when the Manager launches the metadata module (Setup -> Live).
/// `treasury` is the admin from then on.
#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct MetadataLaunched {
    #[topic]
    pub treasury: Address,
}

/// Publishes `MetadataLaunched` once, from the Manager's `launch`.
pub fn emit_launched(env: &Env, treasury: &Address) {
    MetadataLaunched {
        treasury: treasury.clone(),
    }
    .publish(env);
}

/// Emitted once by the constructor, when the Manager deploys the contract
/// in `create_dao`. `admin` is the launch admin.
#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct MetadataInitialized {
    #[topic]
    pub token: Address,
    pub renderer_base: String,
    pub admin: Address,
}

/// Publishes `MetadataInitialized` from the constructor.
pub fn emit_metadata_initialized(
    env: &Env,
    token: &Address,
    renderer_base: &String,
    admin: &Address,
) {
    MetadataInitialized {
        token: token.clone(),
        renderer_base: renderer_base.clone(),
        admin: admin.clone(),
    }
    .publish(env);
}

/// The DAO profile (serialized JSON: description, links, image). This event
/// is the only copy of the text; the chain keeps `hash` and `seq`. `seq` is 0
/// at creation and increases by one per update.
#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ProfileUpdated {
    #[topic]
    pub seq: u32,
    pub hash: BytesN<32>,
    pub profile: String,
}

/// Publishes `ProfileUpdated` from the constructor (seq 0) and
/// `update_profile`: the only copy of the profile text.
pub fn emit_profile_updated(env: &Env, seq: u32, hash: &BytesN<32>, profile: &String) {
    ProfileUpdated {
        seq,
        hash: hash.clone(),
        profile: profile.clone(),
    }
    .publish(env);
}

/// A new property, from `add_properties`, `delete_and_recreate_properties`
/// or the constructor. `property_id` is its index (ids restart at 0 after a
/// reset). Items are not emitted; read them with `get_items`.
#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PropertyAdded {
    #[topic]
    pub property_id: u32,
    pub name: String,
}

/// Publishes `PropertyAdded` for each new property (constructor,
/// `add_properties`, `delete_and_recreate_properties`).
pub fn emit_property_added(env: &Env, property_id: u32, name: &String) {
    let event = PropertyAdded {
        property_id,
        name: name.clone(),
    };
    event.publish(env);
}

/// A token's trait selections, from `on_minted` or `regenerate`.
/// `selections` is `[num_properties, item_index..]`, as `get_attributes`
/// returns it. Not emitted for a token minted before any artwork.
#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SeedGenerated {
    #[topic]
    pub token_id: u32,
    pub num_properties: u32,
    pub selections: Vec<u32>,
}

/// Publishes `SeedGenerated` when `on_minted` or `regenerate` writes a token's
/// selections.
pub fn emit_seed_generated(env: &Env, token_id: u32, num_properties: u32, selections: &Vec<u32>) {
    let event = SeedGenerated {
        token_id,
        num_properties,
        selections: selections.clone(),
    };
    event.publish(env);
}

/// Emitted once by `on_minted_batch` for the contiguous range
/// `[first_token_id, first_token_id + count)`, instead of one
/// `SeedGenerated` per token (keeps large batches under the per-transaction
/// event size limit). `selections[i]` belongs to token `first_token_id + i`
/// and has the same shape as `SeedGenerated.selections`.
#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SeedsGenerated {
    #[topic]
    pub first_token_id: u32,
    pub count: u32,
    pub num_properties: u32,
    pub selections: Vec<Vec<u32>>,
}

/// Publishes one `SeedsGenerated` for the whole range `on_minted_batch`
/// seeds.
pub fn emit_seeds_generated(
    env: &Env,
    first_token_id: u32,
    count: u32,
    num_properties: u32,
    selections: &Vec<Vec<u32>>,
) {
    let event = SeedsGenerated {
        first_token_id,
        count,
        num_properties,
        selections: selections.clone(),
    };
    event.publish(env);
}

/// The admin changed the image compositor URL (`update_renderer_base`).
#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct RendererBaseUpdated {
    pub old_base: String,
    pub new_base: String,
}

/// Publishes `RendererBaseUpdated` from `update_renderer_base`.
pub fn emit_renderer_base_updated(env: &Env, old_base: &String, new_base: &String) {
    let event = RendererBaseUpdated {
        old_base: old_base.clone(),
        new_base: new_base.clone(),
    };
    event.publish(env);
}

/// The admin cleared every property (`delete_and_recreate_properties`); the
/// new properties follow as `PropertyAdded` from id 0. Tokens keep their
/// stored selections.
#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PropertiesReset {
    /// Number of properties that existed before the reset.
    pub old_num_properties: u32,
}

/// Publishes `PropertiesReset` when `delete_and_recreate_properties` clears
/// the properties, before their replacements' `PropertyAdded`.
pub fn emit_properties_reset(env: &Env, old_num_properties: u32) {
    let event = PropertiesReset { old_num_properties };
    event.publish(env);
}
