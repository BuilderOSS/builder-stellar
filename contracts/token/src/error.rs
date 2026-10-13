use soroban_sdk::contracterror;

/// Token errors (block `common::error::codes::TOKEN`).
#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum TokenError {
    /// The minter is neither the admin nor a registered module allowed to mint
    /// now (before launch only the `claims` module may)
    MintAuthorityNotAllowed = 7201,
    /// Invalid input parameters (mismatched lengths, zero amounts, etc.)
    InvalidInput = 7202,
    /// `launch` treasury differs from the treasury wired at construction
    TreasuryMismatch = 7203,
    // 7204 (TreasuryNotMinter) and 7206 (MinterNotGranted) are retired with the
    // shared Minter; codes are never reused.
    /// `batch_mint` exceeds the event budget (`common::batch_mint_fits`)
    BatchTooLarge = 7205,
    /// The collection name contains `"`, `\` or a control character
    InvalidName = 7207,
    /// The metadata contract address is missing from the instance
    MetadataNotSet = 7208,
    /// The address is not a registered module
    NotAModule = 7209,
    /// Only deployed Wasm contracts can be modules (not wallets, Stellar Asset
    /// Contracts or predicted addresses)
    NotAContract = 7210,
    /// The kind is not a built-in kind or `custom_<name>`
    InvalidKind = 7211,
    /// Another module already has this kind
    KindTaken = 7212,
    /// The address is already registered
    ModuleAlreadyRegistered = 7213,
    /// The registry already holds `common::modules::MAX_MODULES` modules
    TooManyModules = 7214,
    /// The mint exceeds the module's remaining allowance
    AllowanceExceeded = 7215,
    /// The token is locked and this movement or approval is not one of the
    /// DAO-controlled paths (docs/designs/locked-tokens.md)
    TransfersLocked = 7216,
    /// A switch or transfer agent was set to the value it already has
    SettingUnchanged = 7217,
    /// `dao_transfer` while `dao_recovery` is off
    RecoveryOff = 7218,
    /// `agent_transfer` by a module the DAO has not made a transfer agent
    NotTransferAgent = 7219,
    /// `dao_transfer` from or to a registered module (custody keeps its own
    /// records)
    ModuleCustody = 7220,
    /// Members-only delegation: the delegatee holds no token or holds no votes
    DelegateNotMember = 7221,
}
