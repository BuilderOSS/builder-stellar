extern crate std;

use soroban_sdk::{
    contract, contractimpl, symbol_short, testutils::Address as _, vec, Address, BytesN, Env,
    IntoVal, String, Symbol, Val, Vec,
};

use crate::{DaoTreasuryContract, DaoTreasuryContractClient};

#[contract]
pub struct TargetContract;

#[contractimpl]
impl TargetContract {
    pub fn set_value(e: &Env, value: u32) -> u32 {
        e.storage().instance().set(&symbol_short!("value"), &value);
        value
    }

    pub fn get_value(e: &Env) -> u32 {
        e.storage()
            .instance()
            .get(&symbol_short!("value"))
            .unwrap_or(0)
    }
}

/// Stand-in for the Governor: `consume` returns a fixed id, or panics when the
/// `fail` flag is set (models "proposal not queued / already executed").
#[contract]
pub struct MockGovernor;

#[contractimpl]
impl MockGovernor {
    pub fn set_fail(e: &Env, fail: bool) {
        e.storage().instance().set(&symbol_short!("fail"), &fail);
    }

    pub fn consume(
        e: &Env,
        _targets: Vec<Address>,
        _functions: Vec<Symbol>,
        _args: Vec<Vec<Val>>,
        _description_hash: BytesN<32>,
    ) -> BytesN<32> {
        if e.storage()
            .instance()
            .get(&symbol_short!("fail"))
            .unwrap_or(false)
        {
            panic!("not queued");
        }
        BytesN::from_array(e, &[9u8; 32])
    }
}

fn setup_live(
    e: &Env,
    manager: Address,
) -> (
    DaoTreasuryContractClient<'static>,
    MockGovernorClient<'static>,
) {
    e.mock_all_auths();
    let governor = MockGovernorClient::new(e, &e.register(MockGovernor, ()));
    let treasury_id = e.register(
        DaoTreasuryContract,
        (
            Address::generate(e),
            governor.address.clone(),
            manager,
            BytesN::from_array(e, &[1u8; 32]),
            String::from_str(e, "0.1.0"),
        ),
    );
    let treasury = DaoTreasuryContractClient::new(e, &treasury_id);
    treasury.launch(&treasury_id);
    (treasury, governor)
}

fn desc(e: &Env) -> BytesN<32> {
    BytesN::from_array(e, &[3u8; 32])
}

#[test]
fn treasury_executes_arbitrary_call_after_consume() {
    let e = Env::default();
    let (treasury, _gov) = setup_live(&e, Address::generate(&e));
    let target = TargetContractClient::new(&e, &e.register(TargetContract, ()));

    assert_eq!(treasury.version(), String::from_str(&e, "0.1.0"));
    let id = treasury.execute(
        &vec![&e, target.address.clone()],
        &vec![&e, symbol_short!("set_value")],
        &vec![&e, vec![&e, 7_u32.into_val(&e)]],
        &desc(&e),
    );
    assert_eq!(id, BytesN::from_array(&e, &[9u8; 32]));
    assert_eq!(target.get_value(), 7);
}

#[test]
fn governor_rejection_reverts_everything() {
    let e = Env::default();
    let (treasury, gov) = setup_live(&e, Address::generate(&e));
    let target = TargetContractClient::new(&e, &e.register(TargetContract, ()));
    gov.set_fail(&true);
    let r = treasury.try_execute(
        &vec![&e, target.address.clone()],
        &vec![&e, symbol_short!("set_value")],
        &vec![&e, vec![&e, 7_u32.into_val(&e)]],
        &desc(&e),
    );
    assert!(r.is_err());
    assert_eq!(target.get_value(), 0);
}

#[test]
fn self_call_outside_allowlist_is_rejected() {
    let e = Env::default();
    let (treasury, _gov) = setup_live(&e, Address::generate(&e));
    for name in ["transfer_ownership", "execute", "launch", "nope"] {
        let r = treasury.try_execute(
            &vec![&e, treasury.address.clone()],
            &vec![&e, Symbol::new(&e, name)],
            &vec![&e, Vec::<Val>::new(&e)],
            &desc(&e),
        );
        assert_eq!(
            r.err().unwrap().unwrap(),
            crate::error::TreasuryError::UnknownSelfCall.into()
        );
    }
}

