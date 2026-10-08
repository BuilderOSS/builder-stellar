extern crate std;

use soroban_sdk::testutils::{MockAuth, MockAuthInvoke};
use soroban_sdk::{
    contract, contractimpl, symbol_short, testutils::Address as _, vec, Address, Env, IntoVal,
    String, Val, Vec,
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

#[test]
fn treasury_executes_arbitrary_call_for_governor() {
    let e = Env::default();
    e.mock_all_auths();

    let owner = Address::generate(&e);
    let governor = Address::generate(&e);
    let treasury_id = e.register(
        DaoTreasuryContract,
        (
            owner.clone(),
            governor.clone(),
            Address::generate(&e),
            soroban_sdk::BytesN::from_array(&e, &[0u8; 32]),
            String::from_str(&e, "0.1.0"),
        ),
    );
    let treasury = DaoTreasuryContractClient::new(&e, &treasury_id);
    // Treasury only executes once launched.
    e.mock_all_auths();
    treasury.launch(&treasury_id);
    let target_id = e.register(TargetContract, ());
    let target = TargetContractClient::new(&e, &target_id);

    let args: Vec<Val> = vec![&e, 7_u32.into_val(&e)];
    assert_eq!(treasury.version(), String::from_str(&e, "0.1.0"));
    assert_eq!(
        treasury.wasm_hash(),
        soroban_sdk::BytesN::from_array(&e, &[0u8; 32])
    );
    treasury.execute(&target.address, &symbol_short!("set_value"), &args);

    assert_eq!(target.get_value(), 7);
}

#[test]
#[should_panic(expected = "HostError: Error(Auth, InvalidAction)")]
fn treasury_rejects_non_governor() {
    let e = Env::default();
    let owner = Address::generate(&e);
    let governor = Address::generate(&e);
    let attacker = Address::generate(&e);
    let treasury_id = e.register(
        DaoTreasuryContract,
        (
            owner.clone(),
            governor.clone(),
            Address::generate(&e),
            soroban_sdk::BytesN::from_array(&e, &[0u8; 32]),
            String::from_str(&e, "0.1.0"),
        ),
    );
    let treasury = DaoTreasuryContractClient::new(&e, &treasury_id);
    // Treasury only executes once launched.
    e.mock_all_auths();
    treasury.launch(&treasury_id);
    let target_id = e.register(TargetContract, ());
    let target = TargetContractClient::new(&e, &target_id);

    let args: Vec<Val> = vec![&e, 7_u32.into_val(&e)];
    e.mock_auths(&[MockAuth {
        address: &attacker,
        invoke: &MockAuthInvoke {
            contract: &treasury.address,
            fn_name: "execute",
            args: (&target.address, symbol_short!("set_value"), &args).into_val(&e),
            sub_invokes: &[],
        },
    }]);

    treasury.execute(&target.address, &symbol_short!("set_value"), &args);
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
        &target,
        &symbol_short!("set_value"),
        &vec![&e, 1_u32.into_val(&e)],
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
