//! Tests for the parts of the invariants in `docs/audit/INVARIANTS.md` that
//! no other test asserted, and a check of how long a Treasury `authorize`
//! tree stays usable. Each section names the invariant it covers. The
//! property tests over generated operation sequences are in
//! `audit_properties.rs`.
//!
//! The factory tests run the WASM that `stellar contract build` writes, like
//! the rest of this crate's factory tests; the others register the contracts
//! natively.

use super::*;
use manager::ManagerError;
use marketplace::MarketplaceError;
use minter::{ClaimMinterClient, ClaimMinterError};
use soroban_sdk::{contractclient, Executable, InvokeError};
use treasury::AuthNode;

#[path = "audit_properties.rs"]
mod audit_properties;

const DAY: u64 = 86_400;
const PRICE: i128 = 10_000_000;

/// OpenZeppelin's `ProposalNotCancellable`.
const PROPOSAL_NOT_CANCELLABLE: u32 = 5009;

fn contract_error(code: u32) -> soroban_sdk::Error {
    soroban_sdk::Error::from_contract_error(code)
}

/// The Live flag and the admin a DAO contract stores (`common::lifecycle`,
/// `common::admin`).
fn live_and_admin(e: &Env, contract: &Address) -> (bool, Address) {
    e.as_contract(contract, || {
        (common::lifecycle::is_live(e), common::admin::admin(e))
    })
}

/// Every contract of a factory DAO: registry name, WASM file, and address.
fn dao_contracts(f: &DaoFixture) -> std::vec::Vec<(&'static str, &'static str, Address)> {
    std::vec![
        ("Token", "token", f.dao.token.clone()),
        ("Metadata", "metadata", f.dao.metadata.clone()),
        ("Governor", "governor", f.dao.governor.clone()),
        ("Treasury", "treasury", f.dao.treasury.clone()),
        ("Auction", "auction", f.auction()),
        ("Marketplace", "marketplace", f.marketplace()),
        ("ClaimMinter", "minter", f.claims()),
    ]
}

/// The Live flag and admin of every contract, in `dao_contracts` order.
fn lifecycles(f: &DaoFixture) -> std::vec::Vec<(bool, Address)> {
    dao_contracts(f)
        .iter()
        .map(|(_, _, contract)| live_and_admin(&f.e, contract))
        .collect()
}

/// One trait of artwork: a drive's list needs artwork before it opens.
fn add_artwork(f: &DaoFixture) {
    let e = &f.e;
    MetadataContractClient::new(e, &f.dao.metadata).add_properties(
        &vec![e, String::from_str(e, "Trait")],
        &vec![
            e,
            ItemParam {
                property_id: 0,
                name: String::from_str(e, "Item"),
                is_new_property: true,
            },
        ],
        &IpfsGroup {
            base_uri: String::from_str(e, "ipfs://art"),
            extension: String::from_str(e, ".png"),
        },
    );
}

/// The ClaimMinter's internal node: `sha256(min(a, b) || max(a, b))`.
fn node_hash(e: &Env, a: &BytesN<32>, b: &BytesN<32>) -> BytesN<32> {
    let (lo, hi) = if a.to_array() <= b.to_array() {
        (a, b)
    } else {
        (b, a)
    };
    let mut pair = soroban_sdk::Bytes::new(e);
    pair.extend_from_array(&lo.to_array());
    pair.extend_from_array(&hi.to_array());
    e.crypto().sha256(&pair).into()
}

/// A Merkle tree over `(claimer, amount)` leaves, hashed as the ClaimMinter
/// hashes them (`merkle_leaf`, `node_hash`). Returns the root and each leaf's
/// proof. A node without a partner moves up a level unchanged.
fn merkle_tree(
    e: &Env,
    leaves: &[(Address, u128)],
) -> (BytesN<32>, std::vec::Vec<Vec<BytesN<32>>>) {
    let mut level: std::vec::Vec<BytesN<32>> = leaves
        .iter()
        .map(|(who, amount)| merkle_leaf(e, who, *amount))
        .collect();
    let mut proofs: std::vec::Vec<Vec<BytesN<32>>> = leaves.iter().map(|_| Vec::new(e)).collect();
    let mut position: std::vec::Vec<usize> = (0..leaves.len()).collect();
    while level.len() > 1 {
        for (leaf, pos) in position.iter_mut().enumerate() {
            if let Some(sibling) = level.get(*pos ^ 1) {
                proofs[leaf].push_back(sibling.clone());
            }
            *pos /= 2;
        }
        level = level
            .chunks(2)
            .map(|pair| match pair {
                [a, b] => node_hash(e, a, b),
                [a] => a.clone(),
                _ => unreachable!(),
            })
            .collect();
    }
    (level[0].clone(), proofs)
}

/// The terms of a two-token drive for `member`, deadline in ten days.
fn drive_params(e: &Env, member: &Address) -> manager::AssuranceListParams {
    let now = e.ledger().timestamp();
    manager::AssuranceListParams {
        root: merkle_leaf(e, member, 2),
        tree_uri: String::from_str(e, "ipfs://bafyauditdrive"),
        price: PRICE,
        expires_at: now + 30 * DAY,
        total: 2,
        threshold_claimers: 1,
        deadline: now + 10 * DAY,
    }
}

/// `upgrade` and `wasm_hash`, which every DAO contract has.
#[contractclient(name = "UpgradeableClient")]
#[allow(dead_code)]
trait Upgradeable {
    fn upgrade(e: Env, from_hash: BytesN<32>, to_hash: BytesN<32>);
    fn wasm_hash(e: Env) -> BytesN<32>;
}

