import {Address, xdr} from '@stellar/stellar-sdk';
import {Buffer} from 'buffer';

type Point = Buffer;

    /**
 * Error Enum: TokenError
 */
export const TokenError = {
  /**
   * Batch mint amount is invalid (must be 1-100)
   */
  1101 : { message: "InvalidBatchMintAmount" },
  /**
   * Owner not set in contract storage
   */
  1102 : { message: "OwnerNotSet" },
  /**
   * Minter is not authorized to mint tokens
   */
  1103 : { message: "MintAuthorityNotAllowed" }
}

/**
 * Emitted when multiple tokens are minted in a single batch operation.
 *
 * Supplements the individual Mint events (emitted per token) with a summary
 * of the batch operation, including the total amount and final token ID.
 * Useful for tracking bulk minting operations like initial distribution.
 */
export interface BatchMintEvent {
  name: "BatchMint";
  data: {
    minter: string;
    to: string;
    amount?: number;
    last_token_id?: number;
  };
}

/**
 * Custom event to track minter information during single token mints.
 *
 * OpenZeppelin's standard Mint event doesn't include the minter address, only
 * the recipient. This custom event supplements it by tracking who performed the mint,
 * which is useful for auditing and analytics (e.g., distinguishing owner mints
 * from auction contract mints).
 */
export interface MintWithMinterEvent {
  name: "MintWithMinter";
  data: {
    minter: string;
    to: string;
    token_id?: number;
  };
}

/**
 * Emitted when the token contract is initialized.
 *
 * Contains the initial owner and token metadata. This event is emitted once
 * during contract deployment via the `__constructor` function.
 */
export interface TokenInitializedEvent {
  name: "TokenInitialized";
  data: {
    owner: string;
    uri?: string;
    name?: string;
    symbol?: string;
  };
}

/**
 * Emitted when minting authority is granted or revoked for an address.
 *
 * Tracks changes to mint permissions, including who made the change (always the owner).
 * The owner always has implicit minting authority regardless of this flag.
 */
export interface MintAuthorityChangedEvent {
  name: "MintAuthorityChanged";
  data: {
    authority: string;
    old_enabled?: boolean;
    enabled?: boolean;
    changed_by?: string;
  };
}

/**
 * Storage keys for token-specific instance data.
 *
 * Token metadata (name, symbol, URI) and ownership are stored via OpenZeppelin's
 * Base and Ownable traits. This enum only contains keys for contract-specific data.
 */
 export type TokenKey =
  /**
   * Tracks whether an address has minting authority.
   *
   * Maps `Address -> bool` where `true` means the address can mint tokens.
   * The owner has implicit minting authority without needing an entry here.
   */
  { tag: "MintAuthority"; values: readonly [string] };

/**
 * Event emitted when an account is frozen.
 */
export interface FrozenEvent {
  name: "Frozen";
  data: {
    account: string;
  };
}

/**
 * Event emitted when an account is unfrozen.
 */
export interface UnfrozenEvent {
  name: "Unfrozen";
  data: {
    account: string;
  };
}

/**
 * Error Enum: ComplianceError
 */
export const ComplianceError = {
  /**
   * Indicates an admin operation was invoked before
   * [`storage::set_compliance_config`] established a configuration.
   */
  3600 : { message: "NotConfigured" },
  /**
   * Indicates the target account is frozen.
   */
  3601 : { message: "AccountFrozen" },
  /**
   * Indicates the configured policy returned `false` for the target
   * account.
   */
  3602 : { message: "NotAuthorizedByPolicy" },
  /**
   * Indicates the underlying SAC's `authorized()` view returned `false`
   * for the target account (only reachable when `sac_passthrough` is
   * enabled).
   */
  3603 : { message: "NotAuthorizedBySac" }
}

/**
 * Event emitted when the compliance configuration is set or rotated.
 */
export interface ComplianceConfigChangedEvent {
  name: "ComplianceConfigChanged";
  data: {
    policy?: string | null;
    sac_passthrough?: boolean;
  };
}

/**
 * Compliance configuration written once at construction and rotatable under
 * admin auth thereafter. Stored as an instance storage entry.
 */
export interface ComplianceConfig {
  /**
   * Optional external authorization policy (see
   * [`crate::confidential::compliance::Policy`]). `None` disables the
   * policy gate.
   */
  policy: string | null;
  /**
   * When `true`, the gates additionally consult the underlying SAC's
   * `authorized()` view. Requires the underlying token to be a Stellar
   * Asset Contract — `authorized` is not part of SEP-41, and enabling
   * this flag over a non-SAC underlying makes every gated operation trap
   * (see [`check_sac`]).
   */
  sac_passthrough: boolean;
}

/**
 * Storage keys for the confidential token compliance extension.
 */
 export type ComplianceStorageKey =
  /**
   * Singleton [`ComplianceConfig`]. Instance storage.
   */
  { tag: "Config"; values: void } |
  /**
   * Per-account frozen flag. Persistent storage; only set when an account
   * is frozen and removed on unfreeze.
   */
  { tag: "Frozen"; values: readonly [string] };

/**
 * Event emitted when a confidential account merges its receiving balance
 * into its spendable balance.
 */
export interface MergeEvent {
  name: "Merge";
  data: {
    account: string;
  };
}

/**
 * Event emitted when a deposit moves SEP-41 tokens into a confidential
 * receiving balance.
 */
export interface DepositEvent {
  name: "Deposit";
  data: {
    from: string;
    to: string;
    amount?: bigint;
  };
}

/**
 * Event emitted when a confidential account is registered.
 */
export interface RegisterEvent {
  name: "Register";
  data: {
    account: string;
    auditor_id?: number;
  };
}

/**
 * Event emitted on a confidential transfer.
 */
export interface TransferEvent {
  name: "Transfer";
  data: {
    from: string;
    to: string;
    r_e_point?: Uint8Array;
    v_tilde?: Uint8Array;
    sigma?: Uint8Array;
    b_tilde?: Uint8Array;
    v_tilde_aud_r?: Uint8Array;
    r_tilde_aud_r?: Uint8Array;
    v_tilde_aud_s?: Uint8Array;
    b_tilde_aud_s?: Uint8Array;
  };
}

/**
 * Event emitted on a confidential withdrawal.
 */
export interface WithdrawEvent {
  name: "Withdraw";
  data: {
    from: string;
    to: string;
    amount?: bigint;
    r_e_point?: Uint8Array;
    sigma?: Uint8Array;
    b_tilde?: Uint8Array;
    b_tilde_aud_s?: Uint8Array;
  };
}

/**
 * Event emitted when the auditor registry contract address is set or
 * rotated. May fire more than once over the lifetime of the contract.
 */
export interface AuditorSetEvent {
  name: "AuditorSet";
  data: {
    auditor?: string;
  };
}

/**
 * Event emitted when an spender is set up.
 */
export interface SetSpenderEvent {
  name: "SetSpender";
  data: {
    account: string;
    spender: string;
    live_until_ledger?: number;
    r_e_point?: Uint8Array;
    sigma?: Uint8Array;
    b_tilde?: Uint8Array;
    v_tilde_aud_s?: Uint8Array;
    b_tilde_aud_s?: Uint8Array;
  };
}

/**
 * Event emitted when the verifier registry contract address is set or
 * rotated. May fire more than once over the lifetime of the contract.
 */
export interface VerifierSetEvent {
  name: "VerifierSet";
  data: {
    verifier?: string;
  };
}

/**
 * Event emitted when an spender is revoked.
 */
export interface RevokeSpenderEvent {
  name: "RevokeSpender";
  data: {
    account: string;
    spender: string;
    r_e_point?: Uint8Array;
    sigma?: Uint8Array;
    b_tilde?: Uint8Array;
    v_tilde_aud_s?: Uint8Array;
    b_tilde_aud_s?: Uint8Array;
  };
}

/**
 * Event emitted on an spender transfer.
 */
export interface SpenderTransferEvent {
  name: "SpenderTransfer";
  data: {
    spender: string;
    from: string;
    to: string;
    r_e_point?: Uint8Array;
    v_tilde?: Uint8Array;
    sigma_a?: Uint8Array;
    v_tilde_aud_r?: Uint8Array;
    r_tilde_aud_r?: Uint8Array;
    v_tilde_aud_s?: Uint8Array;
    a_tilde_aud_s?: Uint8Array;
  };
}

/**
 * Event emitted when the contract's compressed `addr_f` field is computed and
 * stored. Expected to fire exactly once, from the contract's constructor.
 */
export interface AddressAsFieldSetEvent {
  name: "AddressAsFieldSet";
  data: {
    address_as_field?: Uint8Array;
  };
}

/**
 * Event emitted when the SEP-41 token address is set. Expected to fire
 * exactly once, from the contract's constructor.
 */
export interface UnderlyingAssetSetEvent {
  name: "UnderlyingAssetSet";
  data: {
    underlying_asset?: string;
  };
}

/**
 * Error Enum: ConfidentialTokenError
 */
export const ConfidentialTokenError = {
  /**
   * Indicates `account` already has a confidential account registered.
   */
  3500 : { message: "AccountAlreadyRegistered" },
  /**
   * Indicates the target account is not registered.
   */
  3501 : { message: "AccountNotRegistered" },
  /**
   * Indicates a public amount argument is negative.
   */
  3502 : { message: "NegativeAmount" },
  /**
   * Indicates a delegation already exists for `(account, spender)`.
   */
  3503 : { message: "DelegationAlreadyExists" },
  /**
   * Indicates no delegation exists for `(account, spender)`.
   */
  3504 : { message: "DelegationNotFound" },
  /**
   * Indicates the delegation has expired
   * (`ledger.sequence() > live_until_ledger`).
   */
  3505 : { message: "DelegationExpired" },
  /**
   * Indicates the verifier rejected the accompanying proof.
   */
  3506 : { message: "InvalidProof" },
  /**
   * Indicates the `data` payload could not be decoded into the expected
   * `…Payload` struct.
   */
  3507 : { message: "InvalidData" },
  /**
   * Indicates the contract has not been constructed: the SEP-41 token
   * address is missing.
   */
  3508 : { message: "UnderlyingAssetNotSet" },
  /**
   * Indicates the contract has not been constructed: the verifier
   * address is missing.
   */
  3509 : { message: "VerifierNotSet" },
  /**
   * Indicates the contract has not been constructed: the auditor
   * registry address is missing.
   */
  3510 : { message: "AuditorNotSet" },
  /**
   * Indicates the contract has not been constructed: the `addr_f` field is
   * missing.
   */
  3511 : { message: "AddressAsFieldNotSet" },
  /**
   * Indicates the `addr_f` field has already been set; re-initialization is
   * forbidden.
   */
  3512 : { message: "AddressAsFieldAlreadySet" },
  /**
   * Indicates the SEP-41 token address has already been set;
   * re-initialization is forbidden.
   */
  3513 : { message: "UnderlyingAssetAlreadySet" },
  /**
   * Indicates a prover-supplied 32-byte field representative or Grumpkin
   * coordinate is not a canonical `Bn254Fr` value (`≥ r`). The Soroban
   * host's `bn254_fr_*` deserialiser silently reduces non-canonical
   * encodings, so the contract enforces canonicality at the verifier
   * boundary to keep stored state and emitted events byte-unique per
   * logical value.
   */
  3514 : { message: "NonCanonicalEncoding" }
}

/**
 * Error Enum: AuditorError
 */
export const AuditorError = {
  /**
   * Indicates the `auditor_id` is already registered.
   */
  3300 : { message: "AuditorAlreadyRegistered" },
  /**
   * Indicates no key is registered under `auditor_id`.
   */
  3301 : { message: "AuditorNotRegistered" },
  /**
   * Indicates the point is the identity `(0, 0)`, which is forbidden as an
   * auditor public key.
   */
  3302 : { message: "IdentityPoint" },
  /**
   * Indicates the point is non-canonical or does not satisfy
   * `y² ≡ x³ - 17 (mod r)`.
   */
  3303 : { message: "PointNotOnCurve" }
}

/**
 * Event emitted when an auditor key is rotated.
 */
export interface AuditorRotatedEvent {
  name: "AuditorRotated";
  data: {
    auditor_id: number;
    old_point?: Uint8Array;
    new_point?: Uint8Array;
  };
}

/**
 * Event emitted when a new auditor key is registered.
 */
export interface AuditorRegisteredEvent {
  name: "AuditorRegistered";
  data: {
    auditor_id: number;
    point?: Uint8Array;
  };
}

/**
 * Storage keys for the auditor registry.
 */
 export type AuditorStorageKey =
  /**
   * Maps `auditor_id` to its Grumpkin public key encoded as `(x, y)`.
   */
  { tag: "Key"; values: readonly [number] };