#[test]
fn self_call_with_bad_args_is_rejected() {
    let e = Env::default();
    let (treasury, _gov) = setup_live(&e, Address::generate(&e));
    let r = treasury.try_execute(
        &vec![&e, treasury.address.clone()],
        &vec![&e, Symbol::new(&e, "upgrade")],
        &vec![&e, vec![&e, 1_u32.into_val(&e)]],
        &desc(&e),
    );
    assert_eq!(
        r.err().unwrap().unwrap(),
        crate::error::TreasuryError::InvalidSelfCallArgs.into()
    );
}

#[test]
fn self_dispatch_upgrade_and_sync_version() {
    use common::testutils::{empty_wasm, MockManager, MockManagerClient};
    let e = Env::default();
    e.mock_all_auths();
    let mgr = MockManagerClient::new(&e, &e.register(MockManager, ()));
    let (treasury, _gov) = setup_live(&e, mgr.address.clone());
    let from = BytesN::from_array(&e, &[1u8; 32]);
    let to = empty_wasm(&e);
    mgr.approve(&from, &to);
    mgr.register(&from, &String::from_str(&e, "0.1.5"));
    mgr.register(&to, &String::from_str(&e, "0.2.0"));

    // sync_version first (uses the registry entry of the current hash).
    treasury.execute(
        &vec![&e, treasury.address.clone()],
        &vec![&e, Symbol::new(&e, "sync_version")],
        &vec![&e, Vec::<Val>::new(&e)],
        &desc(&e),
    );
    assert_eq!(treasury.version(), String::from_str(&e, "0.1.5"));

    treasury.execute(
        &vec![&e, treasury.address.clone()],
        &vec![&e, Symbol::new(&e, "upgrade")],
        &vec![&e, vec![&e, from.into_val(&e), to.clone().into_val(&e)]],
        &desc(&e),
    );
    e.as_contract(&treasury.address, || {
        assert_eq!(common::upgrade::current_hash(&e), to);
        assert_eq!(common::upgrade::version(&e), String::from_str(&e, "0.2.0"));
    });
}

#[test]
fn admin_is_treasury_after_launch_so_admin_fns_need_self_auth() {
    // Real auth (no mock): the launch admin / strangers cannot administer the
    // Treasury after launch because admin == the Treasury itself.
    let e = Env::default();
    let (treasury, _gov) = setup_live(&e, Address::generate(&e));
    assert_eq!(treasury.admin(), treasury.address.clone());
    e.set_auths(&[]);
    let from = BytesN::from_array(&e, &[1u8; 32]);
    assert!(treasury.try_upgrade(&from, &from).is_err());
    assert!(treasury.try_migrate().is_err());
    assert!(treasury.try_sync_version().is_err());
}

#[test]
fn launch_is_one_shot_and_hands_admin_to_self() {
    let e = Env::default();
    e.mock_all_auths();
    let owner = Address::generate(&e);
    let manager = Address::generate(&e);
    let attacker = Address::generate(&e);
    let treasury_id = e.register(
        DaoTreasuryContract,
        (
            owner.clone(),
            Address::generate(&e),
            manager,
            soroban_sdk::BytesN::from_array(&e, &[0u8; 32]),
            String::from_str(&e, "0.1.0"),
        ),
    );
    let treasury = DaoTreasuryContractClient::new(&e, &treasury_id);
    let new_treasury = treasury_id.clone();

    assert_eq!(treasury.admin(), owner);
    treasury.launch(&new_treasury);
    assert_eq!(treasury.admin(), new_treasury.clone());
    let r = treasury.try_launch(&attacker);
    assert_eq!(
        r.err().unwrap().unwrap(),
        common::CommonError::AlreadyLive.into()
    );
}

