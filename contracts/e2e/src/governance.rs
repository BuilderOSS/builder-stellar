//! Governance hardening end to end, on the built WASMs: the proposal actions
//! the Governor refuses at `propose` (`consume`, and mints too large for one
//! execution), the event and resource limits of the largest proposals it
//! accepts, the Treasury's two-step upgrade then migrate, and a skipped
//! Governor migration, both behind the storage-layout gate.
//! Build the WASMs first (`pnpm contracts:build`).

use super::*;
use treasury::AuthNode;

/// Live per-transaction memory limit (`stellar network settings`, testnet,
/// 2026-10-12), beside the CPU limit `TX_MAX_INSTRUCTIONS`.
const TX_MAX_MEMORY_BYTES: u64 = 41_943_040;

/// A launched factory DAO whose artwork has 16 traits (the largest seed
/// events) and whose quorum is 1 bp, so the founder's single vote passes
/// every proposal however many tokens earlier proposals mint.
fn launched_with_artwork() -> DaoFixture {
    let f = factory_dao();
    let e = &f.e;
    e.ledger().with_mut(|l| l.max_entry_ttl = 3_110_400);
    let metadata = MetadataContractClient::new(e, &f.dao.metadata);
    let mut names = Vec::new(e);
    let mut items = Vec::new(e);
    for i in 0..16u32 {
        names.push_back(String::from_str(e, "Trait"));
        items.push_back(ItemParam {
            property_id: i,
            name: String::from_str(e, "Item"),
            is_new_property: true,
        });
    }
    metadata.add_properties(
        &names,
        &items,
        &IpfsGroup {
            base_uri: String::from_str(e, "ipfs://art"),
            extension: String::from_str(e, ".png"),
        },
    );
    DaoGovernorContractClient::new(e, &f.dao.governor).set_quorum_bps(&1);
    f.manager.launch_dao(&f.dao.token, &f.no_launch_modules());
    f
}

/// One proposal: its actions and description.
struct Draft {
    targets: Vec<Address>,
    functions: Vec<Symbol>,
    args: Vec<Vec<Val>>,
    description: String,
    name: std::string::String,
}

impl Draft {
    fn new(e: &Env, description: &str) -> Self {
        Draft {
            targets: Vec::new(e),
            functions: Vec::new(e),
            args: Vec::new(e),
            description: String::from_str(e, description),
            name: description.into(),
        }
    }

    fn call(mut self, target: &Address, function: &str, args: Vec<Val>) -> Self {
        let e = self.targets.env().clone();
        self.targets.push_back(target.clone());
        self.functions.push_back(Symbol::new(&e, function));
        self.args.push_back(args);
        self
    }

    fn hash(&self) -> BytesN<32> {
        description_hash(self.targets.env(), &self.description)
    }

    fn try_propose(
        &self,
        governor: &DaoGovernorContractClient,
        proposer: &Address,
    ) -> Result<BytesN<32>, soroban_sdk::Error> {
        governor
            .try_propose(
                &self.targets,
                &self.functions,
                &self.args,
                &self.description,
                proposer,
            )
            .map(|id| id.unwrap())
            .map_err(|err| err.unwrap())
    }

    /// Propose, vote For and queue with the fixture's 300-second timings;
    /// the clock ends past the ETA.
    fn pass(&self, governor: &DaoGovernorContractClient, proposer: &Address) -> BytesN<32> {
        let e = self.targets.env();
        advance(e, 1);
        let id = self.try_propose(governor, proposer).unwrap();
        advance(e, 301);
        governor.cast_vote(&id, &1, &String::from_str(e, ""), proposer);
        advance(e, 301);
        governor.queue(
            &self.targets,
            &self.functions,
            &self.args,
            &self.hash(),
            &0u32,
            proposer,
        );
        advance(e, 301);
        id
    }

