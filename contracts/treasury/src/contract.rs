use soroban_sdk::{
    auth::{ContractContext, InvokerContractAuthEntry, SubContractInvocation},
    contract, contractimpl, panic_with_error, vec, Address, BytesN, Env, IntoVal, String, Symbol,
    TryFromVal, Val, Vec,
};

use crate::error::TreasuryError;
use crate::events::{emit_execute, emit_launched, emit_treasury_initialized};
use crate::storage::*;

/// DAO treasury and the executor of passed proposals.
///
/// The Treasury holds the DAO's assets and is the admin of every DAO module
/// once launched. It acts only through `execute`, which consumes a queued
/// proposal from the Governor and dispatches its actions with the Treasury's
/// authority.
#[contract]
pub struct DaoTreasuryContract;

#[contractimpl]
impl DaoTreasuryContract {
    /// One-shot, Manager-only launch handoff (Setup -> Live).
    ///
    /// Hands the admin to `treasury` (which must be this contract's own
    /// address), marks the module live, and emits `TreasuryLaunched`. A second
    /// call panics with `AlreadyLive`.
    pub fn launch(e: &Env, treasury: Address) {
        let manager = Self::manager(e);
        manager.require_auth();
        common::lifecycle::mark_live(e);
        if treasury != e.current_contract_address() {
            panic_with_error!(e, TreasuryError::TreasuryMismatch);
        }
        common::admin::handoff(e, &treasury);
        common::ttl::extend_instance(e);
        emit_launched(e, &treasury);
    }

    /// Initializes the treasury.
    ///
    /// * `admin` - setup-phase admin (the launch admin); becomes the Treasury itself at launch
    /// * `governor` - Governor whose queued proposals `execute` consumes
    /// * `manager` - Manager contract (upgrade approvals, launch)
    /// * `current_hash`, `version` - this implementation's WASM hash and release
    pub fn __constructor(
        e: &Env,
        admin: Address,
        governor: Address,
        manager: Address,
        current_hash: BytesN<32>,
        version: String,
    ) {
        common::admin::init(e, &admin);
        e.storage()
            .instance()
            .set(&TreasuryKey::Governor, &governor);
        e.storage().instance().set(&TreasuryKey::Manager, &manager);
        common::upgrade::init(e, &current_hash, &version, STORAGE_VERSION);

        emit_treasury_initialized(e, &admin, &governor, &version);
    }

    /// Setup-phase upgrade by the launch admin. After launch the admin is the
    /// Treasury itself, whose auth nobody can produce externally, so this is
    /// dead after launch; governance upgrades go through `execute` ->
    /// `self_dispatch("upgrade")`.
    pub fn upgrade(e: &Env, from_hash: BytesN<32>, to_hash: BytesN<32>) {
        common::admin::require_admin(e);
        Self::do_upgrade(e, &from_hash, &to_hash);
    }

    /// Setup-phase only in practice, see `upgrade`.
    pub fn migrate(e: &Env) {
        common::admin::require_admin(e);
        Self::do_migrate(e);
    }

    /// Setup-phase only in practice, see `upgrade`.
    pub fn sync_version(e: &Env) {
        common::admin::require_admin(e);
        Self::do_sync_version(e);
    }

    pub fn version(e: &Env) -> String {
        common::upgrade::version(e)
    }

    pub fn wasm_hash(e: &Env) -> BytesN<32> {
        common::upgrade::current_hash(e)
    }

    /// Storage-layout version of the data held by this contract.
    pub fn storage_version(e: &Env) -> u32 {
        common::upgrade::storage_version(e)
    }

    /// Module admin: the launch admin during setup, the Treasury itself once live.
    pub fn admin(e: &Env) -> Address {
        common::admin::admin(e)
    }

    /// Read-only check of the trees an `authorize` action would carry: decodes
    /// them, enforces `MAX_AUTH_DEPTH` / `MAX_AUTH_NODES`, and returns the node
    /// count. Simulate it before proposing; panics `InvalidAuthorization`
    /// exactly as `execute` would.
    pub fn check_authorization(e: &Env, nodes: Vec<AuthNode>) -> u32 {
        Self::auth_entries(e, &vec![e, nodes.into_val(e)]);
        let mut count = 0;
        Self::count_nodes(&nodes, &mut count);
        count
    }

    /// The Governor whose queued proposals `execute` consumes.
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
    ///    proposal id. The Governor requires the Treasury's auth, which is
    ///    satisfied implicitly because the Treasury is the direct invoker. The
    ///    Governor is no longer on the call stack afterwards, so targets may
    ///    call the Governor's admin setters (Soroban forbids re-entry).
    /// 2. Each action is dispatched in order:
    ///    - target = this contract, function `authorize`: stores extra
    ///      authorization trees (one `Vec<AuthNode>` argument) for the next
    ///      action, which must be an external call;
    ///    - target = this contract, any other function: the internal allowlist
    ///      `self_dispatch` (never `invoke_contract`, which would be a
    ///      forbidden re-entry);
    ///    - any other target: invoked with the Treasury authorizing exactly
    ///      that call, plus the trees of a preceding `authorize` action.
    ///
    /// Any failing action reverts the whole transaction, including the
    /// Executed mark, so the proposal stays Queued and can be retried until it
    /// expires.
    ///
    /// # Events
    ///
    /// Emits one `Execute` event per action, carrying the proposal id.
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

