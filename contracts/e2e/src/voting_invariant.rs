//! The voting-units invariant (docs/designs/membership-models.md, Success
//! Criteria, "Vote counts stay exact"): after every operation,
//!
//! 1. every address holds voting units equal to its token balance, or zero if
//!    it is a non-voting holder (today: Treasury, Auction, Marketplace);
//! 2. the `TotalSupply` checkpoint equals the sum of all voting units;
//! 3. the account checkpoints (`get_votes`) add up to the `TotalSupply`
//!    checkpoint, so no unit is counted toward quorum without a delegate that
//!    can cast it.
//!
//! Listings, auctions, settlements and pool restocks move a token into or out
//! of a non-voting holder with `transfer` or `batch_mint`, the only paths the
//! Token sees, so random transfers and mints between wallets and the three
//! system holders cover them. A vault module that holds tokens is registered
//! (non-voting) and unregistered at random, and members delegate to it too
//! (modules can be delegates, review 2 C3). The membership switches
//! (docs/designs/locked-tokens.md) flip at random: locked transfers, members-only
//! delegation and recovery, with `dao_transfer` and `agent_transfer` in the mix;
//! a movement or delegation the switches refuse must move nothing. The
//! sequence is a fixed-seed LCG so a failure replays exactly.

extern crate std;

use metadata::{IpfsGroup, ItemParam, MetadataContract};
use soroban_sdk::{
    contract, contractimpl,
    testutils::{Address as _, Ledger},
    vec, Address, BytesN, Env, String, Vec,
};
use std::vec::Vec as StdVec;
use token::{DaoTokenContract, DaoTokenContractClient};

/// A deployed stand-in for a module that mints (only Wasm contracts can hold
/// mint allowances).
#[contract]
pub struct MinterStub;

#[contractimpl]
impl MinterStub {
    pub fn ping() {}
}

/// Minimal deterministic generator (Numerical Recipes LCG).
struct Lcg(u64);

impl Lcg {
    fn next(&mut self) -> u64 {
        self.0 = self
            .0
            .wrapping_mul(6_364_136_223_846_793_005)
            .wrapping_add(1_442_695_040_888_963_407);
        self.0 >> 33
    }

    fn below(&mut self, n: usize) -> usize {
        (self.next() % n as u64) as usize
    }
}

struct World {
    e: Env,
    token: DaoTokenContractClient<'static>,
    minter: Address,
    wallets: StdVec<Address>,
    system: StdVec<Address>,
    /// A deployed contract that holds tokens and is registered as a
    /// non-voting module, or not, as the sequence goes.
    vault: Address,
    vault_registered: bool,
    /// Never holds a token: a delegate members-only delegation refuses.
    outsider: Address,
}