/**
 * Envelope decoded from the `data: Bytes` argument of
 * [`crate::confidential::ConfidentialToken::register`].
 */
export interface RegisterData {
  payload: RegisterPayload;
  proof: Uint8Array;
}

/**
 * Envelope decoded from the `data: Bytes` argument of
 * [`crate::confidential::ConfidentialToken::confidential_transfer`].
 */
export interface TransferData {
  payload: TransferPayload;
  proof: Uint8Array;
}

/**
 * Envelope decoded from the `data: Bytes` argument of
 * [`crate::confidential::ConfidentialToken::withdraw`].
 */
export interface WithdrawData {
  payload: WithdrawPayload;
  proof: Uint8Array;
}

/**
 * Envelope decoded from the `data: Bytes` argument of
 * [`crate::confidential::ConfidentialToken::set_spender`].
 */
export interface SetSpenderData {
  payload: SetSpenderPayload;
  proof: Uint8Array;
}

/**
 * Payload for [`crate::confidential::ConfidentialToken::register`].
 */
export interface RegisterPayload {
  pvk: Point;
  y: Point;
}

/**
 * Payload for
 * [`crate::confidential::ConfidentialToken::confidential_transfer`].
 */
export interface TransferPayload {
  b_tilde: Uint8Array;
  b_tilde_aud_s: Uint8Array;
  c_spend_new: Point;
  c_transfer: Point;
  r_e_point: Point;
  r_tilde_aud_r: Uint8Array;
  sigma: Uint8Array;
  v_tilde: Uint8Array;
  v_tilde_aud_r: Uint8Array;
  v_tilde_aud_s: Uint8Array;
}

/**
 * Payload for [`crate::confidential::ConfidentialToken::withdraw`].
 */
export interface WithdrawPayload {
  b_tilde: Uint8Array;
  b_tilde_aud_s: Uint8Array;
  c_spend_new: Point;
  r_e_point: Point;
  sigma: Uint8Array;
}

/**
 * Envelope decoded from the `data: Bytes` argument of
 * [`crate::confidential::ConfidentialToken::revoke_spender`].
 */
export interface RevokeSpenderData {
  payload: RevokeSpenderPayload;
  proof: Uint8Array;
}

/**
 * Payload for [`crate::confidential::ConfidentialToken::set_spender`].
 */
export interface SetSpenderPayload {
  a_tilde: Uint8Array;
  b_tilde: Uint8Array;
  b_tilde_aud_s: Uint8Array;
  c_a: Point;
  c_spend_new: Point;
  escrowed_dvk: Point;
  r_e_point: Point;
  sigma: Uint8Array;
  sigma_a: Uint8Array;
  v_tilde_aud_s: Uint8Array;
}

/**
 * On-chain spender delegation record.
 */
export interface SpenderDelegation {
  /**
   * Poseidon-encrypted allowance scalar `ã`.
   */
  a_tilde: Uint8Array;
  /**
   * Allowance commitment `C_a = Com(v_a, r_a)`.
   */
  allowance_commitment: Point;
  /**
   * Per-delegation salt `σ_a`.
   */
  allowance_salt: Uint8Array;
  /**
   * ECDH escrow of `dvk_i` under the spender's spending key.
   */
  escrowed_dvk: Point;
  /**
   * The ledger number at which the delegation expires. Spending is
   * authorized while `ledger.sequence() <= live_until_ledger`.
   */
  live_until_ledger: number;
}

/**
 * On-chain confidential account record.
 */
export interface ConfidentialAccount {
  /**
   * Index of the auditor key in the auditor registry.
   */
  auditor_id: number;
  /**
   * Receiving balance commitment `C_receive`.
   */
  receiving_commitment: Point;
  /**
   * Spendable balance commitment `C_spend`.
   */
  spendable_commitment: Point;
  /**
   * `Y = sk · H`, the Grumpkin spending public key.
   */
  spending_public_key: Point;
  /**
   * `PVK = vk · H`, the Grumpkin viewing public key.
   */
  viewing_public_key: Point;
}

/**
 * Envelope decoded from the `data: Bytes` argument of
 * [`crate::confidential::ConfidentialToken::confidential_transfer_from`].
 */
export interface SpenderTransferData {
  payload: SpenderTransferPayload;
  proof: Uint8Array;
}

/**
 * Payload for [`crate::confidential::ConfidentialToken::revoke_spender`].
 */
export interface RevokeSpenderPayload {
  b_tilde: Uint8Array;
  b_tilde_aud_s: Uint8Array;
  c_spend_new: Point;
  r_e_point: Point;
  sigma: Uint8Array;
  v_tilde_aud_s: Uint8Array;
}

/**
 * Payload for
 * [`crate::confidential::ConfidentialToken::confidential_transfer_from`].
 */
export interface SpenderTransferPayload {
  a_tilde_aud_s: Uint8Array;
  a_tilde_new: Uint8Array;
  c_a_new: Point;
  c_transfer: Point;
  r_e_point: Point;
  r_tilde_aud_r: Uint8Array;
  sigma_a_new: Uint8Array;
  v_tilde: Uint8Array;
  v_tilde_aud_r: Uint8Array;
  v_tilde_aud_s: Uint8Array;
}

/**
 * Storage keys for the confidential token.
 */
 export type ConfidentialTokenStorageKey =
  /**
   * SEP-41 token whose balances back the contract. Instance storage.
   */
  { tag: "UnderlyingAsset"; values: void } |
  /**
   * Confidential verifier contract used for `verify_proof`. Instance
   * storage.
   */
  { tag: "Verifier"; values: void } |
  /**
   * Confidential auditor contract used for `get_key`. Instance storage.
   */
  { tag: "Auditor"; values: void } |
  /**
   * The current contract address as a 32-byte big-endian `Bn254Fr`
   * representative. Instance storage.
   */
  { tag: "AddressAsField"; values: void } |
  /**
   * Per-account `ConfidentialAccount` entry, keyed by the owner address.
   * Persistent storage.
   */
  { tag: "Account"; values: readonly [string] } |
  /**
   * Per-`(owner, spender)` `SpenderDelegation` entry. Persistent storage.
   * Persists until explicitly revoked even when `live_until_ledger` has
   * passed.
   */
  { tag: "Delegation"; values: readonly [string, string] };

/**
 * Identifier of a zero-knowledge circuit whose verification key is stored in
 * the registry. The numeric values are part of the on-chain interface and
 * MUST NOT change.
 */
export enum CircuitType {
  /**
   * Enum Case: Register
   */
  Register = 0,
  /**
   * Enum Case: Withdraw
   */
  Withdraw = 1,
  /**
   * Enum Case: Transfer
   */
  Transfer = 2,
  /**
   * Enum Case: SpenderTransfer
   */
  SpenderTransfer = 3,
  /**
   * Enum Case: SetSpender
   */
  SetSpender = 4,
  /**
   * Enum Case: RevokeSpender
   */
  RevokeSpender = 5
}

/**
 * Error Enum: VerifierError
 */
export const VerifierError = {
  /**
   * Indicates `circuit_type` already has a verification key registered.
   */
  3400 : { message: "VerificationKeyAlreadyRegistered" },
  /**
   * Indicates no verification key is registered under `circuit_type`.
   */
  3401 : { message: "VerificationKeyNotRegistered" },
  /**
   * Indicates the proof failed UltraHonk verification.
   */
  3402 : { message: "InvalidProof" }
}

/**
 * Event emitted when a verification key is updated.
 */
export interface VerificationKeyUpdatedEvent {
  name: "VerificationKeyUpdated";
  data: {
    circuit_type: CircuitType;
    old_verification_key?: Uint8Array;
    new_verification_key?: Uint8Array;
  };
}

/**
 * Event emitted when a new verification key is registered.
 */
export interface VerificationKeyRegisteredEvent {
  name: "VerificationKeyRegistered";
  data: {
    circuit_type: CircuitType;
    verification_key?: Uint8Array;
  };
}

/**
 * Storage keys for the verifier registry.
 */
 export type VerifierStorageKey =
  /**
   * Maps [`CircuitType`] to its serialized UltraHonk verification key.
   */
  { tag: "VerificationKey"; values: readonly [CircuitType] };

/**
 * Struct: OwnerTokensKey
 */
export interface OwnerTokensKey {
  index: number;
  owner: string;
}

/**
 * Storage keys for the data associated with the enumerable extension of
 * `NonFungibleToken`
 */
 export type NFTEnumerableStorageKey =
  { tag: "TotalSupply"; values: void } |
  { tag: "OwnerTokens"; values: readonly [OwnerTokensKey] } |
  { tag: "OwnerTokensIndex"; values: readonly [number] } |
  { tag: "GlobalTokens"; values: readonly [number] } |
  { tag: "GlobalTokensIndex"; values: readonly [number] };

/**
 * Event emitted when consecutive tokens are minted.
 */
export interface ConsecutiveMintEvent {
  name: "ConsecutiveMint";
  data: {
    to: string;
    from_token_id?: number;
    to_token_id?: number;
  };
}

/**
 * Storage keys for the data associated with the consecutive extension of
 * `NonFungibleToken`
 */
 export type NFTConsecutiveStorageKey =
  { tag: "Approval"; values: readonly [number] } |
  { tag: "Owner"; values: readonly [number] } |
  { tag: "OwnershipBucket"; values: readonly [number] } |
  { tag: "BurnedToken"; values: readonly [number] };

/**
 * Event emitted when a token is burned.
 */
export interface BurnEvent {
  name: "Burn";
  data: {
    from: string;
    token_id?: number;
  };
}

/**
 * Event emitted when token royalty is set.
 */
export interface SetTokenRoyaltyEvent {
  name: "SetTokenRoyalty";
  data: {
    receiver: string;
    token_id: number;
    basis_points?: number;
  };
}

/**
 * Event emitted when default royalty is set.
 */
export interface SetDefaultRoyaltyEvent {
  name: "SetDefaultRoyalty";
  data: {
    receiver: string;
    basis_points?: number;
  };
}

/**
 * Event emitted when token royalty is removed.
 */
export interface RemoveTokenRoyaltyEvent {
  name: "RemoveTokenRoyalty";
  data: {
    token_id: number;
  };
}

/**
 * Storage container for royalty information
 */
export interface RoyaltyInfo {
  basis_points: number;
  receiver: string;
}

/**
 * Storage keys for royalty data
 */
 export type NFTRoyaltiesStorageKey =
  { tag: "DefaultRoyalty"; values: void } |
  { tag: "TokenRoyalty"; values: readonly [number] };

/**
 * Event emitted when a token is minted.
 */
export interface MintEvent {
  name: "Mint";
  data: {
    to: string;
    token_id?: number;
  };
}

/**
 * Event emitted when an approval is granted.
 */
export interface ApproveEvent {
  name: "Approve";
  data: {
    approver: string;
    token_id: number;
    approved?: string;
    live_until_ledger?: number;
  };
}

/**
 * Event emitted when a token is transferred.
 *
 * Note: renamed from "TransferEvent" to avoid a collision with another generated name.
 */
export interface TransferEvent2 {
  name: "Transfer";
  data: {
    from: string;
    to: string;
    token_id?: number;
  };
}

/**
 * Event emitted when approval for all tokens is granted.
 */
export interface ApproveForAllEvent {
  name: "ApproveForAll";
  data: {
    owner: string;
    operator?: string;
    live_until_ledger?: number;
  };
}

/**
 * Error Enum: NonFungibleTokenError
 */
export const NonFungibleTokenError = {
  /**
   * Indicates a non-existent `token_id`.
   */
  200 : { message: "NonExistentToken" },
  /**
   * Indicates an error related to the ownership over a particular token.
   * Used in transfers.
   */
  201 : { message: "IncorrectOwner" },
  /**
   * Indicates a failure with the `operator`s approval. Used in transfers.
   */
  202 : { message: "InsufficientApproval" },
  /**
   * Indicates a failure with the `approver` of a token to be approved. Used
   * in approvals.
   */
  203 : { message: "InvalidApprover" },
  /**
   * Indicates an invalid value for `live_until_ledger` when setting
   * approvals.
   */
  204 : { message: "InvalidLiveUntilLedger" },
  /**
   * Indicates overflow when adding two values
   */
  205 : { message: "MathOverflow" },
  /**
   * Indicates all possible `token_id`s are already in use.
   */
  206 : { message: "TokenIDsAreDepleted" },
  /**
   * Indicates an invalid amount to batch mint in `consecutive` extension.
   */
  207 : { message: "InvalidAmount" },
  /**
   * Indicates the token does not exist in owner's list.
   */
  208 : { message: "TokenNotFoundInOwnerList" },
  /**
   * Indicates the token does not exist in global list.
   */
  209 : { message: "TokenNotFoundInGlobalList" },
  /**
   * Indicates access to unset metadata.
   */
  210 : { message: "UnsetMetadata" },
  /**
   * Indicates the length of the base URI exceeds the maximum allowed.
   */
  211 : { message: "BaseUriMaxLenExceeded" },
  /**
   * Indicates the royalty amount is higher than 10_000 (100%) basis points.
   */
  212 : { message: "InvalidRoyaltyAmount" },
  /**
   * Indicates the length of the name exceeds the maximum allowed.
   */
  213 : { message: "NameMaxLenExceeded" },
  /**
   * Indicates the length of the symbol exceeds the maximum allowed.
   */
  214 : { message: "SymbolMaxLenExceeded" }
}

