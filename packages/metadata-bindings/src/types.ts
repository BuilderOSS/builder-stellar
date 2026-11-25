import {Address} from '@stellar/stellar-sdk';

    /**
 * Metadata errors (block `common::error::codes::METADATA`). Entry points
 * return them as `Result` errors, or panic with them where they cannot
 * return one (the constructor, `launch`, `handoff`).
 */
export const Error = {
  /**
   * Settings or profile state missing (contract not initialised)
   */
  7301 : { message: "NotInitialized" },
  /**
   * `launch` or `handoff` was given a Treasury other than the one wired at
   * construction
   */
  7302 : { message: "TreasuryMismatch" },
  /**
   * The first `add_properties` call must add at least one property and one item
   */
  7303 : { message: "OnePropertyAndItemRequired" },
  /**
   * A call added no items, or a new property got no items
   */
  7304 : { message: "PropertyHasNoItems" },
  /**
   * More than `MAX_PROPERTIES` (16) properties
   */
  7305 : { message: "TooManyProperties" },
  /**
   * An item references a property that does not exist
   */
  7306 : { message: "InvalidPropertySelected" },
  /**
   * `regenerate` called while no properties exist
   */
  7307 : { message: "NoProperties" },
  /**
   * More than `MAX_ITEMS_PER_CALL` items in one `add_properties` call
   */
  7308 : { message: "TooManyItems" },
  /**
   * `get_items` was given a `limit` above `MAX_PAGE`
   */
  7309 : { message: "LimitTooHigh" },
  /**
   * `regenerate`: the token does not exist. `get_attributes`: the token
   * has no selections (it does not exist, or was minted before artwork)
   */
  7310 : { message: "TokenNotMinted" },
  /**
   * `regenerate` called for a token that already has attributes
   */
  7311 : { message: "AlreadySeeded" },
  /**
   * A settings or artwork string, or the `token_uri` name, is longer than
   * its cap
   */
  7312 : { message: "StringTooLong" },
  /**
   * A string copied into the token JSON (an artwork name, the renderer
   * base or the `token_uri` name) contains `"`, `\` or a control character
   */
  7313 : { message: "InvalidName" },
  /**
   * More than `MAX_IPFS_GROUPS` distinct IPFS groups
   */
  7314 : { message: "TooManyIpfsGroups" },
  /**
   * A property would exceed `MAX_ITEMS_PER_PROPERTY` items
   */
  7315 : { message: "PropertyFull" },
  /**
   * A profile is empty or longer than `common::MAX_PROFILE_LENGTH`
   */
  7316 : { message: "InvalidProfile" },
  /**
   * `update_profile` was given a stale `expected_seq`
   */
  7317 : { message: "ProfileSeqMismatch" },
  /**
   * The token JSON would exceed its buffer (a string over its cap)
   */
  7318 : { message: "TokenUriTooLong" },
  /**
   * `token_uri`: the token has no selections, because it was minted before
   * any artwork (`regenerate` seeds it) or was never minted (`token_uri`
   * does not check existence)
   */
  7319 : { message: "NotSeeded" }
}

/**
 * A new property, from `add_properties`, `delete_and_recreate_properties`
 * or the constructor. `property_id` is its index (ids restart at 0 after a
 * reset). Items are not emitted; read them with `get_items`.
 */
export interface PropertyAddedEvent {
  name: "PropertyAdded";
  data: {
    property_id: number;
    name?: string;
  };
}

/**
 * A token's trait selections, from `on_minted` or `regenerate`.
 * `selections` is `[num_properties, item_index..]`, as `get_attributes`
 * returns it. Not emitted for a token minted before any artwork.
 */
export interface SeedGeneratedEvent {
  name: "SeedGenerated";
  data: {
    token_id: number;
    num_properties?: number;
    selections?: Array<number>;
  };
}

/**
 * The DAO profile (serialized JSON: description, links, image). This event
 * is the only copy of the text; the chain keeps `hash` and `seq`. `seq` is 0
 * at creation and increases by one per update.
 */
export interface ProfileUpdatedEvent {
  name: "ProfileUpdated";
  data: {
    seq: number;
    hash?: Uint8Array;
    profile?: string;
  };
}

/**
 * Emitted once by `on_minted_batch` for the contiguous range
 * `[first_token_id, first_token_id + count)`, instead of one
 * `SeedGenerated` per token (keeps large batches under the per-transaction
 * event size limit). `selections[i]` belongs to token `first_token_id + i`
 * and has the same shape as `SeedGenerated.selections`.
 */
export interface SeedsGeneratedEvent {
  name: "SeedsGenerated";
  data: {
    first_token_id: number;
    count?: number;
    num_properties?: number;
    selections?: Array<Array<number>>;
  };
}

/**
 * The admin cleared every property (`delete_and_recreate_properties`); the
 * new properties follow as `PropertyAdded` from id 0. Tokens keep their
 * stored selections.
 */
export interface PropertiesResetEvent {
  name: "PropertiesReset";
  data: {
    /**
     * Number of properties that existed before the reset.
     */
    old_num_properties?: number;
  };
}

/**
 * Emitted once when the Manager launches the metadata module (Setup -> Live).
 * `treasury` is the admin from then on.
 */
