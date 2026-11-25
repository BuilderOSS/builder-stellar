//! Property tests, with `proptest`, for three invariants in
//! `docs/audit/INVARIANTS.md`:
//!
//! - INV-01: voting units equal non-custody balances, over mints, batch
//!   mints, transfers (custody moves into and out of the Treasury, Auction,
//!   Marketplace, and a vault module among them), delegations, and
//!   registering a holder as a non-voting module. The Token has no burn: a
//!   token's voting unit is burned only when it moves into custody or its
//!   holder becomes a non-voting module, and every minted token stays held.
//! - INV-05: mint-allowance accounting, over module mints, admin mints,
//!   increases (some reaching the unlimited `u32::MAX`), decreases, releases,
//!   unregistering, and registering again.
//! - INV-22: ClaimMinter escrow, over claims, payments sent straight to the
//!   ClaimMinter, the passing of time, launch, releases, and refunds.
//!
//! Each case builds a fresh in-memory host with the contracts registered
//! natively, runs a generated sequence of operations, and checks the
//! invariant after every one, refused operations included (a refused
//! operation must change nothing). A failing case is shrunk to a shorter
//! failing sequence and reported with it.
//!
//! Runs are deterministic: the generator has a fixed seed. Set
//! `PROPTEST_RNG_SEED` (a `u64`) to try other sequences and `PROPTEST_CASES`
//! to run more cases, for example
//! `PROPTEST_CASES=500 PROPTEST_RNG_SEED=7 cargo test -p dao-e2e audit_properties`.
//! With the default seed and case count, each property also requires every
//! kind of step that changes state or is refused to run a minimum number of
//! times, so a change to the generators cannot quietly stop testing a path.
//! The floors are tuned to that seed and to the `proptest` version in
//! `Cargo.lock`; other seeds and case counts print the tally instead.

use super::*;
use minter::{AssuranceState, AssuranceTerms, ClaimMinter, ClaimMinterClient, ClaimMinterError};
use proptest::{
    arbitrary::any,
    collection::vec as vec_of,
    prop_oneof,
    strategy::{Just, Strategy},
    test_runner::{Config, RngAlgorithm, TestCaseError, TestRng, TestRunner},
};
use soroban_sdk::testutils::EnvTestConfig;
use std::{cell::RefCell, collections::BTreeMap, vec::Vec as StdVec};
use token::TokenError;

const DEFAULT_SEED: u64 = 20_261_125;

fn env_number(name: &str) -> Option<u64> {
    std::env::var(name).ok()?.parse().ok()
}

/// How often each kind of step ran, over every case of a property.
type Tally = RefCell<BTreeMap<&'static str, u32>>;

fn count(tally: &Tally, step: &'static str) {
    *tally.borrow_mut().entry(step).or_default() += 1;
}