/**
 * Union: NFTSequentialStorageKey
 */
 export type NFTSequentialStorageKey =
  { tag: "TokenIdCounter"; values: void };

/**
 * Storage container for token metadata
 */
export interface Metadata {
  base_uri: string;
  name: string;
  symbol: string;
}

/**
 * Storage container for the token for which an approval is granted
 * and the ledger number at which this approval expires.
 */
export interface ApprovalData {
  approved: string;
  live_until_ledger: number;
}

/**
 * Storage keys for the data associated with `NonFungibleToken`
 */
 export type NFTStorageKey =
  { tag: "Owner"; values: readonly [number] } |
  { tag: "Balance"; values: readonly [string] } |
  { tag: "Approval"; values: readonly [number] } |
  { tag: "ApprovalForAll"; values: readonly [string, string] } |
  { tag: "Metadata"; values: void };

/**
 * Event emitted when a module is added to compliance.
 */
export interface ModuleAddedEvent {
  name: "ModuleAdded";
  data: {
    hook: ComplianceHook;
    module?: string;
  };
}

/**
 * Describes who initiated a transfer and under what authority, so each
 * compliance module can decide whether its policy applies.
 *
 * Privileged operations (`forced_transfer`, `recover_balance`) deliberately
 * bypass investor-facing policy: a sanctions rule should not block a
 * court-ordered seizure or an account recovery the admin is consciously
 * executing. At the same time, bookkeeping modules must still observe the
 * movement or their records drift from reality. Passing the kind into the
 * hook makes that decision explicit and per-module: a policy module exempts
 * the privileged kinds from its checks, while an accounting module updates
 * its books for every kind.
 *
 * The two privileged kinds differ in what happens to the tokens. A
 * [`TransferKind::Forced`] transfer is a seizure: the tokens leave the
 * holder, so wallet-bound module state (e.g. a lock schedule) is consumed
 * along with them. A [`TransferKind::Recovery`] transfer is a wallet
 * migration: the same investor continues on a new wallet, so wallet-bound
 * state should move to th
 */
 export type TransferKind =
  /**
   * The holder moves its own tokens.
   */
  { tag: "Standard"; values: void } |
  /**
   * A delegate moves the holder's tokens via `transfer_from`; carries the
   * delegate (spender) address.
   */
  { tag: "Delegated"; values: readonly [string] } |
  /**
   * A privileged operation seizes the tokens (`forced_transfer`): the
   * tokens leave the holder for another party. Policy modules should
   * generally exempt this kind; bookkeeping must still be applied, and
   * wallet-bound restrictions are consumed with the departing tokens.
   */
  { tag: "Forced"; values: void } |
  /**
   * A privileged operation migrates a lost wallet's balance to the same
   * investor's new wallet (`recover_balance`). Policy modules should
   * generally exempt this kind; bookkeeping must still be applied, and
   * wallet-bound state (e.g. lock schedules) should move to the
   * destination wallet.
   */
  { tag: "Recovery"; values: void };

/**
 * Event emitted when a module is removed from compliance.
 */
export interface ModuleRemovedEvent {
  name: "ModuleRemoved";
  data: {
    hook: ComplianceHook;
    module?: string;
  };
}

/**
 * Hook types for modular compliance system.
 *
 * One hook exists per token operation, invoked after the operation's state
 * changes are applied but within the same transaction. A module enforces its
 * policy by panicking from the hook, which reverts the entire operation
 * atomically, and records whatever bookkeeping it needs otherwise.
 */
 export type ComplianceHook =
  /**
   * Called when tokens are transferred from one wallet to another.
   * Modules registered for this hook can reject the transfer (by
   * panicking) and update their state based on transfer events.
   */
  { tag: "Transferred"; values: void } |
  /**
   * Called when tokens are created/minted to a wallet. Modules registered
   * for this hook can reject the mint (by panicking) and update their
   * state based on minting events.
   */
  { tag: "Created"; values: void } |
  /**
   * Called when tokens are destroyed/burned from a wallet. Modules
   * registered for this hook can reject the burn (by panicking) and update
   * their state based on burning events.
   */
  { tag: "Destroyed"; values: void };

/**
 * A point-in-time view of one account, captured as of *before* the operation
 * that triggered the hook.
 *
 * Soroban forbids reentrancy, and the token contract is still on the call
 * stack while a hook runs, so a module cannot call back into the token to
 * read a balance. The snapshot carries that state into the hook instead, so a
 * module can reason about a wallet's holdings without a balance mirror of its
 * own.
 *
 * `balance` and `frozen` are measured at the same instant, before the
 * operation is applied. `balance - frozen` is the wallet's free (movable)
 * amount. The hooks run after the operation's state changes, so the snapshot
 * is what gives a module a stable pre-operation view to validate against.
 */
export interface AccountSnapshot {
  /**
   * The wallet address this snapshot describes.
   */
  address: string;
  /**
   * The wallet's total token balance, before the operation.
   */
  balance: bigint;
  /**
   * The partially-frozen portion of `balance`, before the operation.
   */
  frozen: bigint;
}

/**
 * Error Enum: ComplianceError
 */
export const ComplianceHookError = {
  /**
   * Indicates a module is already registered for this hook.
   */
  360 : { message: "ModuleAlreadyRegistered" },
  /**
   * Indicates a module is not registered for this hook.
   */
  361 : { message: "ModuleNotRegistered" },
  /**
   * Indicates a module bound is exceeded.
   */
  362 : { message: "ModuleBoundExceeded" },
  /**
   * Indicates a token is not bound to this compliance contract.
   */
  363 : { message: "TokenNotBound" }
}

/**
 * Emitted when the per-identity maximum balance for a token is configured.
 */
export interface MaxBalanceSetEvent {
  name: "MaxBalanceSet";
  data: {
    token: string;
    max?: bigint;
  };
}

/**
 * Emitted when a tracked identity balance is pre-seeded during the
 * migration preset phase.
 */
export interface IdBalancePresetEvent {
  name: "IdBalancePreset";
  data: {
    token: string;
    identity: string;
    balance?: bigint;
  };
}

/**
 * Emitted when the preset phase for a token is finalized.
 */
export interface PresetCompletedEvent {
  name: "PresetCompleted";
  data: {
    token: string;
  };
}

/**
 * Union: MaxBalanceStorageKey
 */
 export type MaxBalanceStorageKey =
  /**
   * Per-token cap on the aggregate balance any single identity may hold.
   */
  { tag: "MaxBalance"; values: readonly [string] } |
  /**
   * Per-(token, identity) aggregate balance tracked by this module.
   */
  { tag: "IdBalance"; values: readonly [string, string] } |
  /**
   * Per-token flag indicating that the preset migration phase is finalized.
   */
  { tag: "PresetCompleted"; values: readonly [string] };

/**
 * Emitted when the per-token supply cap is configured.
 */
export interface SupplyLimitSetEvent {
  name: "SupplyLimitSet";
  data: {
    token: string;
    limit?: bigint;
  };
}

/**
 * Emitted when the preset phase for a token is finalized.
 *
 * Note: renamed from "PresetCompletedEvent" to avoid a collision with another generated name.
 */
export interface PresetCompletedEvent2 {
  name: "PresetCompleted";
  data: {
    token: string;
  };
}

/**
 * Emitted whenever the tracked supply counter for a token changes.
 */
export interface SupplyCountUpdatedEvent {
  name: "SupplyCountUpdated";
  data: {
    token: string;
    supply?: bigint;
  };
}

/**
 * Union: SupplyLimitStorageKey
 */
 export type SupplyLimitStorageKey =
  /**
   * Per-token cap on the tracked circulating supply.
   */
  { tag: "SupplyLimit"; values: readonly [string] } |
  /**
   * Per-token running supply counter maintained by this module.
   */
  { tag: "SupplyCount"; values: readonly [string] } |
  /**
   * Per-token flag indicating that the preset migration phase is finalized.
   */
  { tag: "PresetCompleted"; values: readonly [string] };

/**
 * Emitted when a country is added to the allowlist.
 */
export interface CountryAllowedEvent {
  name: "CountryAllowed";
  data: {
    token: string;
    country?: number;
  };
}

/**
 * Emitted when a country is removed from the allowlist.
 */
export interface CountryUnallowedEvent {
  name: "CountryUnallowed";
  data: {
    token: string;
    country?: number;
  };
}

/**
 * Union: CountryAllowStorageKey
 */
 export type CountryAllowStorageKey =
  /**
   * Per-(token, country) allowlist membership entry.
   */
  { tag: "AllowedCountry"; values: readonly [string, number] };

/**
 * Emitted when an address is added to the transfer allowlist.
 */
export interface UserAllowedEvent {
  name: "UserAllowed";
  data: {
    token: string;
    user?: string;
  };
}

/**
 * Emitted when an address is removed from the transfer allowlist.
 */
export interface UserDisallowedEvent {
  name: "UserDisallowed";
  data: {
    token: string;
    user?: string;
  };
}

/**
 * Union: TransferAllowStorageKey
 */
 export type TransferAllowStorageKey =
  /**
   * Per-(token, user) allowlist membership entry.
   */
  { tag: "AllowedUser"; values: readonly [string, string] };

/**
 * Emitted when a country is added to the restriction list.
 */
export interface CountryRestrictedEvent {
  name: "CountryRestricted";
  data: {
    token: string;
    country?: number;
  };
}

/**
 * Emitted when a country is removed from the restriction list.
 */
export interface CountryUnrestrictedEvent {
  name: "CountryUnrestricted";
  data: {
    token: string;
    country?: number;
  };
}

/**
 * Union: CountryRestrictStorageKey
 */
 export type CountryRestrictStorageKey =
  /**
   * Per-(token, country) restriction membership entry.
   */
  { tag: "RestrictedCountry"; values: readonly [string, number] };

/**
 * Emitted when the lockup period for a token is configured.
 */
export interface LockupPeriodSetEvent {
  name: "LockupPeriodSet";
  data: {
    token: string;
    period?: number;
  };
}

/**
 * Emitted when the preset phase for a token is finalized.
 *
 * Note: renamed from "PresetCompletedEvent" to avoid a collision with another generated name.
 */
export interface PresetCompletedEvent3 {
  name: "PresetCompleted";
  data: {
    token: string;
  };
}

/**
 * Emitted when a wallet's locks are pre-seeded during the migration preset
 * phase.
 */
export interface LockupStatePresetEvent {
  name: "LockupStatePreset";
  data: {
    token: string;
    wallet: string;
    total_locked?: bigint;
  };
}

/**
 * A single mint-created lock: `amount` tokens that release once the
 * ledger sequence reaches `release_ledger`.
 */
export interface LockedTokens {
  amount: bigint;
  release_ledger: number;
}

/**
 * The lock entries tracked for one `(token, wallet)` pair, together with
 * their running aggregate. `total_locked` always equals the sum of the
 * `locks` amounts, including entries whose release time has already
 * passed: expired entries are consumed lazily by transfers and burns and
 * pruned by subsequent mints, not by the passage of time.
 */
export interface LockedDetails {
  locks: Array<LockedTokens>;
  total_locked: bigint;
}

/**
 * Union: InitialLockupPeriodStorageKey
 */
 export type InitialLockupPeriodStorageKey =
  /**
   * Per-token lockup duration in ledgers applied to minted tokens.
   */
  { tag: "LockupPeriod"; values: readonly [string] } |
  /**
   * Per-(token, wallet) lock entries and their aggregate.
   */
  { tag: "LockedDetails"; values: readonly [string, string] } |
  /**
   * Per-token flag indicating that the preset migration phase is
   * finalized.
   */
  { tag: "PresetCompleted"; values: readonly [string] };

/**
 * Emitted when a time-window limit is added or updated.
 */
export interface TimeTransferLimitSetEvent {
  name: "TimeTransferLimitSet";
  data: {
    token: string;
    limit_duration?: number;
    limit_value?: bigint;
  };
}

/**
 * Emitted when a time-window limit is removed.
 */