    fn try_execute(&self, treasury: &DaoTreasuryContractClient) -> Result<(), soroban_sdk::Error> {
        treasury
            .try_execute(&self.targets, &self.functions, &self.args, &self.hash())
            .map(|_| ())
            .map_err(|err| err.unwrap())
    }

    /// Execute under real authorization, assert the live limits (CPU, memory,
    /// write bytes and events), and return the event bytes used.
    ///
    /// Measured on an unlimited budget and compared with the limits after:
    /// the test host records authorizations on a shadow budget that inherits
    /// the limits, and fails there before the call's own usage is known.
    fn execute_within_limits(&self, treasury: &DaoTreasuryContractClient, what: &str) -> u32 {
        let e = self.targets.env();
        e.set_auths(&[]);
        e.cost_estimate().budget().reset_unlimited();
        treasury.execute(&self.targets, &self.functions, &self.args, &self.hash());
        let memory = e.cost_estimate().budget().memory_bytes_cost();
        std::println!("BUDGET {what}: memory {memory}");
        assert!(memory < TX_MAX_MEMORY_BYTES, "{what}: memory {memory}");
        assert_within_limits(e, what);
        let bytes = e.cost_estimate().resources().contract_events_size_bytes;
        e.cost_estimate().budget().reset_unlimited();
        e.mock_all_auths();
        bytes
    }
}

fn mint_args(e: &Env, treasury: &Address) -> Vec<Val> {
    vec![
        e,
        treasury.clone().into_val(e),
        Address::generate(e).into_val(e),
    ]
}

fn batch_mint_args(e: &Env, treasury: &Address, recipients: u32, each: u32) -> Vec<Val> {
    let mut to = Vec::new(e);
    let mut amounts = Vec::new(e);
    for _ in 0..recipients {
        to.push_back(Address::generate(e));
        amounts.push_back(each as u128);
    }
    vec![
        e,
        treasury.clone().into_val(e),
        to.into_val(e),
        amounts.into_val(e),
    ]
}

/// The Governor's estimate for `draft`'s execution, from the Token mints in
/// it (`(tokens, recipients)` per mint call).
fn estimate(draft: &Draft, mints: &[(u32, u32)]) -> u64 {
    let bytes = mints
        .iter()
        .map(|(tokens, recipients)| common::mint_event_bytes(*tokens, *recipients))
        .sum();
    common::execution_event_bytes(draft.targets.len(), mints.len() as u32, bytes)
}

fn set_stored_layout(e: &Env, contract: &Address, version: u32) {
    e.as_contract(contract, || {
        e.storage().instance().set(
            &common::ns(e, common::upgrade::UpgradeKey::StorageVersion),
            &version,
        );
    });
}