/// With the default seed and case count, each step must have run at least
/// its floor. The floors sit a little under what the default run reaches.
fn assert_reached(tally: &Tally, defaults: bool, steps: &[(&'static str, u32)]) {
    let tally = tally.borrow();
    std::println!("steps run: {tally:?}");
    if !defaults {
        return;
    }
    for (step, at_least) in steps {
        assert!(
            tally.get(step).copied().unwrap_or(0) >= *at_least,
            "step {step} ran fewer than {at_least} times: {tally:?}"
        );
    }
}

/// Runs `test` on `cases` generated inputs (or `PROPTEST_CASES`), seeded
/// from `PROPTEST_RNG_SEED` or the fixed default and the property's name.
/// Returns whether the default seed and case count were used. Panics with
/// the shrunk failing input.
fn check<S>(name: &str, cases: u32, strategy: S, test: impl Fn(S::Value)) -> bool
where
    S: Strategy,
    S::Value: core::fmt::Debug,
{
    let defaults =
        env_number("PROPTEST_CASES").is_none() && env_number("PROPTEST_RNG_SEED").is_none();
    let cases = env_number("PROPTEST_CASES").map_or(cases, |n| n as u32);
    let seed = env_number("PROPTEST_RNG_SEED").unwrap_or(DEFAULT_SEED);
    let mut bytes = [0u8; 32];
    bytes[..8].copy_from_slice(&seed.to_le_bytes());
    for (i, b) in name.bytes().enumerate() {
        bytes[8 + i % 24] ^= b;
    }
    let config = Config {
        cases,
        failure_persistence: None,
        max_shrink_iters: 1_024,
        ..Config::default()
    };
    let mut runner =
        TestRunner::new_with_rng(config, TestRng::from_seed(RngAlgorithm::ChaCha, &bytes));
    let result = runner.run(&strategy, |input| {
        test(input);
        Ok::<(), TestCaseError>(())
    });
    if let Err(failure) = result {
        panic!("{name} (seed {seed}, {cases} cases): {failure}");
    }
    defaults
}

/// An in-memory host that writes no test snapshot when dropped (a property
/// builds one per case), with every authorization mocked.
fn quiet_env() -> Env {
    let e = Env::new_with_config(EnvTestConfig {
        capture_snapshot_at_drop: false,
    });
    e.mock_all_auths();
    e.ledger().set_sequence_number(100);
    e.ledger().set_timestamp(1_000);
    e
}

/// A deployed stand-in for a module: only contracts can be modules.
#[contract]
pub struct PropertyStub;

#[contractimpl]
impl PropertyStub {
    pub fn ping() {}
}

/// Artwork stand-in for the ClaimMinter's world: one trait, and the Token's
/// mint hooks succeed.
#[contract]
pub struct PropertyArtwork;

#[contractimpl]
impl PropertyArtwork {
    pub fn properties_count() -> u32 {
        1
    }
    pub fn on_minted(_token_id: u32) -> bool {
        true
    }
    pub fn on_minted_batch(_first_token_id: u32, _count: u32) -> bool {
        true
    }
}

fn new_token(
    e: &Env,
    admin: &Address,
    treasury: &Address,
    metadata: &Address,
) -> DaoTokenContractClient<'static> {
    let token = e.register(
        DaoTokenContract,
        (
            admin.clone(),
            treasury.clone(),
            String::from_str(e, "Property"),
            String::from_str(e, "PROP"),
            metadata.clone(),
            Address::generate(e),
            BytesN::from_array(e, &[0u8; 32]),
            common::modules::TokenSettings::default(),
        ),
    );
    DaoTokenContractClient::new(e, &token)
}

fn refused<T, C>(result: Result<T, Result<soroban_sdk::Error, C>>) -> soroban_sdk::Error {
    match result {
        Err(Ok(error)) => error,
        _ => panic!("expected a contract error"),
    }
}

// ============================================================================
// INV-01: voting units equal non-custody balances
// ============================================================================

const WALLETS: usize = 4;
/// Holders: four wallets, then the Treasury, the Auction, and the
/// Marketplace (always non-voting), and a vault module that is registered as
/// non-voting or not as the sequence goes.
const TREASURY: usize = WALLETS;
const VAULT: usize = WALLETS + 3;
const HOLDERS: usize = WALLETS + 4;

#[derive(Clone, Debug)]
enum VoteStep {
    Mint {
        to: usize,
    },
    BatchMint {
        to: StdVec<(usize, u8)>,
    },
    /// A transfer of the `token % minted`th token from its owner. Into or
    /// out of a non-voting holder, it is a custody move.
    Transfer {
        token: u32,
        to: usize,
    },
    /// `delegatee`: a wallet, the vault, or (`WALLETS + 1`) an outsider who
    /// never holds a token.
    Delegate {
        account: usize,
        delegatee: usize,
    },
    /// Registering the vault as a non-voting module burns the voting units
    /// of what it holds.
    RegisterVault,
    UnregisterVault,
}

fn vote_step() -> impl Strategy<Value = VoteStep> {
    prop_oneof![
        3 => (0..HOLDERS).prop_map(|to| VoteStep::Mint { to }),
        2 => vec_of((0..HOLDERS, 1..=3u8), 1..=3).prop_map(|to| VoteStep::BatchMint { to }),
        7 => (any::<u32>(), 0..HOLDERS).prop_map(|(token, to)| VoteStep::Transfer { token, to }),
        3 => (0..WALLETS, 0..WALLETS + 2)
            .prop_map(|(account, delegatee)| VoteStep::Delegate { account, delegatee }),
        1 => Just(VoteStep::RegisterVault),
        1 => Just(VoteStep::UnregisterVault),
    ]
}

struct VoteWorld {
    e: Env,
    token: DaoTokenContractClient<'static>,
    minter: Address,
    holders: StdVec<Address>,
    outsider: Address,
    vault_registered: bool,
}

impl VoteWorld {
    fn new() -> Self {
        let e = quiet_env();
        let admin = Address::generate(&e);
        let treasury = Address::generate(&e);
        let metadata = e.register(PropertyArtwork, ());
        let token = new_token(&e, &admin, &treasury, &metadata);
        let minter = e.register(PropertyStub, ());
        token.register_module(&Symbol::new(&e, "custom_minter"), &minter, &false);
        let auction = e.register(PropertyStub, ());
        let marketplace = e.register(PropertyStub, ());
        token.register_module(&Symbol::new(&e, "auction"), &auction, &true);
        token.register_module(&Symbol::new(&e, "marketplace"), &marketplace, &true);
        token.launch(&treasury, &grant(&e, &minter));
        let mut holders: StdVec<Address> = (0..WALLETS).map(|_| Address::generate(&e)).collect();
        holders.extend([treasury, auction, marketplace, e.register(PropertyStub, ())]);
        let outsider = Address::generate(&e);
        Self {
            e,
            token,
            minter,
            holders,
            outsider,
            vault_registered: false,
        }
    }

    fn non_voting(&self, holder: usize) -> bool {
        (TREASURY..VAULT).contains(&holder) || (holder == VAULT && self.vault_registered)
    }

    fn voting_units(&self, account: &Address) -> u128 {
        self.e.as_contract(&self.token.address, || {
            stellar_governance::votes::get_voting_units(&self.e, account)
        })
    }

    /// Units, delegate, votes and balance of every holder and the outsider:
    /// what a refused step must leave unchanged.
    fn books(&self) -> StdVec<(u128, Option<Address>, u128, u32)> {
        self.holders
            .iter()
            .chain(core::iter::once(&self.outsider))
            .map(|a| {
                (
                    self.voting_units(a),
                    self.token.get_delegate(a),
                    self.token.get_votes(a),
                    self.token.balance(a),
                )
            })
            .collect()
    }

    fn assert_invariant(&self, step: &dyn core::fmt::Debug) {
        let mut units_sum = 0u128;
        let mut held = 0u32;
        for (i, holder) in self.holders.iter().enumerate() {
            let units = self.voting_units(holder);
            let balance = self.token.balance(holder);
            let expected = if self.non_voting(i) {
                0
            } else {
                u128::from(balance)
            };
            assert_eq!(units, expected, "units of holder {i} after {step:?}");
            units_sum += units;
            held += balance;
        }
        let supply = self.token.total_supply() as u128;
        assert_eq!(
            units_sum, supply,
            "units vs the voting supply after {step:?}"
        );
        let votes: u128 = self
            .holders
            .iter()
            .chain(core::iter::once(&self.outsider))
            .map(|a| self.token.get_votes(a))
            .sum();
        assert_eq!(votes, supply, "votes vs the voting supply after {step:?}");
        assert_eq!(
            held,
            self.token.minted(),
            "a token went missing after {step:?}"
        );
    }

    fn run(&mut self, step: &VoteStep) -> &'static str {
        let e = &self.e;
        match step {
            VoteStep::Mint { to } => {
                self.token.mint(&self.minter, &self.holders[*to]);
                if self.non_voting(*to) {
                    "mint into custody"
                } else {
                    "mint"
                }
            }
            VoteStep::BatchMint { to } => {
                let mut recipients = Vec::new(e);
                let mut amounts = Vec::new(e);
                for (holder, amount) in to {
                    recipients.push_back(self.holders[*holder].clone());
                    amounts.push_back(u128::from(*amount));
                }
                self.token.batch_mint(&self.minter, &recipients, &amounts);
                "batch mint"
            }
            VoteStep::Transfer { token, to } => {
                let minted = self.token.minted();
                if minted == 0 {
                    return "transfer of nothing";
                }
                let id = token % minted;
                let from = self.token.owner_of(&id);
                let to_address = &self.holders[*to];
                // Moving a token to its owner trips an unchecked subtraction in
                // the test host's invocation metering (see voting_invariant.rs).
                if from == *to_address {
                    return "self-transfer skipped";
                }
                let from_index = self.holders.iter().position(|h| *h == from).unwrap();
                self.token.transfer(&from, to_address, &id);
                match (self.non_voting(from_index), self.non_voting(*to)) {
                    (false, true) => "custody move in",
                    (true, false) => "custody move out",
                    (true, true) => "move between custodians",
                    (false, false) => "transfer",
                }
            }
            VoteStep::Delegate { account, delegatee } => {
                let account = &self.holders[*account];
                let delegatee = match *delegatee {
                    d if d < WALLETS => self.holders[d].clone(),
                    WALLETS => self.holders[VAULT].clone(),
                    _ => self.outsider.clone(),
                };
                let before = self.books();
                match self.token.try_delegate(account, &delegatee) {
                    Ok(_) => "delegate",
                    Err(_) => {
                        // OpenZeppelin refuses delegating to the current delegate.
                        assert_eq!(self.token.get_delegate(account), Some(delegatee));
                        assert_eq!(self.books(), before, "a refused delegation moved votes");
                        "same delegate refused"
                    }
                }
            }
            VoteStep::RegisterVault => {
                let kind = Symbol::new(e, "custom_vault");
                let vault = &self.holders[VAULT];
                if self.vault_registered {
                    let before = self.books();
                    let error = refused(self.token.try_register_module(&kind, vault, &true));
                    assert_eq!(
                        error,
                        TokenError::ModuleAlreadyRegistered.into(),
                        "register twice"
                    );
                    assert_eq!(self.books(), before, "a refused registration moved votes");
                    return "register refused";
                }
                let holding = self.token.balance(vault) > 0;
                self.token.register_module(&kind, vault, &true);
                self.vault_registered = true;
                if holding {
                    "register a holder (its units burn)"
                } else {
                    "register"
                }
            }
            VoteStep::UnregisterVault => {
                let vault = &self.holders[VAULT];
                if !self.vault_registered {
                    return "unregister skipped";
                }
                let holding = self.token.balance(vault) > 0;
                if holding {
                    let before = self.books();
                    let error = refused(self.token.try_unregister_module(vault));
                    assert_eq!(error, TokenError::ModuleHoldsTokens.into());
                    assert_eq!(self.books(), before, "a refused unregister moved votes");
                    // Custody moves out empty it; the recipient follows the id,
                    // so this draws nothing from the generator.
                    for id in 0..self.token.minted() {
                        if self.token.owner_of(&id) == *vault {
                            let to = &self.holders[id as usize % WALLETS];
                            self.token.transfer(vault, to, &id);
                        }
                    }
                }
                self.token.unregister_module(vault);
                self.vault_registered = false;
                if holding {
                    "unregister refused, then emptied"
                } else {
                    "unregister"
                }
            }
        }
    }
}