        let proposal_id = common::clients::GovernorConsumeClient::new(e, &governor).consume(
            &targets,
            &functions,
            &args,
            &description_hash,
        );

        let this = e.current_contract_address();
        let authorize = Symbol::new(e, "authorize");
        let mut pending: Option<Vec<InvokerContractAuthEntry>> = None;
        for i in 0..targets.len() {
            let (Some(target), Some(function), Some(call_args)) =
                (targets.get(i), functions.get(i), args.get(i))
            else {
                panic_with_error!(e, TreasuryError::InvalidProposalLength);
            };

            if target == this && function == authorize {
                if pending.is_some() {
                    panic_with_error!(e, TreasuryError::InvalidAuthorization);
                }
                pending = Some(Self::auth_entries(e, &call_args));
            } else if target == this {
                if pending.is_some() {
                    panic_with_error!(e, TreasuryError::InvalidAuthorization);
                }
                Self::self_dispatch(e, &function, &call_args);
            } else {
                let mut entries = vec![
                    e,
                    InvokerContractAuthEntry::Contract(SubContractInvocation {
                        context: ContractContext {
                            contract: target.clone(),
                            fn_name: function.clone(),
                            args: call_args.clone(),
                        },
                        sub_invocations: vec![e],
                    }),
                ];
                if let Some(extra) = pending.take() {
                    entries.append(&extra);
                }
                e.authorize_as_current_contract(entries);
                e.invoke_contract::<Val>(&target, &function, call_args);
            }
            emit_execute(e, &governor, &target, &function, &proposal_id, i);
        }
        // An `authorize` action must be followed by the call it applies to.
        if pending.is_some() {
            panic_with_error!(e, TreasuryError::InvalidAuthorization);
        }

        proposal_id
    }
}

impl DaoTreasuryContract {
    fn manager(e: &Env) -> Address {
        common::error::require(
            e,
            e.storage().instance().get(&TreasuryKey::Manager),
            common::CommonError::ManagerNotSet,
        )
    }

    fn do_upgrade(e: &Env, from_hash: &BytesN<32>, to_hash: &BytesN<32>) {
        common::upgrade::apply(e, &Self::manager(e), from_hash, to_hash);
    }

    fn do_migrate(e: &Env) {
        common::upgrade::migrate(e, STORAGE_VERSION);
    }

    fn do_sync_version(e: &Env) {
        common::upgrade::sync_version(e, &Self::manager(e));
    }

    /// Allowlisted calls a proposal may aim at the Treasury itself. Authorized
    /// by the proposal (already consumed from the Governor), so no admin auth.
    fn self_dispatch(e: &Env, function: &Symbol, args: &Vec<Val>) {
        if *function == Symbol::new(e, "upgrade") {
            if args.len() != 2 {
                panic_with_error!(e, TreasuryError::InvalidSelfCallArgs);
            }
            let from = Self::arg::<BytesN<32>>(e, args, 0);
            let to = Self::arg::<BytesN<32>>(e, args, 1);
            Self::do_upgrade(e, &from, &to);
        } else if *function == Symbol::new(e, "migrate") {
            if !args.is_empty() {
                panic_with_error!(e, TreasuryError::InvalidSelfCallArgs);
            }
            Self::do_migrate(e);
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

    /// Decode the single `Vec<AuthNode>` argument of an `authorize` action
    /// into host auth entries, enforcing `MAX_AUTH_DEPTH` / `MAX_AUTH_NODES`.
    fn auth_entries(e: &Env, args: &Vec<Val>) -> Vec<InvokerContractAuthEntry> {
        if args.len() != 1 {
            panic_with_error!(e, TreasuryError::InvalidAuthorization);
        }
        let roots = args
            .get(0)
            .and_then(|v| Vec::<AuthNode>::try_from_val(e, &v).ok())
            .unwrap_or_else(|| panic_with_error!(e, TreasuryError::InvalidAuthorization));
        if roots.is_empty() {
            panic_with_error!(e, TreasuryError::InvalidAuthorization);
        }
        let mut budget = MAX_AUTH_NODES;
        Self::to_entries(e, &roots, 1, &mut budget)
    }

    fn count_nodes(nodes: &Vec<AuthNode>, count: &mut u32) {
        for node in nodes.iter() {
            *count += 1;
            Self::count_nodes(&node.sub, count);
        }
    }

    fn to_entries(
        e: &Env,
        nodes: &Vec<AuthNode>,
        depth: u32,
        budget: &mut u32,
    ) -> Vec<InvokerContractAuthEntry> {
        if !nodes.is_empty() && depth > MAX_AUTH_DEPTH {
            panic_with_error!(e, TreasuryError::InvalidAuthorization);
        }
        let mut out = Vec::new(e);
        for node in nodes.iter() {
            if *budget == 0 {
                panic_with_error!(e, TreasuryError::InvalidAuthorization);
            }
            *budget -= 1;
            let sub_invocations = Self::to_entries(e, &node.sub, depth + 1, budget);
            out.push_back(InvokerContractAuthEntry::Contract(SubContractInvocation {
                context: ContractContext {
                    contract: node.contract,
                    fn_name: node.fn_name,
                    args: node.args,
                },
                sub_invocations,
            }));
        }
        out
    }
}