#[test]
fn launch_rejects_treasury_other_than_self() {
    let e = Env::default();
    e.mock_all_auths();
    let id = e.register(
        DaoTreasuryContract,
        (
            Address::generate(&e),
            Address::generate(&e),
            Address::generate(&e),
            soroban_sdk::BytesN::from_array(&e, &[0u8; 32]),
            String::from_str(&e, "0.1.0"),
        ),
    );
    let treasury = DaoTreasuryContractClient::new(&e, &id);
    let r = treasury.try_launch(&Address::generate(&e));
    assert_eq!(
        r.err().unwrap().unwrap(),
        crate::error::TreasuryError::TreasuryMismatch.into()
    );
}

#[test]
fn execute_before_launch_is_not_live() {
    let e = Env::default();
    e.mock_all_auths();
    let governor = Address::generate(&e);
    let id = e.register(
        DaoTreasuryContract,
        (
            Address::generate(&e),
            governor,
            Address::generate(&e),
            soroban_sdk::BytesN::from_array(&e, &[0u8; 32]),
            String::from_str(&e, "0.1.0"),
        ),
    );
    let treasury = DaoTreasuryContractClient::new(&e, &id);
    let target = e.register(TargetContract, ());
    let r = treasury.try_execute(
        &vec![&e, target],
        &vec![&e, symbol_short!("set_value")],
        &vec![&e, vec![&e, 1_u32.into_val(&e)]],
        &BytesN::from_array(&e, &[3u8; 32]),
    );
    assert_eq!(
        r.err().unwrap().unwrap(),
        common::CommonError::NotLive.into()
    );
}

mod upgrade_via_common {
    use super::*;
    use common::testutils::{empty_wasm, MockManager, MockManagerClient};
    use soroban_sdk::BytesN;

    #[test]
    fn upgrade_goes_through_common_apply() {
        let e = Env::default();
        e.mock_all_auths();
        let mgr = MockManagerClient::new(&e, &e.register(MockManager, ()));
        let from = BytesN::from_array(&e, &[1u8; 32]);
        let to = empty_wasm(&e);
        let id = e.register(
            DaoTreasuryContract,
            (
                Address::generate(&e),
                Address::generate(&e),
                mgr.address.clone(),
                from.clone(),
                String::from_str(&e, "0.1.0"),
            ),
        );
        let client = DaoTreasuryContractClient::new(&e, &id);
        mgr.approve(&from, &to);
        mgr.register(&to, &String::from_str(&e, "0.2.0"));
        client.upgrade(&from, &to);

        // Contract code is swapped to an empty module; read the stored keys directly.
        e.as_contract(&id, || {
            assert_eq!(common::upgrade::current_hash(&e), to);
            assert_eq!(common::upgrade::version(&e), String::from_str(&e, "0.2.0"));
        });
    }

    #[test]
    fn upgrade_rejected_when_not_approved() {
        let e = Env::default();
        e.mock_all_auths();
        let mgr = MockManagerClient::new(&e, &e.register(MockManager, ()));
        let from = BytesN::from_array(&e, &[1u8; 32]);
        let to = empty_wasm(&e);
        let id = e.register(
            DaoTreasuryContract,
            (
                Address::generate(&e),
                Address::generate(&e),
                mgr.address.clone(),
                from.clone(),
                String::from_str(&e, "0.1.0"),
            ),
        );
        let client = DaoTreasuryContractClient::new(&e, &id);
        mgr.register(&to, &String::from_str(&e, "0.2.0"));
        let r = client.try_upgrade(&from, &to);
        assert_eq!(
            r.err().unwrap().unwrap(),
            common::CommonError::UpgradeNotApproved.into()
        );
    }