const VOTE_CASES: u32 = 48;

#[test]
fn voting_units_equal_non_custody_balances_over_generated_sequences() {
    let tally = Tally::default();
    let defaults = check(
        "voting units",
        VOTE_CASES,
        vec_of(vote_step(), 1..=40),
        |steps| {
            let mut world = VoteWorld::new();
            world.assert_invariant(&"launch");
            for step in &steps {
                count(&tally, world.run(step));
                world.assert_invariant(step);
            }
        },
    );
    assert_reached(
        &tally,
        defaults,
        &[
            ("mint", 50),
            ("mint into custody", 20),
            ("batch mint", 50),
            ("transfer", 50),
            ("custody move in", 50),
            ("custody move out", 30),
            ("move between custodians", 30),
            ("delegate", 50),
            ("same delegate refused", 10),
            ("register a holder (its units burn)", 5),
            ("register refused", 15),
            ("unregister", 3),
            ("unregister refused, then emptied", 8),
        ],
    );
}

// ============================================================================
// INV-05: mint-allowance accounting
// ============================================================================

#[derive(Clone, Debug)]
enum AllowanceStep {
    /// `n` tokens: one `mint`, or one `batch_mint` of `n`.
    ModuleMint {
        module: usize,
        n: u32,
    },
    AdminMint,
    Increase {
        module: usize,
        by: u32,
    },
    Decrease {
        module: usize,
        by: u32,
    },
    Release {
        module: usize,
        by: u32,
    },
    Unregister {
        module: usize,
    },
    Register {
        module: usize,
    },
}

