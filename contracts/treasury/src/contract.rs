use soroban_sdk::{
    auth::{ContractContext, InvokerContractAuthEntry, SubContractInvocation},
    contract, contractimpl, vec, Address, BytesN, Env, String, Symbol, Val, Vec,
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

    pub fn upgrade(e: &Env, from_hash: BytesN<32>, to_hash: BytesN<32>) {
        let owner = common::error::require(
            e,
            stellar_access::ownable::get_owner(e),
            common::CommonError::OwnerNotSet,
        );
        owner.require_auth();
        let manager = Self::manager(e);
        common::upgrade::apply(e, &manager, &from_hash, &to_hash);
    }

    pub fn version(e: &Env) -> String {
        common::upgrade::version(e)
    }

    pub fn wasm_hash(e: &Env) -> BytesN<32> {
        common::upgrade::current_hash(e)
    }

    pub fn sync_version(e: &Env) {
        let owner = common::error::require(
            e,
            stellar_access::ownable::get_owner(e),
            common::CommonError::OwnerNotSet,
        );
        owner.require_auth();
        let manager = Self::manager(e);
        common::upgrade::sync_version(e, &manager);
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
    /// Panics if the governor is not set (should never happen after initialization).
    pub fn governor(e: &Env) -> Address {
        e.storage()
            .instance()
            .get(&TreasuryKey::Governor)
            .expect("governor not set")
    }

    /// Executes an approved proposal action on a target contract.
    ///
    /// This is the core function of the Treasury - it receives execution instructions
    /// from the Governor and invokes the target contract with the Treasury's authority.
    /// The Treasury authorizes itself as the caller, allowing the target to authenticate
    /// the action as coming from the DAO.
    ///
    /// # Arguments
    ///
    /// * `target` - The contract address to invoke
    /// * `function` - The function name to call on the target
    /// * `args` - The arguments to pass to the function
    ///
    /// # Returns
    ///
    /// The return value from the target function invocation.
    ///
    /// # Authorization
    ///
    /// Requires authentication from the Governor contract. The Treasury then authorizes
    /// itself when invoking the target, establishing a two-layer authorization chain:
    /// Governor → Treasury → Target.
    ///
    /// # Security
    ///
    /// The authorization structure ensures:
    /// - Only the Governor can trigger executions (prevents direct calls)
    /// - The Treasury appears as the authenticated caller to targets (DAO authority)
    /// - Sub-invocations can also use Treasury authority if needed
    ///
    /// # Events
    ///
    /// Emits an `Execute` event with the execution details.
    pub fn execute(e: &Env, target: Address, function: Symbol, args: Vec<Val>) -> Val {
        // Setup-window proposals must not be executable after launch, and the
        // treasury moves no funds before launch.
        common::lifecycle::require_live(e);
        let governor = Self::governor(e);
        governor.require_auth();

        // Authorize this Treasury contract as the authorizer of the
        // immediate target function invocation.
        //
        // If deeper downstream invocations require Treasury authorization,
        // those invocations must also be represented in `sub_invocations`.
        e.authorize_as_current_contract(vec![
            e,
            InvokerContractAuthEntry::Contract(SubContractInvocation {
                context: ContractContext {
                    contract: target.clone(),
                    fn_name: function.clone(),
                    args: args.clone(),
                },
                sub_invocations: vec![e],
            }),
        ]);

        let result = e.invoke_contract::<Val>(&target, &function, args.clone());

        emit_execute(e, &governor, &target, &function);

        result
    }
}

/// Implements the Ownable trait for access control.
///
/// Provides owner management functions:
/// - `owner()` - Get the current owner address
/// - `transfer_ownership()` - Transfer ownership to a new address
/// - `renounce_ownership()` - Remove the owner (use with extreme caution)
///
/// The owner has the ability to change the Governor contract, providing an escape
/// hatch if the governance system becomes compromised.
#[contractimpl(contracttrait)]
impl Ownable for DaoTreasuryContract {}
