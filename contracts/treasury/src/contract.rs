use soroban_sdk::{
    auth::{ContractContext, InvokerContractAuthEntry, SubContractInvocation},
    contract, contractimpl, panic_with_error, vec, Address, BytesN, Env, String, Symbol,
    TryFromVal, Val, Vec,
};
use stellar_access::ownable::{set_owner, Ownable};

use crate::error::TreasuryError;
use crate::events::{emit_execute, emit_launched, emit_treasury_initialized};
use crate::storage::*;

/// Main contract for DAO treasury operations.
///
/// This contract serves as an execution boundary, receiving instructions from the
/// Governor contract and executing them with the Treasury's authority. It provides
/// security isolation between governance decisions and their execution.
#[contract]
pub struct DaoTreasuryContract;

#[contractimpl]
impl DaoTreasuryContract {
    /// One-shot, Manager-only launch handoff (Setup -> Live).
    ///
    /// Sets the owner to `treasury` (which is this contract's own address in the
    /// Manager flow), clears any pending two-step ownership transfer, marks the
    /// module live, and emits `Launched`. A second call panics with `AlreadyLive`.
    pub fn launch(e: &Env, treasury: Address) {
        let manager = Self::manager(e);
        manager.require_auth();
        common::lifecycle::mark_live(e);
        // The treasury is its own owner after launch.
        if treasury != e.current_contract_address() {
            soroban_sdk::panic_with_error!(e, TreasuryError::TreasuryMismatch);
        }
        common::ownership::handoff_owner(e, &treasury);
        common::ttl::extend_instance(e);
        emit_launched(e, &treasury);
    }

    /// Initializes the treasury contract with an owner and governor.
    ///
    /// # Arguments
    ///
    /// * `owner` - The address that will own and control the contract
    /// * `governor` - The governance contract authorized to execute proposals
    ///
    /// # Events
    ///
    /// Emits a `TreasuryInitialized` event with the initialization parameters.
    pub fn __constructor(
        e: &Env,
        owner: Address,
        governor: Address,
        manager: Address,
        current_hash: BytesN<32>,
        version: String,
    ) {
        set_owner(e, &owner);
        e.storage()
            .instance()
            .set(&TreasuryKey::Governor, &governor);
        e.storage().instance().set(&TreasuryKey::Manager, &manager);
        common::upgrade::init(e, &current_hash, &version);

        emit_treasury_initialized(e, &owner, &governor, &version);
    }

    /// Setup-phase upgrade by the launch admin. After launch the owner is the
    /// Treasury itself, whose auth nobody can produce externally, so this is
    /// dead after launch; governance upgrades go through `execute` ->
    /// `self_dispatch("upgrade")`.
    pub fn upgrade(e: &Env, from_hash: BytesN<32>, to_hash: BytesN<32>) {
        Self::require_owner_auth(e);
        Self::do_upgrade(e, &from_hash, &to_hash);
    }

    pub fn version(e: &Env) -> String {
        common::upgrade::version(e)
    }

    pub fn wasm_hash(e: &Env) -> BytesN<32> {
        common::upgrade::current_hash(e)
    }

    /// Setup-phase only in practice, see `upgrade`.
    pub fn sync_version(e: &Env) {
        Self::require_owner_auth(e);
        Self::do_sync_version(e);
    }

    fn manager(e: &Env) -> Address {
        e.storage()
            .instance()
            .get(&TreasuryKey::Manager)
            .unwrap_or_else(|| {
                soroban_sdk::panic_with_error!(e, common::CommonError::ManagerNotSet)
            })
    }

    /// Returns the address of the authorized governor contract.
    ///
    /// # Returns
    ///
    /// The governor contract address.
    ///
    /// # Panics
    ///
    /// Aborts with `CommonError::GovernorNotSet` if the governor is not set (should
    /// never happen after construction).
    pub fn governor(e: &Env) -> Address {
        common::error::require(
            e,
            e.storage().instance().get(&TreasuryKey::Governor),
            common::CommonError::GovernorNotSet,
        )
    }