/// Small amounts most of the time, and amounts near or at `u32::MAX` so
/// increases saturate to unlimited and decreases leave it.
fn allowance_amount() -> impl Strategy<Value = u32> {
    prop_oneof![
        6 => 0..=6u32,
        1 => Just(u32::MAX),
        1 => (u32::MAX - 8)..=u32::MAX,
        1 => any::<u32>(),
    ]
}

fn allowance_step() -> impl Strategy<Value = AllowanceStep> {
    prop_oneof![
        8 => (0..2usize, 1..=4u32).prop_map(|(module, n)| AllowanceStep::ModuleMint { module, n }),
        1 => Just(AllowanceStep::AdminMint),
        3 => (0..2usize, allowance_amount())
            .prop_map(|(module, by)| AllowanceStep::Increase { module, by }),
        2 => (0..2usize, allowance_amount())
            .prop_map(|(module, by)| AllowanceStep::Decrease { module, by }),
        2 => (0..2usize, allowance_amount())
            .prop_map(|(module, by)| AllowanceStep::Release { module, by }),
        1 => (0..2usize).prop_map(|module| AllowanceStep::Unregister { module }),
        1 => (0..2usize).prop_map(|module| AllowanceStep::Register { module }),
    ]
}

/// The documented rules for one module's allowance, kept by the test.
#[derive(Clone, Debug)]
struct Book {
    registered: bool,
    /// `u32::MAX` is unlimited.
    allowance: u32,
    /// Since the allowance last became finite (at launch, or after
    /// unlimited): the balance the module's recipient held then, and the net
    /// amount granted to the module since. What the module minted since is
    /// read from the chain: its recipient's balance now less `baseline`.
    baseline: u32,
    granted: i128,
}

impl Book {
    fn finite(&self) -> bool {
        self.allowance != u32::MAX
    }

    /// The allowance moves from `self.allowance` to `new` by an admin or
    /// module call (not a mint); `held` is the module's recipient's balance.
    fn set(&mut self, new: u32, held: u32) {
        if !self.finite() && new != u32::MAX {
            // Finite again: the accounting starts afresh from here.
            self.baseline = held;
            self.granted = i128::from(new);
        } else if self.finite() && new != u32::MAX {
            self.granted += i128::from(new) - i128::from(self.allowance);
        }
        self.allowance = new;
    }
}