// ============================================================================
// INV-04: only a Pending or Active proposal can be cancelled
// ============================================================================

/// A one-action proposal and the preimage needed to queue, execute, or cancel it.
struct Proposal {
    id: BytesN<32>,
    targets: Vec<Address>,
    functions: Vec<Symbol>,
    args: Vec<Vec<Val>>,
    desc_hash: BytesN<32>,
}

fn propose_set_value(
    e: &Env,
    governor: &DaoGovernorContractClient,
    proposer: &Address,
    target: &Address,
    value: u32,
) -> Proposal {
    let targets = vec![e, target.clone()];
    let functions = vec![e, Symbol::new(e, "set_value")];
    let args = vec![e, vec![e, value.into_val(e)]];
    let description = String::from_str(e, &std::format!("set the value to {value}"));
    let desc_hash = description_hash(e, &description);
    let id = governor.propose(&targets, &functions, &args, &description, proposer);
    Proposal {
        id,
        targets,
        functions,
        args,
        desc_hash,
    }
}

/// The proposer, with their own authorization, can cancel a proposal only
/// while it is `Pending` or `Active`. In every later state (`Succeeded`,
/// `Defeated`, `Queued`, `Executed`, `Expired`, and `Canceled`) `cancel` fails
/// `ProposalNotCancellable` and leaves the state as it was.
#[test]
fn a_proposal_past_active_cannot_be_cancelled_even_by_its_proposer() {
    let (e, token, treasury, governor, target, minter) = setup();
    let proposer = Address::generate(&e);
    token.mint(&minter, &proposer);
    e.ledger().set_sequence_number(200);
    e.ledger().set_timestamp(2_000);

    let cancel = |p: &Proposal| {
        governor.try_cancel(&p.targets, &p.functions, &p.args, &p.desc_hash, &proposer)
    };
    let assert_refused = |p: &Proposal, state: ProposalState| {
        assert_eq!(governor.proposal_state(&p.id), state);
        assert_eq!(
            cancel(p).err().unwrap().unwrap(),
            contract_error(PROPOSAL_NOT_CANCELLABLE),
            "cancel in {state:?}"
        );
        assert_eq!(
            governor.proposal_state(&p.id),
            state,
            "a refused cancel changed a {state:?} proposal"
        );
    };

    // Voting opens at 2,300 and closes at 2,600 (300-second delay and period).
    let pending = propose_set_value(&e, &governor, &proposer, &target.address, 1);
    let active = propose_set_value(&e, &governor, &proposer, &target.address, 2);
    let succeeded = propose_set_value(&e, &governor, &proposer, &target.address, 3);
    let defeated = propose_set_value(&e, &governor, &proposer, &target.address, 4);
    let queued = propose_set_value(&e, &governor, &proposer, &target.address, 5);
    let executed = propose_set_value(&e, &governor, &proposer, &target.address, 6);

    // Pending: the proposer cancels it. Cancelling again is refused.
    assert_eq!(governor.proposal_state(&pending.id), ProposalState::Pending);
    assert!(cancel(&pending).is_ok());
    assert_refused(&pending, ProposalState::Canceled);

    // Active: the proposer cancels it.
    e.ledger().set_timestamp(2_301);
    assert_eq!(governor.proposal_state(&active.id), ProposalState::Active);
    assert!(cancel(&active).is_ok());
    assert_eq!(governor.proposal_state(&active.id), ProposalState::Canceled);

    let reason = String::from_str(&e, "");
    for p in [&succeeded, &queued, &executed] {
        governor.cast_vote(&p.id, &1, &reason, &proposer);
    }
    governor.cast_vote(&defeated.id, &0, &reason, &proposer);

    e.ledger().set_timestamp(2_601);
    assert_refused(&succeeded, ProposalState::Succeeded);
    assert_refused(&defeated, ProposalState::Defeated);

    for p in [&queued, &executed] {
        governor.queue(
            &p.targets,
            &p.functions,
            &p.args,
            &p.desc_hash,
            &0u32,
            &proposer,
        );
    }
    assert_refused(&queued, ProposalState::Queued);

    e.ledger().set_timestamp(2_901);
    treasury.execute(
        &executed.targets,
        &executed.functions,
        &executed.args,
        &executed.desc_hash,
    );
    assert_eq!(target.get_value(), 6);
    assert_refused(&executed, ProposalState::Executed);

    // A Succeeded proposal that is never queued expires 14 days after voting ends.
    e.ledger().set_timestamp(2_600 + 14 * DAY + 1);
    assert_refused(&succeeded, ProposalState::Expired);
    // The proposal that was queued (ETA 2,901) is still Queued, and still refused.
    assert_refused(&queued, ProposalState::Queued);
}

// ============================================================================
// INV-10: a failed launch changes nothing
// ============================================================================

