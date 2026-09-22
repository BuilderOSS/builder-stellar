use soroban_sdk::{contractevent, Address, Env, String, Vec};

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct MetadataInitialized {
    #[topic]
    pub token: Address,
    pub renderer_base: String,
}

pub fn emit_metadata_initialized(env: &Env, token: &Address, renderer_base: &String) {
    let event = MetadataInitialized {
        token: token.clone(),
        renderer_base: renderer_base.clone(),
    };
    event.publish(env);
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

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ContractImageUpdated {
    pub old_image: String,
    pub new_image: String,
}

pub fn emit_contract_image_updated(env: &Env, old_image: &String, new_image: &String) {
    let event = ContractImageUpdated {
        old_image: old_image.clone(),
        new_image: new_image.clone(),
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
pub struct DescriptionUpdated {
    pub old_description: String,
    pub new_description: String,
}

pub fn emit_description_updated(env: &Env, old_description: &String, new_description: &String) {
    let event = DescriptionUpdated {
        old_description: old_description.clone(),
        new_description: new_description.clone(),
    };
    event.publish(env);
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ProjectURIUpdated {
    pub old_uri: String,
    pub new_uri: String,
}

pub fn emit_project_uri_updated(env: &Env, old_uri: &String, new_uri: &String) {
    let event = ProjectURIUpdated {
        old_uri: old_uri.clone(),
        new_uri: new_uri.clone(),
    };
    event.publish(env);
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PropertiesReset {
    pub num_properties: u32,
}

pub fn emit_properties_reset(env: &Env, num_properties: u32) {
    let event = PropertiesReset { num_properties };
    event.publish(env);
}
