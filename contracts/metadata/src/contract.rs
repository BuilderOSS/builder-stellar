use soroban_sdk::{contract, contractimpl, Address, Bytes, Env, String, Vec};

use crate::error::Error;
use crate::events::*;
use crate::storage::*;

/// Metadata Contract
///
/// Manages metadata for Nouns-style artwork generation for each NFT token.
/// Each DAO has its own Metadata contract with custom properties and items.
#[contract]
pub struct MetadataContract;

#[contractimpl]
impl MetadataContract {
    /// Initialize the metadata contract
    ///
    /// # Arguments
    ///
    /// * `token` - The associated ERC-721 token contract
    /// * `project_uri` - DAO website/project URL
    /// * `description` - Collection description
    /// * `contract_image` - Collection image URL
    /// * `renderer_base` - Base URL for image rendering service
    ///
    /// # Errors
    ///
    /// * `AlreadyInitialized` - Contract already initialized
    pub fn initialize(
        env: Env,
        token: Address,
        project_uri: String,
        description: String,
        contract_image: String,
        renderer_base: String,
    ) -> Result<(), Error> {
        if is_initialized(&env) {
            return Err(Error::AlreadyInitialized);
        }

        let settings = Settings {
            token: token.clone(),
            project_uri,
            description,
            contract_image,
            renderer_base: renderer_base.clone(),
        };

        set_settings(&env, &settings);
        set_initialized(&env);

        emit_metadata_initialized(&env, &token, &renderer_base);

        Ok(())
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
    /// Only the token owner (governance) can add properties.
    ///
    /// # Errors
    ///
    /// * `Unauthorized` - Caller is not token owner
    /// * `OnePropertyAndItemRequired` - First addition must have at least 1 property and 1 item
    /// * `PropertyHasNoItems` - Property created without items
    /// * `TooManyProperties` - Exceeds 16 property limit
    /// * `InvalidPropertySelected` - Item references non-existent property
    pub fn add_properties(
        env: Env,
        names: Vec<String>,
        items: Vec<ItemParam>,
        ipfs_group: IpfsGroup,
    ) -> Result<(), Error> {
        // Check authorization
        Self::require_owner(&env)?;

        Self::_add_properties(&env, names, items, ipfs_group)
    }

    /// Delete all properties and recreate with new ones
    ///
    /// WARNING: This can break existing token metadata if properties change structure
    ///
    /// # Authorization
    ///
    /// Only the token owner (governance) can reset properties.
    pub fn delete_and_recreate_properties(
        env: Env,
        names: Vec<String>,
        items: Vec<ItemParam>,
        ipfs_group: IpfsGroup,
    ) -> Result<(), Error> {
        // Check authorization
        Self::require_owner(&env)?;

        // Clear existing data
        let empty_properties: Vec<Property> = Vec::new(&env);
        let empty_ipfs: Vec<IpfsGroup> = Vec::new(&env);
        set_properties(&env, &empty_properties);
        set_ipfs_data(&env, &empty_ipfs);

        emit_properties_reset(&env, 0);

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
    /// * `OnlyToken` - Only token contract can call this function
    pub fn on_minted(env: Env, token_id: u32) -> Result<bool, Error> {
        // Verify caller is token contract
        Self::require_token(&env)?;

        // Get properties
        let properties = get_properties(&env);
        let num_properties = properties.len();

        if num_properties == 0 {
            return Ok(false);
        }

        // Generate seed
        let seed = Self::generate_seed(&env, token_id);

        // Build attributes array
        let mut attr_vec = Vec::new(&env);
        attr_vec.push_front(num_properties); // First element stores number of properties

        // Select item for each property using seed
        let mut seed_value = Self::bytes_to_u64(&seed);

        for i in 0..num_properties {
            let property = properties.get(i).unwrap();
            let num_items = property.items.len();

            // Use lower 16 bits of seed to select item index
            let item_index = (seed_value % (num_items as u64)) as u32;
            attr_vec.push_front(item_index);

            // Shift seed right by 16 bits for next property
            seed_value >>= 16;
        }

        // Reverse to get correct order (we used push_front)
        let mut attributes = Vec::new(&env);
        for i in (0..attr_vec.len()).rev() {
            attributes.push_front(attr_vec.get(i).unwrap());
        }

        // Store attributes
        set_attributes(&env, token_id, &attributes);

        emit_seed_generated(&env, token_id, num_properties, &attributes);

        Ok(true)
    }

    /// Get properties count
    pub fn properties_count(env: Env) -> u32 {
        get_properties(&env).len()
    }

    /// Get items count for a property
    pub fn items_count(env: Env, property_id: u32) -> u32 {
        let properties = get_properties(&env);
        if let Some(property) = properties.get(property_id) {
            property.items.len()
        } else {
            0
        }
    }

    /// Get IPFS data count
    pub fn ipfs_data_count(env: Env) -> u32 {
        get_ipfs_data(&env).len()
    }

    /// Get property by ID
    pub fn get_property(env: Env, property_id: u32) -> Option<Property> {
        get_properties(&env).get(property_id)
    }

    /// Get all properties
    pub fn get_properties(env: Env) -> Vec<Property> {
        get_properties(&env)
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
        Self::require_owner(&env)?;

        let mut settings = get_settings(&env)?;
        let old_image = settings.contract_image.clone();

        settings.contract_image = new_contract_image.clone();
        set_settings(&env, &settings);

        emit_contract_image_updated(&env, &old_image, &new_contract_image);

        Ok(())
    }

    /// Update renderer base URL
    pub fn update_renderer_base(env: Env, new_renderer_base: String) -> Result<(), Error> {
        Self::require_owner(&env)?;

        let mut settings = get_settings(&env)?;
        let old_base = settings.renderer_base.clone();

        settings.renderer_base = new_renderer_base.clone();
        set_settings(&env, &settings);

        emit_renderer_base_updated(&env, &old_base, &new_renderer_base);

        Ok(())
    }

    /// Update description
    pub fn update_description(env: Env, new_description: String) -> Result<(), Error> {
        Self::require_owner(&env)?;

        let mut settings = get_settings(&env)?;
        let old_description = settings.description.clone();

        settings.description = new_description.clone();
        set_settings(&env, &settings);

        emit_description_updated(&env, &old_description, &new_description);

        Ok(())
    }

    /// Update project URI
    pub fn update_project_uri(env: Env, new_project_uri: String) -> Result<(), Error> {
        Self::require_owner(&env)?;

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
        let mut properties = get_properties(env);
        let mut ipfs_data = get_ipfs_data(env);

        let num_stored_properties = properties.len();
        let num_new_properties = names.len();
        let num_new_items = items.len();

        // If this is the first time adding metadata
        if num_stored_properties == 0 {
            if num_new_properties == 0 || num_new_items == 0 {
                return Err(Error::OnePropertyAndItemRequired);
            }
        }

        // If adding new properties, ensure they will have items
        if num_new_properties > 0 && num_new_items == 0 {
            return Err(Error::PropertyHasNoItems);
        }

        // Check if not too many properties
        if num_stored_properties + num_new_properties > 16 {
            return Err(Error::TooManyProperties);
        }

        // Add IPFS group
        let data_length = ipfs_data.len();
        ipfs_data.push_front(ipfs_group);
        set_ipfs_data(env, &ipfs_data);

        // Add new properties
        for i in 0..num_new_properties {
            let name = names.get(i).unwrap();
            let property = Property {
                name: name.clone(),
                items: Vec::new(env),
            };
            properties.push_front(property);

            let property_id = num_stored_properties + i;
            emit_property_added(env, property_id, &name);
        }

        // Add new items
        for i in 0..num_new_items {
            let item_param = items.get(i).unwrap();

            let mut property_id = item_param.property_id;

            // Offset the id if the item is for a new property
            if item_param.is_new_property {
                property_id += num_stored_properties;
            }

            // Ensure the item is for a valid property
            if property_id >= properties.len() {
                return Err(Error::InvalidPropertySelected);
            }

            // Get the property and add item
            let mut property = properties.get(property_id).unwrap();
            let item = Item {
                name: item_param.name,
                reference_slot: data_length,
            };

            // Create new items vec with the new item
            let mut new_items = property.items.clone();
            new_items.push_front(item);
            property.items = new_items;
            properties.set(property_id, property);
        }

        // Validate all newly-added properties have at least one item
        for i in num_stored_properties..properties.len() {
            let property = properties.get(i).unwrap();
            if property.items.len() == 0 {
                return Err(Error::PropertyHasNoItems);
            }
        }

        set_properties(env, &properties);

        Ok(())
    }

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

    fn bytes_to_u64(bytes: &Bytes) -> u64 {
        // Extract first 8 bytes as u64
        let mut arr = [0u8; 8];
        for i in 0..8.min(bytes.len() as usize) {
            arr[i] = bytes.get(i as u32).unwrap();
        }
        u64::from_le_bytes(arr)
    }

    fn require_owner(env: &Env) -> Result<(), Error> {
        let settings = get_settings(env)?;
        let token = stellar_access::ownable::OwnableClient::new(env, &settings.token);
        let owner = token.get_owner().ok_or(Error::Unauthorized)?;

        owner.require_auth();
        Ok(())
    }

    fn require_token(env: &Env) -> Result<(), Error> {
        let settings = get_settings(env)?;
        settings.token.require_auth();
        Ok(())
    }
}