struct AllowanceWorld {
    e: Env,
    token: DaoTokenContractClient<'static>,
    treasury: Address,
    /// Each module mints only to its own recipient, and the admin to a third.
    recipients: [Address; 2],
    admin_recipient: Address,
    modules: [Address; 2],
    books: [Book; 2],
    /// Every token minted, by modules and the admin.
    minted: u32,
}

const KINDS: [&str; 2] = ["custom_a", "custom_b"];

impl AllowanceWorld {
    fn new() -> Self {
        let e = quiet_env();
        let admin = Address::generate(&e);
        let treasury = Address::generate(&e);
        let metadata = e.register(PropertyArtwork, ());
        let token = new_token(&e, &admin, &treasury, &metadata);
        let modules = [e.register(PropertyStub, ()), e.register(PropertyStub, ())];
        for (kind, module) in KINDS.iter().zip(modules.iter()) {
            token.register_module(&Symbol::new(&e, kind), module, &false);
        }
        // The first module launches with an allowance of 3, the second with none.
        token.launch(
            &treasury,
            &vec![
                &e,
                MintGrant {
                    module: modules[0].clone(),
                    allowance: 3,
                },
            ],
        );
        let book = |allowance: u32| Book {
            registered: true,
            allowance,
            baseline: 0,
            granted: i128::from(allowance),
        };
        Self {
            recipients: [Address::generate(&e), Address::generate(&e)],
            admin_recipient: Address::generate(&e),
            e,
            token,
            treasury,
            modules,
            books: [book(3), book(0)],
            minted: 0,
        }
    }

    fn assert_invariant(&self, step: &dyn core::fmt::Debug) {
        for (i, (module, book)) in self.modules.iter().zip(self.books.iter()).enumerate() {
            let allowance = self.token.mint_allowance(module);
            assert_eq!(
                allowance, book.allowance,
                "module {i} after {step:?}: {book:?}"
            );
            if book.finite() {
                let minted = self.token.balance(&self.recipients[i]) - book.baseline;
                assert_eq!(
                    i128::from(minted) + i128::from(allowance),
                    book.granted,
                    "module {i}: minted plus remaining vs granted after {step:?}"
                );
            }
            if !book.registered {
                assert_eq!(allowance, 0, "an unregistered module kept an allowance");
            }
        }
        let held: u32 = self
            .recipients
            .iter()
            .chain(core::iter::once(&self.admin_recipient))
            .map(|r| self.token.balance(r))
            .sum();
        assert_eq!(self.token.minted(), self.minted, "after {step:?}");
        assert_eq!(held, self.minted, "after {step:?}");
    }

    fn run(&mut self, step: &AllowanceStep) -> &'static str {
        let e = &self.e;
        match *step {
            AllowanceStep::ModuleMint { module, n } => {
                let minter = &self.modules[module];
                let to = &self.recipients[module];
                let result = if n == 1 {
                    self.token.try_mint(minter, to).map(|r| r.map(|_| ()))
                } else {
                    self.token
                        .try_batch_mint(minter, &vec![e, to.clone()], &vec![e, u128::from(n)])
                        .map(|r| r.map(|_| ()))
                };
                let book = &mut self.books[module];
                let expected = if !book.registered {
                    Some(TokenError::MintAuthorityNotAllowed)
                } else if book.allowance < n {
                    Some(TokenError::AllowanceExceeded)
                } else {
                    None
                };
                match expected {
                    Some(error) => {
                        assert_eq!(refused(result), error.into(), "{step:?}");
                        if book.registered {
                            "mint past the allowance refused"
                        } else {
                            "mint by an unregistered module refused"
                        }
                    }
                    None => {
                        assert!(result.is_ok(), "{step:?}: {result:?}");
                        self.minted += n;
                        if book.finite() {
                            book.allowance -= n;
                            "module mint"
                        } else {
                            "unlimited mint"
                        }
                    }
                }
            }
            AllowanceStep::AdminMint => {
                self.token.mint(&self.treasury, &self.admin_recipient);
                self.minted += 1;
                "admin mint"
            }
            AllowanceStep::Increase { module, by } => {
                let result = self
                    .token
                    .try_increase_mint_allowance(&self.modules[module], &by);
                let held = self.token.balance(&self.recipients[module]);
                let book = &mut self.books[module];
                if !book.registered {
                    assert_eq!(refused(result), TokenError::NotAModule.into());
                    return "increase for an unregistered module refused";
                }
                assert!(result.is_ok());
                let new = book.allowance.saturating_add(by);
                book.set(new, held);
                if new == u32::MAX {
                    "increase to unlimited"
                } else {
                    "increase"
                }
            }
            AllowanceStep::Decrease { module, by } => {
                self.token
                    .decrease_mint_allowance(&self.modules[module], &by);
                let held = self.token.balance(&self.recipients[module]);
                let book = &mut self.books[module];
                let was_unlimited = !book.finite();
                book.set(book.allowance.saturating_sub(by), held);
                if was_unlimited && book.finite() {
                    "decrease from unlimited"
                } else {
                    "decrease"
                }
            }
            AllowanceStep::Release { module, by } => {
                self.token
                    .release_mint_allowance(&self.modules[module], &by);
                let held = self.token.balance(&self.recipients[module]);
                let book = &mut self.books[module];
                if !book.finite() {
                    return "release of unlimited ignored";
                }
                book.set(book.allowance.saturating_sub(by), held);
                "release"
            }
            AllowanceStep::Unregister { module } => {
                let held = self.token.balance(&self.recipients[module]);
                let book = &mut self.books[module];
                if !book.registered {
                    return "unregister skipped";
                }
                self.token.unregister_module(&self.modules[module]);
                book.registered = false;
                book.set(0, held);
                "unregister"
            }
            AllowanceStep::Register { module } => {
                let book = &mut self.books[module];
                if book.registered {
                    return "register skipped";
                }
                self.token.register_module(
                    &Symbol::new(e, KINDS[module]),
                    &self.modules[module],
                    &false,
                );
                book.registered = true;
                "register"
            }
        }
    }
}

