//! Release 0.5.0 against the code production actually runs (docs/plans/release-main-1.md).
//!
//! The production Manager (`CCLBJAC5…EK72ZD`) runs Manager `f5b32ab1…`, Governor `41ad48e8…` and
//! Metadata `44a0c4b6…`, all 0.4.0; the other five modules are byte-identical to this checkout's build.
//! These tests start from those fixtures (`fixtures/README.md`) and replay the release in order: pause
//! the factory, upgrade the Manager in place, register Governor and Metadata 0.5.0, upgrade a live
//! tribe by proposal, launch a tribe left pending across the upgrade, and create a new one.
//! Build the WASMs first (`pnpm contracts:build`).

extern crate std;

use governor::DaoGovernorContractClient;
use manager::ManagerContractClient;
use metadata::{IpfsGroup, ItemParam, MetadataContractClient};
use soroban_sdk::{
    testutils::{Address as _, Ledger},
    vec, Address, Bytes, BytesN, Env, IntoVal, String, Symbol, Val, Vec,
};
use token::DaoTokenContractClient;
use treasury::DaoTreasuryContractClient;

mod prod_manager {
    soroban_sdk::contractimport!(file = "fixtures/manager-0.4.0-f5b32ab1.wasm");
}

const PROD_GOVERNOR: &[u8] = include_bytes!("../fixtures/governor-0.4.0-41ad48e8.wasm");
const PROD_METADATA: &[u8] = include_bytes!("../fixtures/metadata-0.4.0-44a0c4b6.wasm");

const PROD_MANAGER_HASH: &str = "f5b32ab19f0817a563606c9a88ab290da05871a8bf21e006fb408406659e69c1";
const PROD_GOVERNOR_HASH: &str = "41ad48e8fdbe4a4229ce7821fd207c1c7d06033a24e6bfa09efeb74a02b054dd";
const PROD_METADATA_HASH: &str = "44a0c4b673638b70ce8d8e9554db7903c208d00047c5e732db015b9942e62efb";
/// The five modules this release leaves alone, as production runs them.
const PROD_UNCHANGED: [(&str, &str); 5] = [
    (
        "token",
        "3f36abc90cf93a136549ecbf63d90f1665e2db85e1dad3191d7d030fb90f4f2d",
    ),
    (
        "auction",
        "8130c8518553071a4d2798a9a7eef99dd334638349917719429452ea0bc0b7ff",
    ),
    (
        "treasury",
        "597a9e042d3ddc0d42ef3b5b4434711696e52426b2dab60822cd9c5acf13903d",
    ),
    (
        "marketplace",
        "f28ebc99593a7ccfdce250a3ed49013b5feeb9917de931a3d89db4f34e2e4bb4",
    ),
    (
        "minter",
        "e1c18db983f8f9d1fcddf05ec1aeb142690fd576533aa532d4b179eb7c6079aa",
    ),
];
/// Release 0.5.0: the code the dev Manager (`CDZOPJBW…`) has run since 2026-11-19.
const RELEASE_HASHES: [(&str, &str); 3] = [
    (
        "manager",
        "ab1d0d172f65f47cdcb2e11391e34745a65ec9635f735df9e9a06289ffb7d853",
    ),
    (
        "governor",
        "8bc3a9223bb083f4d91bd342becd89f9b35acec40da76e7def89deac44465807",
    ),
    (
        "metadata",
        "a378c2282e883327a3a919e70280033cc87e0279b6be5c924ccbd035a57370da",
    ),
];
/// The production Manager's upgrade notice, in ledgers.
const PROD_UPGRADE_DELAY: u32 = 720;

fn hex(hash: &BytesN<32>) -> std::string::String {
    hash.to_array()
        .iter()
        .map(|b| std::format!("{b:02x}"))
        .collect()
}

fn built(name: &str) -> std::vec::Vec<u8> {
    let path = std::format!(
        "{}/../../target/wasm32v1-none/release/{name}.wasm",
        env!("CARGO_MANIFEST_DIR")
    );
    std::fs::read(&path).unwrap_or_else(|err| {
        panic!("missing {path} ({err}); run pnpm contracts:build before dao-e2e")
    })
}

fn upload(e: &Env, bytes: &[u8]) -> BytesN<32> {
    e.deployer()
        .upload_contract_wasm(Bytes::from_slice(e, bytes))
}

fn s(e: &Env, value: &str) -> String {
    String::from_str(e, value)
}

