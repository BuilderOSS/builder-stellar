extern crate std;

use soroban_sdk::{
    contract, contractimpl,
    testutils::{Address as _, Events as _},
    Address, BytesN, Env, Event as _, String,
};

use crate::{
    admin::{self, AdminChanged},
    lifecycle,
    testutils::{empty_wasm, MockManager, MockManagerClient},
    upgrade::{self, Migrated, Upgraded, VersionSynced},
    CommonError,
};

#[contract]
struct Harness;

#[contractimpl]
impl Harness {
    pub fn __constructor(e: Env, hash: BytesN<32>, version: String, admin: Address) {
        upgrade::init(&e, &hash, &version, 1);
        admin::init(&e, &admin);
    }
    pub fn migrate(e: Env, code_storage_version: u32) -> u32 {
        upgrade::migrate(&e, code_storage_version)
    }
    pub fn storage_version(e: Env) -> u32 {
        upgrade::storage_version(&e)
    }
    pub fn admin(e: Env) -> Address {
        admin::admin(&e)
    }
    pub fn admin_only(e: Env) {
        admin::require_admin(&e);
    }
    pub fn handoff(e: Env, new_admin: Address) {
        admin::handoff(&e, &new_admin);
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
    let admin = Address::generate(&e);
    let c = HarnessClient::new(
        &e,
        &e.register(Harness, (h(&e, 1), String::from_str(&e, "0.1.0"), admin)),
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
    assert_eq!(
        e.events().all().events().last().unwrap(),
        &Upgraded {
            from_hash: h(&e, 1),
            to_hash: to.clone(),
            version: String::from_str(&e, "0.2.0"),
        }
        .to_xdr(&e, &c.address)
    );
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
    assert_eq!(
        e.events().all().events().last().unwrap(),
        &VersionSynced {
            version: String::from_str(&e, "0.1.1"),
        }
        .to_xdr(&e, &c.address)
    );
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

#[test]
fn migrate_advances_storage_version_once() {
    let (e, c, _) = setup();
    assert_eq!(c.storage_version(), 1);
    assert_eq!(
        c.try_migrate(&1).err().unwrap().unwrap(),
        CommonError::NothingToMigrate.into()
    );
    assert_eq!(c.migrate(&2), 1);
    assert_eq!(
        e.events().all().events().last().unwrap(),
        &Migrated {
            from_storage_version: 1,
            to_storage_version: 2,
        }
        .to_xdr(&e, &c.address)
    );
    assert_eq!(c.storage_version(), 2);
    assert_eq!(
        c.try_migrate(&2).err().unwrap().unwrap(),
        CommonError::NothingToMigrate.into()
    );
}

#[test]
fn admin_handoff_moves_authority_and_emits() {
    let (e, c, _) = setup();
    let first = c.admin();
    let treasury = Address::generate(&e);
    c.handoff(&treasury);
    assert_eq!(
        e.events().all().events().last().unwrap(),
        &AdminChanged {
            old_admin: first,
            new_admin: treasury.clone(),
        }
        .to_xdr(&e, &c.address)
    );
    assert_eq!(c.admin(), treasury);
    c.admin_only();
    assert_eq!(e.auths().last().unwrap().0, treasury);
}

#[test]
fn error_codes_sit_in_the_common_block() {
    use crate::error::codes;
    for code in [
        CommonError::NotLive,
        CommonError::AlreadyLive,
        CommonError::ManagerNotSet,
        CommonError::CurrentHashNotSet,
        CommonError::HashMismatch,
        CommonError::UpgradeNotApproved,
        CommonError::ImplementationNotFound,
        CommonError::AdminNotSet,
        CommonError::VersionNotSet,
        CommonError::TreasuryNotSet,
        CommonError::GovernorNotSet,
        CommonError::NothingToMigrate,
        CommonError::StorageVersionNotSet,
    ] {
        let c = code as u32;
        assert!(c > codes::COMMON && c < codes::COMMON + codes::BLOCK_SIZE);
    }
}