const ALLOWANCE_CASES: u32 = 64;

#[test]
fn minted_plus_remaining_equals_granted_over_generated_sequences() {
    let tally = Tally::default();
    let defaults = check(
        "mint allowance",
        ALLOWANCE_CASES,
        vec_of(allowance_step(), 1..=40),
        |steps| {
            let mut world = AllowanceWorld::new();
            world.assert_invariant(&"launch");
            for step in &steps {
                count(&tally, world.run(step));
                world.assert_invariant(step);
            }
        },
    );
    assert_reached(
        &tally,
        defaults,
        &[
            ("module mint", 100),
            ("mint past the allowance refused", 50),
            ("mint by an unregistered module refused", 10),
            ("unlimited mint", 10),
            ("admin mint", 20),
            ("increase", 50),
            ("increase to unlimited", 10),
            ("increase for an unregistered module refused", 5),
            ("decrease", 50),
            ("decrease from unlimited", 5),
            ("release", 50),
            ("release of unlimited ignored", 2),
            ("unregister", 20),
            ("register", 10),
        ],
    );
}

// ============================================================================
// INV-22: ClaimMinter escrow
// ============================================================================

const CLAIMERS: usize = 4;
const PRICE: i128 = 10_000;
const DEADLINE: u64 = 10 * 86_400;
const EXPIRY: u64 = 30 * 86_400;

#[derive(Clone, Debug)]
enum EscrowStep {
    Claim {
        who: usize,
        n: u32,
    },
    /// A payment sent to the ClaimMinter outside `claim`.
    Donate {
        amount: i128,
    },
    Wait {
        hours: u64,
    },
    /// The Manager's launch: only once the drive is Met, as `launch_when_ready`.
    Launch,
    Release,
    Refund {
        who: usize,
    },
}

fn escrow_step() -> impl Strategy<Value = EscrowStep> {
    prop_oneof![
        6 => (0..CLAIMERS, 1..=2u32).prop_map(|(who, n)| EscrowStep::Claim { who, n }),
        1 => (1..=50i128).prop_map(|amount| EscrowStep::Donate { amount }),
        // Mostly up to two days; sometimes five to eleven, past the deadline.
        3 => (0..=48u64).prop_map(|hours| EscrowStep::Wait { hours }),
        1 => (120..=264u64).prop_map(|hours| EscrowStep::Wait { hours }),
        2 => Just(EscrowStep::Launch),
        2 => Just(EscrowStep::Release),
        3 => (0..CLAIMERS).prop_map(|who| EscrowStep::Refund { who }),
    ]
}

/// A drive: each claimer's leaf amount and the claimers needed.
#[derive(Clone, Debug)]
struct Drive {
    leaves: [u32; CLAIMERS],
    threshold: u32,
}

fn drive() -> impl Strategy<Value = Drive> {
    (
        [1..=3u32, 1..=3u32, 1..=3u32, 1..=3u32],
        1..=CLAIMERS as u32,
    )
        .prop_map(|(leaves, threshold)| Drive { leaves, threshold })
}