fn old_params(
    e: &Env,
    deployer: &Address,
    nonce: u64,
    slug: &str,
) -> prod_manager::DaoCreationParams {
    prod_manager::DaoCreationParams {
        deployer: deployer.clone(),
        nonce,
        launch_admin: deployer.clone(),
        initial_config: prod_manager::InitialDaoConfigValues {
            token_name: s(e, "Release DAO"),
            token_symbol: s(e, "REL"),
            profile: s(e, r#"{"v":1,"description":"Release rehearsal"}"#),
            renderer_base: s(e, "https://example.com/render/"),
            slug: s(e, slug),
            governance: prod_manager::GovernanceConfig {
                voting_delay: 300,
                voting_period: 300,
                queue_delay: 300,
                proposal_threshold: 1,
                quorum_bps: 1000,
            },
            modules: Vec::new(e),
            token_settings: prod_manager::TokenSettings {
                dao_recovery: false,
                members_only_delegation: false,
                transfers_locked: false,
            },
            transfer_agents: Vec::new(e),
        },
    }
}

/// The setup a tribe needs before launch: a founder token and one trait.
fn set_up(e: &Env, token: &Address, metadata: &Address, founder: &Address) {
    MetadataContractClient::new(e, metadata).add_properties(
        &vec![e, s(e, "Background")],
        &vec![
            e,
            ItemParam {
                property_id: 0,
                name: s(e, "Blue"),
                is_new_property: true,
            },
        ],
        &IpfsGroup {
            base_uri: s(e, "ipfs://art"),
            extension: s(e, ".png"),
        },
    );
    // Minted after the artwork, so the token is seeded and has a token_uri.
    DaoTokenContractClient::new(e, token).mint(founder, founder);
}

/// Propose, vote, queue and execute through the Treasury, with the clock moved by the DAO's own timings.
#[allow(clippy::too_many_arguments)]
fn pass_and_execute(
    e: &Env,
    governor: &DaoGovernorContractClient,
    treasury: &DaoTreasuryContractClient,
    voter: &Address,
    targets: &Vec<Address>,
    functions: &Vec<Symbol>,
    args: &Vec<Vec<Val>>,
    description: &str,
) {
    let description = s(e, description);
    let hash: BytesN<32> = e.crypto().keccak256(&description.to_bytes()).to_bytes();
    let start = e.ledger().timestamp();
    e.ledger().set_sequence_number(e.ledger().sequence() + 1);
    let id = governor.propose(targets, functions, args, &description, voter);
    e.ledger().set_timestamp(start + 301);
    e.ledger().set_sequence_number(e.ledger().sequence() + 1);
    governor.cast_vote(&id, &1, &s(e, "for"), voter);
    e.ledger().set_timestamp(start + 602);
    let eta = (start + 602 + 300) as u32;
    governor.queue(targets, functions, args, &hash, &eta, voter);
    e.ledger().set_timestamp(start + 903);
    // Enforcing mode: only the Treasury's own authorization reaches the targets.
    e.set_auths(&[]);
    treasury.execute(targets, functions, args, &hash);
    e.mock_all_auths();
}

#[test]
fn fixtures_are_production_code() {
    let e = Env::default();
    assert_eq!(hex(&upload(&e, prod_manager::WASM)), PROD_MANAGER_HASH);
    assert_eq!(hex(&upload(&e, PROD_GOVERNOR)), PROD_GOVERNOR_HASH);
    assert_eq!(hex(&upload(&e, PROD_METADATA)), PROD_METADATA_HASH);
}

/// Byte identity depends on the compiler and the build platform: production and the dev Manager were
/// built natively on macOS on Apple silicon with rustc 1.95.0 and stellar-cli 28.0.0, and CI builds on
/// Linux (docs/REPRODUCIBLE_BUILDS.md). Run on such a Mac, after `pnpm contracts:build`, before any upload
/// (docs/plans/release-main-1.md, phase 5): `cargo test -p dao-e2e release_0_5_0 -- --include-ignored`.
#[test]
#[ignore = "needs the 0.5.0 build platform (macOS on Apple silicon, rustc 1.95.0, stellar-cli 28.0.0); run with --include-ignored"]
fn release_build_matches_production_and_dev() {
    let e = Env::default();
    for (name, hash) in PROD_UNCHANGED {
        assert_eq!(
            hex(&upload(&e, &built(name))),
            hash,
            "{name} must be byte-identical to production: this release does not upgrade it"
        );
    }
    // The three released contracts must be exactly what dev.tribes.build has run and been tested on.
    for (name, hash) in RELEASE_HASHES {
        assert_eq!(
            hex(&upload(&e, &built(name))),
            hash,
            "{name} 0.5.0 is not the build dev runs"
        );
    }
}

#[test]
fn release_0_5_0_upgrades_production_in_place() {
    let e = Env::default();
    e.mock_all_auths();
    e.cost_estimate().budget().reset_unlimited();
    e.ledger().set_sequence_number(1_000);
    e.ledger().set_timestamp(10_000);
    let admin = Address::generate(&e);

    // --- Production as it runs today -----------------------------------------------------------
    let old_manager_hash = upload(&e, prod_manager::WASM);
    let manager_id = e.register(
        prod_manager::WASM,
        (
            admin.clone(),
            old_manager_hash.clone(),
            s(&e, "0.4.0"),
            PROD_UPGRADE_DELAY,
        ),
    );
    let old = prod_manager::Client::new(&e, &manager_id);
    let old_governor = upload(&e, PROD_GOVERNOR);
    let old_metadata = upload(&e, PROD_METADATA);
    let token_hash = upload(&e, &built("token"));
    let auction_hash = upload(&e, &built("auction"));
    let treasury_hash = upload(&e, &built("treasury"));
    let marketplace_hash = upload(&e, &built("marketplace"));
    let claims_hash = upload(&e, &built("minter"));
    for (name, hash) in [
        ("Token", &token_hash),
        ("Metadata", &old_metadata),
        ("Auction", &auction_hash),
        ("Governor", &old_governor),
        ("Treasury", &treasury_hash),
        ("Marketplace", &marketplace_hash),
        ("ClaimMinter", &claims_hash),
    ] {
        old.register_implementation(&s(&e, name), &s(&e, "0.4.0"), hash);
        old.set_latest_implementation(&s(&e, name), hash);
    }
    old.set_current_implementations(&prod_manager::CurrentImplementations {
        token: token_hash.clone(),
        metadata: old_metadata.clone(),
        auction: auction_hash.clone(),
        governor: old_governor.clone(),
        treasury: treasury_hash.clone(),
        marketplace: marketplace_hash.clone(),
        claims: claims_hash.clone(),
    });

    // A live tribe and one left in setup across the upgrade.
    let founder = Address::generate(&e);
    let live = old.create_dao(&old_params(&e, &founder, 1, "release-live"));
    set_up(&e, &live.token, &live.metadata, &founder);
    old.launch_dao(
        &live.token,
        &prod_manager::LaunchConfig {
            launch_auction: false,
            launch_marketplace: false,
        },
    );
    let pending_founder = Address::generate(&e);
    let pending = old.create_dao(&old_params(&e, &pending_founder, 1, "release-pending"));
    set_up(&e, &pending.token, &pending.metadata, &pending_founder);
    let live_metadata = MetadataContractClient::new(&e, &live.metadata);
    let uri_before = live_metadata.token_uri(&0, &s(&e, "Release DAO #0"));

    // --- Phase 5.1: pause the factory ----------------------------------------------------------
    old.pause_factory();

    // --- Phase 5.2: the Manager, after its notice ------------------------------------------------
    let new_manager_hash = upload(&e, &built("manager"));
    // The constructor doesn't record the Manager's own hash; the upgrade script registers it first
    // (LEGACY_MANAGER_VERSION=0.4.0) when production lacks the record.
    if old.get_implementation(&old_manager_hash).is_none() {
        old.register_implementation(&s(&e, "Manager"), &s(&e, "0.4.0"), &old_manager_hash);
    }
    old.register_implementation(&s(&e, "Manager"), &s(&e, "0.5.0"), &new_manager_hash);
    old.set_latest_implementation(&s(&e, "Manager"), &new_manager_hash);
    old.approve_upgrade(&old_manager_hash, &new_manager_hash);
    let from_ledger = old
        .upgrade_approved_ledger(&old_manager_hash, &new_manager_hash)
        .expect("approval recorded") as u32;
    // The notice is enforced: too early is refused.
    assert!(old
        .try_upgrade_manager(&old_manager_hash, &new_manager_hash)
        .is_err());
    e.ledger()
        .set_sequence_number(from_ledger.max(e.ledger().sequence() + PROD_UPGRADE_DELAY));
    old.upgrade_manager(&old_manager_hash, &new_manager_hash);

    let manager = ManagerContractClient::new(&e, &manager_id);
    assert_eq!(manager.wasm_hash(), new_manager_hash);
    assert_eq!(manager.version(), s(&e, "0.5.0"));
    // Everything production stored is still read the same way.
    assert_eq!(manager.get_dao_by_slug(&s(&e, "release-live")), live.token);
    assert_eq!(
        manager.get_pending_dao(&pending.token).unwrap().slug,
        s(&e, "release-pending")
    );
    assert_eq!(
        manager.current_implementations().unwrap().governor,
        old_governor
    );

    // --- Phase 5.3 and 5.4: Governor and Metadata 0.5.0, the factory's current hashes ----------
    let new_governor = upload(&e, &built("governor"));
    let new_metadata = upload(&e, &built("metadata"));
    manager.register_implementation(&s(&e, "Governor"), &s(&e, "0.5.0"), &new_governor);
    manager.register_implementation(&s(&e, "Metadata"), &s(&e, "0.5.0"), &new_metadata);
    manager.approve_upgrade(&old_governor, &new_governor);
    manager.approve_upgrade(&old_metadata, &new_metadata);
    manager.set_latest_implementation(&s(&e, "Governor"), &new_governor);
    manager.set_current_implementations(&manager::CurrentImplementations {
        token: token_hash.clone(),
        metadata: new_metadata.clone(),
        auction: auction_hash.clone(),
        governor: new_governor.clone(),
        treasury: treasury_hash.clone(),
        marketplace: marketplace_hash.clone(),
        claims: claims_hash.clone(),
    });

    // While paused, nothing new is created.
    let newcomer = Address::generate(&e);
    let mut fresh = manager::DaoCreationParams {
        deployer: newcomer.clone(),
        nonce: 1,
        launch_admin: newcomer.clone(),
        initial_config: manager::InitialDaoConfigValues {
            token_name: s(&e, "After Release"),
            token_symbol: s(&e, "AFT"),
            profile: s(&e, r#"{"v":1,"description":"Created on 0.5.0"}"#),
            renderer_base: s(&e, "https://example.com/render/"),
            slug: s(&e, "release-new"),
            governance: manager::GovernanceConfig {
                voting_delay: 300,
                voting_period: 300,
                queue_delay: 300,
                proposal_threshold: 1,
                quorum_bps: 1000,
                vote_source: None,
            },
            modules: Vec::new(&e),
            token_settings: Default::default(),
            transfer_agents: Vec::new(&e),
        },
    };
    assert!(manager.try_create_dao(&fresh).is_err());

    // --- Phase 6: reopen ------------------------------------------------------------------------
    manager.unpause_factory();

    // The tribe left in setup launches on the new Manager with its 0.4.0 Governor (votes by token).
    manager.launch_dao(
        &pending.token,
        &manager::LaunchConfig {
            launch_auction: false,
            launch_marketplace: false,
        },
    );
    assert_eq!(
        manager.get_dao_by_slug(&s(&e, "release-pending")),
        pending.token
    );

    // A new tribe gets the 0.5.0 Governor and Metadata, and votes with its own token.
    let created = manager.create_dao(&fresh);
    e.as_contract(&created.governor, || {
        assert_eq!(common::upgrade::current_hash(&e), new_governor);
    });
    e.as_contract(&created.metadata, || {
        assert_eq!(common::upgrade::current_hash(&e), new_metadata);
    });
    assert_eq!(
        DaoGovernorContractClient::new(&e, &created.governor).vote_source(),
        created.token
    );
    fresh.nonce = 2;

    // --- The live tribe upgrades Governor and Metadata in one proposal --------------------------
    let governor = DaoGovernorContractClient::new(&e, &live.governor);
    let treasury = DaoTreasuryContractClient::new(&e, &live.treasury);
    let targets = vec![&e, live.governor.clone(), live.metadata.clone()];
    let functions = vec![&e, Symbol::new(&e, "upgrade"), Symbol::new(&e, "upgrade")];
    let args: Vec<Vec<Val>> = vec![
        &e,
        vec![&e, old_governor.into_val(&e), new_governor.into_val(&e)],
        vec![&e, old_metadata.into_val(&e), new_metadata.into_val(&e)],
    ];
    pass_and_execute(
        &e,
        &governor,
        &treasury,
        &founder,
        &targets,
        &functions,
        &args,
        "Upgrade to 0.5.0",
    );

    e.as_contract(&live.governor, || {
        assert_eq!(common::upgrade::current_hash(&e), new_governor);
        assert_eq!(common::upgrade::version(&e, &manager_id), s(&e, "0.5.0"));
    });
    e.as_contract(&live.metadata, || {
        assert_eq!(common::upgrade::current_hash(&e), new_metadata);
    });
    // Same tribe, same art, same votes: the upgraded Governor reads the token, as before.
    assert_eq!(
        live_metadata.token_uri(&0, &s(&e, "Release DAO #0")),
        uri_before
    );
    assert_eq!(governor.vote_source(), live.token);
    // A stale `from` is refused now that the Governor has moved on.
    assert!(governor.try_upgrade(&old_governor, &new_governor).is_err());

    // The upgraded Governor still governs: a proposal on the new code changes the quorum.
    let quorum_targets = vec![&e, live.governor.clone()];
    let quorum_functions = vec![&e, Symbol::new(&e, "set_quorum_bps")];
    let quorum_args: Vec<Vec<Val>> = vec![&e, vec![&e, 2_000_u32.into_val(&e)]];
    pass_and_execute(
        &e,
        &governor,
        &treasury,
        &founder,
        &quorum_targets,
        &quorum_functions,
        &quorum_args,
        "Raise the quorum on 0.5.0",
    );
    assert_eq!(governor.quorum_bps(), 2_000);
}