impl World {
    fn new() -> Self {
        let e = Env::default();
        e.mock_all_auths();
        e.ledger().set_sequence_number(100);
        e.ledger().set_timestamp(1_000);
        let admin = Address::generate(&e);
        let treasury = Address::generate(&e);
        let metadata_id = Address::generate(&e);
        let token_id = e.register(
            DaoTokenContract,
            (
                admin.clone(),
                treasury.clone(),
                String::from_str(&e, "Invariant"),
                String::from_str(&e, "INV"),
                metadata_id.clone(),
                Address::generate(&e),
                BytesN::from_array(&e, &[0u8; 32]),
                common::modules::TokenSettings::default(),
            ),
        );
        e.register_at(
            &metadata_id,
            MetadataContract,
            (
                token_id.clone(),
                String::from_str(&e, r#"{"v":1,"description":"invariant"}"#),
                String::from_str(&e, "https://example.com/render/"),
                Address::generate(&e),
                BytesN::from_array(&e, &[0u8; 32]),
                admin.clone(),
                Address::generate(&e),
                Vec::<String>::new(&e),
                Vec::<ItemParam>::new(&e),
                IpfsGroup {
                    base_uri: String::from_str(&e, "ipfs://"),
                    extension: String::from_str(&e, ".png"),
                },
            ),
        );
        let token = DaoTokenContractClient::new(&e, &token_id);
        // A stub module with an unlimited allowance stands in for the
        // Treasury's proposals (a wallet can't hold mint rights).
        let minter = e.register(MinterStub, ());
        token.register_module(
            &soroban_sdk::Symbol::new(&e, "custom_minter"),
            &minter,
            &false,
        );
        // The Auction and Marketplace hold tokens in custody (non-voting).
        let auction = e.register(MinterStub, ());
        let marketplace = e.register(MinterStub, ());
        for (kind, module) in [("auction", &auction), ("marketplace", &marketplace)] {
            token.register_module(&soroban_sdk::Symbol::new(&e, kind), module, &true);
        }
        token.launch(
            &treasury,
            &vec![
                &e,
                common::modules::MintGrant {
                    module: minter.clone(),
                    allowance: u32::MAX,
                },
            ],
        );
        // The stub minter is also the DAO's transfer agent (as the Circle is).
        token.set_transfer_agent(&minter, &true);
        let wallets = (0..5).map(|_| Address::generate(&e)).collect();
        let vault = e.register(MinterStub, ());
        let outsider = Address::generate(&e);
        Self {
            e,
            token,
            minter,
            wallets,
            system: std::vec![treasury, auction, marketplace],
            vault,
            vault_registered: false,
            outsider,
        }
    }

    fn holders(&self) -> impl Iterator<Item = &Address> {
        self.wallets
            .iter()
            .chain(self.system.iter())
            .chain(core::iter::once(&self.vault))
    }

    /// Tokens held here carry no votes.
    fn non_voting(&self, holder: &Address) -> bool {
        self.system.contains(holder) || (self.vault_registered && *holder == self.vault)
    }

    fn any_holder(&self, rng: &mut Lcg) -> Address {
        let all: StdVec<&Address> = self.holders().collect();
        all[rng.below(all.len())].clone()
    }

    fn voting_units(&self, account: &Address) -> u128 {
        self.e.as_contract(&self.token.address, || {
            stellar_governance::votes::get_voting_units(&self.e, account)
        })
    }

    fn assert_invariant(&self, step: usize, op: &str) {
        let mut units_sum: u128 = 0;
        for holder in self.holders() {
            let units = self.voting_units(holder);
            let expected = if self.non_voting(holder) {
                0
            } else {
                u128::from(self.token.balance(holder))
            };
            assert_eq!(
                units, expected,
                "clause 1 broken after step {step} ({op}): units of {holder:?}"
            );
            units_sum += units;
        }
        let total = self.token.total_supply() as u128;
        assert_eq!(
            units_sum, total,
            "clause 2 broken after step {step} ({op}): units vs TotalSupply"
        );
        // Delegates are wallets, the vault or the outsider (system holders
        // never delegate), so these account checkpoints cover every delegate.
        let votes_sum: u128 = self
            .holders()
            .chain(core::iter::once(&self.outsider))
            .map(|a| self.token.get_votes(a))
            .sum();
        assert_eq!(
            votes_sum, total,
            "clause 3 broken after step {step} ({op}): account checkpoints vs TotalSupply"
        );
    }

    fn step(&mut self, rng: &mut Lcg) -> &'static str {
        let minted = self.token.minted();
        match rng.below(11) {
            0 => {
                let to = self.any_holder(rng);
                self.token.mint(&self.minter, &to);
                "mint"
            }
            1 => {
                let n = 1 + rng.below(3);
                let mut recipients = Vec::new(&self.e);
                let mut amounts = Vec::new(&self.e);
                for _ in 0..n {
                    recipients.push_back(self.any_holder(rng));
                    amounts.push_back(1 + rng.below(3) as u128);
                }
                self.token.batch_mint(&self.minter, &recipients, &amounts);
                "batch_mint"
            }
            // Transfers between any holders: wallet resales, listing into the
            // Marketplace, auction settlement out of the Auction, Treasury spends.
            // Self-transfers are skipped: OpenZeppelin deletes a `VotingUnits`
            // entry that reaches zero and re-creates it in the same call, which
            // trips an unchecked subtraction in soroban-env-host 27's test-only
            // invocation metering (`invocation_metering.rs:1013`), not the Token.
            2 | 3 if minted > 0 => {
                let id = rng.below(minted as usize) as u32;
                let from = self.token.owner_of(&id);
                let to = self.any_holder(rng);
                if to == from {
                    return "skip self-transfer";
                }
                // On a locked token only DAO-controlled paths pass; a refused
                // movement moves nothing.
                match self.token.try_transfer(&from, &to, &id) {
                    Ok(_) => "transfer",
                    Err(err) => {
                        assert_eq!(err.unwrap(), soroban_sdk::Error::from_contract_error(7216));
                        assert!(self.token.transfers_locked());
                        assert_eq!(self.token.owner_of(&id), from);
                        "transfer refused"
                    }
                }
            }
            4 => {
                let account = self.wallets[rng.below(self.wallets.len())].clone();
                // Half the delegations go to a wallet, a quarter to the vault
                // and a quarter to an outsider who never holds a token.
                let delegatee = match rng.below(4) {
                    0 | 1 => self.wallets[rng.below(self.wallets.len())].clone(),
                    2 => self.vault.clone(),
                    _ => self.outsider.clone(),
                };
                // Re-delegating to the current delegate reverts (OZ SameDelegate, 4103).
                if self.token.get_delegate(&account) == Some(delegatee.clone()) {
                    return "skip same delegate";
                }
                let before = (
                    self.token.get_delegate(&account),
                    self.token.get_votes(&delegatee),
                    self.token.get_votes(&account),
                );
                match self.token.try_delegate(&account, &delegatee) {
                    Ok(_) => "delegate",
                    // A delegation the members-only rule refuses moves no votes.
                    Err(err) => {
                        assert_eq!(err.unwrap(), soroban_sdk::Error::from_contract_error(7221));
                        assert!(self.token.members_only_delegation());
                        let after = (
                            self.token.get_delegate(&account),
                            self.token.get_votes(&delegatee),
                            self.token.get_votes(&account),
                        );
                        assert_eq!(before, after, "a refused delegation moved votes");
                        "delegation refused"
                    }
                }
            }
            // Register the vault (moving the votes of what it holds out of the
            // supply) or unregister it (self-delegating it, moving them back).
            5 => {
                let kind = soroban_sdk::Symbol::new(&self.e, "custom_vault");
                let holding = self.token.balance(&self.vault) > 0;
                if self.vault_registered {
                    self.token.unregister_module(&self.vault);
                    self.vault_registered = false;
                    if holding {
                        "unregister holding"
                    } else {
                        "unregister"
                    }
                } else {
                    self.token.register_module(&kind, &self.vault, &true);
                    self.vault_registered = true;
                    if holding {
                        "register holding"
                    } else {
                        "register"
                    }
                }
            }
            // The three switches, by proposal (the Treasury's auth is mocked).
            6 => {
                let locked = !self.token.transfers_locked();
                self.token.set_transfers_locked(&locked);
                if locked {
                    "lock"
                } else {
                    "unlock"
                }
            }
            7 => {
                let on = !self.token.members_only_delegation();
                self.token.set_members_only_delegation(&on);
                "members-only toggle"
            }
            8 => {
                let on = !self.token.dao_recovery();
                self.token.set_dao_recovery(&on);
                "recovery toggle"
            }
            // The DAO moves a membership from its current owner, to a member
            // or back to the Treasury (owners in custody are refused).
            9 if minted > 0 => {
                let id = rng.below(minted as usize) as u32;
                let from = self.token.owner_of(&id);
                let pick = rng.below(self.wallets.len() + 1);
                let to = if pick == self.wallets.len() {
                    self.system[0].clone()
                } else {
                    self.wallets[pick].clone()
                };
                if to == from {
                    return "skip self-transfer";
                }
                match self.token.try_dao_transfer(&id, &to) {
                    Ok(_) => "dao_transfer",
                    Err(err) => {
                        let code = err.unwrap();
                        let off = soroban_sdk::Error::from_contract_error(7218);
                        let custody = soroban_sdk::Error::from_contract_error(7220);
                        assert!(code == off || code == custody, "{code:?}");
                        assert_eq!(self.token.owner_of(&id), from);
                        "dao_transfer refused"
                    }
                }
            }
            // The transfer agent moves a membership, locked or not.
            10 if minted > 0 => {
                let id = rng.below(minted as usize) as u32;
                let from = self.token.owner_of(&id);
                let to = self.any_holder(rng);
                if to == from {
                    return "skip self-transfer";
                }
                self.token.agent_transfer(&self.minter, &from, &to, &id);
                "agent_transfer"
            }
            _ => {
                let to = self.wallets[rng.below(self.wallets.len())].clone();
                self.token.mint(&self.minter, &to);
                "mint"
            }
        }
    }
}

