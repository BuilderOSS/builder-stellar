import {Address} from '@stellar/stellar-sdk';

    /**
 * Error Enum: Error
 */
export const Error = {
  3 : { message: "NotInitialized" },
  /**
   * `launch` treasury differs from the treasury wired at construction
   */
  4 : { message: "TreasuryMismatch" },
  10 : { message: "OnePropertyAndItemRequired" },
  11 : { message: "PropertyHasNoItems" },
  12 : { message: "TooManyProperties" },
  13 : { message: "InvalidPropertySelected" },
  /**
   * `regenerate` called while no properties exist
   */
  14 : { message: "NoProperties" },
  /**
   * More than `MAX_ITEMS_PER_CALL` items in one `add_properties` call
   */
  15 : { message: "TooManyItems" },
  /**
   * A paginated/bump `limit` above the allowed cap
   */
  16 : { message: "LimitTooHigh" },
  20 : { message: "OnlyToken" },
  21 : { message: "TokenNotMinted" },
  /**
   * `regenerate` called for a token that already has attributes
   */
  22 : { message: "AlreadySeeded" },
  30 : { message: "Unauthorized" }
}

/**
 * Emitted once when the Manager launches the metadata module (Setup -> Live).
 */
export interface LaunchedEvent {
  name: "Launched";
  data: {
    treasury: string;
  };
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
    owner?: string;
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
 * Errors shared by all module contracts. Codes live in the 9000 range so
 * they never collide with module (11xx-13xx, 3, 30) or manager (10xx) codes.
 */
export const CommonError = {
  /**
   * Operation requires the module to be live (launched).
   */
  9001 : { message: "NotLive" },
  /**
   * Operation is only valid during setup; the module is already live.
   */
  9002 : { message: "AlreadyLive" },
  /**
   * Manager address missing from storage.
   */
  9003 : { message: "ManagerNotSet" },
  /**
   * `CurrentHash` missing from storage.
   */
  9004 : { message: "CurrentHashNotSet" },
  /**
   * `from_hash` does not equal the stored `CurrentHash`.
   */
  9005 : { message: "HashMismatch" },
  /**
   * Manager did not approve this upgrade path.
   */
  9006 : { message: "UpgradeNotApproved" },
  /**
   * Manager has no registry entry for the requested hash.
   */
  9007 : { message: "ImplementationNotFound" },
  /**
   * Owner missing from storage.
   */
  9008 : { message: "OwnerNotSet" },
  /**
   * `CurrentVersion` missing from storage.
   */
  9009 : { message: "VersionNotSet" },
  /**
   * Treasury address missing from storage.
   */
  9010 : { message: "TreasuryNotSet" },
  /**
   * Governor address missing from storage.
   */
  9011 : { message: "GovernorNotSet" }
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
    export type ContractEvent = LaunchedEvent | PropertyAddedEvent | SeedGeneratedEvent | PropertiesResetEvent | ProjectURIUpdatedEvent | DescriptionUpdatedEvent | MetadataInitializedEvent | RendererBaseUpdatedEvent | ContractImageUpdatedEvent | UpgradedEvent | VersionSyncedEvent;
    