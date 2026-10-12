#![allow(clippy::too_many_arguments)] // emit helpers mirror the event fields 1:1

use soroban_sdk::{contractevent, Address, BytesN, Env, String, Vec};

/// Emitted once when the Manager launches the metadata module (Setup -> Live).
#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct MetadataLaunched {
    #[topic]
    pub treasury: Address,
}

pub fn emit_launched(env: &Env, treasury: &Address) {
    MetadataLaunched {
        treasury: treasury.clone(),
    }
    .publish(env);
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct MetadataInitialized {
    #[topic]
    pub token: Address,
    pub renderer_base: String,
    pub admin: Address,
}

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

pub fn emit_profile_updated(env: &Env, seq: u32, hash: &BytesN<32>, profile: &String) {
    ProfileUpdated {
        seq,
        hash: hash.clone(),
        profile: profile.clone(),
    }
    .publish(env);
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PropertyAdded {
    #[topic]
    pub property_id: u32,
    pub name: String,
}

pub fn emit_property_added(env: &Env, property_id: u32, name: &String) {
    let event = PropertyAdded {
        property_id,
        name: name.clone(),
    };
    event.publish(env);
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SeedGenerated {
    #[topic]
    pub token_id: u32,
    pub num_properties: u32,
    pub selections: Vec<u32>,
}

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

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct RendererBaseUpdated {
    pub old_base: String,
    pub new_base: String,
}

pub fn emit_renderer_base_updated(env: &Env, old_base: &String, new_base: &String) {
    let event = RendererBaseUpdated {
        old_base: old_base.clone(),
        new_base: new_base.clone(),
    };
    event.publish(env);
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PropertiesReset {
    /// Number of properties that existed before the reset.
    pub old_num_properties: u32,
}

pub fn emit_properties_reset(env: &Env, old_num_properties: u32) {
    let event = PropertiesReset { old_num_properties };
    event.publish(env);
}
