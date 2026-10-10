import {Address} from '@stellar/stellar-sdk';

    /**
 * Metadata errors (block `common::error::codes::METADATA`).
 */
export const Error = {
  /**
   * Settings missing (contract not initialized)
   */
  7301 : { message: "NotInitialized" },
  /**
   * `launch` treasury differs from the treasury wired at construction
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
   * More than 16 properties
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
   * A paginated/bump `limit` above `MAX_PAGE`
   */
  7309 : { message: "LimitTooHigh" },
  /**
   * The token does not exist (or has no attributes yet)
   */
  7310 : { message: "TokenNotMinted" },
  /**
   * `regenerate` called for a token that already has attributes
   */
  7311 : { message: "AlreadySeeded" },
  /**
   * A settings string is longer than `common::MAX_STRING_LENGTH`
   */
  7312 : { message: "StringTooLong" }
}

/**
 * Event: PropertyAdded
 */
export interface PropertyAddedEvent {
  name: "PropertyAdded";
  data: {
    property_id: number;
    name?: string;
  };
}

/**
 * Event: SeedGenerated
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
 * Event: PropertiesReset
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
 */
export interface MetadataLaunchedEvent {
  name: "MetadataLaunched";
  data: {
    treasury: string;
  };
}

/**
 * Event: ProjectURIUpdated
 */
export interface ProjectURIUpdatedEvent {
  name: "ProjectURIUpdated";
  data: {
    old_uri?: string;
    new_uri?: string;
  };
}

/**
 * Event: DescriptionUpdated
 */
export interface DescriptionUpdatedEvent {
  name: "DescriptionUpdated";
  data: {
    old_description?: string;
    new_description?: string;
  };
}

/**
 * Event: MetadataInitialized
 */
export interface MetadataInitializedEvent {
  name: "MetadataInitialized";
  data: {
    token: string;
    renderer_base?: string;
    version?: string;
    admin?: string;
    project_uri?: string;
    description?: string;
    contract_image?: string;
  };
}

/**
 * Event: RendererBaseUpdated
 */
export interface RendererBaseUpdatedEvent {
  name: "RendererBaseUpdated";
  data: {
    old_base?: string;
    new_base?: string;
  };
}

/**
 * Event: ContractImageUpdated
 */
export interface ContractImageUpdatedEvent {
  name: "ContractImageUpdated";
  data: {
    old_image?: string;
    new_image?: string;
  };
}

/**
 * Struct: Item
 */
export interface Item {
  name: string;
  reference_slot: number;
}

/**
 * Struct: Property
 */
export interface Property {
  items: Array<Item>;
  name: string;
}

/**
 * Struct: Settings
 */
export interface Settings {
  contract_image: string;
  description: string;
  project_uri: string;
  renderer_base: string;
  token: string;
}

/**
 * Struct: IpfsGroup
 */
export interface IpfsGroup {
  base_uri: string;
  extension: string;
}

/**
 * Struct: ItemParam
 */
export interface ItemParam {
  is_new_property: boolean;
  name: string;
  property_id: number;
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
   * `CurrentVersion` missing from storage.
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

/**
 * Emitted by `sync_version`.
 */
export interface VersionSyncedEvent {
  name: "VersionSynced";
  data: {
    version?: string;
  };
}
    export type ContractEvent = PropertyAddedEvent | SeedGeneratedEvent | SeedsGeneratedEvent | PropertiesResetEvent | MetadataLaunchedEvent | ProjectURIUpdatedEvent | DescriptionUpdatedEvent | MetadataInitializedEvent | RendererBaseUpdatedEvent | ContractImageUpdatedEvent | AdminChangedEvent | MigratedEvent | UpgradedEvent | VersionSyncedEvent;
    