    #[test]
    fn upgrade_and_sync_version_reject_unauthorized_caller() {
        let e = Env::default();
        e.mock_all_auths();
        let mgr = MockManagerClient::new(&e, &e.register(MockManager, ()));
        let from = BytesN::from_array(&e, &[1u8; 32]);
        let to = empty_wasm(&e);
        let id = e.register(
            DaoTreasuryContract,
            (
                Address::generate(&e),
                Address::generate(&e),
                mgr.address.clone(),
                from.clone(),
                String::from_str(&e, "0.1.0"),
            ),
        );
        let client = DaoTreasuryContractClient::new(&e, &id);
        mgr.approve(&from, &to);
        mgr.register(&to, &String::from_str(&e, "0.2.0"));
        mgr.register(&from, &String::from_str(&e, "0.1.1"));
        // Drop mock_all_auths: no authorization is provided for any address.
        e.set_auths(&[]);
        assert!(client.try_upgrade(&from, &to).is_err());
        assert!(client.try_sync_version().is_err());
        e.mock_all_auths();
        e.as_contract(&id, || {
            assert_eq!(common::upgrade::current_hash(&e), from);
            assert_eq!(common::upgrade::version(&e), String::from_str(&e, "0.1.0"));
        });
    }

    #[test]
    fn upgrade_hash_mismatch_leaves_state_unchanged() {
        let e = Env::default();
        e.mock_all_auths();
        let mgr = MockManagerClient::new(&e, &e.register(MockManager, ()));
        let from = BytesN::from_array(&e, &[1u8; 32]);
        let to = empty_wasm(&e);
        let id = e.register(
            DaoTreasuryContract,
            (
                Address::generate(&e),
                Address::generate(&e),
                mgr.address.clone(),
                from.clone(),
                String::from_str(&e, "0.1.0"),
            ),
        );
        let client = DaoTreasuryContractClient::new(&e, &id);
        let wrong = BytesN::from_array(&e, &[9u8; 32]);
        mgr.approve(&wrong, &to);
        mgr.register(&to, &String::from_str(&e, "0.2.0"));
        let r = client.try_upgrade(&wrong, &to);
        assert_eq!(
            r.err().unwrap().unwrap(),
            common::CommonError::HashMismatch.into()
        );
        e.as_contract(&id, || {
            assert_eq!(common::upgrade::current_hash(&e), from);
            assert_eq!(common::upgrade::version(&e), String::from_str(&e, "0.1.0"));
        });
    }
}

#[test]
fn sync_version_extends_instance_ttl() {
    use common::testutils::{advance_ledgers, instance_ttl, MockManager, MockManagerClient};
    let e = Env::default();
    e.mock_all_auths();
    let mgr = MockManagerClient::new(&e, &e.register(MockManager, ()));
    let (treasury, _gov) = setup_live(&e, mgr.address.clone());
    mgr.register(
        &BytesN::from_array(&e, &[1u8; 32]),
        &String::from_str(&e, "0.1.5"),
    );
    advance_ledgers(&e, 120 * 17_280);
    let before = instance_ttl(&e, &treasury.address);
    treasury.sync_version();
    let after = instance_ttl(&e, &treasury.address);
    assert!(
        after > before,
        "instance TTL not extended: {before} -> {after}"
    );
}

#[test]
fn self_dispatch_migrate_requires_a_newer_layout() {
    let e = Env::default();
    let (treasury, _gov) = setup_live(&e, Address::generate(&e));
    assert_eq!(treasury.storage_version(), crate::storage::STORAGE_VERSION);
    let r = treasury.try_execute(
        &vec![&e, treasury.address.clone()],
        &vec![&e, Symbol::new(&e, "migrate")],
        &vec![&e, Vec::<Val>::new(&e)],
        &desc(&e),
    );
    assert_eq!(
        r.err().unwrap().unwrap(),
        common::CommonError::NothingToMigrate.into()
    );
}

mod nested_authorization {
    use super::*;
    use crate::{error::TreasuryError, AuthNode, MAX_AUTH_DEPTH, MAX_AUTH_NODES};

    /// Ledger that debits `from` only with `from`'s authorization.
    #[contract]
    pub struct Ledger;