/// The largest mint proposals the Governor accepts (one `MAX_BATCH_MINT`
/// batch beside two other actions, two batches of 21, ten single mints, one
/// batch to `MAX_BATCH_RECIPIENTS`) execute against 16-trait artwork within
/// the live limits, each using fewer event bytes than the estimate. The next
/// shapes up are refused at `propose`.
#[test]
fn the_largest_mint_proposals_the_governor_accepts_execute_within_the_live_limits() {
    let f = launched_with_artwork();
    let e = &f.e;
    let governor = DaoGovernorContractClient::new(e, &f.dao.governor);
    let treasury = DaoTreasuryContractClient::new(e, &f.dao.treasury);
    let (token, t) = (&f.dao.token, &f.dao.treasury);
    let max = common::MAX_BATCH_MINT;
    // Actions without events of their own: the estimate counts only mints.
    let quiet = e.register(TargetContract, ());

    let mut max_and_two =
        Draft::new(e, "max batch and two").call(token, "batch_mint", batch_mint_args(e, t, 1, max));
    for i in 0..2u32 {
        max_and_two = max_and_two.call(&quiet, "set_value", vec![e, i.into_val(e)]);
    }
    let two_21 = Draft::new(e, "two batches of 21")
        .call(token, "batch_mint", batch_mint_args(e, t, 1, 21))
        .call(token, "batch_mint", batch_mint_args(e, t, 1, 21));
    let mut ten = Draft::new(e, "ten mints");
    for _ in 0..10 {
        ten = ten.call(token, "mint", mint_args(e, t));
    }
    let widest = Draft::new(e, "widest batch").call(
        token,
        "batch_mint",
        batch_mint_args(e, t, common::MAX_BATCH_RECIPIENTS, 1),
    );
    let accepted = [
        (max_and_two, std::vec![(max, 1)]),
        (two_21, std::vec![(21, 1), (21, 1)]),
        (ten, std::vec![(1, 1); 10]),
        (
            widest,
            std::vec![(common::MAX_BATCH_RECIPIENTS, common::MAX_BATCH_RECIPIENTS)],
        ),
    ];
    for (draft, mints) in accepted.iter() {
        draft.pass(&governor, &f.deployer);
        let what = draft.name.clone();
        let used = draft.execute_within_limits(&treasury, &what);
        let estimated = estimate(draft, mints);
        assert!(estimated <= common::EXECUTION_EVENT_BUDGET as u64, "{what}");
        assert!(u64::from(used) <= estimated, "{what}: {used} > {estimated}");
    }

    let too_large: soroban_sdk::Error = governor::CustomGovernorError::MintsTooLarge.into();
    let two_max = Draft::new(e, "two max batches")
        .call(token, "batch_mint", batch_mint_args(e, t, 1, max))
        .call(token, "batch_mint", batch_mint_args(e, t, 1, max));
    let mut max_and_three = Draft::new(e, "max batch and three").call(
        token,
        "batch_mint",
        batch_mint_args(e, t, 1, max),
    );
    for i in 0..3u32 {
        max_and_three = max_and_three.call(&quiet, "set_value", vec![e, i.into_val(e)]);
    }
    let mut eleven = Draft::new(e, "eleven mints");
    for _ in 0..11 {
        eleven = eleven.call(token, "mint", mint_args(e, t));
    }
    for draft in [two_max, max_and_three, eleven] {
        assert_eq!(draft.try_propose(&governor, &f.deployer), Err(too_large));
    }
}

/// A 20-action proposal of costly actions (the five mints that 20 actions
/// leave room for, each seeding 16-trait artwork for a new holder, and
/// fifteen Governor setters, each with its own event) is accepted and
/// executes within the live limits. A sixth mint is refused at `propose`.
///
/// Memory is the limit with the least room here: each call into a contract
/// instantiates its code, and the Governor bounds events, not memory. Eight
/// mints and twelve setters, which the event bound now refuses, measured
/// about 41.3 MB of 41.9 MB.
#[test]
fn a_twenty_action_proposal_of_costly_actions_executes_within_the_live_limits() {
    let f = launched_with_artwork();
    let e = &f.e;
    let governor = DaoGovernorContractClient::new(e, &f.dao.governor);
    let treasury = DaoTreasuryContractClient::new(e, &f.dao.treasury);
    let draft_with = |mints: u32, description: &str| {
        let mut draft = Draft::new(e, description);
        for _ in 0..mints {
            draft = draft.call(&f.dao.token, "mint", mint_args(e, &f.dao.treasury));
        }
        let setters = ["set_voting_delay", "set_voting_period", "set_queue_delay"];
        for i in 0..governor::MAX_PROPOSAL_ACTIONS - mints {
            draft = draft.call(
                &f.dao.governor,
                setters[i as usize % setters.len()],
                vec![e, (301 + i).into_val(e)],
            );
        }
        draft
    };
    advance(e, 1);
    assert_eq!(
        draft_with(6, "six mints").try_propose(&governor, &f.deployer),
        Err(governor::CustomGovernorError::MintsTooLarge.into())
    );
    let draft = draft_with(5, "twenty costly actions");
    assert_eq!(draft.targets.len(), governor::MAX_PROPOSAL_ACTIONS);
    let minted = DaoTokenContractClient::new(e, &f.dao.token).minted();
    draft.pass(&governor, &f.deployer);
    let used = draft.execute_within_limits(&treasury, "execute (20 actions: 5 mints, 15 setters)");
    assert!(u64::from(used) <= estimate(&draft, &[(1, 1); 5]));
    assert_eq!(
        DaoTokenContractClient::new(e, &f.dao.token).minted(),
        minted + 5
    );
    assert_eq!(governor.voting_delay(), 313);
}