export interface TimeTransferLimitRemovedEvent {
  name: "TimeTransferLimitRemoved";
  data: {
    token: string;
    limit_duration?: number;
  };
}

/**
 * A single time-window limit configured for a token: at most `limit_value`
 * tokens may be sent within a window lasting `limit_duration` ledgers. A
 * window opens with the first transfer after the previous one elapsed;
 * per-identity consumption against the cap is tracked by
 * [`TransferCounter`].
 */
export interface TransferLimit {
  limit_duration: number;
  limit_value: bigint;
}

/**
 * The cumulative volume one identity has sent within its currently active
 * window: `value` accumulates against the matching [`TransferLimit`]'s cap
 * until the ledger sequence reaches `deadline` (the moment the window
 * ends), after which the next transfer restarts the counter for a fresh
 * window.
 *
 * An identity will/may have multiple active counters at once if
 * multiple limits are configured for the token, one for each distinct
 * window duration.
 */
export interface TransferCounter {
  deadline: number;
  value: bigint;
}

/**
 * Storage key fields for a per-(token, identity, window) counter entry.
 */
export interface TransferCounterKey {
  identity: string;
  limit_duration: number;
  token: string;
}

/**
 * Union: TimeTransfersLimitsStorageKey
 */
 export type TimeTransfersLimitsStorageKey =
  /**
   * Per-token list of configured time-window limits.
   */
  { tag: "Limits"; values: readonly [string] } |
  /**
   * Per-(token, identity, window) cumulative transfer counter.
   */
  { tag: "Counter"; values: readonly [TransferCounterKey] };

/**
 * Error Enum: ComplianceModuleError
 */
export const ComplianceModuleError = {
  /**
   * An amount argument is negative when it must be non-negative.
   */
  390 : { message: "InvalidAmount" },
  /**
   * Arithmetic overflow in a checked addition.
   */
  391 : { message: "MathOverflow" },
  /**
   * Arithmetic underflow in a checked subtraction.
   */
  392 : { message: "MathUnderflow" },
  /**
   * A transfer or mint would push an identity's aggregate balance above the
   * configured maximum.
   */
  393 : { message: "MaxBalanceExceeded" },
  /**
   * A mint would push the tracked supply above the configured limit.
   */
  394 : { message: "SupplyLimitExceeded" },
  /**
   * A preset operation was attempted after the preset phase has been
   * finalized.
   */
  395 : { message: "PresetAlreadyCompleted" },
  /**
   * The identity registry storage address has not been configured.
   */
  396 : { message: "IdentityRegistryNotSet" },
  /**
   * The two parallel arrays in a batch call have different lengths.
   */
  397 : { message: "BatchSizeMismatch" },
  /**
   * No authorized compliance dispatcher has been bound for the given
   * token.
   */
  398 : { message: "ComplianceNotSet" },
  /**
   * A transfer or burn would consume more unlocked tokens than the sender
   * holds.
   */
  399 : { message: "InsufficientUnlockedBalance" },
  /**
   * A transfer would push the sender identity's cumulative volume above a
   * configured time-window limit.
   */
  401 : { message: "TransferLimitExceeded" },
  /**
   * Adding another time-window limit would exceed the per-token bound.
   */
  402 : { message: "LimitBoundExceeded" },
  /**
   * No time-window limit exists for the given window duration.
   */
  403 : { message: "LimitNotFound" },
  /**
   * The transfer recipient's country is not on the allowlist.
   */
  404 : { message: "CountryNotAllowed" },
  /**
   * The transfer recipient's country is on the restriction list.
   */
  405 : { message: "CountryRestricted" },
  /**
   * Neither transfer party is on the allowlist.
   */
  406 : { message: "UserNotAllowed" },
  /**
   * A mint or preset would push a wallet's lock entries above the
   * per-wallet bound.
   */
  407 : { message: "LockBoundExceeded" }
}

/**
 * Union: ComplianceModuleStorageKey
 */
 export type ComplianceModuleStorageKey =
  /**
   * The IRS contract address for a specific token.
   */
  { tag: "Registry"; values: readonly [string] } |
  /**
   * The authorized compliance dispatcher for a specific token. Used by
   * state-mutating modules to authenticate their hook callers.
   */
  { tag: "Compliance"; values: readonly [string] };

/**
 * Storage keys for the modular compliance contract.
 */
 export type ComplianceDataKey =
  /**
   * Maps ComplianceHook -> `Vec<Address>` for registered modules
   */
  { tag: "HookModules"; values: readonly [ComplianceHook] };

/**
 * Error codes for document management operations.
 */
export const DocumentError = {
  /**
   * The specified document was not found.
   */
  380 : { message: "DocumentNotFound" },
  /**
   * Maximum number of documents has been reached.
   */
  381 : { message: "MaxDocumentsReached" },
  /**
   * The URI exceeds the maximum allowed length.
   */
  382 : { message: "UriTooLong" }
}

/**
 * Event emitted when a document is removed.
 */
export interface DocumentRemovedEvent {
  name: "DocumentRemoved";
  data: {
    name: Uint8Array;
  };
}

/**
 * Event emitted when a document is updated (added or modified).
 */
export interface DocumentUpdatedEvent {
  name: "DocumentUpdated";
  data: {
    name: Uint8Array;
    uri?: string;
    document_hash?: Uint8Array;
    timestamp?: bigint;
  };
}

/**
 * Represents a document with its metadata.
 */
export interface Document {
  /**
   * The hash of the document contents.
   */
  document_hash: Uint8Array;
  /**
   * Timestamp when the document was last modified.
   */
  timestamp: bigint;
  /**
   * The URI where the document can be accessed.
   */
  uri: string;
}

/**
 * Storage keys for document management.
 */
 export type DocumentStorageKey =
  /**
   * Maps document name to its global index.
   */
  { tag: "Index"; values: readonly [Uint8Array] } |
  /**
   * Maps bucket index to a vector of (name, document) tuples.
   */
  { tag: "Bucket"; values: readonly [number] } |
  /**
   * Total count of documents.
   */
  { tag: "Count"; values: void };

/**
 * Event emitted when tokens are burned.
 *
 * Note: renamed from "BurnEvent" to avoid a collision with another generated name.
 */
export interface BurnEvent2 {
  name: "Burn";
  data: {
    from: string;
    amount?: bigint;
  };
}

/**
 * Event emitted when tokens are minted.
 *
 * Note: renamed from "MintEvent" to avoid a collision with another generated name.
 */
export interface MintEvent2 {
  name: "Mint";
  data: {
    to: string;
    amount?: bigint;
  };
}

/**
 * Event emitted when a key is allowed for a scheme and claim topic.
 */
export interface KeyAllowedEvent {
  name: "KeyAllowed";
  data: {
    public_key: Uint8Array;
    registry?: string;
    scheme?: number;
    claim_topic?: number;
  };
}

/**
 * Event emitted when a key is removed from a scheme and claim topic.
 */
export interface KeyRemovedEvent {
  name: "KeyRemoved";
  data: {
    public_key: Uint8Array;
    registry?: string;
    scheme?: number;
    claim_topic?: number;
  };
}

/**
 * Event emitted when a claim is revoked.
 */
export interface ClaimRevokedEvent {
  name: "ClaimRevoked";
  data: {
    identity: string;
    claim_topic: number;
    revoked: boolean;
    claim_data?: Uint8Array;
  };
}

/**
 * Error Enum: ClaimIssuerError
 */
export const ClaimIssuerError = {
  /**
   * Signature data length does not match the expected scheme.
   */
  350 : { message: "SigDataMismatch" },
  /**
   * The provided key is empty.
   */
  351 : { message: "KeyIsEmpty" },
  /**
   * The key is already allowed for the specified topic.
   */
  352 : { message: "KeyAlreadyAllowed" },
  /**
   * The specified key was not found in the allowed keys.
   */
  353 : { message: "KeyNotFound" },
  /**
   * The claim issuer is not allowed to sign claims about the specified
   * claim topic.
   */
  354 : { message: "NotAllowed" },
  /**
   * Maximum limit exceeded (keys per topic or registries per key).
   */
  355 : { message: "LimitExceeded" },
  /**
   * No signing keys found for the specified claim topic.
   */
  356 : { message: "NoKeysForTopic" },
  /**
   * Invalid claim data encoding.
   */
  357 : { message: "InvalidClaimDataExpiration" },
  /**
   * Recovery of the Secp256k1 public key failed.
   */
  358 : { message: "Secp256k1RecoveryFailed" },
  /**
   * Indicates overflow when adding two values.
   */
  359 : { message: "MathOverflow" }
}

/**
 * Event emitted when claim signatures are invalidated by incrementing the
 * nonce.
 */
export interface SignaturesInvalidatedEvent {
  name: "SignaturesInvalidated";
  data: {
    identity: string;
    claim_topic: number;
    nonce?: number;
  };
}

/**
 * Struct: SigningKey
 */
export interface SigningKey {
  public_key: Uint8Array;
  scheme: number;
}

/**
 * Signature data for Ed25519 scheme.
 */
export interface Ed25519SignatureData {
  public_key: Uint8Array;
  signature: Uint8Array;
}

/**
 * Storage keys for claim issuer key management.
 */
 export type ClaimIssuerStorageKey =
  /**
   * Maps Topic -> `Vec<SigningKey>`
   */
  { tag: "Topics"; values: readonly [number] } |
  /**
   * Maps SigningKey -> Vec<(Topic, Registry)>
   */
  { tag: "Pairs"; values: readonly [SigningKey] } |
  /**
   * Tracks explicitly revoked claims by claim digest
   */
  { tag: "RevokedClaim"; values: readonly [Uint8Array] } |
  /**
   * Tracks current nonce for a specific identity and claim topics
   */
  { tag: "ClaimNonce"; values: readonly [string, number] };

/**
 * Signature data for Secp256k1 scheme.
 */
export interface Secp256k1SignatureData {
  public_key: Uint8Array;
  recovery_id: number;
  signature: Uint8Array;
}

/**
 * Signature data for Secp256r1 scheme.
 */
export interface Secp256r1SignatureData {
  public_key: Uint8Array;
  signature: Uint8Array;
}

/**
 * Event emitted when a claim is added.
 */
export interface ClaimAddedEvent {
  name: "ClaimAdded";
  data: {
    claim: Claim;
  };
}

/**
 * Error Enum: ClaimsError
 */
export const ClaimsError = {
  /**
   * Claim  ID does not exist.
   */
  340 : { message: "ClaimNotFound" },
  /**
   * Claim Issuer cannot validate the claim (revocation, signature mismatch,
   * unauthorized signing key, etc.)
   */
  341 : { message: "ClaimNotValid" }
}

/**
 * Event emitted when a claim is changed.
 */
export interface ClaimChangedEvent {
  name: "ClaimChanged";
  data: {
    claim: Claim;
  };
}

/**
 * Event emitted when a claim is removed.
 */
export interface ClaimRemovedEvent {
  name: "ClaimRemoved";
  data: {
    claim: Claim;
  };
}

/**
 * Represents a claim stored on-chain.
 */
export interface Claim {
  /**
   * The claim data
   */
  data: Uint8Array;
  /**
   * The address of the claim issuer
   */
  issuer: string;
  /**
   * The signature scheme used
   */
  scheme: number;
  /**
   * The cryptographic signature
   */
  signature: Uint8Array;
  /**
   * The claim topic (numeric identifier)
   */
  topic: number;
  /**
   * Optional URI for additional information
   */
  uri: string;
}

/**
 * Storage keys for the data associated with Identity Claims.
 */
 export type ClaimsStorageKey =
  /**
   * Maps claim ID to claim data
   */
  { tag: "Claim"; values: readonly [Uint8Array] } |
  /**
   * Maps topic to vector of claim IDs
   */
  { tag: "ClaimsByTopic"; values: readonly [number] };

/**
 * Event emitted when a claim topic is added.
 */
export interface ClaimTopicAddedEvent {
  name: "ClaimTopicAdded";
  data: {
    claim_topic: number;
  };
}

/**
 * Event emitted when a claim topic is removed.
 */
export interface ClaimTopicRemovedEvent {
  name: "ClaimTopicRemoved";
  data: {
    claim_topic: number;
  };
}

/**
 * Event emitted when a trusted issuer is added.
 */
export interface TrustedIssuerAddedEvent {
  name: "TrustedIssuerAdded";
  data: {
    trusted_issuer: string;
    claim_topics?: Array<number>;
  };
}

/**
 * Event emitted when issuer topics are updated.
 */
export interface IssuerTopicsUpdatedEvent {
  name: "IssuerTopicsUpdated";
  data: {
    trusted_issuer: string;
    claim_topics?: Array<number>;
  };
}

/**
 * Event emitted when a trusted issuer is removed.
 */