struct EscrowWorld {
    e: Env,
    token: DaoTokenContractClient<'static>,
    cm: ClaimMinterClient<'static>,
    pay: TokenClient<'static>,
    treasury: Address,
    donor: Address,
    list: u32,
    start: u64,
    total: u32,
    threshold: u32,
    claimers: StdVec<(Address, u128, Vec<BytesN<32>>)>,
    // The test's own books.
    claimed: [u32; CLAIMERS],
    escrowed: [i128; CLAIMERS],
    donated: i128,
    to_treasury: i128,
    released: bool,
    live: bool,
    supply: i128,
}

impl EscrowWorld {
    fn new(drive: &Drive) -> Self {
        let e = quiet_env();
        let launch_admin = Address::generate(&e);
        let treasury = Address::generate(&e);
        let manager = Address::generate(&e);
        let metadata = e.register(PropertyArtwork, ());
        let token = new_token(&e, &launch_admin, &treasury, &metadata);
        let sac = e.register_stellar_asset_contract_v2(Address::generate(&e));
        let asset = sac.address();
        let cm_id = e.register(
            ClaimMinter,
            (
                launch_admin.clone(),
                token.address.clone(),
                treasury.clone(),
                manager,
                asset.clone(),
                BytesN::from_array(&e, &[0u8; 32]),
            ),
        );
        let cm = ClaimMinterClient::new(&e, &cm_id);
        token.register_module(&Symbol::new(&e, "claims"), &cm_id, &false);

        let leaves: StdVec<(Address, u128)> = drive
            .leaves
            .iter()
            .map(|amount| (Address::generate(&e), u128::from(*amount)))
            .collect();
        let (root, proofs) = super::merkle_tree(&e, &leaves);
        // One short of every leaf, so the list's total can run out too.
        let total = drive.leaves.iter().sum::<u32>() - 1;
        let threshold = drive.threshold.min(total);
        token.increase_mint_allowance(&cm_id, &total);
        let start = e.ledger().timestamp();
        let list = cm.open_list(
            &root,
            &String::from_str(&e, "ipfs://bafyproperty"),
            &asset,
            &PRICE,
            &(start + EXPIRY),
            &total,
            &Some(AssuranceTerms {
                threshold_claimers: threshold,
                deadline: start + DEADLINE,
            }),
        );
        let mint = StellarAssetClient::new(&e, &asset);
        let mut supply = 0;
        for (who, amount) in &leaves {
            let funds = PRICE * *amount as i128;
            mint.mint(who, &funds);
            supply += funds;
        }
        let donor = Address::generate(&e);
        mint.mint(&donor, &1_000_000);
        supply += 1_000_000;
        let claimers = leaves
            .into_iter()
            .zip(proofs)
            .map(|((who, amount), proof)| (who, amount, proof))
            .collect();
        Self {
            pay: TokenClient::new(&e, &asset),
            e,
            token,
            cm,
            treasury,
            donor,
            list,
            start,
            total,
            threshold,
            claimers,
            claimed: [0; CLAIMERS],
            escrowed: [0; CLAIMERS],
            donated: 0,
            to_treasury: 0,
            released: false,
            live: false,
            supply,
        }
    }

    fn now(&self) -> u64 {
        self.e.ledger().timestamp()
    }

    fn failed(&self) -> bool {
        self.now() > self.start + DEADLINE && !self.live
    }

    fn state(&self) -> AssuranceState {
        let claimers = self.claimed.iter().filter(|c| **c > 0).count() as u32;
        if self.failed() {
            AssuranceState::Failed
        } else if claimers >= self.threshold {
            AssuranceState::Met
        } else {
            AssuranceState::Open
        }
    }

    fn assert_invariant(&self, step: &dyn core::fmt::Debug) {
        let list = self.cm.get_list(&self.list).unwrap();
        let mut records = 0;
        for (i, (who, _, _)) in self.claimers.iter().enumerate() {
            let record = self.cm.get_claim(&self.list, who);
            assert_eq!(
                record.claimed, self.claimed[i],
                "claimer {i} after {step:?}"
            );
            assert_eq!(
                record.escrowed, self.escrowed[i],
                "claimer {i} after {step:?}"
            );
            records += record.escrowed;
        }
        let held = self.pay.balance(&self.cm.address);
        if self.released {
            // `release` zeroes the escrow and leaves the records.
            assert_eq!(list.escrow, 0, "escrow after release, after {step:?}");
        } else {
            assert_eq!(list.escrow, records, "escrow vs the records after {step:?}");
        }
        assert_eq!(
            held,
            list.escrow + self.donated,
            "balance vs escrow after {step:?}"
        );
        assert_eq!(
            self.pay.balance(&self.treasury),
            self.to_treasury,
            "after {step:?}"
        );
        assert_eq!(
            self.cm.assurance_state(&self.list),
            self.state(),
            "after {step:?}"
        );
        // No payment is created or lost.
        let outside: i128 = self
            .claimers
            .iter()
            .map(|(who, _, _)| self.pay.balance(who))
            .sum::<i128>()
            + self.pay.balance(&self.donor);
        assert_eq!(
            outside + held + self.to_treasury,
            self.supply,
            "after {step:?}"
        );
    }