export interface MetadataLaunchedEvent {
  name: "MetadataLaunched";
  data: {
    treasury: string;
  };
}

/**
 * Emitted once by the constructor, when the Manager deploys the contract
 * in `create_dao`. `admin` is the launch admin.
 */
export interface MetadataInitializedEvent {
  name: "MetadataInitialized";
  data: {
    token: string;
    renderer_base?: string;
    admin?: string;
  };
}

/**
 * The admin changed the image compositor URL (`update_renderer_base`).
 */
export interface RendererBaseUpdatedEvent {
  name: "RendererBaseUpdated";
  data: {
    old_base?: string;
    new_base?: string;
  };
}

/**
 * One value of a property (a trait), as `get_items` returns it.
 */
export interface Item {
  /**
   * At most `common::MAX_ARTWORK_NAME_LENGTH` bytes, without `"`, `\` or
   * control characters (it is copied into the token JSON).
   */
  name: string;
  /**
   * Index of the item's [`IpfsGroup`] (`get_ipfs_group`), below
   * `MAX_IPFS_GROUPS`.
   */
  reference_slot: number;
}

/**
 * A property (trait type) with all of its items, in item order.
 */
export interface Property {
  items: Array<Item>;
  name: string;
}

/**
 * The Token this contract serves and where token images are rendered.
 */
export interface Settings {
  /**
   * Base URL of the image compositor; `token_uri` points `image` here.
   */
  renderer_base: string;
  /**
   * The Token: the only caller of the mint hooks.
   */
  token: string;
}

/**
 * The IPFS folder (`base_uri`) and file extension a batch of item images
 * was uploaded with. Items point at their group by `reference_slot`; the
 * off-chain compositor builds each image URL from it.
 */
export interface IpfsGroup {
  /**
   * At most `common::MAX_STRING_LENGTH` bytes.
   */
  base_uri: string;
  /**
   * At most `common::MAX_EXTENSION_LENGTH` bytes.
   */
  extension: string;
}

/**
 * An item to add with `add_properties`.
 */
export interface ItemParam {
  /**
   * Whether `property_id` counts from the first property this call adds.
   */
  is_new_property: boolean;
  name: string;
  /**
   * The property's index: among the existing properties, or, with
   * `is_new_property`, among the `names` of the same call.
   */
  property_id: number;
}

/**
 * A property's name and item count, without its items.
 */
export interface PropertyHeader {
  item_count: number;
  name: string;
}

/**
 * Emitted by [`handoff`]. The emitting contract address is the event's contract id.
 *
 * Same shape as the Manager's own `AdminChanged`, so indexers decode both
 * with one schema.
 */
export interface AdminChangedEvent {
  name: "AdminChanged";
  data: {
    old_admin: string;
    new_admin: string;
  };
}

/**
 * Errors shared by all module contracts (block `codes::COMMON`).
 */
export const CommonError = {
  /**
   * Operation requires the module to be live (launched).
   */
  7001 : { message: "NotLive" },
  /**
   * Operation is only valid during setup; the module is already live.
   */
  7002 : { message: "AlreadyLive" },
  /**
   * Manager address missing from storage.
   */
  7003 : { message: "ManagerNotSet" },
  /**
   * `CurrentHash` missing from storage.
   */
  7004 : { message: "CurrentHashNotSet" },
  /**
   * `from_hash` does not equal the stored `CurrentHash`.
   */
  7005 : { message: "HashMismatch" },
  /**
   * Manager did not approve this upgrade path.
   */
  7006 : { message: "UpgradeNotApproved" },
  /**
   * Manager has no registry entry for the requested hash.
   */
  7007 : { message: "ImplementationNotFound" },
  /**
   * Module admin missing from storage.
   */
  7008 : { message: "AdminNotSet" },
  /**
   * The Manager's own `CurrentManagerVersion` missing from storage.
   */
  7009 : { message: "VersionNotSet" },
  /**
   * Treasury address missing from storage.
   */
  7010 : { message: "TreasuryNotSet" },
  /**
   * Governor address missing from storage.
   */
  7011 : { message: "GovernorNotSet" },
  /**
   * `migrate` called while the stored layout is already current.
   */
  7012 : { message: "NothingToMigrate" },
  /**
   * `StorageVersion` missing from storage.
   */
  7013 : { message: "StorageVersionNotSet" }
}

/**
 * Emitted by `migrate`.
 */
export interface MigratedEvent {
  name: "Migrated";
  data: {
    from_storage_version?: number;
    to_storage_version?: number;
  };
}

/**
 * Emitted by `apply`. The emitting contract address is the event's contract id.
 */
export interface UpgradedEvent {
  name: "Upgraded";
  data: {
    from_hash: Uint8Array;
    to_hash: Uint8Array;
    version?: string;
  };
}
    export type ContractEvent = PropertyAddedEvent | SeedGeneratedEvent | ProfileUpdatedEvent | SeedsGeneratedEvent | PropertiesResetEvent | MetadataLaunchedEvent | MetadataInitializedEvent | RendererBaseUpdatedEvent | AdminChangedEvent | MigratedEvent | UpgradedEvent;
    