/// `launch_dao` launches the Token, the Governor, the Treasury, every module
/// in registration order (Auction, Marketplace, ClaimMinter) and then the
/// Metadata. Making each of those calls fail in turn (by launching that one
/// contract first, as the Manager would, so the Manager's own call to it
/// fails `AlreadyLive`) shows that the transaction reverts whatever had
/// already run: every other contract is still in Setup with the launch admin
/// as its admin, the first auction's token was never minted, no allowance
/// was granted, `PendingDao` is kept, and the slug is still free.
///
/// When the Token is the one launched first, the Manager's check that the
/// launch admin still holds the Token refuses before any call
/// (`LaunchAdminNotOwner`, 7126).
#[test]
fn a_launch_that_fails_at_any_contract_leaves_every_contract_as_it_was() {
    let config = manager::LaunchConfig {
        launch_auction: true,
        launch_marketplace: true,
    };
    let order = [
        "Token",
        "Governor",
        "Treasury",
        "Auction",
        "Marketplace",
        "ClaimMinter",
        "Metadata",
    ];
    for failing in order {
        let f = factory_dao();
        let e = &f.e;
        let token = DaoTokenContractClient::new(e, &f.dao.token);
        let treasury = f.dao.treasury.clone();
        let slug = String::from_str(e, "upgrade-dao");
        let contracts = dao_contracts(&f);
        let (_, _, early) = contracts
            .iter()
            .find(|(name, _, _)| *name == failing)
            .unwrap()
            .clone();

        // The Manager's authorization is mocked, so this stands in for an
        // earlier launch of this one contract.
        match failing {
            "Token" => token.launch(&treasury, &Vec::new(e)),
            "Governor" | "Treasury" | "Metadata" => {
                common::clients::TreasuryLaunchClient::new(e, &early).launch(&treasury)
            }
            _ => common::clients::DaoModuleClient::new(e, &early).launch(&treasury, &false),
        }
        let before = lifecycles(&f);
        for ((name, _, _), state) in contracts.iter().zip(before.iter()) {
            let expected = if *name == failing {
                (true, treasury.clone())
            } else {
                (false, f.deployer.clone())
            };
            assert_eq!(*state, expected, "{failing}: {name} before the launch");
        }
        let pending = f.manager.get_pending_dao(&f.dao.token).unwrap();
        let minted = token.minted();

        let refused = f
            .manager
            .try_launch_dao(&f.dao.token, &config)
            .err()
            .unwrap();
        let expected = if failing == "Token" {
            Ok(ManagerError::LaunchAdminNotOwner)
        } else {
            Err(InvokeError::Contract(
                common::CommonError::AlreadyLive as u32,
            ))
        };
        assert_eq!(refused, expected, "{failing}");

        assert_eq!(lifecycles(&f), before, "{failing}: a contract changed");
        assert_eq!(
            token.minted(),
            minted,
            "{failing}: the first auction minted"
        );
        assert_eq!(token.mint_allowance(&f.auction()), 0, "{failing}");
        assert_eq!(
            f.manager.get_pending_dao(&f.dao.token).unwrap(),
            pending,
            "{failing}"
        );
        assert!(f.manager.try_get_dao_by_slug(&slug).is_err(), "{failing}");
    }
}

// ============================================================================
// INV-12: after handoff the launch admin can change nothing
// ============================================================================

/// Once `open_assurance` has handed every admin to the Treasury, the launch
/// admin's signature no longer raises or lowers a mint allowance, and no
/// longer upgrades any of the seven contracts, even along a path the
/// registry approved. Before the handoff the same signature raised the
/// allowance; with the admin's authorization mocked the same upgrades go
/// through, so the admin check is the only thing refusing them.
#[test]
fn after_handoff_the_launch_admin_cannot_change_an_allowance_or_upgrade() {
    let f = factory_dao();
    let e = &f.e;
    add_artwork(&f);
    let token = DaoTokenContractClient::new(e, &f.dao.token);
    let claims = f.claims();

    // An approved upgrade for every contract.
    let mut upgrades = std::vec::Vec::new();
    for (name, wasm, contract) in dao_contracts(&f) {
        let from = UpgradeableClient::new(e, &contract).wasm_hash();
        let to = module_wasm_variant(e, wasm, "audit-handoff");
        f.manager.register_implementation(
            &String::from_str(e, name),
            &String::from_str(e, "0.1.1"),
            &to,
        );
        f.manager.approve_upgrade(&from, &to);
        upgrades.push((name, contract, from, to));
    }

    let as_launch_admin = |contract: &Address, function: &'static str, args: Vec<Val>| {
        only_auth(e, &f.deployer, contract, function, args, &[]);
    };
    let allowance_args = |amount: u32| vec![e, claims.into_val(e), amount.into_val(e)];

    // Before the handoff the launch admin's own signature raises it.
    let before = token.mint_allowance(&claims);
    as_launch_admin(&f.dao.token, "increase_mint_allowance", allowance_args(1));
    token.increase_mint_allowance(&claims, &1);
    assert_eq!(token.mint_allowance(&claims), before + 1);

    e.mock_all_auths();
    let member = Address::generate(e);
    f.manager.open_assurance(
        &f.dao.token,
        &drive_params(e, &member),
        &f.no_launch_modules(),
    );
    for (name, _, contract) in dao_contracts(&f) {
        assert_eq!(
            live_and_admin(e, &contract),
            (false, f.dao.treasury.clone()),
            "{name} after the handoff"
        );
    }
    let granted = token.mint_allowance(&claims);

    as_launch_admin(&f.dao.token, "increase_mint_allowance", allowance_args(1));
    assert_eq!(
        token
            .try_increase_mint_allowance(&claims, &1)
            .err()
            .unwrap()
            .unwrap(),
        auth_error()
    );
    as_launch_admin(&f.dao.token, "decrease_mint_allowance", allowance_args(1));
    assert_eq!(
        token
            .try_decrease_mint_allowance(&claims, &1)
            .err()
            .unwrap()
            .unwrap(),
        auth_error()
    );
    assert_eq!(token.mint_allowance(&claims), granted);

    for (name, contract, from, to) in &upgrades {
        let client = UpgradeableClient::new(e, contract);
        as_launch_admin(
            contract,
            "upgrade",
            vec![e, from.into_val(e), to.into_val(e)],
        );
        assert_eq!(
            client.try_upgrade(from, to).err().unwrap().unwrap(),
            auth_error(),
            "{name}"
        );
        assert_eq!(client.wasm_hash(), *from, "{name}");
        assert_eq!(
            contract.executable(),
            Some(Executable::Wasm(from.clone())),
            "{name}"
        );
    }

    // The approvals were usable: the admin's authorization is what was missing.
    e.mock_all_auths();
    for (name, contract, from, to) in &upgrades {
        UpgradeableClient::new(e, contract).upgrade(from, to);
        assert_eq!(
            contract.executable(),
            Some(Executable::Wasm(to.clone())),
            "{name}"
        );
    }
}

