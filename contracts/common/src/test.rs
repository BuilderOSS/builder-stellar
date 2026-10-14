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
    upgrade::{self, Migrated, Upgraded},
    CommonError,
};

#[contract]
struct Harness;

#[contractimpl]
impl Harness {
    pub fn __constructor(e: Env, hash: BytesN<32>, admin: Address) {
        upgrade::init(&e, &hash, 1);
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
    pub fn state(e: Env, manager: Address) -> (BytesN<32>, String) {
        (upgrade::current_hash(&e), upgrade::version(&e, &manager))
    }
    pub fn version(e: Env, manager: Address) -> String {
        upgrade::version(&e, &manager)
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
    let c = HarnessClient::new(&e, &e.register(Harness, (h(&e, 1), admin)));
    mgr.register(&h(&e, 1), &String::from_str(&e, "0.1.0"));
    (e, c, mgr)
}

fn assert_unchanged(e: &Env, c: &HarnessClient, mgr: &MockManagerClient) {
    assert_eq!(
        c.state(&mgr.address),
        (h(e, 1), String::from_str(e, "0.1.0"))
    );
}

#[test]
fn upgrade_hash_mismatch() {
    let (e, c, mgr) = setup();
    mgr.approve(&h(&e, 9), &h(&e, 2));
    mgr.register(&h(&e, 2), &String::from_str(&e, "0.2.0"));
    let r = c.try_upgrade(&mgr.address, &h(&e, 9), &h(&e, 2));
    assert_eq!(r.err().unwrap().unwrap(), CommonError::HashMismatch.into());
    assert_unchanged(&e, &c, &mgr);
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
    assert_unchanged(&e, &c, &mgr);
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
    assert_unchanged(&e, &c, &mgr);
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
        assert_eq!(
            upgrade::version(&e, &mgr.address),
            String::from_str(&e, "0.2.0")
        );
    });
}