export interface TrustedIssuerRemovedEvent {
  name: "TrustedIssuerRemoved";
  data: {
    trusted_issuer: string;
  };
}

/**
 * Error Enum: ClaimTopicsAndIssuersError
 */
export const ClaimTopicsAndIssuersError = {
  /**
   * Indicates a non-existent claim topic.
   */
  370 : { message: "ClaimTopicDoesNotExist" },
  /**
   * Indicates a non-existent trusted issuer.
   */
  371 : { message: "IssuerDoesNotExist" },
  /**
   * Indicates a claim topic already exists.
   */
  372 : { message: "ClaimTopicAlreadyExists" },
  /**
   * Indicates a trusted issuer already exists.
   */
  373 : { message: "IssuerAlreadyExists" },
  /**
   * Indicates max claim topics limit is reached.
   */
  374 : { message: "MaxClaimTopicsLimitReached" },
  /**
   * Indicates max trusted issuers limit is reached.
   */
  375 : { message: "MaxIssuersLimitReached" },
  /**
   * Indicates claim topics set provided for the issuer cannot be empty.
   */
  376 : { message: "ClaimTopicsSetCannotBeEmpty" }
}

/**
 * Storage keys for the data associated with the claim topics and issuers
 * extension
 */
 export type ClaimTopicsAndIssuersStorageKey =
  /**
   * Stores the claim topics registry
   */
  { tag: "ClaimTopics"; values: void } |
  /**
   * Stores the trusted issuers registry
   */
  { tag: "TrustedIssuers"; values: void } |
  /**
   * Stores the claim topics allowed for a specific trusted issuer
   */
  { tag: "IssuerClaimTopics"; values: readonly [string] } |
  /**
   * Stores the trusted issuers allowed for a specific claim topic
   */
  { tag: "ClaimTopicIssuers"; values: readonly [number] };

/**
 * Error codes for the Identity Registry Storage system.
 */
export const IRSError = {
  /**
   * An identity already exists for the given account.
   */
  320 : { message: "IdentityOverwrite" },
  /**
   * No identity found for the given account.
   */
  321 : { message: "IdentityNotFound" },
  /**
   * Country data not found at the specified index.
   */
  322 : { message: "CountryDataNotFound" },
  /**
   * Identity can't be with empty country data list.
   */
  323 : { message: "EmptyCountryList" },
  /**
   * The maximum number of country entries has been reached.
   */
  324 : { message: "MaxCountryEntriesReached" },
  /**
   * Account has been recovered and cannot be used.
   */
  325 : { message: "AccountRecovered" },
  /**
   * Metadata has too many entries (exceeds MAX_METADATA_ENTRIES).
   */
  326 : { message: "MetadataTooManyEntries" },
  /**
   * Metadata string value is too long (exceeds MAX_METADATA_STRING_LEN).
   */
  327 : { message: "MetadataStringTooLong" },
  /**
   * The account still holds a balance in a linked token.
   */
  328 : { message: "AccountHasBalance" }
}

/**
 * Event emitted when an identity is stored for an account.
 */
export interface IdentityStoredEvent {
  name: "IdentityStored";
  data: {
    account: string;
    identity: string;
  };
}

/**
 * Event emitted for country data operations.
 */
export interface CountryDataAddedEvent {
  name: "CountryDataAdded";
  data: {
    account: string;
    country_data?: any;
  };
}

/**
 * Event emitted when an identity is removed from an account.
 */
export interface IdentityUnstoredEvent {
  name: "IdentityUnstored";
  data: {
    account: string;
    identity: string;
  };
}

/**
 * Event emitted when an identity is recovered for a new account.
 */
export interface IdentityRecoveredEvent {
  name: "IdentityRecovered";
  data: {
    old_account: string;
    new_account: string;
  };
}

/**
 * Event: CountryDataRemoved
 */
export interface CountryDataRemovedEvent {
  name: "CountryDataRemoved";
  data: {
    account: string;
    country_data?: any;
  };
}

/**
 * Event: CountryDataModified
 */
export interface CountryDataModifiedEvent {
  name: "CountryDataModified";
  data: {
    account: string;
    country_data?: any;
  };
}

/**
 * A country data containing the country relationship and optional metadata
 */
export interface CountryData {
  /**
   * Type of country relationship
   */
  country: CountryRelation;
  /**
   * Optional metadata (e.g., visa type, validity period)
   */
  metadata: Map<string, string> | null;
}

/**
 * Represents the type of identity holder
 */
 export type IdentityType =
  { tag: "Individual"; values: void } |
  { tag: "Organization"; values: void };

/**
 * Storage keys for the data associated with Identity Storage Registry.
 */
 export type IRSStorageKey =
  /**
   * Maps account address to identity address
   */
  { tag: "Identity"; values: readonly [string] } |
  /**
   * Maps an account to its complete identity profile
   */
  { tag: "IdentityProfile"; values: readonly [string] } |
  /**
   * Maps old account to new account after recovery
   */
  { tag: "RecoveredTo"; values: readonly [string] };

/**
 * Unified country relationship that can be either individual or organizational
 */
 export type CountryRelation =
  { tag: "Individual"; values: readonly [IndividualCountryRelation] } |
  { tag: "Organization"; values: readonly [OrganizationCountryRelation] };

/**
 * Complete identity profile containing identity type and country data
 */
export interface IdentityProfile {
  countries: Array<CountryData>;
  identity_type: IdentityType;
}

/**
 * Represents different types of country relationships for individuals
 * ISO 3166-1 numeric country code
 */
 export type IndividualCountryRelation =
  /**
   * Country of residence
   */
  { tag: "Residence"; values: readonly [number] } |
  /**
   * Country of citizenship
   */
  { tag: "Citizenship"; values: readonly [number] } |
  /**
   * Country where funds originate
   */
  { tag: "SourceOfFunds"; values: readonly [number] } |
  /**
   * Tax residency (can differ from residence)
   */
  { tag: "TaxResidency"; values: readonly [number] } |
  /**
   * Custom country type for future extensions
   */
  { tag: "Custom"; values: readonly [string, number] };

/**
 * Represents different types of country relationships for organizations
 */
 export type OrganizationCountryRelation =
  /**
   * Country of incorporation/registration
   */
  { tag: "Incorporation"; values: readonly [number] } |
  /**
   * Countries where organization operates
   */
  { tag: "OperatingJurisdiction"; values: readonly [number] } |
  /**
   * Tax jurisdiction
   */
  { tag: "TaxJurisdiction"; values: readonly [number] } |
  /**
   * Country where funds originate
   */
  { tag: "SourceOfFunds"; values: readonly [number] } |
  /**
   * Custom country type for future extensions
   */
  { tag: "Custom"; values: readonly [string, number] };

/**
 * Storage keys for the data associated with `RWA` token
 */
 export type IdentityVerifierStorageKey =
  /**
   * Claim Topics and Issuers contract address
   */
  { tag: "ClaimTopicsAndIssuers"; values: void } |
  /**
   * Identity Registry Storage contract address
   */
  { tag: "IdentityRegistryStorage"; values: void };

/**
 * Error Enum: RWAError
 */
export const RWAError = {
  /**
   * Indicates an error related to insufficient balance for the operation.
   */
  300 : { message: "InsufficientBalance" },
  /**
   * Indicates an error when an input must be >= 0.
   */
  301 : { message: "LessThanZero" },
  /**
   * Indicates the address is frozen and cannot perform operations.
   */
  302 : { message: "AddressFrozen" },
  /**
   * Indicates insufficient free tokens (due to partial freezing).
   */
  303 : { message: "InsufficientFreeTokens" },
  /**
   * Indicates an identity cannot be verified.
   */
  304 : { message: "IdentityVerificationFailed" },
  /**
   * Indicates the compliance contract is not set.
   */
  307 : { message: "ComplianceNotSet" },
  /**
   * Indicates the onchain ID is not set.
   */
  308 : { message: "OnchainIdNotSet" },
  /**
   * Indicates the version is not set.
   */
  309 : { message: "VersionNotSet" },
  /**
   * Indicates the claim topics and issuers contract is not set.
   */
  310 : { message: "ClaimTopicsAndIssuersNotSet" },
  /**
   * Indicates the identity registry storage contract is not set.
   */
  311 : { message: "IdentityRegistryStorageNotSet" },
  /**
   * Indicates the identity verifier contract is not set.
   */
  312 : { message: "IdentityVerifierNotSet" },
  /**
   * Indicates the old account and new account have different identities.
   */
  313 : { message: "IdentityMismatch" }
}

/**
 * Event emitted when tokens are frozen.
 */
export interface TokensFrozenEvent {
  name: "TokensFrozen";
  data: {
    user_address: string;
    amount?: bigint;
  };
}

/**
 * Event emitted when an address is frozen or unfrozen.
 */
export interface AddressFrozenEvent {
  name: "AddressFrozen";
  data: {
    user_address: string;
    is_frozen: boolean;
  };
}

/**
 * Event emitted when compliance contract is set.
 */
export interface ComplianceSetEvent {
  name: "ComplianceSet";
  data: {
    compliance: string;
  };
}

/**
 * Event emitted when tokens are unfrozen.
 */
export interface TokensUnfrozenEvent {
  name: "TokensUnfrozen";
  data: {
    user_address: string;
    amount?: bigint;
  };
}

/**
 * Event emitted when a recovery is successful.
 */
export interface RecoverySuccessEvent {
  name: "RecoverySuccess";
  data: {
    old_account: string;
    new_account: string;
  };
}

/**
 * Event emitted when identity verifier contract is set.
 */
export interface IdentityVerifierSetEvent {
  name: "IdentityVerifierSet";
  data: {
    identity_verifier: string;
  };
}

/**
 * Event emitted when token onchain ID is updated.
 */
export interface TokenOnchainIdUpdatedEvent {
  name: "TokenOnchainIdUpdated";
  data: {
    onchain_id: string;
  };
}

/**
 * Event emitted when claim topics and issuers contract is set.
 */
export interface ClaimTopicsAndIssuersSetEvent {
  name: "ClaimTopicsAndIssuersSet";
  data: {
    claim_topics_and_issuers: string;
  };
}

/**
 * Event emitted when identity registry storage contract is set.
 */
export interface IdentityRegistryStorageSetEvent {
  name: "IdentityRegistryStorageSet";
  data: {
    identity_registry_storage: string;
  };
}

/**
 * Event emitted when a token is bound to the contract.
 */
export interface TokenBoundEvent {
  name: "TokenBound";
  data: {
    token: string;
  };
}

/**
 * Event emitted when a token is unbound from the contract.
 */
export interface TokenUnboundEvent {
  name: "TokenUnbound";
  data: {
    token: string;
  };
}

/**
 * Error codes for the Token Binder system.
 */
export const TokenBinderError = {
  /**
   * The specified token was not found in the bound tokens list.
   */
  330 : { message: "TokenNotFound" },
  /**
   * Attempted to bind a token that is already bound.
   */
  331 : { message: "TokenAlreadyBound" },
  /**
   * Total token capacity (MAX_TOKENS) has been reached.
   */
  332 : { message: "MaxTokensReached" },
  /**
   * The batch contains duplicates.
   */
  334 : { message: "BindBatchDuplicates" }
}

/**
 * Storage keys for the token binder system.
 *
 * All bound token addresses are kept in a single `Vec<Address>` entry. With
 * the capacity capped at [`MAX_TOKENS`], the full list stays a few kilobytes,
 * far below the ledger's per-entry size limit. When a token is unbound, the
 * last token is moved to fill the gap (swap-remove pattern).
 */
 export type TokenBinderStorageKey =
  /**
   * The list of all bound token addresses.
   */
  { tag: "Tokens"; values: void };

/**
 * Storage keys for the data associated with `RWA` token
 */
 export type RWAStorageKey =
  /**
   * Frozen status of an address (true = frozen, false = not frozen)
   */
  { tag: "AddressFrozen"; values: readonly [string] } |
  /**
   * Amount of tokens frozen for a specific address
   */
  { tag: "FrozenTokens"; values: readonly [string] } |
  /**
   * Compliance contract address
   */
  { tag: "Compliance"; values: void } |
  /**
   * OnchainID contract address
   */
  { tag: "OnchainId"; values: void } |
  /**
   * Version of the token
   */
  { tag: "Version"; values: void } |
  /**
   * Identity Verifier contract address
   */
  { tag: "IdentityVerifier"; values: void };

/**
 * Event emitted when underlying assets are deposited into the vault.
 *
 * Note: renamed from "DepositEvent" to avoid a collision with another generated name.
 */
export interface DepositEvent2 {
  name: "Deposit";
  data: {
    operator: string;
    from: string;
    receiver: string;
    assets?: bigint;
    shares?: bigint;
  };
}

