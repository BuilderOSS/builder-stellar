extern crate std;

use soroban_sdk::{contract, contractimpl, Address, BytesN, Env, String};

use crate::{
    lifecycle,
    testutils::{empty_wasm, MockManager, MockManagerClient},
    upgrade, CommonError,
};

#[contract]
struct Harness;

#[contractimpl]
impl Harness {
    pub fn __constructor(e: Env, hash: BytesN<32>, version: String) {
        upgrade::init(&e, &hash, &version);
    }
    pub fn upgrade(e: Env, manager: Address, from: BytesN<32>, to: BytesN<32>) {
        upgrade::apply(&e, &manager, &from, &to);
    }
    pub fn sync_version(e: Env, manager: Address) -> String {
        upgrade::sync_version(&e, &manager)
    }
    pub fn state(e: Env) -> (BytesN<32>, String) {
        (upgrade::current_hash(&e), upgrade::version(&e))
    }
    pub fn version(e: Env) -> String {
        upgrade::version(&e)
    }
    pub fn need_live(e: Env) {
        lifecycle::require_live(&e);
    }
    pub fn go_live(e: Env) {
        lifecycle::mark_live(&e);
    }
    pub fn need_setup(e: Env) {
        lifecycle::require_setup(&e);
    }
}

fn h(e: &Env, b: u8) -> BytesN<32> {
    BytesN::from_array(e, &[b; 32])
}

fn setup() -> (Env, HarnessClient<'static>, MockManagerClient<'static>) {
    let e = Env::default();
    e.mock_all_auths();
    let mgr = MockManagerClient::new(&e, &e.register(MockManager, ()));
    let c = HarnessClient::new(
        &e,
        &e.register(Harness, (h(&e, 1), String::from_str(&e, "0.1.0"))),
    );
    (e, c, mgr)
}

fn assert_unchanged(e: &Env, c: &HarnessClient) {
    assert_eq!(c.state(), (h(e, 1), String::from_str(e, "0.1.0")));
}

#[test]
fn upgrade_hash_mismatch() {
    let (e, c, mgr) = setup();
    mgr.approve(&h(&e, 9), &h(&e, 2));
    mgr.register(&h(&e, 2), &String::from_str(&e, "0.2.0"));
    let r = c.try_upgrade(&mgr.address, &h(&e, 9), &h(&e, 2));
    assert_eq!(r.err().unwrap().unwrap(), CommonError::HashMismatch.into());
    assert_unchanged(&e, &c);
}

#[test]
fn upgrade_not_approved() {
    let (e, c, mgr) = setup();
    mgr.register(&h(&e, 2), &String::from_str(&e, "0.2.0"));
    let r = c.try_upgrade(&mgr.address, &h(&e, 1), &h(&e, 2));
    assert_eq!(
        r.err().unwrap().unwrap(),
        CommonError::UpgradeNotApproved.into()
    );
    assert_unchanged(&e, &c);
}

#[test]
fn upgrade_missing_registry_entry() {
    let (e, c, mgr) = setup();
    mgr.approve(&h(&e, 1), &h(&e, 2));
    let r = c.try_upgrade(&mgr.address, &h(&e, 1), &h(&e, 2));
    assert_eq!(
        r.err().unwrap().unwrap(),
        CommonError::ImplementationNotFound.into()
    );
    assert_unchanged(&e, &c);
}

#[test]
fn upgrade_ok_updates_hash_and_version() {
    let (e, c, mgr) = setup();
    // Minimal valid wasm module; `apply` swaps the contract code to it.
    let to = empty_wasm(&e);
    mgr.approve(&h(&e, 1), &to);
    mgr.register(&to, &String::from_str(&e, "0.2.0"));
    c.upgrade(&mgr.address, &h(&e, 1), &to);
    // Contract code is replaced; verify the stored keys directly.
    e.as_contract(&c.address, || {
        assert_eq!(upgrade::current_hash(&e), to);
        assert_eq!(upgrade::version(&e), String::from_str(&e, "0.2.0"));
    });
}

#[test]
fn sync_version_reads_registry() {
    let (e, c, mgr) = setup();
    assert_eq!(c.version(), String::from_str(&e, "0.1.0"));
    mgr.register(&h(&e, 1), &String::from_str(&e, "0.1.1"));
    assert_eq!(c.sync_version(&mgr.address), String::from_str(&e, "0.1.1"));
    assert_eq!(c.version(), String::from_str(&e, "0.1.1"));
}

#[test]
fn lifecycle_flow() {
    let (_e, c, _) = setup();
    c.need_setup();
    assert_eq!(
        c.try_need_live().err().unwrap().unwrap(),
        CommonError::NotLive.into()
    );
    c.go_live();
    c.need_live();
    assert_eq!(
        c.try_go_live().err().unwrap().unwrap(),
        CommonError::AlreadyLive.into()
    );
    assert_eq!(
        c.try_need_setup().err().unwrap().unwrap(),
        CommonError::AlreadyLive.into()
    );
}