    #[contractimpl]
    impl Ledger {
        pub fn debit(e: &Env, from: Address, amount: u32) {
            from.require_auth();
            let total: u32 = e
                .storage()
                .instance()
                .get(&symbol_short!("debited"))
                .unwrap_or(0);
            e.storage()
                .instance()
                .set(&symbol_short!("debited"), &(total + amount));
        }
        pub fn debited(e: &Env) -> u32 {
            e.storage()
                .instance()
                .get(&symbol_short!("debited"))
                .unwrap_or(0)
        }
    }

    /// Calls `ledger.debit(from, amount)`: `from`'s auth is needed one level
    /// below the Treasury's direct call, like a marketplace pulling payment.
    #[contract]
    pub struct Vault;

    #[contractimpl]
    impl Vault {
        pub fn pull(e: &Env, ledger: Address, from: Address, amount: u32) {
            LedgerClient::new(e, &ledger).debit(&from, &amount);
        }
    }

    struct World {
        e: Env,
        treasury: DaoTreasuryContractClient<'static>,
        ledger: LedgerClient<'static>,
        vault: Address,
    }

    fn world() -> World {
        let e = Env::default();
        let (treasury, _gov) = setup_live(&e, Address::generate(&e));
        let ledger = LedgerClient::new(&e, &e.register(Ledger, ()));
        let vault = e.register(Vault, ());
        // Real auth from here on: only the Treasury's own entries count.
        e.set_auths(&[]);
        World {
            e,
            treasury,
            ledger,
            vault,
        }
    }

    fn debit_node(w: &World, amount: u32) -> AuthNode {
        AuthNode {
            contract: w.ledger.address.clone(),
            fn_name: Symbol::new(&w.e, "debit"),
            args: vec![
                &w.e,
                w.treasury.address.clone().into_val(&w.e),
                amount.into_val(&w.e),
            ],
            sub: Vec::new(&w.e),
        }
    }

    fn pull_args(w: &World, amount: u32) -> Vec<Val> {
        vec![
            &w.e,
            w.ledger.address.clone().into_val(&w.e),
            w.treasury.address.clone().into_val(&w.e),
            amount.into_val(&w.e),
        ]
    }

    fn authorize_args(w: &World, nodes: Vec<AuthNode>) -> Vec<Val> {
        vec![&w.e, nodes.into_val(&w.e)]
    }

    #[test]
    fn deep_auth_fails_without_authorize_action() {
        let w = world();
        let r = w.treasury.try_execute(
            &vec![&w.e, w.vault.clone()],
            &vec![&w.e, Symbol::new(&w.e, "pull")],
            &vec![&w.e, pull_args(&w, 5)],
            &desc(&w.e),
        );
        assert!(r.is_err());
        assert_eq!(w.ledger.debited(), 0);
    }

    #[test]
    fn authorize_action_covers_the_next_call() {
        let w = world();
        let nodes = vec![&w.e, debit_node(&w, 5)];
        assert_eq!(w.treasury.check_authorization(&nodes), 1);
        w.treasury.execute(
            &vec![&w.e, w.treasury.address.clone(), w.vault.clone()],
            &vec![
                &w.e,
                Symbol::new(&w.e, "authorize"),
                Symbol::new(&w.e, "pull"),
            ],
            &vec![&w.e, authorize_args(&w, nodes), pull_args(&w, 5)],
            &desc(&w.e),
        );
        assert_eq!(w.ledger.debited(), 5);
    }

