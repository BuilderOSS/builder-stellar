use soroban_sdk::{
    contract, contracterror, contractevent, contractimpl, contracttype, panic_with_error, Address,
    Env, Vec,
};

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum MockAdapterError {
    /// A checkpoint read at the current or a future ledger (as OZ `Votes`).
    FutureLookup = 1,
}

#[contracttype]
#[derive(Clone)]
enum Key {
    Admin,
    Decimals,
    /// Instance: the total's checkpoints.
    Total,
    /// Persistent: one account's checkpoints.
    Account(Address),
}

/// One checkpoint: the value from `ledger` on.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Checkpoint {
    pub ledger: u32,
    pub votes: u128,
}

/// Emitted by `set_votes`.
#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct MockVotesSet {
    #[topic]
    pub account: Address,
    pub votes: u128,
    pub total: u128,
}

const TTL_THRESHOLD: u32 = 17_280 * 30;
const TTL_EXTEND_TO: u32 = 17_280 * 120;

#[contract]
pub struct VoteAdapterMock;

#[contractimpl]
impl VoteAdapterMock {
    pub fn __constructor(e: &Env, admin: Address, decimals: u32) {
        e.storage().instance().set(&Key::Admin, &admin);
        e.storage().instance().set(&Key::Decimals, &decimals);
    }

    pub fn admin(e: &Env) -> Address {
        e.storage().instance().get(&Key::Admin).unwrap()
    }

    /// Admin only: `account` holds `votes` from this ledger on.
    pub fn set_votes(e: &Env, account: Address, votes: u128) {
        Self::admin(e).require_auth();
        let previous = Self::get_votes(e, account.clone());
        let total = Self::get_total_supply(e) - previous + votes;

        let key = Key::Account(account.clone());
        let mut points: Vec<Checkpoint> = e
            .storage()
            .persistent()
            .get(&key)
            .unwrap_or_else(|| Vec::new(e));
        Self::push(e, &mut points, votes);
        e.storage().persistent().set(&key, &points);
        e.storage()
            .persistent()
            .extend_ttl(&key, TTL_THRESHOLD, TTL_EXTEND_TO);

        let mut totals = Self::totals(e);
        Self::push(e, &mut totals, total);
        e.storage().instance().set(&Key::Total, &totals);
        e.storage()
            .instance()
            .extend_ttl(TTL_THRESHOLD, TTL_EXTEND_TO);

        MockVotesSet {
            account,
            votes,
            total,
        }
        .publish(e);
    }

    /// Current votes of `account`.
    pub fn get_votes(e: &Env, account: Address) -> u128 {
        Self::account_points(e, &account)
            .last()
            .map(|c| c.votes)
            .unwrap_or(0)
    }

    pub fn get_votes_at_checkpoint(e: &Env, account: Address, ledger: u32) -> u128 {
        Self::require_past(e, ledger);
        Self::lookup(&Self::account_points(e, &account), ledger)
    }

    pub fn get_total_supply(e: &Env) -> u128 {
        Self::totals(e).last().map(|c| c.votes).unwrap_or(0)
    }

    pub fn get_total_supply_at_checkpoint(e: &Env, ledger: u32) -> u128 {
        Self::require_past(e, ledger);
        Self::lookup(&Self::totals(e), ledger)
    }

    /// The total at the previous ledger: equals
    /// `get_total_supply_at_checkpoint(current - 1)`.
    pub fn voting_supply_at_previous_ledger(e: &Env) -> u128 {
        match e.ledger().sequence().checked_sub(1) {
            Some(previous) => Self::lookup(&Self::totals(e), previous),
            None => 0,
        }
    }

    pub fn decimals(e: &Env) -> u32 {
        e.storage().instance().get(&Key::Decimals).unwrap_or(0)
    }

    fn require_past(e: &Env, ledger: u32) {
        if ledger >= e.ledger().sequence() {
            panic_with_error!(e, MockAdapterError::FutureLookup);
        }
    }

    fn totals(e: &Env) -> Vec<Checkpoint> {
        e.storage()
            .instance()
            .get(&Key::Total)
            .unwrap_or_else(|| Vec::new(e))
    }

    fn account_points(e: &Env, account: &Address) -> Vec<Checkpoint> {
        e.storage()
            .persistent()
            .get(&Key::Account(account.clone()))
            .unwrap_or_else(|| Vec::new(e))
    }

    fn push(e: &Env, points: &mut Vec<Checkpoint>, votes: u128) {
        let ledger = e.ledger().sequence();
        if let Some(last) = points.last() {
            if last.ledger == ledger {
                points.set(points.len() - 1, Checkpoint { ledger, votes });
                return;
            }
        }
        points.push_back(Checkpoint { ledger, votes });
    }

    /// The value of the last checkpoint at or before `ledger` (binary search).
    fn lookup(points: &Vec<Checkpoint>, ledger: u32) -> u128 {
        let (mut low, mut high) = (0u32, points.len());
        while low < high {
            let mid = (low + high) / 2;
            if points.get_unchecked(mid).ledger <= ledger {
                low = mid + 1;
            } else {
                high = mid;
            }
        }
        if low == 0 {
            0
        } else {
            points.get_unchecked(low - 1).votes
        }
    }
}