    fn run(&mut self, step: &EscrowStep) -> &'static str {
        match *step {
            EscrowStep::Claim { who, n } => {
                let (address, leaf, proof) = &self.claimers[who];
                let result = self
                    .cm
                    .try_claim(&self.list, address, leaf, &n, proof, &PRICE);
                let minted: u32 = self.claimed.iter().sum();
                let expected = if self.now() >= self.start + EXPIRY {
                    Some(ClaimMinterError::ListExpired)
                } else if self.failed() {
                    Some(ClaimMinterError::AssuranceFailed)
                } else if u128::from(self.claimed[who] + n) > *leaf {
                    Some(ClaimMinterError::AlreadyClaimed)
                } else if minted + n > self.total {
                    Some(ClaimMinterError::ListSoldOut)
                } else {
                    None
                };
                match expected {
                    Some(error) => {
                        assert_eq!(result.err().unwrap(), Ok(error), "{step:?}");
                        match error {
                            ClaimMinterError::AssuranceFailed => "claim after the drive failed",
                            ClaimMinterError::ListSoldOut => "claim past the total refused",
                            _ => "claim refused",
                        }
                    }
                    None => {
                        assert!(result.is_ok(), "{step:?}: {result:?}");
                        self.claimed[who] += n;
                        let cost = PRICE * i128::from(n);
                        if self.live {
                            self.to_treasury += cost;
                            "claim after launch"
                        } else {
                            self.escrowed[who] += cost;
                            "claim into escrow"
                        }
                    }
                }
            }
            EscrowStep::Donate { amount } => {
                self.pay.transfer(&self.donor, &self.cm.address, &amount);
                self.donated += amount;
                "direct payment"
            }
            EscrowStep::Wait { hours } => {
                self.e.ledger().with_mut(|l| {
                    l.timestamp += hours * 3_600;
                    l.sequence_number += 1;
                });
                "wait"
            }
            EscrowStep::Launch => {
                if self.live {
                    return "launch skipped";
                }
                if self.state() != AssuranceState::Met {
                    return "not ready to launch";
                }
                let escrow = self.cm.get_list(&self.list).unwrap().escrow;
                // What the Manager's launch does for these two contracts.
                self.token.launch(&self.treasury, &Vec::new(&self.e));
                self.cm.launch(&self.treasury, &false);
                self.live = true;
                self.released = true;
                self.to_treasury += escrow;
                "launch (releases the escrow)"
            }
            EscrowStep::Release => {
                let result = self.cm.try_release(&self.list);
                if !self.live {
                    assert_eq!(result.err().unwrap(), Ok(ClaimMinterError::TokenNotLive));
                    return "release before launch refused";
                }
                assert_eq!(result.unwrap().unwrap(), 0, "a second release moved escrow");
                "release after launch"
            }
            EscrowStep::Refund { who } => {
                let result = self.cm.try_refund(&self.list, &self.claimers[who].0);
                if !self.failed() {
                    assert_eq!(result.err().unwrap(), Ok(ClaimMinterError::NotFailed));
                    return "refund refused (not failed)";
                }
                if self.escrowed[who] == 0 {
                    assert_eq!(result.err().unwrap(), Ok(ClaimMinterError::NothingToRefund));
                    return "refund refused (nothing to refund)";
                }
                assert_eq!(result.unwrap().unwrap(), self.escrowed[who]);
                self.escrowed[who] = 0;
                "refund"
            }
        }
    }
}

const ESCROW_CASES: u32 = 64;

#[test]
fn claim_minter_escrow_equals_its_records_and_its_balance_over_generated_sequences() {
    let tally = Tally::default();
    let defaults = check(
        "claim minter escrow",
        ESCROW_CASES,
        (drive(), vec_of(escrow_step(), 1..=40)),
        |(drive, steps)| {
            let mut world = EscrowWorld::new(&drive);
            world.assert_invariant(&"the list opening");
            for step in &steps {
                count(&tally, world.run(step));
                world.assert_invariant(step);
            }
        },
    );
    assert_reached(
        &tally,
        defaults,
        &[
            ("claim into escrow", 100),
            ("claim refused", 50),
            ("claim past the total refused", 2),
            ("claim after the drive failed", 20),
            ("claim after launch", 10),
            ("direct payment", 20),
            ("launch (releases the escrow)", 10),
            ("not ready to launch", 40),
            ("release before launch refused", 20),
            ("release after launch", 10),
            ("refund", 10),
            ("refund refused (not failed)", 20),
            ("refund refused (nothing to refund)", 10),
        ],
    );
}