// ============================================================================
// INV-14: the factory pause
// ============================================================================

/// While the factory is paused, `create_dao` and `open_assurance` fail with
/// `FactoryPaused` (7111) and change nothing: no DAO, no list, no allowance,
/// no slug, no handoff. Unpaused, both go through.
#[test]
fn a_paused_factory_refuses_create_dao_and_open_assurance() {
    let f = factory_dao();
    let e = &f.e;
    add_artwork(&f);
    let token = DaoTokenContractClient::new(e, &f.dao.token);
    let claims = ClaimMinterClient::new(e, &f.claims());
    let member = Address::generate(e);
    let slug = String::from_str(e, "upgrade-dao");
    let second = slug_params(e, &f.deployer, 2, "second-dao", &f.payment.address());
    let allowance = token.mint_allowance(&f.claims());

    f.manager.pause_factory();
    // Nothing was deployed: the same parameters (the same predicted
    // addresses) create the DAO once the factory is unpaused, below.
    assert_eq!(
        f.manager.try_create_dao(&second).err().unwrap(),
        Ok(ManagerError::FactoryPaused)
    );
    assert_eq!(
        f.manager
            .try_open_assurance(
                &f.dao.token,
                &drive_params(e, &member),
                &f.no_launch_modules()
            )
            .err()
            .unwrap(),
        Ok(ManagerError::FactoryPaused)
    );
    assert_eq!(claims.next_list_id(), 0);
    assert_eq!(token.mint_allowance(&f.claims()), allowance);
    assert!(f.manager.get_assurance(&f.dao.token).is_none());
    assert!(f.manager.try_get_dao_by_slug(&slug).is_err());
    for state in lifecycles(&f) {
        assert_eq!(state, (false, f.deployer.clone()));
    }

    f.manager.unpause_factory();
    let created = f.manager.create_dao(&second);
    assert!(f.manager.get_pending_dao(&created.token).is_some());
    let list = f.manager.open_assurance(
        &f.dao.token,
        &drive_params(e, &member),
        &f.no_launch_modules(),
    );
    assert_eq!(claims.assurance_list(), Some(list));
    assert_eq!(f.manager.get_dao_by_slug(&slug), f.dao.token);
}

// ============================================================================
// INV-18: the voting period is at least 300 seconds
// ============================================================================

/// The Governor's constructor refuses a voting period below 300 seconds
/// (`InvalidVotingPeriod`, 7505).
#[test]
#[should_panic(expected = "Error(Contract, #7505)")]
fn a_governor_constructed_with_a_voting_period_under_300_seconds_is_refused() {
    let e = Env::default();
    e.register(
        DaoGovernorContract,
        (
            Address::generate(&e),
            Address::generate(&e),
            Address::generate(&e),
            300_u32,
            299_u32,
            300_u32,
            1_u128,
            1_000_u32,
            Address::generate(&e),
            BytesN::from_array(&e, &[0u8; 32]),
        ),
    );
}

/// `set_voting_period` refuses anything below 300 seconds
/// (`InvalidVotingPeriod`, 7505) and keeps the period it had; 300 is
/// accepted. The Manager refuses such a period before it deploys a Governor
/// (`InvalidGovernanceTiming`, 7118).
#[test]
fn a_voting_period_under_300_seconds_is_refused_by_the_setter_and_the_manager() {
    let (_e, _token, _treasury, governor, _target, _minter) = setup();
    governor.set_voting_period(&600);
    for short in [0_u32, 1, 299] {
        assert_eq!(
            governor
                .try_set_voting_period(&short)
                .err()
                .unwrap()
                .unwrap(),
            contract_error(governor::CustomGovernorError::InvalidVotingPeriod as u32),
            "{short}"
        );
        assert_eq!(governor.voting_period(), 600);
    }
    governor.set_voting_period(&300);
    assert_eq!(governor.voting_period(), 300);

    let f = factory_dao();
    let e = &f.e;
    let mut params = slug_params(e, &f.deployer, 2, "short-vote", &f.payment.address());
    params.initial_config.governance.voting_period = 299;
    assert_eq!(
        f.manager.try_create_dao(&params).err().unwrap(),
        Ok(ManagerError::InvalidGovernanceTiming)
    );
    params.initial_config.governance.voting_period = 300;
    f.manager.create_dao(&params);
}

// ============================================================================
// INV-22: escrow, records and balance agree at every step of a drive
// ============================================================================