/**
 * Event emitted when shares are exchanged back for underlying assets.
 *
 * Note: renamed from "WithdrawEvent" to avoid a collision with another generated name.
 */
export interface WithdrawEvent2 {
  name: "Withdraw";
  data: {
    operator: string;
    receiver: string;
    owner: string;
    assets?: bigint;
    shares?: bigint;
  };
}

/**
 * Error Enum: VaultTokenError
 */
export const VaultTokenError = {
  /**
   * Indicates access to uninitialized vault asset address.
   */
  400 : { message: "VaultAssetAddressNotSet" },
  /**
   * Indicates that vault asset address is already set.
   */
  401 : { message: "VaultAssetAddressAlreadySet" },
  /**
   * Indicates that vault virtual decimals offset is already set.
   */
  402 : { message: "VaultVirtualDecimalsOffsetAlreadySet" },
  /**
   * Indicates the amount is not a valid vault assets value.
   */
  403 : { message: "VaultInvalidAssetsAmount" },
  /**
   * Indicates the amount is not a valid vault shares value.
   */
  404 : { message: "VaultInvalidSharesAmount" },
  /**
   * Attempted to deposit more assets than the max amount for address.
   */
  405 : { message: "VaultExceededMaxDeposit" },
  /**
   * Attempted to mint more shares than the max amount for address.
   */
  406 : { message: "VaultExceededMaxMint" },
  /**
   * Attempted to withdraw more assets than the max amount for address.
   */
  407 : { message: "VaultExceededMaxWithdraw" },
  /**
   * Attempted to redeem more shares than the max amount for address.
   */
  408 : { message: "VaultExceededMaxRedeem" },
  /**
   * Maximum number of decimals offset exceeded
   */
  409 : { message: "VaultMaxDecimalsOffsetExceeded" },
  /**
   * Indicates overflow due to mathematical operations
   */
  410 : { message: "MathOverflow" }
}

/**
 * Storage keys for the data associated with the vault extension
 */
 export type VaultStorageKey =
  /**
   * Stores the address of the vault's underlying asset
   */
  { tag: "AssetAddress"; values: void } |
  /**
   * Stores the virtual decimals offset of the vault
   */
  { tag: "VirtualDecimalsOffset"; values: void };

/**
 * Storage key for the cap value
 */
 export type CapStorageKey =
  { tag: "Cap"; values: void };

/**
 * Event emitted when tokens are burned.
 *
 * Note: renamed from "BurnEvent" to avoid a collision with another generated name.
 */
export interface BurnEvent3 {
  name: "Burn";
  data: {
    from: string;
    amount?: bigint;
  };
}

/**
 * Event emitted when a user is allowed to transfer tokens.
 *
 * Note: renamed from "UserAllowedEvent" to avoid a collision with another generated name.
 */
export interface UserAllowedEvent2 {
  name: "UserAllowed";
  data: {
    user: string;
  };
}

/**
 * Event emitted when a user is disallowed from transferring tokens.
 *
 * Note: renamed from "UserDisallowedEvent" to avoid a collision with another generated name.
 */
export interface UserDisallowedEvent2 {
  name: "UserDisallowed";
  data: {
    user: string;
  };
}

/**
 * Storage keys for the data associated with the allowlist extension
 */
 export type AllowListStorageKey =
  /**
   * Stores the allowed status of an account
   */
  { tag: "Allowed"; values: readonly [string] };

/**
 * Event emitted when a user is blocked from transferring tokens.
 */
export interface UserBlockedEvent {
  name: "UserBlocked";
  data: {
    user: string;
  };
}

/**
 * Event emitted when a user is unblocked and allowed to transfer tokens.
 */
export interface UserUnblockedEvent {
  name: "UserUnblocked";
  data: {
    user: string;
  };
}

/**
 * Storage keys for the data associated with the blocklist extension
 */
 export type BlockListStorageKey =
  /**
   * Stores the blocked status of an account
   */
  { tag: "Blocked"; values: readonly [string] };

/**
 * Event emitted when tokens are minted.
 *
 * Note: renamed from "MintEvent" to avoid a collision with another generated name.
 */
export interface MintEvent3 {
  name: "Mint";
  data: {
    to: string;
    amount?: bigint;
  };
}

/**
 * Event emitted when an allowance is approved.
 *
 * Note: renamed from "ApproveEvent" to avoid a collision with another generated name.
 */
export interface ApproveEvent2 {
  name: "Approve";
  data: {
    owner: string;
    spender: string;
    amount?: bigint;
    live_until_ledger?: number;
  };
}

/**
 * Event emitted when tokens are transferred between addresses without a
 * muxed destination.
 *
 * Per SEP-41, the event data is a bare `i128` when no muxed address is
 * involved. The `data_format = "single-value"` attribute ensures the
 * `amount` field is serialized as a bare value rather than a map.
 *
 * Note: renamed from "TransferEvent" to avoid a collision with another generated name.
 */
export interface TransferEvent3 {
  name: "Transfer";
  data: {
    from: string;
    to: string;
    amount: bigint;
  };
}

/**
 * Event emitted when tokens are transferred to a muxed address.
 *
 * Per SEP-41, when the destination is a [`MuxedAddress`] the event data
 * carries both the amount and the muxed identifier so that off-chain
 * consumers can attribute the transfer to the correct sub-account.
 *
 * Uses `topics = ["transfer"]` so that both [`Transfer`] and
 * [`MuxedTransfer`] share the same `"transfer"` event symbol, as required
 * by SEP-41.
 */
export interface MuxedTransferEvent {
  name: "MuxedTransfer";
  data: {
    from: string;
    to: string;
    to_muxed_id?: bigint | null;
    amount?: bigint;
  };
}

/**
 * Error Enum: FungibleTokenError
 */
export const FungibleTokenError = {
  /**
   * Indicates an error related to the current balance of account from which
   * tokens are expected to be transferred.
   */
  100 : { message: "InsufficientBalance" },
  /**
   * Indicates a failure with the allowance mechanism when a given spender
   * doesn't have enough allowance.
   */
  101 : { message: "InsufficientAllowance" },
  /**
   * Indicates an invalid value for `live_until_ledger` when setting an
   * allowance.
   */
  102 : { message: "InvalidLiveUntilLedger" },
  /**
   * Indicates an error when an input that must be >= 0
   */
  103 : { message: "LessThanZero" },
  /**
   * Indicates overflow when adding two values
   */
  104 : { message: "MathOverflow" },
  /**
   * Indicates access to uninitialized metadata
   */
  105 : { message: "UnsetMetadata" },
  /**
   * Indicates that the operation would have caused `total_supply` to exceed
   * the `cap`.
   */
  106 : { message: "ExceededCap" },
  /**
   * Indicates the supplied `cap` is not a valid cap value.
   */
  107 : { message: "InvalidCap" },
  /**
   * Indicates the Cap was not set.
   */
  108 : { message: "CapNotSet" },
  /**
   * Indicates the SAC address was not set.
   */
  109 : { message: "SACNotSet" },
  /**
   * Indicates a SAC address different than expected.
   */
  110 : { message: "SACAddressMismatch" },
  /**
   * Indicates a missing function parameter in the SAC contract context.
   */
  111 : { message: "SACMissingFnParam" },
  /**
   * Indicates an invalid function parameter in the SAC contract context.
   */
  112 : { message: "SACInvalidFnParam" },
  /**
   * The user is not allowed to perform this operation
   */
  113 : { message: "UserNotAllowed" },
  /**
   * The user is blocked and cannot perform this operation
   */
  114 : { message: "UserBlocked" }
}

/**
 * Storage key for accessing the SAC address
 */
 export type SACAdminGenericDataKey =
  { tag: "Sac"; values: void };

/**
 * Storage key for accessing the SAC address
 */
 export type SACAdminWrapperDataKey =
  { tag: "Sac"; values: void };

/**
 * Storage container for token metadata
 */
export interface Metadata {
  decimals: number;
  name: string;
  symbol: string;
}

/**
 * Storage key that maps to [`AllowanceData`]
 */
export interface AllowanceKey {
  owner: string;
  spender: string;
}

/**
 * Storage container for the amount of tokens for which an allowance is granted
 * and the ledger number at which this allowance expires.
 */
export interface AllowanceData {
  amount: bigint;
  live_until_ledger: number;
}

/**
 * Storage keys for the data associated with `FungibleToken`
 */
 export type FungibleStorageKey =
  { tag: "Meta"; values: void } |
  { tag: "TotalSupply"; values: void } |
  { tag: "Balance"; values: readonly [string] } |
  { tag: "Allowance"; values: readonly [AllowanceKey] };

/**
 * Union: UpgradeableStorageKey
 */
 export type UpgradeableStorageKey =
  { tag: "SchemaVersion"; values: void };

/**
 * Event emitted when the merkle root is set.
 */
export interface SetRootEvent {
  name: "SetRoot";
  data: {
    root?: Uint8Array;
  };
}

/**
 * Event emitted when an index is claimed.
 */
export interface SetClaimedEvent {
  name: "SetClaimed";
  data: {
    index?: number;
  };
}

/**
 * Error Enum: MerkleDistributorError
 */
export const MerkleDistributorError = {
  /**
   * The merkle root is not set.
   */
  1300 : { message: "RootNotSet" },
  /**
   * The provided index was already claimed.
   */
  1301 : { message: "IndexAlreadyClaimed" },
  /**
   * The proof is invalid.
   */
  1302 : { message: "InvalidProof" }
}

/**
 * Storage keys for the data associated with `MerkleDistributor`
 */
 export type MerkleDistributorStorageKey =
  /**
   * The Merkle root of the distribution tree
   */
  { tag: "Root"; values: void } |
  /**
   * Maps an index to its claimed status
   */
  { tag: "Claimed"; values: readonly [number] };

/**
 * Rounding direction for division operations
 */
 export type Rounding =
  /**
   * Round toward negative infinity (down)
   */
  { tag: "Floor"; values: void } |
  /**
   * Round toward positive infinity (up)
   */
  { tag: "Ceil"; values: void } |
  /**
   * Round toward zero (truncation)
   */
  { tag: "Truncate"; values: void };

/**
 * Error Enum: SorobanFixedPointError
 */
export const SorobanFixedPointError = {
  /**
   * Arithmetic overflow occurred
   */
  1500 : { message: "Overflow" },
  /**
   * Division by zero
   */
  1501 : { message: "DivisionByZero" },
  /**
   * Base is outside the valid domain (e.g. `ln(x)` for `x <= 0`,
   * or `powf(x, y)` with non-positive `x` combined with float exponent).
   */
  1502 : { message: "InvalidBase" }
}

/**
 * Error Enum: CryptoError
 */
export const CryptoError = {
  /**
   * The merkle proof length is out of bounds.
   */
  1400 : { message: "MerkleProofOutOfBounds" },
  /**
   * The index of the leaf is out of bounds.
   */
  1401 : { message: "MerkleIndexOutOfBounds" },
  /**
   * No data in hasher state.
   */
  1402 : { message: "HasherEmptyState" },
  /**
   * The point is neither the canonical identity encoding nor a canonical
   * on-curve point.
   */
  1403 : { message: "InvalidPoint" }
}

/**
 * Event emitted when the contract is paused.
 */
export interface PausedEvent {
  name: "Paused";
  data: {

  };
}

/**
 * Event emitted when the contract is unpaused.
 */
export interface UnpausedEvent {
  name: "Unpaused";
  data: {

  };
}

/**
 * Error Enum: PausableError
 */
export const PausableError = {
  /**
   * The operation failed because the contract is paused.
   */
  1000 : { message: "EnforcedPause" },
  /**
   * The operation failed because the contract is not paused.
   */
  1001 : { message: "ExpectedPause" }
}

/**
 * Storage key for the pausable state
 */
 export type PausableStorageKey =
  /**
   * Indicates whether the contract is in paused state.
   */
  { tag: "Paused"; values: void };

/**
 * Errors that can occur in votes operations.
 */
export const VotesError = {
  /**
   * The ledger is in the future
   */
  4100 : { message: "FutureLookup" },
  /**
   * Arithmetic overflow occurred
   */
  4101 : { message: "MathOverflow" },
  /**
   * Attempting to transfer more voting units than available
   */
  4102 : { message: "InsufficientVotingUnits" },
  /**
   * Attempting to delegate to the same delegate that is already set
   */
  4103 : { message: "SameDelegate" },
  /**
   * A checkpoint that was expected to exist was not found in storage
   */
  4104 : { message: "CheckpointNotFound" }
}

/**
 * Event emitted when an account changes its delegate.
 */