    /// Executes a queued proposal. The Treasury is the top-level executor.
    ///
    /// Anyone may call this; authority comes from the Governor's approval.
    ///
    /// 1. `governor.consume(...)` (a returning call) checks the proposal is
    ///    Queued, past its ETA and unexpired, marks it Executed, and returns the
    ///    proposal id. The Governor requires the Treasury's auth, which the
    ///    Treasury grants for exactly that call. The Governor is no longer on
    ///    the call stack afterwards, so targets may call the Governor's owner
    ///    setters (Soroban forbids re-entry).
    /// 2. Each call is dispatched in order. Calls whose target is this contract
    ///    go through the internal allowlist `self_dispatch` (never
    ///    `invoke_contract`, which would be a forbidden re-entry); any other
    ///    target is invoked with the Treasury authorizing exactly that call.
    ///
    /// Any failing call reverts the whole transaction, including the Executed
    /// mark, so the proposal stays Queued and can be retried until it expires.
    ///
    /// Resource impact: one extra cross-contract call (`consume`) and one
    /// persistent write in the Governor per execution; no new Treasury storage.
    ///
    /// # Events
    ///
    /// Emits one `Execute` event per call, carrying the proposal id.
    pub fn execute(
        e: &Env,
        targets: Vec<Address>,
        functions: Vec<Symbol>,
        args: Vec<Vec<Val>>,
        description_hash: BytesN<32>,
    ) -> BytesN<32> {
        common::lifecycle::require_live(e);
        common::ttl::extend_instance(e);
        let governor = Self::governor(e);

        // No explicit auth entry: the Governor's `treasury.require_auth()` on this
        // direct call is satisfied implicitly because the Treasury is the invoker.
        let proposal_id = common::clients::GovernorConsumeClient::new(e, &governor).consume(
            &targets,
            &functions,
            &args,
            &description_hash,
        );

        let this = e.current_contract_address();
        for i in 0..targets.len() {
            let (Some(target), Some(function), Some(call_args)) =
                (targets.get(i), functions.get(i), args.get(i))
            else {
                panic_with_error!(e, TreasuryError::InvalidProposalLength);
            };

            if target == this {
                Self::self_dispatch(e, &function, &call_args);
            } else {
                // If deeper downstream invocations require Treasury
                // authorization they would need `sub_invocations`; the default
                // is a single authorized level.
                e.authorize_as_current_contract(vec![
                    e,
                    InvokerContractAuthEntry::Contract(SubContractInvocation {
                        context: ContractContext {
                            contract: target.clone(),
                            fn_name: function.clone(),
                            args: call_args.clone(),
                        },
                        sub_invocations: vec![e],
                    }),
                ]);
                e.invoke_contract::<Val>(&target, &function, call_args);
            }
            emit_execute(e, &governor, &target, &function, &proposal_id, i);
        }

        proposal_id
    }
}

impl DaoTreasuryContract {
    fn require_owner_auth(e: &Env) {
        let owner = common::error::require(
            e,
            stellar_access::ownable::get_owner(e),
            common::CommonError::OwnerNotSet,
        );
        owner.require_auth();
    }

    fn do_upgrade(e: &Env, from_hash: &BytesN<32>, to_hash: &BytesN<32>) {
        let manager = Self::manager(e);
        common::upgrade::apply(e, &manager, from_hash, to_hash);
    }

    fn do_sync_version(e: &Env) {
        let manager = Self::manager(e);
        common::upgrade::sync_version(e, &manager);
    }

    /// Allowlisted calls a proposal may aim at the Treasury itself. Authorized
    /// by the proposal (already consumed from the Governor), so no owner auth.
    fn self_dispatch(e: &Env, function: &Symbol, args: &Vec<Val>) {
        if *function == Symbol::new(e, "upgrade") {
            if args.len() != 2 {
                panic_with_error!(e, TreasuryError::InvalidSelfCallArgs);
            }
            let from = Self::arg::<BytesN<32>>(e, args, 0);
            let to = Self::arg::<BytesN<32>>(e, args, 1);
            Self::do_upgrade(e, &from, &to);
        } else if *function == Symbol::new(e, "sync_version") {
            if !args.is_empty() {
                panic_with_error!(e, TreasuryError::InvalidSelfCallArgs);
            }
            Self::do_sync_version(e);
        } else {
            panic_with_error!(e, TreasuryError::UnknownSelfCall);
        }
    }

    fn arg<T: TryFromVal<Env, Val>>(e: &Env, args: &Vec<Val>, i: u32) -> T {
        args.get(i)
            .and_then(|v| T::try_from_val(e, &v).ok())
            .unwrap_or_else(|| panic_with_error!(e, TreasuryError::InvalidSelfCallArgs))
    }
}

/// Implements the Ownable trait for access control.
///
/// Provides owner management functions:
/// - `owner()` - Get the current owner address
/// - `transfer_ownership()` - Transfer ownership to a new address
/// - `renounce_ownership()` - Remove the owner (use with extreme caution)
///
/// After launch the owner is the Treasury itself, so no external account can
/// satisfy owner auth; the Treasury is administered only via `execute` ->
/// `self_dispatch`. The impl is kept because the Manager's launch flow and
/// bindings use `get_owner` and the setup-phase two-step transfer.
#[contractimpl(contracttrait)]
impl Ownable for DaoTreasuryContract {}