/// The Treasury cannot migrate in the proposal that upgrades it: it runs the
/// proposal on its old code, so the `migrate` action finds nothing to do and
/// reverts the whole proposal, upgrade included. The upgrade passes on its
/// own; while the stored layout is behind the new code, `execute` refuses
/// every proposal, and anyone completes the migration with one call.
///
/// Both hashes hold the same code (a tagged copy), so the test lowers the
/// stored version after the upgrade to stand for data the new code has not
/// migrated yet.
#[test]
fn the_treasury_upgrades_then_migrates_in_two_steps() {
    let f = launched_with_artwork();
    let e = &f.e;
    let governor = DaoGovernorContractClient::new(e, &f.dao.governor);
    let treasury = DaoTreasuryContractClient::new(e, &f.dao.treasury);
    let v1 = treasury.wasm_hash();
    let v2 = module_wasm_variant(e, "treasury", "v2");
    f.manager.register_implementation(
        &String::from_str(e, "Treasury"),
        &String::from_str(e, "0.6.0"),
        &v2,
    );
    f.manager.approve_upgrade(&v1, &v2);
    let upgrade_args = vec![e, v1.clone().into_val(e), v2.clone().into_val(e)];
    let t = &f.dao.treasury;

    // One step: the migrate action runs the old code and reverts it all.
    let both = Draft::new(e, "upgrade and migrate the Treasury")
        .call(t, "upgrade", upgrade_args.clone())
        .call(t, "migrate", Vec::new(e));
    let both_id = both.pass(&governor, &f.deployer);
    assert_eq!(
        both.try_execute(&treasury),
        Err(common::CommonError::NothingToMigrate.into())
    );
    assert_eq!(treasury.wasm_hash(), v1);
    assert_eq!(governor.proposal_state(&both_id), ProposalState::Queued);

    // Step one: the upgrade alone.
    let upgrade = Draft::new(e, "upgrade the Treasury").call(t, "upgrade", upgrade_args);
    upgrade.pass(&governor, &f.deployer);
    upgrade.execute_within_limits(&treasury, "execute (Treasury upgrade)");
    assert_eq!(treasury.wasm_hash(), v2);
    assert_eq!(treasury.version(), String::from_str(e, "0.6.0"));

    // The new code finds data it has not migrated, and refuses to run.
    let code = treasury::STORAGE_VERSION;
    set_stored_layout(e, t, code - 1);
    let next = Draft::new(e, "after the upgrade").call(
        &f.dao.metadata,
        "update_renderer_base",
        vec![e, String::from_str(e, "https://v2.example/").into_val(e)],
    );
    let next_id = next.pass(&governor, &f.deployer);
    assert_eq!(
        next.try_execute(&treasury),
        Err(treasury::TreasuryError::StorageVersionMismatch.into())
    );
    assert_eq!(governor.proposal_state(&next_id), ProposalState::Queued);

    // Step two: anyone migrates, with no authorization at all.
    e.set_auths(&[]);
    treasury.migrate();
    assert_eq!(treasury.storage_version(), code);
    assert_eq!(
        treasury.try_migrate().err().unwrap().unwrap(),
        common::CommonError::NothingToMigrate.into()
    );
    e.mock_all_auths();
    next.execute_within_limits(&treasury, "execute (after the Treasury migration)");
    assert_eq!(governor.proposal_state(&next_id), ProposalState::Executed);
}