export interface DelegateChangedEvent {
  name: "DelegateChanged";
  data: {
    /**
     * The account that changed its delegate
     */
    delegator: string;
    /**
     * The previous delegate (if any)
     */
    from_delegate?: string | null;
    /**
     * The new delegate
     */
    to_delegate?: string;
  };
}

/**
 * Event emitted when a delegate's voting power changes.
 */
export interface DelegateVotesChangedEvent {
  name: "DelegateVotesChanged";
  data: {
    /**
     * The delegate whose voting power changed
     */
    delegate: string;
    /**
     * The previous voting power
     */
    previous_votes?: bigint;
    /**
     * The new voting power
     */
    new_votes?: bigint;
  };
}

/**
 * A checkpoint recording voting power at a specific ledger sequence number.
 */
export interface Checkpoint {
  /**
   * The ledger sequence number when this checkpoint was created
   */
  ledger: number;
  /**
   * The voting power at this ledger sequence number
   */
  votes: bigint;
}

/**
 * Selects the checkpoint timeline to operate on.
 *
 * Each variant maps to a different set of storage keys so that
 * per-account voting-power history and aggregate total supply history
 * are kept separate.
 */
 export type CheckpointType =
  /**
   * The global total supply checkpoint.
   */
  { tag: "TotalSupply"; values: void } |
  /**
   * A per-account (delegate) voting-power checkpoint.
   */
  { tag: "Account"; values: readonly [string] };

/**
 * Storage keys for the votes module.
 *
 * Only delegated voting power counts as votes (i.e., only delegatees can
 * vote), so the storage design tracks delegates and their checkpointed
 * voting power separately from the raw voting units held by each account.
 */
 export type VotesStorageKey =
  /**
   * Maps account to its delegate
   */
  { tag: "Delegatee"; values: readonly [string] } |
  /**
   * Number of checkpoints for a delegate
   */
  { tag: "NumCheckpoints"; values: readonly [string] } |
  /**
   * Individual checkpoint for a delegate at index
   */
  { tag: "DelegateCheckpoint"; values: readonly [string, number] } |
  /**
   * Number of total supply checkpoints
   */
  { tag: "NumTotalSupplyCheckpoints"; values: void } |
  /**
   * Individual total supply checkpoint at index
   */
  { tag: "TotalSupplyCheckpoint"; values: readonly [number] } |
  /**
   * Voting units held by an account (tracked separately from delegation)
   */
  { tag: "VotingUnits"; values: readonly [string] };

/**
 * Event emitted when a vote is cast.
 */
export interface VoteCastEvent {
  name: "VoteCast";
  data: {
    voter: string;
    proposal_id: Uint8Array;
    /**
     * The type of vote cast.
     */
    vote_type?: number;
    /**
     * The voting power used.
     */
    weight?: bigint;
    /**
     * The voter's explanation for their vote.
     */
    reason?: string;
  };
}

/**
 * Errors that can occur in governor operations.
 */
export const GovernorError = {
  /**
   * The proposal was not found.
   */
  5000 : { message: "ProposalNotFound" },
  /**
   * The proposal already exists.
   */
  5001 : { message: "ProposalAlreadyExists" },
  /**
   * The proposer does not have enough voting power.
   */
  5002 : { message: "InsufficientProposerVotes" },
  /**
   * The proposal contains no actions.
   */
  5003 : { message: "EmptyProposal" },
  /**
   * The targets, functions, and args vectors have different lengths.
   */
  5004 : { message: "InvalidProposalLength" },
  /**
   * The proposal is not in the active state.
   */
  5005 : { message: "ProposalNotActive" },
  /**
   * The proposal has not succeeded.
   */
  5006 : { message: "ProposalNotSuccessful" },
  /**
   * The proposal has not been queued.
   */
  5007 : { message: "ProposalNotQueued" },
  /**
   * The proposal has already been executed.
   */
  5008 : { message: "ProposalAlreadyExecuted" },
  /**
   * The proposal is in a non-cancellable state (`Canceled`, `Expired`, or
   * `Executed`).
   */
  5009 : { message: "ProposalNotCancellable" },
  /**
   * The voting delay has not been set.
   */
  5010 : { message: "VotingDelayNotSet" },
  /**
   * The voting period has not been set.
   */
  5011 : { message: "VotingPeriodNotSet" },
  /**
   * The proposal threshold has not been set.
   */
  5012 : { message: "ProposalThresholdNotSet" },
  /**
   * The name has not been set.
   */
  5013 : { message: "NameNotSet" },
  /**
   * The version has not been set.
   */
  5014 : { message: "VersionNotSet" },
  /**
   * Arithmetic overflow occurred.
   */
  5015 : { message: "MathOverflow" },
  /**
   * The account has already voted on this proposal.
   */
  5016 : { message: "AlreadyVoted" },
  /**
   * The vote type is invalid (must be 0, 1, or 2).
   */
  5017 : { message: "InvalidVoteType" },
  /**
   * The quorum has not been set.
   */
  5018 : { message: "QuorumNotSet" },
  /**
   * The token contract has already been set (can only be initialized once).
   */
  5019 : { message: "TokenContractAlreadySet" },
  /**
   * The token contract has not been set.
   */
  5020 : { message: "TokenContractNotSet" },
  /**
   * The proposal description exceeds the maximum allowed length.
   */
  5021 : { message: "DescriptionTooLong" },
  /**
   * Queuing is not enabled for this governor.
   */
  5022 : { message: "QueueNotEnabled" },
  /**
   * The voting period is zero, which would leave every proposal unvotable.
   */
  5023 : { message: "InvalidVotingPeriod" }
}

/**
 * The state of a proposal in its lifecycle.
 *
 * States are divided into two categories:
 *
 * ## Time-based states (derived, never stored explicitly)
 *
 * These are computed by [`get_proposal_state()`] from the current ledger
 * relative to the proposal's voting schedule. They are only returned when
 * no explicit state has been set.
 *
 * - [`Pending`](ProposalState::Pending) — voting has not started yet.
 * - [`Active`](ProposalState::Active) — voting is ongoing.
 * - [`Defeated`](ProposalState::Defeated) — voting ended **without** the
 * counting logic marking the proposal as `Succeeded`.
 *
 * ## Explicit states
 *
 * Set explicitly by the Governor or its extensions and persisted in
 * storage. Once set, they take precedence over any time-based derivation.
 *
 * - [`Canceled`](ProposalState::Canceled) — set by the Governor.
 * - [`Succeeded`](ProposalState::Succeeded) — set by the counting logic.
 * - [`Queued`](ProposalState::Queued) / [`Expired`](ProposalState::Expired) —
 * set by extensions like `TimelockControl`.
 * - [`Executed`](ProposalState::Execu
 */
export enum ProposalState {
  /**
   * The proposal is pending and voting has not started yet.
   */
  Pending = 0,
  /**
   * The proposal is active and voting is ongoing.
   */
  Active = 1,
  /**
   * The proposal was defeated (did not meet quorum or majority). This is
   * the default outcome when voting ends and the counting logic has
   * not marked the proposal as [`Succeeded`](ProposalState::Succeeded).
   */
  Defeated = 2,
  /**
   * The proposal has been cancelled. Set by the Governor.
   */
  Canceled = 3,
  /**
   * The proposal succeeded and can be executed. Set by the counting
   * logic when the proposal meets the required quorum and vote
   * thresholds. If a queuing extension is enabled, this state means the
   * proposal is ready to be queued.
   */
  Succeeded = 4,
  /**
   * The proposal is queued for execution. Set by extensions like
   * `TimelockControl`.
   */
  Queued = 5,
  /**
   * The proposal has expired and can no longer be executed. Set by
   * extensions like `TimelockControl`.
   */
  Expired = 6,
  /**
   * The proposal has been executed. Set by the Governor.
   */
  Executed = 7
}

/**
 * Event emitted when the quorum value is changed.
 */
export interface QuorumChangedEvent {
  name: "QuorumChanged";
  data: {
    old_quorum?: bigint;
    new_quorum?: bigint;
  };
}

/**
 * Event emitted when a proposal is queued.
 */
export interface ProposalQueuedEvent {
  name: "ProposalQueued";
  data: {
    proposal_id: Uint8Array;
    eta?: number;
  };
}

/**
 * Event emitted when a proposal is created.
 */
export interface ProposalCreatedEvent {
  name: "ProposalCreated";
  data: {
    proposal_id: Uint8Array;
    proposer: string;
    targets?: Array<string>;
    functions?: Array<string>;
    args?: Array<Array<any>>;
    vote_snapshot?: number;
    vote_end?: number;
    description?: string;
  };
}

/**
 * Event emitted when a proposal is executed.
 */
export interface ProposalExecutedEvent {
  name: "ProposalExecuted";
  data: {
    proposal_id: Uint8Array;
  };
}

/**
 * Event emitted when a proposal is cancelled.
 */
export interface ProposalCancelledEvent {
  name: "ProposalCancelled";
  data: {
    proposal_id: Uint8Array;
  };
}

/**
 * Core proposal data stored on-chain.
 */
export interface ProposalCore {
  /**
   * The address that created the proposal.
   */
  proposer: string;
  /**
   * The current state of the proposal.
   */
  state: ProposalState;
  /**
   * The last ledger where voting is active (inclusive).
   */
  vote_end: number;
  /**
   * The ledger at which voting power is snapshotted. Voting opens on
   * the next ledger (`vote_snapshot + 1`).
   */
  vote_snapshot: number;
}

/**
 * A quorum checkpoint recording the quorum value at a specific ledger.
 */
export interface QuorumCheckpoint {
  /**
   * The ledger at which this quorum value took effect.
   */
  ledger: number;
  /**
   * The quorum value.
   */
  quorum: bigint;
}

/**
 * Storage keys for the Governor contract.
 */
 export type GovernorStorageKey =
  /**
   * The name of the governor.
   */
  { tag: "Name"; values: void } |
  /**
   * The version of the governor contract.
   */
  { tag: "Version"; values: void } |
  /**
   * The voting delay in ledgers.
   */
  { tag: "VotingDelay"; values: void } |
  /**
   * The voting period in ledgers.
   */
  { tag: "VotingPeriod"; values: void } |
  /**
   * Minimum voting power required to propose.
   */
  { tag: "ProposalThreshold"; values: void } |
  /**
   * Proposal data indexed by proposal ID.
   */
  { tag: "Proposal"; values: readonly [Uint8Array] } |
  /**
   * Number of quorum checkpoints.
   */
  { tag: "NumQuorumCheckpoints"; values: void } |
  /**
   * Individual quorum checkpoint at index.
   */
  { tag: "QuorumCheckpoint"; values: readonly [number] } |
  /**
   * Vote tallies for a proposal, indexed by proposal ID.
   */
  { tag: "ProposalVote"; values: readonly [Uint8Array] } |
  /**
   * Whether an account has voted on a proposal.
   */
  { tag: "HasVoted"; values: readonly [Uint8Array, string] } |
  /**
   * The address of the token contract that implements the Votes trait.
   */
  { tag: "TokenContract"; values: void };

/**
 * Vote tallies for a proposal.
 */
export interface ProposalVoteCounts {
  /**
   * Total voting power cast as abstain.
   */
  abstain_votes: bigint;
  /**
   * Total voting power cast against the proposal.
   */
  against_votes: bigint;
  /**
   * Total voting power cast in favor of the proposal.
   */
  for_votes: bigint;
}

/**
 * Errors that can occur in timelock operations.
 */
export const TimelockError = {
  /**
   * The operation is already scheduled
   */
  4000 : { message: "OperationAlreadyScheduled" },
  /**
   * The delay is less than the minimum required delay
   */
  4001 : { message: "InsufficientDelay" },
  /**
   * The operation is not in the expected state
   */
  4002 : { message: "InvalidOperationState" },
  /**
   * A predecessor operation has not been executed yet
   */
  4003 : { message: "UnexecutedPredecessor" },
  /**
   * The caller is not authorized to perform this action
   */
  4004 : { message: "Unauthorized" },
  /**
   * The minimum delay has not been set
   */
  4005 : { message: "MinDelayNotSet" },
  /**
   * The operation has not been scheduled
   */
  4006 : { message: "OperationNotScheduled" }
}

/**
 * Event emitted when the minimum delay is changed.
 */
export interface MinDelayChangedEvent {
  name: "MinDelayChanged";
  data: {
    old_delay?: number;
    new_delay?: number;
  };
}

/**
 * Event emitted when an operation is executed.
 */
export interface OperationExecutedEvent {
  name: "OperationExecuted";
  data: {
    id: Uint8Array;
    target: string;
    function?: string;
    args?: Array<any>;
    predecessor?: Uint8Array;
    salt?: Uint8Array;
  };
}

/**
 * Event emitted when an operation is cancelled.
 */