/// The drive's escrow, the sum of its claim records' `escrowed`, and the
/// ClaimMinter's balance of the asset less what was sent to it directly.
fn escrow_books(
    f: &DaoFixture,
    list: u32,
    claimers: &[(Address, u128)],
    donated: i128,
) -> (i128, i128, i128) {
    let e = &f.e;
    let claims = ClaimMinterClient::new(e, &f.claims());
    let escrow = claims.get_list(&list).unwrap().escrow;
    let records = claimers
        .iter()
        .map(|(who, _)| claims.get_claim(&list, who).escrowed)
        .sum();
    let held = TokenClient::new(e, &f.payment.address()).balance(&f.claims()) - donated;
    (escrow, records, held)
}

fn assert_escrow_agrees(
    f: &DaoFixture,
    list: u32,
    claimers: &[(Address, u128)],
    donated: i128,
    step: &str,
) {
    let (escrow, records, held) = escrow_books(f, list, claimers, donated);
    assert_eq!(escrow, records, "{step}: escrow vs the records");
    assert_eq!(held, escrow, "{step}: the balance vs escrow");
}

/// A drive through the real Manager, with the three-way equality checked
/// after every step: partial claims, a payment sent straight to the
/// ClaimMinter, refused claims, refunds, and releases. Then either the drive
/// is met and launched, which releases the escrow (the records keep their
/// amounts; `ClaimList::escrow` documents this), or it fails and every
/// claimer is refunded one at a time.
#[test]
fn a_drives_escrow_equals_its_records_and_its_balance_after_every_step() {
    for launch in [true, false] {
        let f = factory_dao();
        let e = &f.e;
        add_artwork(&f);
        let claims = ClaimMinterClient::new(e, &f.claims());
        let asset = StellarAssetClient::new(e, &f.payment.address());
        let pay = TokenClient::new(e, &f.payment.address());
        let claimers: std::vec::Vec<(Address, u128)> = [3_u128, 2, 1]
            .iter()
            .map(|amount| (Address::generate(e), *amount))
            .collect();
        for (who, amount) in &claimers {
            asset.mint(who, &(PRICE * *amount as i128));
        }
        let (root, proofs) = merkle_tree(e, &claimers);
        let now = e.ledger().timestamp();
        let list = f.manager.open_assurance(
            &f.dao.token,
            &manager::AssuranceListParams {
                root,
                tree_uri: String::from_str(e, "ipfs://bafyauditescrow"),
                price: PRICE,
                expires_at: now + 30 * DAY,
                total: 6,
                threshold_claimers: 2,
                deadline: now + 10 * DAY,
            },
            &f.no_launch_modules(),
        );
        let claim = |i: usize, n: u32| {
            let (who, leaf) = &claimers[i];
            claims.try_claim(&list, who, leaf, &n, &proofs[i], &PRICE)
        };
        let mut donated = 0_i128;
        let check =
            |donated: i128, step: &str| assert_escrow_agrees(&f, list, &claimers, donated, step);
        check(donated, "opened");

        claim(0, 1).unwrap().unwrap();
        check(donated, "a claims 1");
        let donor = Address::generate(e);
        asset.mint(&donor, &7);
        pay.transfer(&donor, f.claims(), &7);
        donated += 7;
        check(donated, "a payment sent directly");
        claim(1, 2).unwrap().unwrap();
        check(donated, "b claims 2");
        assert_eq!(
            claim(0, 3).err().unwrap(),
            Ok(ClaimMinterError::AlreadyClaimed)
        );
        check(donated, "a claims past the leaf");
        assert_eq!(
            claims.try_refund(&list, &claimers[0].0).err().unwrap(),
            Ok(ClaimMinterError::NotFailed)
        );
        assert_eq!(
            claims.try_release(&list).err().unwrap(),
            Ok(ClaimMinterError::TokenNotLive)
        );
        check(donated, "an early refund and release");
        claim(0, 2).unwrap().unwrap();
        check(donated, "a claims the rest of the leaf");

        if launch {
            let (escrow, records, _) = escrow_books(&f, list, &claimers, donated);
            f.manager.launch_when_ready(&f.dao.token);
            assert_eq!(pay.balance(&f.dao.treasury), escrow);
            let (after, kept, held) = escrow_books(&f, list, &claimers, donated);
            assert_eq!((after, held), (0, 0), "released");
            assert_eq!(kept, records, "release leaves the records");
            assert_eq!(
                claims.try_refund(&list, &claimers[0].0).err().unwrap(),
                Ok(ClaimMinterError::NotFailed)
            );
            // After launch a claim pays the Treasury, not the escrow.
            claim(2, 1).unwrap().unwrap();
            assert_eq!(claims.get_claim(&list, &claimers[2].0).escrowed, 0);
            assert_eq!(pay.balance(&f.dao.treasury), escrow + PRICE);
            assert_eq!(escrow_books(&f, list, &claimers, donated), (0, records, 0));
            assert_eq!(claims.release(&list), 0);
        } else {
            e.ledger().set_timestamp(now + 10 * DAY + 1);
            assert_eq!(
                claim(2, 1).err().unwrap(),
                Ok(ClaimMinterError::AssuranceFailed)
            );
            check(donated, "a claim after the drive failed");
            for i in [0, 1] {
                let paid = claims.get_claim(&list, &claimers[i].0).escrowed;
                assert_eq!(claims.refund(&list, &claimers[i].0), paid);
                assert_eq!(pay.balance(&claimers[i].0), paid);
                check(donated, "a refund");
            }
            for i in [0, 2] {
                assert_eq!(
                    claims.try_refund(&list, &claimers[i].0).err().unwrap(),
                    Ok(ClaimMinterError::NothingToRefund)
                );
            }
            check(donated, "nothing left to refund");
            assert_eq!(escrow_books(&f, list, &claimers, donated), (0, 0, 0));
        }
        // What was sent directly is in no escrow and stays.
        assert_eq!(pay.balance(&f.claims()), donated);
    }
}

