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
fn owner_is_treasury_after_launch_so_owner_fns_need_self_auth() {
    // Real auth (no mock): the launch admin / strangers cannot administer the
    // Treasury after launch because owner == the Treasury itself.
    let e = Env::default();
    let (treasury, _gov) = setup_live(&e, Address::generate(&e));
    assert_eq!(treasury.get_owner(), Some(treasury.address.clone()));
    e.set_auths(&[]);
    let from = BytesN::from_array(&e, &[1u8; 32]);
    assert!(treasury.try_upgrade(&from, &from).is_err());
    assert!(treasury.try_sync_version().is_err());
    assert!(treasury
        .try_transfer_ownership(&Address::generate(&e), &1_000)
        .is_err());
}

#[test]
fn launch_is_one_shot_and_clears_pending_owner() {
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

    treasury.transfer_ownership(&attacker, &(e.ledger().sequence() + 1_000));
    treasury.launch(&new_treasury);
    assert_eq!(treasury.get_owner(), Some(new_treasury.clone()));
    assert!(treasury.try_accept_ownership().is_err());
    assert_eq!(treasury.get_owner(), Some(new_treasury.clone()));
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