#[test]
fn voting_units_match_balances_and_checkpoints_add_up() {
    let mut ran: std::collections::BTreeMap<&'static str, u32> = Default::default();
    let mut held_by_vault = 0u32;
    for seed in [1_u64, 7, 42, 2026] {
        let mut world = World::new();
        let mut rng = Lcg(seed);
        world.assert_invariant(0, "launch");
        for step in 1..=150 {
            let op = world.step(&mut rng);
            *ran.entry(op).or_default() += 1;
            world.assert_invariant(step, op);
        }
        // The run must exercise non-voting custody, or clause 1's zero branch
        // proves nothing.
        let held_by_system: u32 = world.system.iter().map(|a| world.token.balance(a)).sum();
        assert!(
            held_by_system > 0,
            "seed {seed}: no tokens reached a system holder"
        );
        held_by_vault += world.token.balance(&world.vault);
    }
    // Registration must move the votes of tokens the vault really holds.
    assert!(held_by_vault > 0, "the vault never held tokens");
    // Each switch flips both ways, and every new path and refusal runs.
    for (op, at_least) in [
        ("lock", 20),
        ("unlock", 20),
        ("members-only toggle", 20),
        ("recovery toggle", 20),
        ("transfer refused", 20),
        ("delegation refused", 10),
        ("dao_transfer", 10),
        ("dao_transfer refused", 10),
        ("agent_transfer", 20),
    ] {
        assert!(
            ran.get(op).copied().unwrap_or(0) >= at_least,
            "operation {op} ran too rarely: {ran:?}"
        );
    }
    for op in [
        "mint",
        "batch_mint",
        "transfer",
        "delegate",
        "register holding",
        "unregister holding",
    ] {
        assert!(
            ran.get(op).copied().unwrap_or(0) >= 20,
            "operation {op} ran too rarely to cover the invariant: {ran:?}"
        );
    }
}