// ============================================================================
// INV-28: only the seller cancels a listing
// ============================================================================

/// Someone other than the seller cannot cancel a listing: naming themselves
/// fails `NotSeller` (7708), and naming the seller without the seller's
/// signature fails authorization. The listing and the escrowed token stay;
/// the seller then cancels and gets the token back.
#[test]
fn a_listing_is_cancelled_only_by_its_seller() {
    let f = factory_dao();
    let e = &f.e;
    f.manager.launch_dao(
        &f.dao.token,
        &manager::LaunchConfig {
            launch_auction: false,
            launch_marketplace: true,
        },
    );
    let token = DaoTokenContractClient::new(e, &f.dao.token);
    let market = MarketplaceContractClient::new(e, &f.marketplace());
    let seller = f.deployer.clone();
    let id = 0_u32;
    token.approve(
        &seller,
        &market.address,
        &id,
        &(e.ledger().sequence() + 10_000),
    );
    market.list(
        &id,
        &seller,
        &1_000_000,
        &(e.ledger().timestamp() + DAY),
        &250,
        &f.payment.address(),
    );
    assert_eq!(token.owner_of(&id), market.address);
    let listing = market.get_listing(&id);
    assert!(listing.is_some());

    let other = Address::generate(e);
    let cancel_as = |signer: &Address, named: &Address| {
        only_auth(
            e,
            signer,
            &market.address,
            "cancel",
            vec![e, id.into_val(e), named.into_val(e)],
            &[],
        );
        market.try_cancel(&id, named)
    };
    assert_eq!(
        cancel_as(&other, &other).err().unwrap().unwrap(),
        contract_error(MarketplaceError::NotSeller as u32)
    );
    assert_eq!(
        cancel_as(&other, &seller).err().unwrap().unwrap(),
        auth_error()
    );
    assert_eq!(market.get_listing(&id), listing);
    assert_eq!(token.owner_of(&id), market.address);

    assert!(cancel_as(&seller, &seller).is_ok());
    assert_eq!(market.get_listing(&id), None);
    assert_eq!(token.owner_of(&id), seller);
}

// ============================================================================
// INV-16: an `authorize` tree is used only within the call it was attached to
// ============================================================================
//
// Question: can the trees an `authorize` action stores be consumed by a
// `require_auth(treasury)` deeper in a later call than the one they were
// meant for? `execute` passes them to `authorize_as_current_contract`
// together with the entry for the next action's own call, just before it
// makes that call. In the host these entries last only until that call
// returns. Within it, a node is used once, by a call with exactly its
// contract, function, and arguments, at any depth below the call; a node's
// sub-nodes are used only below the call that used the node. Every proposal
// below runs through the real Governor and Treasury, executed with no
// authorization but the Treasury's own.

/// Debits `from` only with `from`'s authorization, as a payment from the
/// Treasury would.
#[contract]
pub struct AuditLedger;

#[contractimpl]
impl AuditLedger {
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

/// Reaches the ledger at different depths below the Treasury's direct call.
#[contract]
pub struct AuditRelay;

#[contractimpl]
impl AuditRelay {
    /// Needs no authorization.
    pub fn ping(_e: &Env) {}

    /// `ledger.debit(from, amount)`, one level below this call.
    pub fn pull(e: &Env, ledger: Address, from: Address, amount: u32) {
        AuditLedgerClient::new(e, &ledger).debit(&from, &amount);
    }

    /// `relay.pull(...)`: the debit two levels below this call.
    pub fn pull_via(e: &Env, relay: Address, ledger: Address, from: Address, amount: u32) {
        AuditRelayClient::new(e, &relay).pull(&ledger, &from, &amount);
    }

    /// The same debit twice: one level below this call, then two levels
    /// below through `relay`.
    pub fn pull_twice(e: &Env, relay: Address, ledger: Address, from: Address, amount: u32) {
        AuditLedgerClient::new(e, &ledger).debit(&from, &amount);
        AuditRelayClient::new(e, &relay).pull(&ledger, &from, &amount);
    }

    /// `gate.forward(owner, ledger, amount)`: the debit below the gate's call.
    pub fn through_gate(e: &Env, gate: Address, ledger: Address, owner: Address, amount: u32) {
        AuditGateClient::new(e, &gate).forward(&owner, &ledger, &amount);
    }

    /// `gate.approve(owner, ledger, amount)` alone.
    pub fn approve_only(e: &Env, gate: Address, ledger: Address, owner: Address, amount: u32) {
        AuditGateClient::new(e, &gate).approve(&owner, &ledger, &amount);
    }

    /// `gate.approve(owner, ledger, amount)`, then, once it has returned,
    /// `ledger.debit(owner, amount)`: the debit is after the gate's call,
    /// not below it.
    pub fn approve_then_pull(e: &Env, gate: Address, ledger: Address, owner: Address, amount: u32) {
        AuditGateClient::new(e, &gate).approve(&owner, &ledger, &amount);
        AuditLedgerClient::new(e, &ledger).debit(&owner, &amount);
    }
}

/// Needs `owner`'s authorization itself: a call whose authorization node can
/// have the debit as its sub-node.
#[contract]
pub struct AuditGate;

#[contractimpl]
impl AuditGate {
    /// Then debits `owner`, below this call.
    pub fn forward(e: &Env, owner: Address, ledger: Address, amount: u32) {
        owner.require_auth();
        AuditLedgerClient::new(e, &ledger).debit(&owner, &amount);
    }