/// A Governor upgraded without its migration refuses proposals until anyone
/// runs `migrate`; no proposal is needed, so governance cannot lock itself
/// out by forgetting one.
#[test]
fn a_skipped_governor_migration_is_completed_by_anyone() {
    let f = launched_with_artwork();
    let e = &f.e;
    let governor = DaoGovernorContractClient::new(e, &f.dao.governor);
    let treasury = DaoTreasuryContractClient::new(e, &f.dao.treasury);
    let v1 = governor.wasm_hash();
    let v2 = module_wasm_variant(e, "governor", "v2");
    f.manager.register_implementation(
        &String::from_str(e, "Governor"),
        &String::from_str(e, "0.6.0"),
        &v2,
    );
    f.manager.approve_upgrade(&v1, &v2);
    let upgrade = Draft::new(e, "upgrade the Governor").call(
        &f.dao.governor,
        "upgrade",
        vec![e, v1.into_val(e), v2.clone().into_val(e)],
    );
    upgrade.pass(&governor, &f.deployer);
    upgrade.execute_within_limits(&treasury, "execute (Governor upgrade)");
    assert_eq!(governor.wasm_hash(), v2);

    let code = governor::STORAGE_VERSION;
    set_stored_layout(e, &f.dao.governor, code - 1);
    let next = Draft::new(e, "after the Governor upgrade").call(
        &f.dao.metadata,
        "update_renderer_base",
        vec![e, String::from_str(e, "https://g2.example/").into_val(e)],
    );
    assert_eq!(
        next.try_propose(&governor, &f.deployer),
        Err(governor::CustomGovernorError::StorageVersionMismatch.into())
    );
    e.set_auths(&[]);
    governor.migrate();
    assert_eq!(governor.storage_version(), code);
    e.mock_all_auths();
    next.pass(&governor, &f.deployer);
    next.execute_within_limits(&treasury, "execute (after the Governor migration)");
}

/// No proposal can mark another Executed without running its actions: an
/// action aimed at `consume` is refused at `propose`, and a contract the
/// proposal calls cannot reach `consume` through an `authorize` tree, which
/// the Treasury refuses (and `check_authorization` reports before proposing).
/// The victim proposal stays Queued and then runs its own actions.
#[test]
fn a_proposal_cannot_consume_another() {
    let f = launched_with_artwork();
    let e = &f.e;
    let governor = DaoGovernorContractClient::new(e, &f.dao.governor);
    let treasury = DaoTreasuryContractClient::new(e, &f.dao.treasury);
    let victim = Draft::new(e, "the victim").call(
        &f.dao.metadata,
        "update_renderer_base",
        vec![
            e,
            String::from_str(e, "https://victim.example/").into_val(e),
        ],
    );
    let consume_args = vec![
        e,
        victim.targets.clone().into_val(e),
        victim.functions.clone().into_val(e),
        victim.args.clone().into_val(e),
        victim.hash().into_val(e),
    ];

    // Directly: refused at `propose`.
    advance(e, 1);
    let direct =
        Draft::new(e, "consume directly").call(&f.dao.governor, "consume", consume_args.clone());
    assert_eq!(
        direct.try_propose(&governor, &f.deployer),
        Err(governor::CustomGovernorError::CannotConsume.into())
    );

    // Through a contract the proposal calls, with an `authorize` tree.
    let attacker = e.register(MaliciousConsumeContract, ());
    let tree = vec![
        e,
        AuthNode {
            contract: f.dao.governor.clone(),
            fn_name: Symbol::new(e, "consume"),
            args: consume_args.clone(),
            sub: Vec::new(e),
        },
    ];
    let cannot: soroban_sdk::Error = treasury::TreasuryError::CannotConsume.into();
    assert_eq!(
        treasury
            .try_check_authorization(&tree)
            .err()
            .unwrap()
            .unwrap(),
        cannot
    );
    let mut attack_args = vec![e, f.dao.governor.clone().into_val(e)];
    for arg in consume_args.iter() {
        attack_args.push_back(arg);
    }
    let indirect = Draft::new(e, "consume through a contract")
        .call(&f.dao.treasury, "authorize", vec![e, tree.into_val(e)])
        .call(&attacker, "attack", attack_args);

    let victim_id = victim.pass(&governor, &f.deployer);
    let indirect_id = indirect.pass(&governor, &f.deployer);
    e.set_auths(&[]);
    assert_eq!(indirect.try_execute(&treasury), Err(cannot));
    e.mock_all_auths();
    assert_eq!(governor.proposal_state(&indirect_id), ProposalState::Queued);
    assert_eq!(governor.proposal_state(&victim_id), ProposalState::Queued);

    victim.execute_within_limits(&treasury, "execute (the victim)");
    assert_eq!(governor.proposal_state(&victim_id), ProposalState::Executed);
}