/// D6: nothing to sync. `version()` follows the registry record of the
/// running hash on every read, and fails loudly for an unknown hash.
#[test]
fn version_is_read_from_the_registry() {
    let (e, c, mgr) = setup();
    assert_eq!(c.version(&mgr.address), String::from_str(&e, "0.1.0"));
    mgr.register(&h(&e, 1), &String::from_str(&e, "0.1.1"));
    assert_eq!(c.version(&mgr.address), String::from_str(&e, "0.1.1"));
    let empty = MockManagerClient::new(&e, &e.register(MockManager, ()));
    assert_eq!(
        c.try_version(&empty.address).err().unwrap().unwrap(),
        CommonError::ImplementationNotFound.into()
    );
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

/// D30: the exact XDR of a namespaced key. apps/web/src/lib/storage-key.test.ts
/// pins the same bytes, so the off-chain readers and the contracts agree.
#[test]
fn namespaced_key_xdr_is_pinned() {
    use soroban_sdk::xdr::{Limits, ScVal, WriteXdr};
    use soroban_sdk::{contracttype, Env, IntoVal, TryFromVal, Val};
    #[contracttype]
    enum Probe {
        Admin,
        Listing(u32),
    }
    let e = Env::default();
    let hex = |v: Val| {
        let sc = ScVal::try_from_val(&e, &v).unwrap();
        let bytes = sc.to_xdr(Limits::none()).unwrap();
        bytes
            .iter()
            .map(|b| std::format!("{b:02x}"))
            .collect::<std::string::String>()
    };
    assert_eq!(
        hex(crate::ns(&e, Probe::Admin).into_val(&e)),
        "0000001000000001000000020000000f000000076275696c646572000000001000000001000000010000000f0000000541646d696e000000"
    );
    assert_eq!(
        hex(crate::ns(&e, Probe::Listing(7)).into_val(&e)),
        "0000001000000001000000020000000f000000076275696c646572000000001000000001000000020000000f000000074c697374696e67000000000300000007"
    );
}

// ---------------------------------------------------------------------------
// TTL policy (`crate::ttl`), with every starting TTL set explicitly.
// ---------------------------------------------------------------------------

mod ttl_policy {
    extern crate std;
    use crate::ttl::*;
    use soroban_sdk::{
        contract, contractimpl,
        testutils::{storage::Persistent as _, Deployer as _, Ledger as _},
        Env,
    };

    #[contract]
    struct TtlProbe;

    #[contractimpl]
    impl TtlProbe {
        /// What every module's state-changing entry point does first.
        pub fn touch(e: Env) {
            extend_instance(&e);
        }
        /// Set the instance or the code TTL to exactly `to` (test setup).
        pub fn set_instance_ttl(e: Env, to: u32) {
            e.deployer()
                .extend_ttl_for_contract_instance(e.current_contract_address(), to, to);
        }
        pub fn set_code_ttl(e: Env, to: u32) {
            e.deployer()
                .extend_ttl_for_code(e.current_contract_address(), to, to);
        }
        pub fn put(e: Env, key: u32) {
            e.storage().persistent().set(&key, &key);
        }
        pub fn renew(e: Env, key: u32) {
            extend_persistent(&e, &key);
        }
        pub fn renew_for(e: Env, key: u32, threshold: u32, extend_to: u32) {
            extend_persistent_for(&e, &key, threshold, extend_to);
        }
    }

    const MAX_ENTRY_TTL: u32 = 3_110_400; // testnet, 2026-10-12

    /// A probe whose instance and code are born with one day of TTL, under
    /// testnet's maximum entry TTL.
    fn probe() -> (Env, TtlProbeClient<'static>) {
        let e = Env::default();
        e.ledger().with_mut(|l| {
            l.sequence_number = 1_000;
            l.min_persistent_entry_ttl = DAY_IN_LEDGERS;
            l.max_entry_ttl = MAX_ENTRY_TTL;
        });
        let id = e.register(TtlProbe, ());
        let client = TtlProbeClient::new(&e, &id);
        (e, client)
    }

    fn ttls(e: &Env, c: &TtlProbeClient) -> (u32, u32) {
        (
            e.deployer().get_contract_instance_ttl(&c.address),
            e.deployer().get_contract_code_ttl(&c.address),
        )
    }

    fn persistent_ttl(e: &Env, c: &TtlProbeClient, key: u32) -> u32 {
        e.as_contract(&c.address, || e.storage().persistent().get_ttl(&key))
    }

    #[test]
    fn code_below_its_threshold_gets_four_days_and_the_instance_is_untouched() {
        let (e, c) = probe();
        c.set_instance_ttl(&(100 * DAY_IN_LEDGERS));
        let (instance, code) = ttls(&e, &c);
        assert_eq!(instance, 100 * DAY_IN_LEDGERS);
        assert!(code < CODE_TTL_THRESHOLD, "{code}");
        c.touch();
        assert_eq!(ttls(&e, &c), (100 * DAY_IN_LEDGERS, CODE_TTL_EXTEND_TO));
    }

    #[test]
    fn instance_below_its_threshold_gets_170_days_and_the_code_is_untouched() {
        let (e, c) = probe();
        c.set_code_ttl(&(30 * DAY_IN_LEDGERS));
        let (instance, code) = ttls(&e, &c);
        assert!(instance < INSTANCE_TTL_THRESHOLD, "{instance}");
        assert_eq!(code, 30 * DAY_IN_LEDGERS);
        c.touch();
        assert_eq!(ttls(&e, &c), (INSTANCE_TTL_EXTEND_TO, 30 * DAY_IN_LEDGERS));
    }

    /// The original bug (docs/STORAGE_DIET.md D27): with both low, the
    /// old `instance().extend_ttl` pushed code to 170 days at the caller's cost.
    #[test]
    fn both_below_never_push_code_past_four_days() {
        let (e, c) = probe();
        c.touch();
        assert_eq!(ttls(&e, &c), (INSTANCE_TTL_EXTEND_TO, CODE_TTL_EXTEND_TO));
    }

    #[test]
    fn both_above_their_thresholds_change_nothing() {
        let (e, c) = probe();
        c.set_instance_ttl(&(61 * DAY_IN_LEDGERS));
        c.set_code_ttl(&(30 * DAY_IN_LEDGERS));
        c.touch();
        assert_eq!(ttls(&e, &c), (61 * DAY_IN_LEDGERS, 30 * DAY_IN_LEDGERS));
    }

    /// The host extends when the TTL is at or below the threshold.
    #[test]
    fn thresholds_include_their_bound() {
        // One ledger above each threshold: untouched.
        let (e, c) = probe();
        c.set_instance_ttl(&(INSTANCE_TTL_THRESHOLD + 1));
        c.set_code_ttl(&(CODE_TTL_THRESHOLD + 1));
        c.touch();
        assert_eq!(
            ttls(&e, &c),
            (INSTANCE_TTL_THRESHOLD + 1, CODE_TTL_THRESHOLD + 1)
        );
        // One ledger later both sit exactly at their thresholds: renewed.
        e.ledger().with_mut(|l| l.sequence_number += 1);
        assert_eq!(ttls(&e, &c), (INSTANCE_TTL_THRESHOLD, CODE_TTL_THRESHOLD));
        c.touch();
        assert_eq!(ttls(&e, &c), (INSTANCE_TTL_EXTEND_TO, CODE_TTL_EXTEND_TO));
    }

    #[test]
    fn code_ages_out_of_four_days_and_is_bumped_again_on_the_next_touch() {
        let (e, c) = probe();
        c.touch();
        assert_eq!(ttls(&e, &c).1, CODE_TTL_EXTEND_TO);
        // Two days later code is at its threshold; a bit later it is below.
        e.ledger()
            .with_mut(|l| l.sequence_number += CODE_TTL_EXTEND_TO - CODE_TTL_THRESHOLD + 10);
        assert!(ttls(&e, &c).1 < CODE_TTL_THRESHOLD);
        c.touch();
        assert_eq!(ttls(&e, &c).1, CODE_TTL_EXTEND_TO);
        // The instance (170 days, minus 2 days) was not renewed.
        assert_eq!(
            ttls(&e, &c).0,
            INSTANCE_TTL_EXTEND_TO - (CODE_TTL_EXTEND_TO - CODE_TTL_THRESHOLD + 10)
        );
    }

    #[test]
    fn long_lived_entries_renew_to_the_network_cap_only_under_30_days() {
        let (e, c) = probe();
        c.put(&7);
        assert!(persistent_ttl(&e, &c, 7) < PERSISTENT_TTL_THRESHOLD);
        c.renew(&7);
        // One year requested; the host clamps it to the network maximum.
        let renewed = persistent_ttl(&e, &c, 7);
        assert_eq!(renewed, MAX_ENTRY_TTL - 1);
        // 31 days left: a read does not renew (and pays no rent).
        e.ledger()
            .with_mut(|l| l.sequence_number += renewed - 31 * DAY_IN_LEDGERS);
        c.renew(&7);
        assert_eq!(persistent_ttl(&e, &c, 7), 31 * DAY_IN_LEDGERS);
        // 29 days left: it does.
        e.ledger()
            .with_mut(|l| l.sequence_number += 2 * DAY_IN_LEDGERS);
        c.renew(&7);
        assert_eq!(persistent_ttl(&e, &c, 7), renewed);
    }

    #[test]
    fn bounded_entries_use_their_own_values() {
        // The Governor's proposal policy: 30 -> 120 days.
        let (e, c) = probe();
        c.put(&1);
        c.renew_for(&1, &(30 * DAY_IN_LEDGERS), &(120 * DAY_IN_LEDGERS));
        assert_eq!(persistent_ttl(&e, &c, 1), 120 * DAY_IN_LEDGERS);
        e.ledger()
            .with_mut(|l| l.sequence_number += 80 * DAY_IN_LEDGERS);
        c.renew_for(&1, &(30 * DAY_IN_LEDGERS), &(120 * DAY_IN_LEDGERS));
        assert_eq!(persistent_ttl(&e, &c, 1), 40 * DAY_IN_LEDGERS);
        e.ledger()
            .with_mut(|l| l.sequence_number += 11 * DAY_IN_LEDGERS);
        c.renew_for(&1, &(30 * DAY_IN_LEDGERS), &(120 * DAY_IN_LEDGERS));
        assert_eq!(persistent_ttl(&e, &c, 1), 120 * DAY_IN_LEDGERS);
    }
}

#[test]
#[should_panic(expected = "sample every variant")]
fn a_storage_variant_missing_from_the_samples_fails_the_guard() {
    crate::testutils::assert_every_variant_sampled("Example", &[0, 2], 3);
}