    /// Only the authorization; the arguments name the debit it approves.
    pub fn approve(_e: &Env, owner: Address, _ledger: Address, _amount: u32) {
        owner.require_auth();
    }
}

struct AuthWorld {
    e: Env,
    token: DaoTokenContractClient<'static>,
    treasury: DaoTreasuryContractClient<'static>,
    governor: DaoGovernorContractClient<'static>,
    minter: Address,
    ledger: AuditLedgerClient<'static>,
    relay: Address,
    relay2: Address,
    gate: Address,
}

type Action = (Address, &'static str, Vec<Val>);

impl AuthWorld {
    /// A fresh DAO for each proposal: `queue_proposal` sets the ledger to a
    /// fixed sequence and time.
    fn new() -> Self {
        let (e, token, treasury, governor, _target, minter) = setup();
        let ledger = AuditLedgerClient::new(&e, &e.register(AuditLedger, ()));
        let relay = e.register(AuditRelay, ());
        let relay2 = e.register(AuditRelay, ());
        let gate = e.register(AuditGate, ());
        Self {
            e,
            token,
            treasury,
            governor,
            minter,
            ledger,
            relay,
            relay2,
            gate,
        }
    }

    fn t(&self) -> Address {
        self.treasury.address.clone()
    }

    fn debit_node(&self, amount: u32) -> AuthNode {
        let e = &self.e;
        AuthNode {
            contract: self.ledger.address.clone(),
            fn_name: Symbol::new(e, "debit"),
            args: vec![e, self.t().into_val(e), amount.into_val(e)],
            sub: Vec::new(e),
        }
    }

    /// A node for `gate.<function>(treasury, ledger, amount)` with the debit
    /// as its sub-node.
    fn gate_node(&self, function: &str, amount: u32) -> AuthNode {
        let e = &self.e;
        AuthNode {
            contract: self.gate.clone(),
            fn_name: Symbol::new(e, function),
            args: vec![
                e,
                self.t().into_val(e),
                self.ledger.address.into_val(e),
                amount.into_val(e),
            ],
            sub: vec![e, self.debit_node(amount)],
        }
    }

    fn authorize(&self, nodes: std::vec::Vec<AuthNode>) -> Action {
        let e = &self.e;
        let mut list = Vec::new(e);
        for node in nodes {
            list.push_back(node);
        }
        (self.t(), "authorize", vec![e, list.into_val(e)])
    }

    fn ping(&self) -> Action {
        (self.relay.clone(), "ping", Vec::new(&self.e))
    }

    fn pull(&self, amount: u32) -> Action {
        let e = &self.e;
        (
            self.relay.clone(),
            "pull",
            vec![
                e,
                self.ledger.address.into_val(e),
                self.t().into_val(e),
                amount.into_val(e),
            ],
        )
    }

    /// A relay function taking `(relay2, ledger, treasury, amount)`; `relay`
    /// and `relay2` are distinct contracts (no re-entry).
    fn relayed(&self, function: &'static str, amount: u32) -> Action {
        let e = &self.e;
        (
            self.relay.clone(),
            function,
            vec![
                e,
                self.relay2.into_val(e),
                self.ledger.address.into_val(e),
                self.t().into_val(e),
                amount.into_val(e),
            ],
        )
    }

    /// A relay function taking `(gate, ledger, treasury, amount)`.
    fn via_gate(&self, function: &'static str, amount: u32) -> Action {
        let e = &self.e;
        (
            self.relay.clone(),
            function,
            vec![
                e,
                self.gate.into_val(e),
                self.ledger.address.into_val(e),
                self.t().into_val(e),
                amount.into_val(e),
            ],
        )
    }

    /// Passes `actions` as one proposal, then executes it with real
    /// authorization only. Returns the error `execute` failed with, if any,
    /// and the proposal's state afterwards.
    fn execute(&self, actions: &[Action]) -> (Option<soroban_sdk::Error>, ProposalState) {
        let e = &self.e;
        let mut targets = Vec::new(e);
        let mut functions = Vec::new(e);
        let mut args = Vec::new(e);
        for (target, function, call_args) in actions {
            targets.push_back(target.clone());
            functions.push_back(Symbol::new(e, function));
            args.push_back(call_args.clone());
        }
        let (id, desc_hash) = queue_proposal(
            e,
            &self.token,
            &self.governor,
            &self.minter,
            &targets,
            &functions,
            &args,
            "authorization scope",
        );
        e.set_auths(&[]);
        let refused = match self
            .treasury
            .try_execute(&targets, &functions, &args, &desc_hash)
        {
            Ok(_) => None,
            Err(Ok(error)) => Some(error),
            Err(Err(error)) => panic!("execute failed outside the contract: {error:?}"),
        };
        e.mock_all_auths();
        (refused, self.governor.proposal_state(&id))
    }
}

/// A tree attached to an action that does not use it is gone when that
/// action's call returns: a later action that needs it, one level or two
/// levels below its own call, is refused, and the proposal stays `Queued`
/// with nothing debited. The controls show the refusal is the missing tree:
/// the unused tree and the action it was attached to execute on their own,
/// the same later action executes with a tree of its own, and the tree works
/// on the action that uses it.
#[test]
fn an_authorize_tree_does_not_outlive_the_call_it_was_attached_to() {
    let w = AuthWorld::new();
    let (refused, state) = w.execute(&[w.authorize(std::vec![w.debit_node(5)]), w.pull(5)]);
    assert_eq!((refused, state), (None, ProposalState::Executed));
    assert_eq!(w.ledger.debited(), 5);

    let w = AuthWorld::new();
    let (refused, state) = w.execute(&[w.authorize(std::vec![w.debit_node(5)]), w.ping()]);
    assert_eq!((refused, state), (None, ProposalState::Executed));
    assert_eq!(w.ledger.debited(), 0);

    for later in ["pull", "pull_via"] {
        let next = |w: &AuthWorld| {
            if later == "pull" {
                w.pull(5)
            } else {
                w.relayed("pull_via", 5)
            }
        };
        let w = AuthWorld::new();
        let (refused, state) = w.execute(&[
            w.authorize(std::vec![w.debit_node(5)]),
            w.ping(),
            w.authorize(std::vec![w.debit_node(5)]),
            next(&w),
        ]);
        assert_eq!((refused, state), (None, ProposalState::Executed), "{later}");
        assert_eq!(w.ledger.debited(), 5, "{later}");

        let w = AuthWorld::new();
        let (refused, state) =
            w.execute(&[w.authorize(std::vec![w.debit_node(5)]), w.ping(), next(&w)]);
        assert_eq!(
            refused,
            Some(auth_error()),
            "{later}: a leftover tree was used"
        );
        assert_eq!(state, ProposalState::Queued, "{later}");
        assert_eq!(w.ledger.debited(), 0, "{later}");
    }
}

/// Within the call it is attached to, a node is matched by its exact call at
/// any depth: a debit two levels down uses it. It is used only once: an
/// action that makes the same debit twice (one level, then two levels down)
/// is refused, and the whole proposal reverts with nothing debited, while
/// two nodes cover both debits.
#[test]
fn an_authorize_node_is_used_once_at_any_depth_below_its_call() {
    let w = AuthWorld::new();
    let (refused, _) = w.execute(&[
        w.authorize(std::vec![w.debit_node(5)]),
        w.relayed("pull_via", 5),
    ]);
    assert_eq!(refused, None);
    assert_eq!(w.ledger.debited(), 5);

    let w = AuthWorld::new();
    let (refused, state) = w.execute(&[
        w.authorize(std::vec![w.debit_node(5)]),
        w.relayed("pull_twice", 5),
    ]);
    assert_eq!(
        refused,
        Some(auth_error()),
        "one node authorized two debits"
    );
    assert_eq!(state, ProposalState::Queued);
    assert_eq!(w.ledger.debited(), 0);

    let w = AuthWorld::new();
    let (refused, _) = w.execute(&[
        w.authorize(std::vec![w.debit_node(5), w.debit_node(5)]),
        w.relayed("pull_twice", 5),
    ]);
    assert_eq!(refused, None);
    assert_eq!(w.ledger.debited(), 10);
}

/// A sub-node is used only below the call that used its parent node. With
/// `gate.forward` over the debit, the debit below the gate's call works, and
/// the same debit with no gate call is refused. With `gate.approve` over the
/// debit, the gate's call alone executes (the sub-node left unused), and a
/// debit made after the gate's call has returned is refused.
#[test]
fn a_nested_authorize_node_is_used_only_below_its_parent() {
    let w = AuthWorld::new();
    let (refused, _) = w.execute(&[
        w.authorize(std::vec![w.gate_node("forward", 5)]),
        w.via_gate("through_gate", 5),
    ]);
    assert_eq!(refused, None);
    assert_eq!(w.ledger.debited(), 5);

    let w = AuthWorld::new();
    let (refused, state) =
        w.execute(&[w.authorize(std::vec![w.gate_node("forward", 5)]), w.pull(5)]);
    assert_eq!(
        (refused, state),
        (Some(auth_error()), ProposalState::Queued),
        "a sub-node was used with no parent call"
    );

    let w = AuthWorld::new();
    let (refused, state) = w.execute(&[
        w.authorize(std::vec![w.gate_node("approve", 5)]),
        w.via_gate("approve_only", 5),
    ]);
    assert_eq!((refused, state), (None, ProposalState::Executed));

    let w = AuthWorld::new();
    let (refused, state) = w.execute(&[
        w.authorize(std::vec![w.gate_node("approve", 5)]),
        w.via_gate("approve_then_pull", 5),
    ]);
    assert_eq!(
        (refused, state),
        (Some(auth_error()), ProposalState::Queued),
        "a sub-node was used after its parent call returned"
    );
    assert_eq!(w.ledger.debited(), 0);
}

/// `check_authorization` only reads the tree it is given and stores nothing:
/// after it has checked a tree, a proposal whose action needs that tree but
/// carries no `authorize` action is still refused.
#[test]
fn check_authorization_installs_no_authorization() {
    let w = AuthWorld::new();
    let nodes = vec![&w.e, w.debit_node(5)];
    assert_eq!(w.treasury.check_authorization(&nodes), 1);
    let (refused, state) = w.execute(&[w.pull(5)]);
    assert_eq!(
        (refused, state),
        (Some(auth_error()), ProposalState::Queued)
    );
    assert_eq!(w.ledger.debited(), 0);
}