    #[test]
    fn authorization_is_exact_and_single_use() {
        let w = world();
        // Wrong amount in the tree: the deeper call is not covered.
        let r = w.treasury.try_execute(
            &vec![&w.e, w.treasury.address.clone(), w.vault.clone()],
            &vec![
                &w.e,
                Symbol::new(&w.e, "authorize"),
                Symbol::new(&w.e, "pull"),
            ],
            &vec![
                &w.e,
                authorize_args(&w, vec![&w.e, debit_node(&w, 4)]),
                pull_args(&w, 5),
            ],
            &desc(&w.e),
        );
        assert!(r.is_err());
        // The trees apply to the next call only, not a later one.
        let r = w.treasury.try_execute(
            &vec![
                &w.e,
                w.treasury.address.clone(),
                w.vault.clone(),
                w.vault.clone(),
            ],
            &vec![
                &w.e,
                Symbol::new(&w.e, "authorize"),
                Symbol::new(&w.e, "pull"),
                Symbol::new(&w.e, "pull"),
            ],
            &vec![
                &w.e,
                authorize_args(&w, vec![&w.e, debit_node(&w, 5)]),
                pull_args(&w, 5),
                pull_args(&w, 5),
            ],
            &desc(&w.e),
        );
        assert!(r.is_err());
        assert_eq!(w.ledger.debited(), 0);
    }

    fn assert_invalid(
        w: &World,
        targets: Vec<Address>,
        functions: Vec<Symbol>,
        args: Vec<Vec<Val>>,
    ) {
        let r = w
            .treasury
            .try_execute(&targets, &functions, &args, &desc(&w.e));
        assert_eq!(
            r.err().unwrap().unwrap(),
            TreasuryError::InvalidAuthorization.into()
        );
    }

    #[test]
    fn malformed_authorize_actions_are_rejected() {
        let w = world();
        let t = w.treasury.address.clone();
        let auth = Symbol::new(&w.e, "authorize");
        let one = authorize_args(&w, vec![&w.e, debit_node(&w, 1)]);
        // Dangling: nothing follows.
        assert_invalid(
            &w,
            vec![&w.e, t.clone()],
            vec![&w.e, auth.clone()],
            vec![&w.e, one.clone()],
        );
        // Two in a row.
        assert_invalid(
            &w,
            vec![&w.e, t.clone(), t.clone(), w.vault.clone()],
            vec![&w.e, auth.clone(), auth.clone(), Symbol::new(&w.e, "pull")],
            vec![&w.e, one.clone(), one.clone(), pull_args(&w, 1)],
        );
        // Followed by a self call.
        assert_invalid(
            &w,
            vec![&w.e, t.clone(), t.clone()],
            vec![&w.e, auth.clone(), Symbol::new(&w.e, "sync_version")],
            vec![&w.e, one.clone(), Vec::<Val>::new(&w.e)],
        );
        // Empty tree list and wrong argument shapes.
        for bad in [
            authorize_args(&w, Vec::new(&w.e)),
            Vec::<Val>::new(&w.e),
            vec![&w.e, 7_u32.into_val(&w.e)],
        ] {
            assert_invalid(
                &w,
                vec![&w.e, t.clone(), w.vault.clone()],
                vec![&w.e, auth.clone(), Symbol::new(&w.e, "pull")],
                vec![&w.e, bad, pull_args(&w, 1)],
            );
        }
    }

    #[test]
    fn tree_size_and_depth_are_bounded() {
        let w = world();
        let wide: Vec<AuthNode> = {
            let mut v = Vec::new(&w.e);
            for _ in 0..=MAX_AUTH_NODES {
                v.push_back(debit_node(&w, 1));
            }
            v
        };
        assert_eq!(
            w.treasury
                .try_check_authorization(&wide)
                .err()
                .unwrap()
                .unwrap(),
            TreasuryError::InvalidAuthorization.into()
        );
        let mut deep = debit_node(&w, 1);
        for _ in 0..MAX_AUTH_DEPTH {
            let mut parent = debit_node(&w, 1);
            parent.sub = vec![&w.e, deep];
            deep = parent;
        }
        assert_eq!(
            w.treasury
                .try_check_authorization(&vec![&w.e, deep.clone()])
                .err()
                .unwrap()
                .unwrap(),
            TreasuryError::InvalidAuthorization.into()
        );
        // One level shallower fits.
        assert_eq!(
            w.treasury
                .check_authorization(&vec![&w.e, deep.sub.get(0).unwrap()]),
            MAX_AUTH_DEPTH
        );
    }
}