export interface OperationCancelledEvent {
  name: "OperationCancelled";
  data: {
    id: Uint8Array;
  };
}

/**
 * Event emitted when an operation is scheduled.
 */
export interface OperationScheduledEvent {
  name: "OperationScheduled";
  data: {
    id: Uint8Array;
    target: string;
    function?: string;
    args?: Array<any>;
    predecessor?: Uint8Array;
    salt?: Uint8Array;
    delay?: number;
  };
}

/**
 * Represents a operation to be executed by the timelock.
 *
 * An operation encapsulates all the information needed to invoke a function
 * on a target contract after the timelock delay has passed.
 */
export interface Operation {
  /**
   * The serialized arguments to pass to the function
   */
  args: Array<any>;
  /**
   * The function name to invoke on the target contract
   */
  function_: string;
  /**
   * Hash of a predecessor operation that must be executed first.
   * Use BytesN::<32>::from_array(&[0u8; 32]) for no predecessor.
   */
  predecessor: Uint8Array;
  /**
   * A salt value for operation uniqueness.
   * Allows scheduling the same operation multiple times with different IDs.
   */
  salt: Uint8Array;
  /**
   * The contract address to call
   */
  target: string;
}

/**
 * The state of an operation in the timelock system.
 */
 export type OperationState =
  /**
   * Operation has not been scheduled
   */
  { tag: "Unset"; values: void } |
  /**
   * Operation is scheduled but the delay period has not passed
   */
  { tag: "Waiting"; values: void } |
  /**
   * Operation is ready to be executed (delay has passed)
   */
  { tag: "Ready"; values: void } |
  /**
   * Operation has been executed
   */
  { tag: "Done"; values: void };

/**
 * Storage keys for the timelock module.
 */
 export type TimelockStorageKey =
  /**
   * Minimum delay in ledgers for operations
   */
  { tag: "MinDelay"; values: void } |
  /**
   * Maps operation ID to the ledger sequence number when it will be in a
   * [`OperationState::Ready`] state (Note: value is 0 for
   * [`OperationState::Unset`], 1 for [`OperationState::Done`]).
   */
  { tag: "OperationLedger"; values: readonly [Uint8Array] };

/**
 * Error Enum: RoleTransferError
 */
export const RoleTransferError = {
  2200 : { message: "NoPendingTransfer" },
  2201 : { message: "InvalidLiveUntilLedger" },
  2202 : { message: "InvalidPendingAccount" },
  2203 : { message: "TransferExpired" }
}

/**
 * Stores the pending role holder and the explicit deadline for acceptance.
 */
export interface PendingTransfer {
  address: string;
  live_until_ledger: number;
}

/**
 * Event emitted when a role is granted.
 */
export interface RoleGrantedEvent {
  name: "RoleGranted";
  data: {
    role: string;
    account: string;
    caller?: string;
  };
}

/**
 * Event emitted when a role is revoked.
 */
export interface RoleRevokedEvent {
  name: "RoleRevoked";
  data: {
    role: string;
    account: string;
    caller?: string;
  };
}

/**
 * Event emitted when the admin role is renounced.
 */
export interface AdminRenouncedEvent {
  name: "AdminRenounced";
  data: {
    admin: string;
  };
}

/**
 * Event emitted when a role admin is changed.
 */
export interface RoleAdminChangedEvent {
  name: "RoleAdminChanged";
  data: {
    role: string;
    previous_admin_role?: string;
    new_admin_role?: string;
  };
}

/**
 * Error Enum: AccessControlError
 */
export const AccessControlError = {
  2000 : { message: "Unauthorized" },
  2001 : { message: "AdminNotSet" },
  2002 : { message: "IndexOutOfBounds" },
  2003 : { message: "AdminRoleNotFound" },
  2004 : { message: "RoleCountIsNotZero" },
  2005 : { message: "RoleNotFound" },
  2006 : { message: "AdminAlreadySet" },
  2007 : { message: "RoleNotHeld" },
  2008 : { message: "RoleIsEmpty" },
  2009 : { message: "TransferInProgress" },
  2010 : { message: "MaxRolesExceeded" }
}

/**
 * Event emitted when an admin transfer is completed.
 */
export interface AdminTransferCompletedEvent {
  name: "AdminTransferCompleted";
  data: {
    new_admin: string;
    previous_admin?: string;
  };
}

/**
 * Event emitted when an admin transfer is initiated.
 */
export interface AdminTransferInitiatedEvent {
  name: "AdminTransferInitiated";
  data: {
    current_admin: string;
    new_admin?: string;
    live_until_ledger?: number;
  };
}

/**
 * Storage key for enumeration of accounts per role.
 */
export interface RoleAccountKey {
  index: number;
  role: string;
}

/**
 * Storage keys for the data associated with the access control
 */
 export type AccessControlStorageKey =
  { tag: "ExistingRoles"; values: void } |
  { tag: "RoleAccounts"; values: readonly [RoleAccountKey] } |
  { tag: "HasRole"; values: readonly [string, string] } |
  { tag: "RoleAccountsCount"; values: readonly [string] } |
  { tag: "RoleAdmin"; values: readonly [string] } |
  { tag: "Admin"; values: void } |
  { tag: "PendingAdmin"; values: void };

/**
 * Error Enum: OwnableError
 */
export const OwnableError = {
  2100 : { message: "OwnerNotSet" },
  2101 : { message: "TransferInProgress" },
  2102 : { message: "OwnerAlreadySet" }
}

/**
 * Event emitted when an ownership transfer is initiated.
 */
export interface OwnershipTransferEvent {
  name: "OwnershipTransfer";
  data: {
    old_owner?: string;
    new_owner?: string;
    live_until_ledger?: number;
  };
}

/**
 * Event emitted when ownership is renounced.
 */
export interface OwnershipRenouncedEvent {
  name: "OwnershipRenounced";
  data: {
    old_owner?: string;
  };
}

/**
 * Event emitted when an ownership transfer is completed.
 */
export interface OwnershipTransferCompletedEvent {
  name: "OwnershipTransferCompleted";
  data: {
    new_owner?: string;
  };
}

/**
 * Storage keys for `Ownable` utility.
 */
 export type OwnableStorageKey =
  { tag: "Owner"; values: void } |
  { tag: "PendingOwner"; values: void };

/**
 * Context of a single authorized call performed by an address.
 *
 * Custom account contracts that implement `__check_auth` special function
 * receive a list of `Context` values corresponding to all the calls that
 * need to be authorized.
 */
 export type Context =
  /**
   * Contract invocation.
   */
  { tag: "Contract"; values: readonly [ContractContext] } |
  /**
   * Contract that has a constructor with no arguments is created.
   */
  { tag: "CreateContractHostFn"; values: readonly [CreateContractHostFnContext] } |
  /**
   * Contract that has a constructor with 1 or more arguments is created.
   */
  { tag: "CreateContractWithCtorHostFn"; values: readonly [CreateContractWithConstructorHostFnContext] };

/**
 * Authorization context of a single contract call.
 *
 * This struct corresponds to a `require_auth_for_args` call for an address
 * from `contract` function with `fn_name` name and `args` arguments.
 */
export interface ContractContext {
  args: Array<any>;
  contract: string;
  fn_name: string;
}

/**
 * Contract executable used for creating a new contract and used in
 * `CreateContractHostFnContext`.
 */
 export type ContractExecutable =
  { tag: "Wasm"; values: readonly [Uint8Array] };

/**
 * Value of contract node in InvokerContractAuthEntry tree.
 */
export interface SubContractInvocation {
  context: ContractContext;
  sub_invocations: Array<InvokerContractAuthEntry>;
}

/**
 * A node in the tree of authorizations performed on behalf of the current
 * contract as invoker of the contracts deeper in the call stack.
 *
 * This is used as an argument of `authorize_as_current_contract` host function.
 *
 * This tree corresponds `require_auth[_for_args]` calls on behalf of the
 * current contract.
 */
 export type InvokerContractAuthEntry =
  /**
   * Invoke a contract.
   */
  { tag: "Contract"; values: readonly [SubContractInvocation] } |
  /**
   * Create a contract passing 0 arguments to constructor.
   */
  { tag: "CreateContractHostFn"; values: readonly [CreateContractHostFnContext] } |
  /**
   * Create a contract passing 0 or more arguments to constructor.
   */
  { tag: "CreateContractWithCtorHostFn"; values: readonly [CreateContractWithConstructorHostFnContext] };

/**
 * Authorization context for `create_contract` host function that creates a
 * new contract on behalf of authorizer address.
 */
export interface CreateContractHostFnContext {
  executable: ContractExecutable;
  salt: Uint8Array;
}

/**
 * Authorization context for `create_contract` host function that creates a
 * new contract on behalf of authorizer address.
 * This is the same as `CreateContractHostFnContext`, but also has
 * contract constructor arguments.
 */
export interface CreateContractWithConstructorHostFnContext {
  constructor_args: Array<any>;
  executable: ContractExecutable;
  salt: Uint8Array;
}

/**
 * Union: Executable
 */
 export type Executable =
  { tag: "Wasm"; values: readonly [Uint8Array] } |
  { tag: "StellarAsset"; values: void } |
  { tag: "Account"; values: void };
    export type ContractEvent = BatchMintEvent | MintWithMinterEvent | TokenInitializedEvent | MintAuthorityChangedEvent | FrozenEvent | UnfrozenEvent | ComplianceConfigChangedEvent | MergeEvent | DepositEvent | RegisterEvent | TransferEvent | WithdrawEvent | AuditorSetEvent | SetSpenderEvent | VerifierSetEvent | RevokeSpenderEvent | SpenderTransferEvent | AddressAsFieldSetEvent | UnderlyingAssetSetEvent | AuditorRotatedEvent | AuditorRegisteredEvent | VerificationKeyUpdatedEvent | VerificationKeyRegisteredEvent | ConsecutiveMintEvent | BurnEvent | SetTokenRoyaltyEvent | SetDefaultRoyaltyEvent | RemoveTokenRoyaltyEvent | MintEvent | ApproveEvent | TransferEvent2 | ApproveForAllEvent | ModuleAddedEvent | ModuleRemovedEvent | MaxBalanceSetEvent | IdBalancePresetEvent | PresetCompletedEvent | SupplyLimitSetEvent | PresetCompletedEvent2 | SupplyCountUpdatedEvent | CountryAllowedEvent | CountryUnallowedEvent | UserAllowedEvent | UserDisallowedEvent | CountryRestrictedEvent | CountryUnrestrictedEvent | LockupPeriodSetEvent | PresetCompletedEvent3 | LockupStatePresetEvent | TimeTransferLimitSetEvent | TimeTransferLimitRemovedEvent | DocumentRemovedEvent | DocumentUpdatedEvent | BurnEvent2 | MintEvent2 | KeyAllowedEvent | KeyRemovedEvent | ClaimRevokedEvent | SignaturesInvalidatedEvent | ClaimAddedEvent | ClaimChangedEvent | ClaimRemovedEvent | ClaimTopicAddedEvent | ClaimTopicRemovedEvent | TrustedIssuerAddedEvent | IssuerTopicsUpdatedEvent | TrustedIssuerRemovedEvent | IdentityStoredEvent | CountryDataAddedEvent | IdentityUnstoredEvent | IdentityRecoveredEvent | CountryDataRemovedEvent | CountryDataModifiedEvent | TokensFrozenEvent | AddressFrozenEvent | ComplianceSetEvent | TokensUnfrozenEvent | RecoverySuccessEvent | IdentityVerifierSetEvent | TokenOnchainIdUpdatedEvent | ClaimTopicsAndIssuersSetEvent | IdentityRegistryStorageSetEvent | TokenBoundEvent | TokenUnboundEvent | DepositEvent2 | WithdrawEvent2 | BurnEvent3 | UserAllowedEvent2 | UserDisallowedEvent2 | UserBlockedEvent | UserUnblockedEvent | MintEvent3 | ApproveEvent2 | TransferEvent3 | MuxedTransferEvent | SetRootEvent | SetClaimedEvent | PausedEvent | UnpausedEvent | DelegateChangedEvent | DelegateVotesChangedEvent | VoteCastEvent | QuorumChangedEvent | ProposalQueuedEvent | ProposalCreatedEvent | ProposalExecutedEvent | ProposalCancelledEvent | MinDelayChangedEvent | OperationExecutedEvent | OperationCancelledEvent | OperationScheduledEvent | RoleGrantedEvent | RoleRevokedEvent | AdminRenouncedEvent | RoleAdminChangedEvent | AdminTransferCompletedEvent | AdminTransferInitiatedEvent | OwnershipTransferEvent | OwnershipRenouncedEvent | OwnershipTransferCompletedEvent;
    