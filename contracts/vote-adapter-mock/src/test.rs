extern crate std;

use soroban_sdk::{testutils::Address as _, testutils::Ledger as _, Address, Env};

use crate::{MockAdapterError, VoteAdapterMock, VoteAdapterMockClient};

fn setup() -> (Env, VoteAdapterMockClient<'static>, Address) {
    let e = Env::default();
    e.mock_all_auths();
    e.ledger().set_sequence_number(100);
    let admin = Address::generate(&e);
    let id = e.register(VoteAdapterMock, (&admin, 9u32));
    (e.clone(), VoteAdapterMockClient::new(&e, &id), admin)
}

fn advance(e: &Env) {
    e.ledger().set_sequence_number(e.ledger().sequence() + 1);
}

#[test]
fn reads_follow_checkpoints() {
    let (e, mock, _) = setup();
    let alice = Address::generate(&e);
    let bob = Address::generate(&e);
    assert_eq!(mock.decimals(), 9);
    assert_eq!(mock.get_total_supply(), 0);

    mock.set_votes(&alice, &5); // ledger 100
    advance(&e);
    mock.set_votes(&bob, &3); // ledger 101
    mock.set_votes(&alice, &7); // ledger 101: overwrites, same ledger
    advance(&e); // 102

    assert_eq!(mock.get_votes(&alice), 7);
    assert_eq!(mock.get_votes_at_checkpoint(&alice, &99), 0);
    assert_eq!(mock.get_votes_at_checkpoint(&alice, &100), 5);
    assert_eq!(mock.get_votes_at_checkpoint(&alice, &101), 7);
    assert_eq!(mock.get_votes_at_checkpoint(&bob, &100), 0);
    assert_eq!(mock.get_total_supply_at_checkpoint(&100), 5);
    assert_eq!(mock.get_total_supply_at_checkpoint(&101), 10);
    assert_eq!(mock.get_total_supply(), 10);
}

#[test]
fn previous_ledger_supply_matches_checkpoint_supply() {
    let (e, mock, _) = setup();
    let alice = Address::generate(&e);
    let bob = Address::generate(&e);
    mock.set_votes(&alice, &4);
    advance(&e);
    // A write in this ledger must not move the previous-ledger supply.
    mock.set_votes(&bob, &6);
    let previous = e.ledger().sequence() - 1;
    assert_eq!(mock.voting_supply_at_previous_ledger(), 4);
    assert_eq!(
        mock.voting_supply_at_previous_ledger(),
        mock.get_total_supply_at_checkpoint(&previous)
    );
    advance(&e);
    let previous = e.ledger().sequence() - 1;
    assert_eq!(mock.voting_supply_at_previous_ledger(), 10);
    assert_eq!(
        mock.voting_supply_at_previous_ledger(),
        mock.get_total_supply_at_checkpoint(&previous)
    );
}

#[test]
fn lowering_votes_lowers_the_total() {
    let (e, mock, _) = setup();
    let alice = Address::generate(&e);
    mock.set_votes(&alice, &8);
    advance(&e);
    mock.set_votes(&alice, &2);
    assert_eq!(mock.get_total_supply(), 2);
}

#[test]
fn future_lookup_is_refused() {
    let (e, mock, _) = setup();
    let alice = Address::generate(&e);
    let now = e.ledger().sequence();
    assert_eq!(
        mock.try_get_votes_at_checkpoint(&alice, &now),
        Err(Ok(MockAdapterError::FutureLookup.into()))
    );
    assert_eq!(
        mock.try_get_total_supply_at_checkpoint(&now),
        Err(Ok(MockAdapterError::FutureLookup.into()))
    );
}

#[test]
#[should_panic]
fn set_votes_needs_the_admin() {
    let e = Env::default();
    let admin = Address::generate(&e);
    let id = e.register(VoteAdapterMock, (&admin, 0u32));
    let mock = VoteAdapterMockClient::new(&e, &id);
    mock.set_votes(&Address::generate(&e), &1);
}
