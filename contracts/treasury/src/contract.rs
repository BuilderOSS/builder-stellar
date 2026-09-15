use soroban_sdk::{
    auth::{ContractContext, InvokerContractAuthEntry, SubContractInvocation},
    contract, contractimpl, vec, Address, Env, Symbol, Val, Vec,
};
use stellar_access::ownable::{set_owner, Ownable};
use stellar_macros::only_owner;

use crate::events::{emit_execute, emit_governor_changed, emit_treasury_initialized};
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
    pub fn __constructor(e: &Env, owner: Address, governor: Address) {
        set_owner(e, &owner);
        e.storage()
            .instance()
            .set(&TreasuryKey::Governor, &governor);

        emit_treasury_initialized(e, &owner, &governor);
    }

    /// Updates the authorized governor contract address.
    ///
    /// Only the owner can call this function. This allows replacing a compromised
    /// or upgraded Governor contract without losing Treasury assets or authority.
    ///
    /// # Arguments
    ///
    /// * `governor` - The new governor contract address
    ///
    /// # Authorization
    ///
    /// Requires owner authentication (enforced by `#[only_owner]` macro).
    ///
    /// # Events
    ///
    /// Emits a `GovernorChanged` event with old and new governor addresses.
    #[only_owner]
    pub fn set_governor(e: &Env, governor: Address) {
        let old_governor = Self::governor(e);

        e.storage()
            .instance()
            .set(&TreasuryKey::Governor, &governor);

        emit_governor_changed(e, &old_governor, &governor);
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