// Releases built from this branch with `STORAGE_VERSION = 2`: one whose
// `migrate` always fails, and the fixed one (fixtures/README.md).
const GOVERNOR_BROKEN: &[u8] = include_bytes!("../fixtures/governor-recovery-broken.wasm");
const GOVERNOR_FIXED: &[u8] = include_bytes!("../fixtures/governor-recovery-fixed.wasm");
const TREASURY_BROKEN: &[u8] = include_bytes!("../fixtures/treasury-recovery-broken.wasm");
const TREASURY_FIXED: &[u8] = include_bytes!("../fixtures/treasury-recovery-fixed.wasm");

/// Uploads the broken and fixed releases of `name` and approves the path
/// running -> broken -> fixed. Returns `(broken, fixed)`.
fn broken_and_fixed(
    f: &DaoFixture,
    name: &str,
    running: &BytesN<32>,
    broken: &[u8],
    fixed: &[u8],
) -> (BytesN<32>, BytesN<32>) {
    let e = &f.e;
    let upload = |bytes: &[u8]| {
        e.deployer()
            .upload_contract_wasm(soroban_sdk::Bytes::from_slice(e, bytes))
    };
    let (broken, fixed) = (upload(broken), upload(fixed));
    for (hash, version) in [(&broken, "0.6.0"), (&fixed, "0.6.1")] {
        f.manager.register_implementation(
            &String::from_str(e, name),
            &String::from_str(e, version),
            hash,
        );
    }
    f.manager.approve_upgrade(running, &broken);
    f.manager.approve_upgrade(&broken, &fixed);
    (broken, fixed)
}

fn renderer_change(e: &Env, f: &DaoFixture, description: &str) -> Draft {
    Draft::new(e, description).call(
        &f.dao.metadata,
        "update_renderer_base",
        vec![e, String::from_str(e, "https://after.example/").into_val(e)],
    )
}

/// A Governor upgraded to a release whose `migrate` always fails refuses
/// ordinary proposals, but the tribe can still propose, vote on, queue and
/// execute a recovery proposal: an upgrade to the fixed release and its
/// migration, in one proposal. Governance then runs as before.
#[test]
fn a_governor_whose_migration_fails_recovers_by_proposal() {
    let f = launched_with_artwork();
    let e = &f.e;
    let governor = DaoGovernorContractClient::new(e, &f.dao.governor);
    let treasury = DaoTreasuryContractClient::new(e, &f.dao.treasury);
    let running = governor.wasm_hash();
    let (broken, fixed) =
        broken_and_fixed(&f, "Governor", &running, GOVERNOR_BROKEN, GOVERNOR_FIXED);
    let g = &f.dao.governor;

    let install = Draft::new(e, "install 0.6.0").call(
        g,
        "upgrade",
        vec![e, running.into_val(e), broken.clone().into_val(e)],
    );
    install.pass(&governor, &f.deployer);
    install.execute_within_limits(&treasury, "execute (Governor 0.6.0)");
    assert_eq!(governor.wasm_hash(), broken);
    assert_eq!(governor.storage_version(), 1);

    // The migration fails for everyone, and ordinary proposals are refused.
    e.set_auths(&[]);
    assert!(governor.try_migrate().is_err());
    assert_eq!(governor.storage_version(), 1);
    e.mock_all_auths();
    let ordinary = renderer_change(e, &f, "ordinary");
    advance(e, 1);
    assert_eq!(
        ordinary.try_propose(&governor, &f.deployer),
        Err(governor::CustomGovernorError::StorageVersionMismatch.into())
    );

    // Recovery: the fixed release and its migration, in one proposal.
    let recover = Draft::new(e, "recover with 0.6.1")
        .call(
            g,
            "upgrade",
            vec![e, broken.into_val(e), fixed.clone().into_val(e)],
        )
        .call(g, "migrate", Vec::new(e));
    let recover_id = recover.pass(&governor, &f.deployer);
    recover.execute_within_limits(&treasury, "execute (Governor recovery)");
    assert_eq!(
        governor.proposal_state(&recover_id),
        ProposalState::Executed
    );
    assert_eq!(governor.wasm_hash(), fixed);
    assert_eq!(governor.storage_version(), 2);

    ordinary.pass(&governor, &f.deployer);
    ordinary.execute_within_limits(&treasury, "execute (after the Governor recovery)");
}

/// A Treasury upgraded to a release whose `migrate` always fails refuses to
/// execute ordinary proposals, but still executes a recovery proposal that
/// upgrades it to the fixed release; anyone then runs the fixed migration
/// (the Treasury's second step), and execution runs as before.
#[test]
fn a_treasury_whose_migration_fails_recovers_by_proposal() {
    let f = launched_with_artwork();
    let e = &f.e;
    let governor = DaoGovernorContractClient::new(e, &f.dao.governor);
    let treasury = DaoTreasuryContractClient::new(e, &f.dao.treasury);
    let running = treasury.wasm_hash();
    let (broken, fixed) =
        broken_and_fixed(&f, "Treasury", &running, TREASURY_BROKEN, TREASURY_FIXED);
    let t = &f.dao.treasury;

    let install = Draft::new(e, "install 0.6.0").call(
        t,
        "upgrade",
        vec![e, running.into_val(e), broken.clone().into_val(e)],
    );
    install.pass(&governor, &f.deployer);
    install.execute_within_limits(&treasury, "execute (Treasury 0.6.0)");
    assert_eq!(treasury.wasm_hash(), broken);

    e.set_auths(&[]);
    assert!(treasury.try_migrate().is_err());
    assert_eq!(treasury.storage_version(), 1);
    e.mock_all_auths();
    let ordinary = renderer_change(e, &f, "ordinary");
    let ordinary_id = ordinary.pass(&governor, &f.deployer);
    assert_eq!(
        ordinary.try_execute(&treasury),
        Err(treasury::TreasuryError::StorageVersionMismatch.into())
    );

    let recover = Draft::new(e, "recover with 0.6.1").call(
        t,
        "upgrade",
        vec![e, broken.into_val(e), fixed.clone().into_val(e)],
    );
    recover.pass(&governor, &f.deployer);
    recover.execute_within_limits(&treasury, "execute (Treasury recovery)");
    assert_eq!(treasury.wasm_hash(), fixed);

    e.set_auths(&[]);
    treasury.migrate();
    assert_eq!(treasury.storage_version(), 2);
    e.mock_all_auths();
    ordinary.execute_within_limits(&treasury, "execute (after the Treasury recovery)");
    assert_eq!(
        governor.proposal_state(&ordinary_id),
        ProposalState::Executed
    );
}
