extern crate std;

use soroban_sdk::{
    contract, contractimpl, symbol_short,
    testutils::{Address as _, Ledger, MockAuth, MockAuthInvoke},
    vec, Address, BytesN, Env, IntoVal, String, Val, Vec,
};
use stellar_governance::governor::ProposalState;
use token::{DaoTokenContract, DaoTokenContractClient};
use treasury::{DaoTreasuryContract, DaoTreasuryContractClient};

use crate::{error::CustomGovernorError, DaoGovernorContract, DaoGovernorContractClient};

#[contract]
pub struct TargetContract;

#[contractimpl]
impl TargetContract {
    pub fn set_value(e: &Env, value: u32) -> u32 {
        e.storage().instance().set(&symbol_short!("value"), &value);
        value
    }

    pub fn get_value(e: &Env) -> u32 {
        e.storage()
            .instance()
            .get(&symbol_short!("value"))
            .unwrap_or(0)
    }
}

// Malicious contract that attempts reentrancy attack
#[contract]
pub struct MaliciousReentrantContract;

#[contractimpl]
impl MaliciousReentrantContract {
    /// This function attempts to re-enter treasury.execute()
    /// when called during proposal execution
    pub fn attack(
        e: &Env,
        treasury: Address,
        targets: Vec<Address>,
        functions: Vec<soroban_sdk::Symbol>,
        args: Vec<Vec<Val>>,
        desc_hash: BytesN<32>,
    ) {
        // Store attack parameters
        e.storage()
            .instance()
            .set(&symbol_short!("attacked"), &true);

        // Attempt to re-enter treasury.execute() - blocked by the host (Treasury is on the stack)
        let treasury_client = DaoTreasuryContractClient::new(e, &treasury);
        treasury_client.execute(&targets, &functions, &args, &desc_hash);
    }

    pub fn was_attacked(e: &Env) -> bool {
        e.storage()
            .instance()
            .get(&symbol_short!("attacked"))
            .unwrap_or(false)
    }
}

fn setup() -> (
    Env,
    DaoTokenContractClient<'static>,
    DaoTreasuryContractClient<'static>,
    DaoGovernorContractClient<'static>,
    TargetContractClient<'static>,
    Address,
) {
    let e = Env::default();
    e.mock_all_auths();
    e.ledger().set_sequence_number(100);
    e.ledger().set_timestamp(1_000);

    let owner = Address::generate(&e);
    let token_id = e.register(
        DaoTokenContract,
        (
            owner.clone(),
            Address::generate(&e),
            String::from_str(&e, "DAO Vote NFT"),
            String::from_str(&e, "vDAO"),
            Address::generate(&e),
            Address::generate(&e),
            BytesN::from_array(&e, &[0u8; 32]),
            common::modules::TokenSettings::default(),
        ),
    );
    let token = DaoTokenContractClient::new(&e, &token_id);

    // Wiring is constructor-only: pre-generate the governor address so the
    // treasury can be constructed with it (mirrors the Manager's predicted addresses).
    let governor_id = Address::generate(&e);
    let treasury_id = e.register(
        DaoTreasuryContract,
        (
            owner.clone(),
            governor_id.clone(),
            Address::generate(&e),
            BytesN::from_array(&e, &[0u8; 32]),
        ),
    );
    let treasury = DaoTreasuryContractClient::new(&e, &treasury_id);

    e.register_at(
        &governor_id,
        DaoGovernorContract,
        (
            owner.clone(),
            token_id.clone(),
            treasury_id.clone(),
            300_u32, // voting_delay: 5 minutes
            300_u32, // voting_period: 5 minutes
            300_u32, // queue_delay: 5 minutes
            1_u128,
            1_000_u32,
            Address::generate(&e),
            BytesN::from_array(&e, &[0u8; 32]),
        ),
    );
    let governor = DaoGovernorContractClient::new(&e, &governor_id);

    let target_id = e.register(TargetContract, ());
    let target = TargetContractClient::new(&e, &target_id);

    // Proposals only work once launched.
    governor.launch(&treasury_id);
    treasury.launch(&treasury_id);

    (e, token, treasury, governor, target, owner)
}

fn proposal_args(e: &Env) -> Vec<Vec<Val>> {
    // Args for calling target.set_value(42)
    vec![e, vec![e, 42_u32.into_val(e)]]
}

fn description_hash(e: &Env, description: &String) -> BytesN<32> {
    e.crypto().keccak256(&description.to_bytes()).to_bytes()
}

#[test]
fn full_governance_flow_executes_treasury_call() {
    let (e, token, treasury, governor, target, owner) = setup();
    let proposer = Address::generate(&e);

    assert_eq!(governor.wasm_hash(), BytesN::from_array(&e, &[0u8; 32]));
    let token_id = token.mint(&owner, &proposer);
    assert_eq!(token_id, 0);
    assert_eq!(token.get_votes(&proposer), 1);

    e.ledger().set_sequence_number(200);
    e.ledger().set_timestamp(2_000);

    let targets = vec![&e, target.address.clone()];
    let functions = vec![&e, symbol_short!("set_value")];
    let args = proposal_args(&e);
    let description = String::from_str(&e, "Call target through treasury");
    let desc_hash = description_hash(&e, &description);

    let proposal_id = governor.propose(&targets, &functions, &args, &description, &proposer);
    assert_eq!(
        governor.proposal_state(&proposal_id),
        ProposalState::Pending
    );

    e.ledger().set_timestamp(2_301);
    governor.cast_vote(&proposal_id, &1, &String::from_str(&e, "yes"), &proposer);

    e.ledger().set_timestamp(2_601);
    assert_eq!(
        governor.proposal_state(&proposal_id),
        ProposalState::Succeeded
    );

    governor.queue(
        &targets, &functions, &args, &desc_hash, &2_901_u32, &proposer,
    );
    assert_eq!(governor.proposal_state(&proposal_id), ProposalState::Queued);

    e.ledger().set_timestamp(2_901);
    treasury.execute(&targets, &functions, &args, &desc_hash);

    assert_eq!(target.get_value(), 42);
    assert_eq!(
        governor.proposal_state(&proposal_id),
        ProposalState::Executed
    );
}

#[test]
#[should_panic(expected = "#5002")]
fn propose_fails_below_threshold() {
    let (e, _token, _treasury, governor, target, _) = setup();
    let proposer = Address::generate(&e);

    e.ledger().set_sequence_number(200);
    e.ledger().set_timestamp(2_000);

    let targets = vec![&e, target.address.clone()];
    let functions = vec![&e, symbol_short!("set_value")];
    let args = proposal_args(&e);
    let description = String::from_str(&e, "Not enough votes");

    let _ = governor.propose(&targets, &functions, &args, &description, &proposer);
}

#[test]
fn threshold_above_the_voting_supply_is_capped_at_the_supply() {
    let (e, token, _treasury, governor, target, owner) = setup();
    // Set while the supply is zero, as a launch admin can before minting.
    governor.set_proposal_threshold(&5);
    assert_eq!(governor.proposal_threshold(), 5);

    let alice = Address::generate(&e);
    let bob = Address::generate(&e);
    token.mint(&owner, &alice);
    token.mint(&owner, &alice);
    token.mint(&owner, &bob);

    e.ledger().set_sequence_number(200);
    e.ledger().set_timestamp(2_000);
    let targets = vec![&e, target.address.clone()];
    let functions = vec![&e, symbol_short!("set_value")];
    let args = proposal_args(&e);
    let description = String::from_str(&e, "Supply 3, threshold 5");

    // The cap is the whole voting supply (3): two votes are not enough.
    assert_eq!(governor.votes_needed_to_propose(), 3);
    assert_eq!(
        governor.try_propose(&targets, &functions, &args, &description, &alice),
        Err(Ok(
            stellar_governance::governor::GovernorError::InsufficientProposerVotes.into()
        ))
    );

    // Once every vote is with one account, that account can propose.
    token.delegate(&bob, &alice);
    e.ledger().set_sequence_number(201);
    let id = governor.propose(&targets, &functions, &args, &description, &alice);
    assert_eq!(governor.proposal_state(&id), ProposalState::Pending);
    // The configured threshold is unchanged.
    assert_eq!(governor.proposal_threshold(), 5);
}

#[test]
fn threshold_below_the_voting_supply_is_unchanged() {
    let (e, token, _treasury, governor, target, owner) = setup();
    let alice = Address::generate(&e);
    let bob = Address::generate(&e);
    for _ in 0..3 {
        token.mint(&owner, &alice);
    }
    token.mint(&owner, &bob);
    governor.set_proposal_threshold(&2);

    e.ledger().set_sequence_number(200);
    e.ledger().set_timestamp(2_000);
    let targets = vec![&e, target.address.clone()];
    let functions = vec![&e, symbol_short!("set_value")];
    let args = proposal_args(&e);
    let description = String::from_str(&e, "Supply 4, threshold 2");
    assert_eq!(governor.votes_needed_to_propose(), 2);

    assert_eq!(
        governor.try_propose(&targets, &functions, &args, &description, &bob),
        Err(Ok(
            stellar_governance::governor::GovernorError::InsufficientProposerVotes.into()
        ))
    );
    governor.propose(&targets, &functions, &args, &description, &alice);
}

#[test]
fn execute_accepts_direct_target_calls() {
    let (e, token, treasury, governor, target, owner) = setup();
    let proposer = Address::generate(&e);

    let token_id = token.mint(&owner, &proposer);
    assert_eq!(token_id, 0);
    e.ledger().set_sequence_number(200);
    e.ledger().set_timestamp(2_000);

    let targets = vec![&e, target.address.clone()];
    let functions = vec![&e, symbol_short!("set_value")];
    let args = proposal_args(&e);
    let description = String::from_str(&e, "Call target directly");
    let desc_hash = description_hash(&e, &description);

    let proposal_id = governor.propose(&targets, &functions, &args, &description, &proposer);
    e.ledger().set_timestamp(2_301);
    governor.cast_vote(&proposal_id, &1, &String::from_str(&e, "yes"), &proposer);
    e.ledger().set_timestamp(2_601);

    governor.queue(
        &targets, &functions, &args, &desc_hash, &2_901_u32, &proposer,
    );
    e.ledger().set_timestamp(2_901);
    treasury.execute(&targets, &functions, &args, &desc_hash);

    assert_eq!(target.get_value(), 42);
}

#[test]
#[should_panic(expected = "#7513")]
fn execute_fails_before_queue_delay_elapses() {
    let (e, token, treasury, governor, target, owner) = setup();
    let proposer = Address::generate(&e);

    let token_id = token.mint(&owner, &proposer);
    assert_eq!(token_id, 0);
    e.ledger().set_sequence_number(200);
    e.ledger().set_timestamp(2_000);

    let targets = vec![&e, target.address.clone()];
    let functions = vec![&e, symbol_short!("set_value")];
    let args = proposal_args(&e);
    let description = String::from_str(&e, "Queue delay check");
    let desc_hash = description_hash(&e, &description);

    let proposal_id = governor.propose(&targets, &functions, &args, &description, &proposer);
    e.ledger().set_timestamp(2_301);
    governor.cast_vote(&proposal_id, &1, &String::from_str(&e, "yes"), &proposer);
    e.ledger().set_timestamp(2_601);
    governor.queue(
        &targets, &functions, &args, &desc_hash, &2_901_u32, &proposer,
    );

    e.ledger().set_timestamp(2_410);
    let _ = treasury.execute(&targets, &functions, &args, &desc_hash);
}

#[test]
#[should_panic(expected = "#5008")]
fn execute_cannot_run_twice() {
    let (e, token, treasury, governor, target, owner) = setup();
    let proposer = Address::generate(&e);

    let token_id = token.mint(&owner, &proposer);
    assert_eq!(token_id, 0);
    e.ledger().set_sequence_number(200);
    e.ledger().set_timestamp(2_000);

    let targets = vec![&e, target.address.clone()];
    let functions = vec![&e, symbol_short!("set_value")];
    let args = proposal_args(&e);
    let description = String::from_str(&e, "Execute twice");
    let desc_hash = description_hash(&e, &description);

    let proposal_id = governor.propose(&targets, &functions, &args, &description, &proposer);
    e.ledger().set_timestamp(2_301);
    governor.cast_vote(&proposal_id, &1, &String::from_str(&e, "yes"), &proposer);
    e.ledger().set_timestamp(2_601);

    governor.queue(
        &targets, &functions, &args, &desc_hash, &2_901_u32, &proposer,
    );
    e.ledger().set_timestamp(2_901);
    treasury.execute(&targets, &functions, &args, &desc_hash);
    treasury.execute(&targets, &functions, &args, &desc_hash);
}

#[test]
fn quorum_uses_total_supply_bps() {
    let e = Env::default();
    e.mock_all_auths();

    let owner = Address::generate(&e);
    let token_id = e.register(
        DaoTokenContract,
        (
            owner.clone(),
            Address::generate(&e),
            String::from_str(&e, "DAO Vote NFT"),
            String::from_str(&e, "vDAO"),
            Address::generate(&e),
            Address::generate(&e),
            BytesN::from_array(&e, &[0u8; 32]),
            common::modules::TokenSettings::default(),
        ),
    );
    let token = DaoTokenContractClient::new(&e, &token_id);

    let treasury_id = e.register(
        DaoTreasuryContract,
        (
            owner.clone(),
            Address::generate(&e),
            Address::generate(&e),
            BytesN::from_array(&e, &[0u8; 32]),
        ),
    );
    let governor_id = e.register(
        DaoGovernorContract,
        (
            owner.clone(),
            token_id.clone(),
            treasury_id.clone(),
            300_u32,
            300_u32,
            300_u32,
            1_u128,
            3_000_u32,
            Address::generate(&e),
            BytesN::from_array(&e, &[0u8; 32]),
        ),
    );
    let governor = DaoGovernorContractClient::new(&e, &governor_id);

    for token_id in 0..10_u32 {
        let minted_token_id = token.mint(&owner, &owner);
        assert_eq!(minted_token_id, token_id);
    }

    e.ledger().set_sequence_number(102);

    assert_eq!(governor.quorum(&(e.ledger().sequence() - 1)), 3);
}

#[test]
fn owner_can_set_voting_delay() {
    let (_e, _token, _treasury, governor, _target, owner) = setup();
    governor.set_voting_delay(&300);
    assert_eq!(governor.voting_delay(), 300);

    let _ = owner;
}

#[test]
fn owner_can_set_voting_period() {
    let (_e, _token, _treasury, governor, _target, owner) = setup();
    governor.set_voting_period(&300);
    assert_eq!(governor.voting_period(), 300);

    let _ = owner;
}

#[test]
fn owner_can_set_proposal_threshold() {
    let (e, token, _treasury, governor, _target, owner) = setup();
    // Mint some tokens so total supply > 0 (required for validation)
    let user1 = Address::generate(&e);
    token.mint(&owner, &user1);
    token.mint(&owner, &user1);
    token.mint(&owner, &user1);
    token.mint(&owner, &user1);
    token.mint(&owner, &user1);
    token.mint(&owner, &user1);
    token.mint(&owner, &user1);
    token.mint(&owner, &user1);
    token.mint(&owner, &user1);
    token.mint(&owner, &user1);
    // Total supply is now 10

    // Advance ledger so checkpoint reflects minted tokens
    e.ledger().set_sequence_number(101);

    governor.set_proposal_threshold(&5);
    assert_eq!(governor.proposal_threshold(), 5);

    let _ = owner;
}

#[test]
fn owner_can_set_quorum_bps() {
    let (_e, _token, _treasury, governor, _target, owner) = setup();
    governor.set_quorum_bps(&2000);
    assert_eq!(governor.quorum_bps(), 2000);

    let _ = owner;
}

#[test]
fn owner_can_set_queue_delay() {
    let (_e, _token, _treasury, governor, _target, owner) = setup();
    // Use the minimum queue delay of 5 minutes (300 seconds)
    let new_queue_delay = 300u32;

    governor.set_queue_delay(&new_queue_delay);

    let _ = owner;
}

#[test]
#[should_panic(expected = "HostError: Error(Auth, InvalidAction)")]
fn non_owner_cannot_set_voting_delay() {
    let (e, _token, _treasury, governor, _target, _owner) = setup();
    let unauthorized = Address::generate(&e);

    e.mock_auths(&[MockAuth {
        address: &unauthorized,
        invoke: &MockAuthInvoke {
            contract: &governor.address,
            fn_name: "set_voting_delay",
            args: (&20u32,).into_val(&e),
            sub_invokes: &[],
        },
    }]);

    governor.set_voting_delay(&20);
}

#[test]
#[should_panic(expected = "HostError: Error(Auth, InvalidAction)")]
fn non_owner_cannot_set_voting_period() {
    let (e, _token, _treasury, governor, _target, _owner) = setup();
    let unauthorized = Address::generate(&e);

    e.mock_auths(&[MockAuth {
        address: &unauthorized,
        invoke: &MockAuthInvoke {
            contract: &governor.address,
            fn_name: "set_voting_period",
            args: (&200u32,).into_val(&e),
            sub_invokes: &[],
        },
    }]);

    governor.set_voting_period(&200);
}

#[test]
#[should_panic(expected = "HostError: Error(Auth, InvalidAction)")]
fn non_owner_cannot_set_proposal_threshold() {
    let (e, _token, _treasury, governor, _target, _owner) = setup();
    let unauthorized = Address::generate(&e);

    e.mock_auths(&[MockAuth {
        address: &unauthorized,
        invoke: &MockAuthInvoke {
            contract: &governor.address,
            fn_name: "set_proposal_threshold",
            args: (&5u128,).into_val(&e),
            sub_invokes: &[],
        },
    }]);

    governor.set_proposal_threshold(&5);
}

#[test]
#[should_panic(expected = "HostError: Error(Auth, InvalidAction)")]
fn non_owner_cannot_set_quorum_bps() {
    let (e, _token, _treasury, governor, _target, _owner) = setup();
    let unauthorized = Address::generate(&e);

    e.mock_auths(&[MockAuth {
        address: &unauthorized,
        invoke: &MockAuthInvoke {
            contract: &governor.address,
            fn_name: "set_quorum_bps",
            args: (&2000u32,).into_val(&e),
            sub_invokes: &[],
        },
    }]);

    governor.set_quorum_bps(&2000);
}

#[test]
#[should_panic(expected = "HostError: Error(Auth, InvalidAction)")]
fn non_owner_cannot_set_queue_delay() {
    let (e, _token, _treasury, governor, _target, _owner) = setup();
    let unauthorized = Address::generate(&e);

    e.mock_auths(&[MockAuth {
        address: &unauthorized,
        invoke: &MockAuthInvoke {
            contract: &governor.address,
            fn_name: "set_queue_delay",
            args: (&500u32,).into_val(&e),
            sub_invokes: &[],
        },
    }]);

    governor.set_queue_delay(&500);
}

#[test]
fn proposal_handles_large_timestamps() {
    let (e, token, _treasury, governor, target, owner) = setup();
    let proposer = Address::generate(&e);

    let _ = token.mint(&owner, &proposer);

    // Set timestamp to a large value (year 2100+)
    // u32::MAX = 4,294,967,295 seconds = Feb 2106
    // Let's test with 4 billion (well before u32 limit but large enough)
    e.ledger().set_timestamp(4_000_000_000);
    e.ledger().set_sequence_number(200);

    let targets = vec![&e, target.address.clone()];
    let functions = vec![&e, symbol_short!("set_value")];
    let args = proposal_args(&e);
    let description = String::from_str(&e, "Test large timestamp");

    // Should succeed without overflow
    let proposal_id = governor.propose(&targets, &functions, &args, &description, &proposer);

    // Verify proposal was created successfully
    assert_eq!(
        governor.proposal_state(&proposal_id),
        ProposalState::Pending
    );

    let _ = e;
}

#[test]
fn proposal_timestamps_stored_as_u64() {
    let (e, token, _treasury, governor, target, owner) = setup();
    let proposer = Address::generate(&e);

    let _ = token.mint(&owner, &proposer);

    // Use a timestamp that would overflow u32 in the future
    // Current timestamp + voting_delay should be calculated correctly
    let now = 3_000_000_000_u64; // Year 2065
    e.ledger().set_timestamp(now);
    e.ledger().set_sequence_number(200);

    let targets = vec![&e, target.address.clone()];
    let functions = vec![&e, symbol_short!("set_value")];
    let args = proposal_args(&e);
    let description = String::from_str(&e, "Test u64 storage");

    let proposal_id = governor.propose(&targets, &functions, &args, &description, &proposer);

    // If this didn't panic, timestamps are being stored correctly as u64
    // Verify proposal was created and is in Pending state
    assert_eq!(
        governor.proposal_state(&proposal_id),
        ProposalState::Pending
    );
}

#[test]
fn proposal_state_transitions_with_large_timestamps() {
    let (e, token, _treasury, governor, target, owner) = setup();
    let proposer = Address::generate(&e);

    let _ = token.mint(&owner, &proposer);

    // Use large timestamp
    let start_time = 3_500_000_000_u64;
    e.ledger().set_timestamp(start_time);
    e.ledger().set_sequence_number(200);

    let targets = vec![&e, target.address.clone()];
    let functions = vec![&e, symbol_short!("set_value")];
    let args = proposal_args(&e);
    let description = String::from_str(&e, "Test state transitions");

    let proposal_id = governor.propose(&targets, &functions, &args, &description, &proposer);

    // Should be Pending
    assert_eq!(
        governor.proposal_state(&proposal_id),
        ProposalState::Pending
    );

    // Move past voting_delay (300 seconds)
    e.ledger().set_timestamp(start_time + 301);
    assert_eq!(governor.proposal_state(&proposal_id), ProposalState::Active);

    // Cast vote
    governor.cast_vote(&proposal_id, &1, &String::from_str(&e, "yes"), &proposer);

    // Move past voting_period (300 seconds total from vote start)
    e.ledger().set_timestamp(start_time + 601);
    assert_eq!(
        governor.proposal_state(&proposal_id),
        ProposalState::Succeeded
    );
}

#[test]
#[should_panic(expected = "HostError: Error(Contract, #7512)")]
fn cast_vote_fails_with_zero_weight() {
    let (e, token, _treasury, governor, target, owner) = setup();
    let proposer = Address::generate(&e);
    let zero_voter = Address::generate(&e);

    // Give proposer voting power
    let _ = token.mint(&owner, &proposer);

    e.ledger().set_sequence_number(200);
    e.ledger().set_timestamp(2_000);

    let targets = vec![&e, target.address.clone()];
    let functions = vec![&e, symbol_short!("set_value")];
    let args = proposal_args(&e);
    let description = String::from_str(&e, "Test zero vote");

    let proposal_id = governor.propose(&targets, &functions, &args, &description, &proposer);

    // Move to voting period
    e.ledger().set_timestamp(2_301);

    // Try to vote with zero voting power (should fail)
    governor.cast_vote(&proposal_id, &1, &String::from_str(&e, "yes"), &zero_voter);
}

#[test]
#[should_panic(expected = "HostError: Error(Contract, #7502)")]
fn set_proposal_threshold_zero_fails() {
    let (_e, _token, _treasury, governor, _target, _owner) = setup();

    // Try to set threshold to zero (should fail)
    governor.set_proposal_threshold(&0);
}

#[test]
#[should_panic(expected = "HostError: Error(Contract, #7503)")]
fn set_quorum_bps_zero_fails() {
    let (_e, _token, _treasury, governor, _target, _owner) = setup();

    // Try to set quorum to zero (should fail)
    governor.set_quorum_bps(&0);
}

#[test]
#[should_panic(expected = "HostError: Error(Contract, #7503)")]
fn set_quorum_bps_above_max_fails() {
    let (_e, _token, _treasury, governor, _target, _owner) = setup();

    // Try to set quorum above 100% (should fail)
    governor.set_quorum_bps(&10_001);
}

#[test]
fn queued_proposal_expires_after_14_days() {
    let (e, token, _treasury, governor, target, owner) = setup();
    let proposer = Address::generate(&e);

    // Mint token to proposer
    let _ = token.mint(&owner, &proposer);
    e.ledger().set_sequence_number(200);
    e.ledger().set_timestamp(2_000);

    // Create and pass a proposal
    let targets = vec![&e, target.address.clone()];
    let functions = vec![&e, symbol_short!("set_value")];
    let args = proposal_args(&e);
    let description = String::from_str(&e, "Test expiration");
    let desc_hash = description_hash(&e, &description);

    let proposal_id = governor.propose(&targets, &functions, &args, &description, &proposer);

    // Advance time and vote
    e.ledger().set_timestamp(2_301);
    governor.cast_vote(&proposal_id, &1, &String::from_str(&e, "yes"), &proposer);

    // Advance to after voting period (proposal now Succeeded)
    e.ledger().set_timestamp(2_601);
    assert_eq!(
        governor.proposal_state(&proposal_id),
        ProposalState::Succeeded
    );

    // Queue the proposal (ETA = 2_111 + 1000 = 3_111)
    governor.queue(
        &targets, &functions, &args, &desc_hash, &3_111_u32, &proposer,
    );
    assert_eq!(governor.proposal_state(&proposal_id), ProposalState::Queued);

    // Advance to just after ETA (still queued, can execute)
    e.ledger().set_timestamp(3_112);
    assert_eq!(governor.proposal_state(&proposal_id), ProposalState::Queued);

    // ETA = 3_111, expiration period = 1_209_600 seconds (14 days)
    // Expiration time = 3_111 + 1_209_600 = 1_212_711
    // Proposal expires when now >= expiration_time

    // Test well after ETA but before expiration (e.g. 1 week after ETA)
    e.ledger().set_timestamp(3_111 + 604_800); // ETA + 7 days
    assert_eq!(governor.proposal_state(&proposal_id), ProposalState::Queued);

    // Test at expiration time (expires)
    e.ledger().set_timestamp(3_111 + 1_209_600); // ETA + 14 days = 1_212_711
    assert_eq!(
        governor.proposal_state(&proposal_id),
        ProposalState::Expired
    );

    // Test after expiration
    e.ledger().set_timestamp(3_111 + 1_209_601); // ETA + 14 days + 1 second
    assert_eq!(
        governor.proposal_state(&proposal_id),
        ProposalState::Expired
    );
}

#[test]
fn queued_proposal_can_execute_before_expiration() {
    let (e, token, treasury, governor, target, owner) = setup();
    let proposer = Address::generate(&e);

    // Mint token to proposer
    let _ = token.mint(&owner, &proposer);
    e.ledger().set_sequence_number(200);
    e.ledger().set_timestamp(2_000);

    // Create and pass a proposal
    let targets = vec![&e, target.address.clone()];
    let functions = vec![&e, symbol_short!("set_value")];
    let args = proposal_args(&e);
    let description = String::from_str(&e, "Execute before expiration");
    let desc_hash = description_hash(&e, &description);

    let proposal_id = governor.propose(&targets, &functions, &args, &description, &proposer);

    // Advance time and vote
    e.ledger().set_timestamp(2_301);
    governor.cast_vote(&proposal_id, &1, &String::from_str(&e, "yes"), &proposer);

    // Advance to after voting period
    e.ledger().set_timestamp(2_601);
    assert_eq!(
        governor.proposal_state(&proposal_id),
        ProposalState::Succeeded
    );

    // Queue the proposal (ETA = 2_111 + 1000 = 3_111)
    governor.queue(
        &targets, &functions, &args, &desc_hash, &3_111_u32, &proposer,
    );
    assert_eq!(governor.proposal_state(&proposal_id), ProposalState::Queued);

    // Advance to ETA (can now execute)
    e.ledger().set_timestamp(3_111);
    assert_eq!(governor.proposal_state(&proposal_id), ProposalState::Queued);

    // Execute before expiration
    treasury.execute(&targets, &functions, &args, &desc_hash);
    assert_eq!(
        governor.proposal_state(&proposal_id),
        ProposalState::Executed
    );
    assert_eq!(target.get_value(), 42);
}

#[test]
#[should_panic(expected = "HostError: Error(Contract, #5007)")]
fn expired_proposal_cannot_be_executed() {
    let (e, token, treasury, governor, target, owner) = setup();
    let proposer = Address::generate(&e);

    // Mint token to proposer
    let _ = token.mint(&owner, &proposer);
    e.ledger().set_sequence_number(200);
    e.ledger().set_timestamp(2_000);

    // Create and pass a proposal
    let targets = vec![&e, target.address.clone()];
    let functions = vec![&e, symbol_short!("set_value")];
    let args = proposal_args(&e);
    let description = String::from_str(&e, "Expired execution test");
    let desc_hash = description_hash(&e, &description);

    let proposal_id = governor.propose(&targets, &functions, &args, &description, &proposer);

    // Advance time and vote
    e.ledger().set_timestamp(2_301);
    governor.cast_vote(&proposal_id, &1, &String::from_str(&e, "yes"), &proposer);

    // Advance to after voting period
    e.ledger().set_timestamp(2_601);
    assert_eq!(
        governor.proposal_state(&proposal_id),
        ProposalState::Succeeded
    );

    // Queue the proposal (ETA = 2_111 + 1000 = 3_111)
    governor.queue(
        &targets, &functions, &args, &desc_hash, &3_111_u32, &proposer,
    );

    // Advance past expiration (ETA + 14 days + 1 second)
    e.ledger().set_timestamp(1_212_712); // 3_111 + 1_209_600 + 1
    assert_eq!(
        governor.proposal_state(&proposal_id),
        ProposalState::Expired
    );

    // Try to execute expired proposal (should fail with ProposalNotQueued error #5007)
    treasury.execute(&targets, &functions, &args, &desc_hash);
}

#[test]
#[should_panic(expected = "HostError: Error(Context, InvalidAction)")]
fn execute_prevents_reentrancy_attack() {
    // NOTE: Soroban has built-in reentrancy protection at the platform level
    // This test verifies that even if an attacker tries to re-enter execute(),
    // the platform blocks it with Error(Context, InvalidAction) - "Contract re-entry is not allowed"
    //
    // Additionally, our CEI pattern (Checks-Effects-Interactions) provides defense-in-depth
    // by updating the proposal state to Executed BEFORE making external calls.
    // If platform protection is bypassed, our state check would catch it.
    let (e, token, treasury, governor, _target, owner) = setup();
    let proposer = Address::generate(&e);

    // Register malicious contract
    let malicious_id = e.register(MaliciousReentrantContract, ());
    let _malicious = MaliciousReentrantContractClient::new(&e, &malicious_id);

    // Mint token to proposer
    let _ = token.mint(&owner, &proposer);
    e.ledger().set_sequence_number(200);
    e.ledger().set_timestamp(2_000);

    // Create a proposal that calls the malicious contract
    // The malicious contract will try to re-enter execute()
    let targets = vec![&e, malicious_id.clone()];
    let functions = vec![&e, symbol_short!("attack")];

    // Build args for the malicious attack function
    // attack(governor, targets, functions, args, desc_hash, executor)
    let attack_targets = vec![&e, malicious_id.clone()]; // Dummy targets for reentrancy attempt
    let attack_functions = vec![&e, symbol_short!("attack")];
    let attack_args: Vec<Vec<Val>> = vec![&e, vec![&e]];
    let attack_desc = String::from_str(&e, "Reentrancy attack");
    let attack_desc_hash = description_hash(&e, &attack_desc);

    let args = vec![
        &e,
        vec![
            &e,
            treasury.address.clone().into_val(&e),
            attack_targets.into_val(&e),
            attack_functions.into_val(&e),
            attack_args.into_val(&e),
            attack_desc_hash.into_val(&e),
        ],
    ];

    let description = String::from_str(&e, "Test reentrancy protection");
    let desc_hash = description_hash(&e, &description);

    let proposal_id = governor.propose(&targets, &functions, &args, &description, &proposer);

    // Advance time and vote for the proposal
    e.ledger().set_timestamp(2_301);
    governor.cast_vote(&proposal_id, &1, &String::from_str(&e, "yes"), &proposer);

    // Advance to after voting period (proposal now Succeeded)
    e.ledger().set_timestamp(2_601);
    assert_eq!(
        governor.proposal_state(&proposal_id),
        ProposalState::Succeeded
    );

    // Queue the proposal
    governor.queue(
        &targets, &functions, &args, &desc_hash, &3_111_u32, &proposer,
    );
    assert_eq!(governor.proposal_state(&proposal_id), ProposalState::Queued);

    // Advance past ETA
    e.ledger().set_timestamp(3_112);

    // Execute the proposal
    // The malicious contract's attack() function will be called
    // It will try to re-enter execute(), which should fail with ProposalAlreadyExecuted error #5006
    treasury.execute(&targets, &functions, &args, &desc_hash);
}

#[test]
fn execute_updates_state_before_external_calls() {
    let (e, token, treasury, governor, target, owner) = setup();
    let proposer = Address::generate(&e);

    // Mint token to proposer
    let _ = token.mint(&owner, &proposer);
    e.ledger().set_sequence_number(200);
    e.ledger().set_timestamp(2_000);

    // Create a normal proposal
    let targets = vec![&e, target.address.clone()];
    let functions = vec![&e, symbol_short!("set_value")];
    let args = proposal_args(&e);
    let description = String::from_str(&e, "Test state update timing");
    let desc_hash = description_hash(&e, &description);

    let proposal_id = governor.propose(&targets, &functions, &args, &description, &proposer);

    // Advance time and vote
    e.ledger().set_timestamp(2_301);
    governor.cast_vote(&proposal_id, &1, &String::from_str(&e, "yes"), &proposer);

    // Advance to after voting period
    e.ledger().set_timestamp(2_601);
    assert_eq!(
        governor.proposal_state(&proposal_id),
        ProposalState::Succeeded
    );

    // Queue the proposal
    governor.queue(
        &targets, &functions, &args, &desc_hash, &3_111_u32, &proposer,
    );
    assert_eq!(governor.proposal_state(&proposal_id), ProposalState::Queued);

    // Advance past ETA
    e.ledger().set_timestamp(3_112);

    // Execute the proposal
    treasury.execute(&targets, &functions, &args, &desc_hash);

    // Verify proposal state is Executed (not Queued)
    assert_eq!(
        governor.proposal_state(&proposal_id),
        ProposalState::Executed
    );

    // Verify the target contract function was actually called
    assert_eq!(target.get_value(), 42);
}

mod upgrade_via_common {
    use super::*;
    use common::testutils::{empty_wasm, MockManager, MockManagerClient};

    #[test]
    fn upgrade_goes_through_common_apply() {
        let e = Env::default();
        e.mock_all_auths();
        let mgr = MockManagerClient::new(&e, &e.register(MockManager, ()));
        let from = BytesN::from_array(&e, &[1u8; 32]);
        let to = empty_wasm(&e);
        let id = e.register(
            DaoGovernorContract,
            (
                Address::generate(&e),
                Address::generate(&e),
                Address::generate(&e),
                300_u32,
                300_u32,
                300_u32,
                1_u128,
                1_000_u32,
                mgr.address.clone(),
                from.clone(),
            ),
        );
        let client = DaoGovernorContractClient::new(&e, &id);
        mgr.approve(&from, &to);
        mgr.register(&to, &String::from_str(&e, "0.2.0"));
        client.upgrade(&from, &to);

        // Contract code is swapped to an empty module; read the stored keys directly.
        e.as_contract(&id, || {
            assert_eq!(common::upgrade::current_hash(&e), to);
            assert_eq!(
                common::upgrade::version(&e, &mgr.address),
                String::from_str(&e, "0.2.0")
            );
        });
    }

    #[test]
    fn upgrade_rejected_when_not_approved() {
        let e = Env::default();
        e.mock_all_auths();
        let mgr = MockManagerClient::new(&e, &e.register(MockManager, ()));
        let from = BytesN::from_array(&e, &[1u8; 32]);
        let to = empty_wasm(&e);
        let id = e.register(
            DaoGovernorContract,
            (
                Address::generate(&e),
                Address::generate(&e),
                Address::generate(&e),
                300_u32,
                300_u32,
                300_u32,
                1_u128,
                1_000_u32,
                mgr.address.clone(),
                from.clone(),
            ),
        );
        let client = DaoGovernorContractClient::new(&e, &id);
        mgr.register(&to, &String::from_str(&e, "0.2.0"));
        let r = client.try_upgrade(&from, &to);
        assert_eq!(
            r.err().unwrap().unwrap(),
            common::CommonError::UpgradeNotApproved.into()
        );
    }

    #[test]
    fn upgrade_rejects_unauthorized_caller() {
        let e = Env::default();
        e.mock_all_auths();
        let mgr = MockManagerClient::new(&e, &e.register(MockManager, ()));
        let from = BytesN::from_array(&e, &[1u8; 32]);
        let to = empty_wasm(&e);
        let id = e.register(
            DaoGovernorContract,
            (
                Address::generate(&e),
                Address::generate(&e),
                Address::generate(&e),
                300_u32,
                300_u32,
                300_u32,
                1_u128,
                1_000_u32,
                mgr.address.clone(),
                from.clone(),
            ),
        );
        let client = DaoGovernorContractClient::new(&e, &id);
        mgr.approve(&from, &to);
        mgr.register(&to, &String::from_str(&e, "0.2.0"));
        mgr.register(&from, &String::from_str(&e, "0.1.1"));
        // The module's own version() reads its Manager (D6).
        assert_eq!(client.version(), String::from_str(&e, "0.1.1"));
        // Drop mock_all_auths: no authorization is provided for any address.
        e.set_auths(&[]);
        assert!(client.try_upgrade(&from, &to).is_err());
        e.mock_all_auths();
        e.as_contract(&id, || {
            assert_eq!(common::upgrade::current_hash(&e), from);
            assert_eq!(
                common::upgrade::version(&e, &mgr.address),
                String::from_str(&e, "0.1.1")
            );
        });
    }

    #[test]
    fn upgrade_hash_mismatch_leaves_state_unchanged() {
        let e = Env::default();
        e.mock_all_auths();
        let mgr = MockManagerClient::new(&e, &e.register(MockManager, ()));
        let from = BytesN::from_array(&e, &[1u8; 32]);
        let to = empty_wasm(&e);
        let id = e.register(
            DaoGovernorContract,
            (
                Address::generate(&e),
                Address::generate(&e),
                Address::generate(&e),
                300_u32,
                300_u32,
                300_u32,
                1_u128,
                1_000_u32,
                mgr.address.clone(),
                from.clone(),
            ),
        );
        let client = DaoGovernorContractClient::new(&e, &id);
        mgr.register(&from, &String::from_str(&e, "0.1.0"));
        let wrong = BytesN::from_array(&e, &[9u8; 32]);
        mgr.approve(&wrong, &to);
        mgr.register(&to, &String::from_str(&e, "0.2.0"));
        let r = client.try_upgrade(&wrong, &to);
        assert_eq!(
            r.err().unwrap().unwrap(),
            common::CommonError::HashMismatch.into()
        );
        e.as_contract(&id, || {
            assert_eq!(common::upgrade::current_hash(&e), from);
            assert_eq!(
                common::upgrade::version(&e, &mgr.address),
                String::from_str(&e, "0.1.0")
            );
        });
    }
}

fn register_with(
    e: &Env,
    manager: &Address,
    owner: &Address,
    threshold: u128,
    quorum_bps: u32,
    voting_delay: u32,
) -> DaoGovernorContractClient<'static> {
    register_with_treasury(
        e,
        manager,
        owner,
        &Address::generate(e),
        threshold,
        quorum_bps,
        voting_delay,
    )
}

fn register_with_treasury(
    e: &Env,
    manager: &Address,
    owner: &Address,
    treasury: &Address,
    threshold: u128,
    quorum_bps: u32,
    voting_delay: u32,
) -> DaoGovernorContractClient<'static> {
    let id = e.register(
        DaoGovernorContract,
        (
            owner.clone(),
            Address::generate(e),
            treasury.clone(),
            voting_delay,
            300_u32,
            300_u32,
            threshold,
            quorum_bps,
            manager.clone(),
            BytesN::from_array(e, &[0u8; 32]),
        ),
    );
    DaoGovernorContractClient::new(e, &id)
}

#[test]
#[should_panic(expected = "Error(Contract, #7503)")]
fn constructor_rejects_zero_quorum() {
    let e = Env::default();
    register_with(
        &e,
        &Address::generate(&e),
        &Address::generate(&e),
        1,
        0,
        300,
    );
}

#[test]
#[should_panic(expected = "Error(Contract, #7503)")]
fn constructor_rejects_quorum_above_max() {
    let e = Env::default();
    register_with(
        &e,
        &Address::generate(&e),
        &Address::generate(&e),
        1,
        10_001,
        300,
    );
}

#[test]
#[should_panic(expected = "Error(Contract, #7502)")]
fn constructor_rejects_zero_threshold() {
    let e = Env::default();
    register_with(
        &e,
        &Address::generate(&e),
        &Address::generate(&e),
        0,
        1_000,
        300,
    );
}

#[test]
#[should_panic(expected = "Error(Contract, #7504)")]
fn constructor_rejects_short_voting_delay() {
    let e = Env::default();
    register_with(
        &e,
        &Address::generate(&e),
        &Address::generate(&e),
        1,
        1_000,
        299,
    );
}

#[test]
fn launch_is_one_shot_and_hands_admin_to_treasury() {
    let e = Env::default();
    e.mock_all_auths();
    let manager = Address::generate(&e);
    let owner = Address::generate(&e);
    let attacker = Address::generate(&e);
    let treasury = Address::generate(&e);
    let governor = register_with_treasury(&e, &manager, &owner, &treasury, 1, 1_000, 300);

    assert_eq!(governor.admin(), owner);
    governor.launch(&treasury);
    assert_eq!(governor.admin(), treasury);
    let r = governor.try_launch(&attacker);
    assert_eq!(
        r.err().unwrap().unwrap(),
        common::CommonError::AlreadyLive.into()
    );
}

/// docs/designs/membership-models.md §2: `manager.open_assurance` hands the
/// admin over early; only the Manager may, only in Setup, which freezes the
/// governance settings.
#[test]
fn handoff_is_the_managers_freezes_settings_and_stays_in_setup() {
    let e = Env::default();
    e.mock_all_auths();
    let manager = Address::generate(&e);
    let owner = Address::generate(&e);
    let treasury = Address::generate(&e);
    let governor = register_with_treasury(&e, &manager, &owner, &treasury, 1, 1_000, 300);
    let id = governor.address.clone();
    e.mock_auths(&[soroban_sdk::testutils::MockAuth {
        address: &owner,
        invoke: &soroban_sdk::testutils::MockAuthInvoke {
            contract: &id,
            fn_name: "handoff",
            args: soroban_sdk::IntoVal::into_val(&(treasury.clone(),), &e),
            sub_invokes: &[],
        },
    }]);
    assert!(governor.try_handoff(&treasury).is_err());
    e.mock_all_auths();
    assert_eq!(
        governor
            .try_handoff(&Address::generate(&e))
            .err()
            .unwrap()
            .unwrap(),
        CustomGovernorError::TreasuryMismatch.into()
    );
    governor.handoff(&treasury);
    assert_eq!(governor.admin(), treasury);
    // The launch admin's setter now needs the Treasury.
    e.mock_auths(&[soroban_sdk::testutils::MockAuth {
        address: &owner,
        invoke: &soroban_sdk::testutils::MockAuthInvoke {
            contract: &id,
            fn_name: "set_quorum_bps",
            args: soroban_sdk::IntoVal::into_val(&(2_000u32,), &e),
            sub_invokes: &[],
        },
    }]);
    assert!(governor.try_set_quorum_bps(&2_000).is_err());
    e.mock_all_auths();
    governor.launch(&treasury);
    assert_eq!(governor.admin(), treasury);
    assert_eq!(
        governor.try_handoff(&treasury).err().unwrap().unwrap(),
        common::CommonError::AlreadyLive.into()
    );
}

#[test]
fn launch_rejects_treasury_other_than_wired() {
    let e = Env::default();
    e.mock_all_auths();
    let manager = Address::generate(&e);
    let governor = register_with(&e, &manager, &Address::generate(&e), 1, 1_000, 300);
    let r = governor.try_launch(&Address::generate(&e));
    assert_eq!(
        r.err().unwrap().unwrap(),
        CustomGovernorError::TreasuryMismatch.into()
    );
}

#[test]
fn proposal_entrypoints_are_not_live_before_launch_and_work_after() {
    let e = Env::default();
    e.mock_all_auths();
    e.ledger().set_sequence_number(100);
    e.ledger().set_timestamp(1_000);
    let manager = Address::generate(&e);
    let owner = Address::generate(&e);
    let treasury = Address::generate(&e);
    let governor = register_with_treasury(&e, &manager, &owner, &treasury, 1, 1_000, 300);

    let targets = vec![&e, Address::generate(&e)];
    let functions = vec![&e, symbol_short!("set_value")];
    let args: Vec<Vec<Val>> = vec![&e, vec![&e, 1_u32.into_val(&e)]];
    let description = String::from_str(&e, "d");
    let desc_hash = BytesN::from_array(&e, &[7u8; 32]);
    let who = Address::generate(&e);
    let not_live: soroban_sdk::Error = common::CommonError::NotLive.into();

    assert_eq!(
        governor
            .try_propose(&targets, &functions, &args, &description, &who)
            .err()
            .unwrap()
            .unwrap(),
        not_live
    );
    assert_eq!(
        governor
            .try_cast_vote(&desc_hash, &1, &description, &who)
            .err()
            .unwrap()
            .unwrap(),
        not_live
    );
    assert_eq!(
        governor
            .try_queue(&targets, &functions, &args, &desc_hash, &0, &who)
            .err()
            .unwrap()
            .unwrap(),
        not_live
    );
    assert_eq!(
        governor
            .try_consume(&targets, &functions, &args, &desc_hash)
            .err()
            .unwrap()
            .unwrap(),
        not_live
    );

    governor.launch(&treasury);
    // Past the NotLive guard; with no voting power the proposer is rejected for a
    // different reason.
    let r = governor.try_propose(&targets, &functions, &args, &description, &who);
    assert_ne!(
        r.err().map(|e| e.ok()),
        Some(Some(not_live)),
        "propose must pass the live guard after launch"
    );
}

#[test]
fn governor_execute_always_fails_with_use_treasury_execute() {
    let (e, _token, _treasury, governor, target, _owner) = setup();
    let targets = vec![&e, target.address.clone()];
    let functions = vec![&e, symbol_short!("set_value")];
    let args = proposal_args(&e);
    let r = governor.try_execute(
        &targets,
        &functions,
        &args,
        &BytesN::from_array(&e, &[1u8; 32]),
        &Address::generate(&e),
    );
    assert_eq!(
        r.err().unwrap().unwrap(),
        CustomGovernorError::UseTreasuryExecute.into()
    );
}

#[test]
fn consume_requires_treasury_auth() {
    let (e, token, treasury, governor, target, owner) = setup();
    let proposer = Address::generate(&e);
    token.mint(&owner, &proposer);
    e.ledger().set_sequence_number(200);
    e.ledger().set_timestamp(2_000);
    let targets = vec![&e, target.address.clone()];
    let functions = vec![&e, symbol_short!("set_value")];
    let args = proposal_args(&e);
    let description = String::from_str(&e, "consume auth");
    let desc_hash = description_hash(&e, &description);
    let proposal_id = governor.propose(&targets, &functions, &args, &description, &proposer);
    e.ledger().set_timestamp(2_301);
    governor.cast_vote(&proposal_id, &1, &String::from_str(&e, "yes"), &proposer);
    e.ledger().set_timestamp(2_601);
    governor.queue(
        &targets, &functions, &args, &desc_hash, &2_901_u32, &proposer,
    );
    e.ledger().set_timestamp(2_901);

    // With real auth, nobody but the Treasury (as invoker) can consume.
    e.set_auths(&[]);
    assert!(governor
        .try_consume(&targets, &functions, &args, &desc_hash)
        .is_err());
    assert_eq!(governor.proposal_state(&proposal_id), ProposalState::Queued);

    // The Treasury path works with no caller auth at all.
    treasury.execute(&targets, &functions, &args, &desc_hash);
    assert_eq!(target.get_value(), 42);
    assert_eq!(
        governor.proposal_state(&proposal_id),
        ProposalState::Executed
    );
}

mod unqueued_expiry {
    use super::*;
    use stellar_governance::governor::GovernorError;

    // vote_end = 2_000 + 300 (delay) + 300 (period) = 2_600.
    const EXPIRY: u64 = 2_600 + 1_209_600;

    #[allow(clippy::type_complexity)]
    fn succeeded(
        vote: bool,
    ) -> (
        Env,
        DaoGovernorContractClient<'static>,
        Vec<Address>,
        Vec<soroban_sdk::Symbol>,
        Vec<Vec<Val>>,
        BytesN<32>,
        BytesN<32>,
        Address,
    ) {
        let (e, token, _treasury, governor, target, owner) = setup();
        let proposer = Address::generate(&e);
        token.mint(&owner, &proposer);
        e.ledger().set_sequence_number(200);
        e.ledger().set_timestamp(2_000);
        let targets = vec![&e, target.address.clone()];
        let functions = vec![&e, symbol_short!("set_value")];
        let args = proposal_args(&e);
        let description = String::from_str(&e, "unqueued");
        let desc_hash = description_hash(&e, &description);
        let id = governor.propose(&targets, &functions, &args, &description, &proposer);
        e.ledger().set_timestamp(2_301);
        if vote {
            governor.cast_vote(&id, &1, &String::from_str(&e, "yes"), &proposer);
        }
        (
            e, governor, targets, functions, args, desc_hash, id, proposer,
        )
    }

    #[test]
    fn queue_just_before_expiry_works() {
        let (e, governor, t, f, a, h, id, p) = succeeded(true);
        e.ledger().set_timestamp(EXPIRY - 1);
        assert_eq!(governor.proposal_state(&id), ProposalState::Succeeded);
        governor.queue(&t, &f, &a, &h, &0, &p);
        assert_eq!(governor.proposal_state(&id), ProposalState::Queued);
    }

    #[test]
    fn queue_at_boundary_and_after_fails_and_state_is_expired() {
        // Boundary choice: `now >= vote_end + 14d` is Expired (same as Queued).
        for now in [EXPIRY, EXPIRY + 1] {
            let (e, governor, t, f, a, h, id, p) = succeeded(true);
            e.ledger().set_timestamp(now);
            assert_eq!(governor.proposal_state(&id), ProposalState::Expired);
            let r = governor.try_queue(&t, &f, &a, &h, &0, &p);
            assert_eq!(
                r.err().unwrap().unwrap(),
                GovernorError::ProposalNotSuccessful.into()
            );
            let r = governor.try_consume(&t, &f, &a, &h);
            assert_eq!(
                r.err().unwrap().unwrap(),
                GovernorError::ProposalNotQueued.into()
            );
        }
    }

    #[test]
    fn defeated_proposal_is_unaffected() {
        let (e, governor, _t, _f, _a, _h, id, _p) = succeeded(false);
        e.ledger().set_timestamp(EXPIRY + 10);
        assert_eq!(governor.proposal_state(&id), ProposalState::Defeated);
    }
}

#[test]
fn state_changing_entrypoint_extends_instance_ttl() {
    use common::testutils::{advance_ledgers, instance_ttl};
    let (e, _token, _treasury, governor, _target, _owner) = setup();
    advance_ledgers(&e, 120 * 17_280);
    let before = instance_ttl(&e, &governor.address);
    governor.set_voting_delay(&600);
    let after = instance_ttl(&e, &governor.address);
    assert!(
        after > before,
        "instance TTL not extended: {before} -> {after}"
    );
}

// ---------------------------------------------------------------------------
// Maximum governance timing (30 days)
// ---------------------------------------------------------------------------

fn register_timing(
    e: &Env,
    voting_delay: u32,
    voting_period: u32,
    queue_delay: u32,
) -> DaoGovernorContractClient<'static> {
    let id = e.register(
        DaoGovernorContract,
        (
            Address::generate(e),
            Address::generate(e),
            Address::generate(e),
            voting_delay,
            voting_period,
            queue_delay,
            1_u128,
            1_000_u32,
            Address::generate(e),
            BytesN::from_array(e, &[0u8; 32]),
        ),
    );
    DaoGovernorContractClient::new(e, &id)
}

#[test]
fn constructor_accepts_exact_max_timing() {
    let e = Env::default();
    let g = register_timing(
        &e,
        crate::MAX_VOTING_DELAY,
        crate::MAX_VOTING_PERIOD,
        crate::MAX_QUEUE_DELAY,
    );
    assert_eq!(g.voting_delay(), 2_592_000);
    assert_eq!(g.voting_period(), 2_592_000);
}

#[test]
#[should_panic(expected = "Error(Contract, #7509)")]
fn constructor_rejects_voting_delay_above_max() {
    let e = Env::default();
    register_timing(&e, crate::MAX_VOTING_DELAY + 1, 300, 300);
}

#[test]
#[should_panic(expected = "Error(Contract, #7510)")]
fn constructor_rejects_voting_period_above_max() {
    let e = Env::default();
    register_timing(&e, 300, crate::MAX_VOTING_PERIOD + 1, 300);
}

#[test]
#[should_panic(expected = "Error(Contract, #7511)")]
fn constructor_rejects_queue_delay_above_max() {
    let e = Env::default();
    register_timing(&e, 300, 300, crate::MAX_QUEUE_DELAY + 1);
}

#[test]
fn setters_accept_exact_max_and_reject_above() {
    let (_e, _token, _treasury, governor, _target, _owner) = setup();

    governor.set_voting_delay(&crate::MAX_VOTING_DELAY);
    governor.set_voting_period(&crate::MAX_VOTING_PERIOD);
    governor.set_queue_delay(&crate::MAX_QUEUE_DELAY);
    assert_eq!(governor.voting_delay(), crate::MAX_VOTING_DELAY);
    assert_eq!(governor.voting_period(), crate::MAX_VOTING_PERIOD);

    assert_eq!(
        governor
            .try_set_voting_delay(&(crate::MAX_VOTING_DELAY + 1))
            .err()
            .unwrap()
            .unwrap(),
        CustomGovernorError::VotingDelayTooLong.into()
    );
    assert_eq!(
        governor
            .try_set_voting_period(&(crate::MAX_VOTING_PERIOD + 1))
            .err()
            .unwrap()
            .unwrap(),
        CustomGovernorError::VotingPeriodTooLong.into()
    );
    assert_eq!(
        governor
            .try_set_queue_delay(&(crate::MAX_QUEUE_DELAY + 1))
            .err()
            .unwrap()
            .unwrap(),
        CustomGovernorError::QueueDelayTooLong.into()
    );
    // Rejected calls leave the stored values untouched.
    assert_eq!(governor.voting_delay(), crate::MAX_VOTING_DELAY);
    assert_eq!(governor.voting_period(), crate::MAX_VOTING_PERIOD);
}

#[test]
fn proposal_with_max_timing_computes_schedule_without_overflow() {
    let (e, token, _treasury, governor, target, owner) = setup();
    governor.set_voting_delay(&crate::MAX_VOTING_DELAY);
    governor.set_voting_period(&crate::MAX_VOTING_PERIOD);
    governor.set_queue_delay(&crate::MAX_QUEUE_DELAY);

    let proposer = Address::generate(&e);
    let _ = token.mint(&owner, &proposer);
    let now = e.ledger().timestamp();
    e.ledger().set_sequence_number(200);

    let targets = vec![&e, target.address.clone()];
    let functions = vec![&e, symbol_short!("set_value")];
    let args = proposal_args(&e);
    let description = String::from_str(&e, "max timing");
    let id = governor.propose(&targets, &functions, &args, &description, &proposer);

    let end = now + u64::from(crate::MAX_VOTING_DELAY) + u64::from(crate::MAX_VOTING_PERIOD);
    assert_eq!(u64::from(governor.proposal_deadline(&id)), end);
    assert_eq!(governor.proposal_state(&id), ProposalState::Pending);

    // Vote at the start, queue after the end: eta = now + max queue delay.
    e.ledger()
        .set_timestamp(now + u64::from(crate::MAX_VOTING_DELAY) + 1);
    governor.cast_vote(&id, &1, &String::from_str(&e, "yes"), &proposer);
    e.ledger().set_timestamp(end + 1);
    let hash = description_hash(&e, &description);
    governor.queue(&targets, &functions, &args, &hash, &0_u32, &proposer);
    assert_eq!(governor.proposal_state(&id), ProposalState::Queued);
}

mod proposal_views_and_events {
    use super::*;
    use crate::events::ProposalScheduled;
    use soroban_sdk::{testutils::Events as _, Event as _};

    #[test]
    fn proposal_proposer_returns_the_proposer() {
        let (e, token, _treasury, governor, target, owner) = setup();
        let proposer = Address::generate(&e);
        token.mint(&owner, &proposer);
        e.ledger().set_sequence_number(200);
        e.ledger().set_timestamp(2_000);
        let id = governor.propose(
            &vec![&e, target.address.clone()],
            &vec![&e, symbol_short!("set_value")],
            &proposal_args(&e),
            &String::from_str(&e, "who proposed"),
            &proposer,
        );
        assert_eq!(governor.proposal_proposer(&id), proposer);
        assert_eq!(
            governor
                .try_proposal_proposer(&BytesN::from_array(&e, &[7u8; 32]))
                .err()
                .unwrap()
                .unwrap(),
            stellar_governance::governor::GovernorError::ProposalNotFound.into()
        );
    }

    #[test]
    fn propose_emits_proposal_scheduled_with_window_and_quorum() {
        let (e, token, _treasury, governor, target, owner) = setup();
        let proposer = Address::generate(&e);
        for _ in 0..3 {
            token.mint(&owner, &proposer);
        }
        e.ledger().set_sequence_number(200);
        e.ledger().set_timestamp(2_000);
        let id = governor.propose(
            &vec![&e, target.address.clone()],
            &vec![&e, symbol_short!("set_value")],
            &proposal_args(&e),
            &String::from_str(&e, "scheduled"),
            &proposer,
        );
        // setup(): voting delay 300, voting period 300, quorum 10% of 3 votes -> 1.
        assert_eq!(
            e.events().all().events().last().unwrap(),
            &ProposalScheduled {
                proposal_id: id.clone(),
                vote_start: 2_300,
                vote_end: 2_600,
                snapshot_ledger: 199,
                quorum_votes: 1,
            }
            .to_xdr(&e, &governor.address)
        );
    }
}

/// Unsold auction tokens accumulating in the Treasury must not raise quorum:
/// the token excludes Treasury-held tokens from the voting supply.
#[test]
fn treasury_held_tokens_never_raise_quorum() {
    let e = Env::default();
    e.mock_all_auths();
    e.ledger().set_sequence_number(100);
    e.ledger().set_timestamp(1_000);
    let owner = Address::generate(&e);
    let governor_id = Address::generate(&e);
    let treasury_id = e.register(
        DaoTreasuryContract,
        (
            owner.clone(),
            governor_id.clone(),
            Address::generate(&e),
            BytesN::from_array(&e, &[0u8; 32]),
        ),
    );
    let token_id = e.register(
        DaoTokenContract,
        (
            owner.clone(),
            treasury_id.clone(),
            String::from_str(&e, "DAO Vote NFT"),
            String::from_str(&e, "vDAO"),
            Address::generate(&e),
            Address::generate(&e),
            BytesN::from_array(&e, &[0u8; 32]),
            common::modules::TokenSettings::default(),
        ),
    );
    let token = DaoTokenContractClient::new(&e, &token_id);
    e.register_at(
        &governor_id,
        DaoGovernorContract,
        (
            owner.clone(),
            token_id.clone(),
            treasury_id.clone(),
            300_u32,
            300_u32,
            300_u32,
            1_u128,
            5_000_u32, // 50% quorum
            Address::generate(&e),
            BytesN::from_array(&e, &[0u8; 32]),
        ),
    );
    let governor = DaoGovernorContractClient::new(&e, &governor_id);
    governor.launch(&treasury_id);
    let voter = Address::generate(&e);

    // 2 circulating votes, 40 unsold tokens in the treasury.
    token.batch_mint(
        &owner,
        &vec![&e, voter.clone(), treasury_id.clone()],
        &vec![&e, 2u128, 18u128],
    );
    token.batch_mint(&owner, &vec![&e, treasury_id.clone()], &vec![&e, 20u128]);
    e.ledger().set_sequence_number(200);
    e.ledger().set_timestamp(2_000);
    // 50% of the 2 voting-capable tokens, not of 40.
    assert_eq!(governor.quorum(&199), 1);

    let id = governor.propose(
        &vec![&e, Address::generate(&e)],
        &vec![&e, symbol_short!("set_value")],
        &proposal_args(&e),
        &String::from_str(&e, "still reachable"),
        &voter,
    );
    e.ledger().set_timestamp(2_301);
    governor.cast_vote(&id, &1, &String::from_str(&e, "yes"), &voter);
    e.ledger().set_timestamp(2_601);
    assert_eq!(governor.proposal_state(&id), ProposalState::Succeeded);
}

mod comments {
    use super::*;
    use crate::events::ProposalCommented;
    use soroban_sdk::{testutils::Events as _, Event as _};
    use std::string::String as StdString;

    fn proposal(
        e: &Env,
        token: &DaoTokenContractClient,
        governor: &DaoGovernorContractClient,
        target: &TargetContractClient,
        owner: &Address,
    ) -> BytesN<32> {
        let proposer = Address::generate(e);
        for _ in 0..3 {
            token.mint(owner, &proposer);
        }
        e.ledger().set_sequence_number(200);
        governor.propose(
            &vec![e, target.address.clone()],
            &vec![e, symbol_short!("set_value")],
            &proposal_args(e),
            &String::from_str(e, "comments"),
            &proposer,
        )
    }

    fn text(e: &Env, len: u32) -> String {
        String::from_str(e, &"a".repeat(len as usize))
    }

    #[test]
    fn comment_emits_event_and_needs_author_auth() {
        let (e, token, _treasury, governor, target, owner) = setup();
        let id = proposal(&e, &token, &governor, &target, &owner);
        let author = Address::generate(&e);
        let body = text(&e, common::MAX_PROPOSAL_COMMENT_LENGTH);
        governor.comment(&id, &body, &author);
        assert_eq!(
            e.events().all().events().last().unwrap(),
            &ProposalCommented {
                proposal_id: id.clone(),
                author: author.clone(),
                body,
            }
            .to_xdr(&e, &governor.address)
        );
        assert_eq!(
            e.auths()[0].0,
            author,
            "the author must authorize the comment"
        );
    }

    #[test]
    #[should_panic(expected = "HostError: Error(Contract, #7515)")]
    fn comment_over_cap_fails() {
        let (e, token, _treasury, governor, target, owner) = setup();
        let id = proposal(&e, &token, &governor, &target, &owner);
        let body = text(&e, common::MAX_PROPOSAL_COMMENT_LENGTH + 1);
        governor.comment(&id, &body, &Address::generate(&e));
    }

    #[test]
    #[should_panic(expected = "HostError: Error(Contract, #7514)")]
    fn empty_comment_fails() {
        let (e, token, _treasury, governor, target, owner) = setup();
        let id = proposal(&e, &token, &governor, &target, &owner);
        governor.comment(&id, &String::from_str(&e, ""), &Address::generate(&e));
    }

    #[test]
    #[should_panic(expected = "HostError: Error(Contract, #5000)")]
    fn comment_on_unknown_proposal_fails() {
        let (e, _token, _treasury, governor, _target, _owner) = setup();
        governor.comment(
            &BytesN::from_array(&e, &[7; 32]),
            &String::from_str(&e, "hello"),
            &Address::generate(&e),
        );
    }

    #[test]
    #[should_panic(expected = "HostError: Error(Auth, InvalidAction)")]
    fn comment_requires_author_auth() {
        let (e, token, _treasury, governor, target, owner) = setup();
        let id = proposal(&e, &token, &governor, &target, &owner);
        e.set_auths(&[]);
        governor.comment(&id, &String::from_str(&e, "hi"), &Address::generate(&e));
    }

    #[test]
    #[should_panic(expected = "HostError: Error(Contract, #7515)")]
    fn vote_reason_over_cap_fails() {
        let (e, token, _treasury, governor, target, owner) = setup();
        let id = proposal(&e, &token, &governor, &target, &owner);
        e.ledger().set_timestamp(1_000 + 301);
        let reason: StdString = "a".repeat(common::MAX_PROPOSAL_COMMENT_LENGTH as usize + 1);
        governor.cast_vote(&id, &1, &String::from_str(&e, &reason), &owner);
    }
}

/// docs/STORAGE_DIET.md D26: no governor key may encode like a
/// `common` or OpenZeppelin key the contract links.
#[test]
fn storage_keys_do_not_collide() {
    use common::testutils::{assert_keys_disjoint, common_key_shapes, key_shape};
    #[allow(unused_imports)]
    use soroban_sdk::{testutils::Address as _, Address, Env, IntoVal, Val};
    let e = Env::default();
    let _a = Address::generate(&e);
    let id = soroban_sdk::BytesN::from_array(&e, &[0u8; 32]);
    use stellar_governance::governor::storage::GovernorStorageKey;
    let all = |keys: std::vec::Vec<Val>| -> std::vec::Vec<(std::string::String, u32)> {
        keys.into_iter().map(|k| key_shape(&e, k)).collect()
    };
    // Every variant, checked exhaustively next to the enum.
    let module = all(crate::storage::key_samples::all(&e));
    assert_keys_disjoint(&[
        ("GovernorKey", module),
        ("common", common_key_shapes(&e)),
        (
            "GovernorStorageKey",
            all(std::vec![
                GovernorStorageKey::Name.into_val(&e),
                GovernorStorageKey::Version.into_val(&e),
                GovernorStorageKey::VotingDelay.into_val(&e),
                GovernorStorageKey::VotingPeriod.into_val(&e),
                GovernorStorageKey::ProposalThreshold.into_val(&e),
                GovernorStorageKey::Proposal(id.clone()).into_val(&e),
                GovernorStorageKey::NumQuorumCheckpoints.into_val(&e),
                GovernorStorageKey::QuorumCheckpoint(0).into_val(&e),
                GovernorStorageKey::ProposalVote(id.clone()).into_val(&e),
                GovernorStorageKey::HasVoted(id.clone(), _a.clone()).into_val(&e),
                GovernorStorageKey::TokenContract.into_val(&e),
            ]),
        ),
    ]);
}

// ============================================================================
// Proposal list from chain state (docs/STORAGE_DIET.md D10)
// ============================================================================

/// Propose `n` distinct proposals from one voter; returns their ids.
fn propose_n(
    e: &Env,
    token: &DaoTokenContractClient,
    governor: &DaoGovernorContractClient,
    target: &TargetContractClient,
    owner: &Address,
    n: u32,
) -> std::vec::Vec<BytesN<32>> {
    let proposer = Address::generate(e);
    token.mint(owner, &proposer);
    e.ledger().set_sequence_number(e.ledger().sequence() + 10);
    (0..n)
        .map(|i| {
            let description = String::from_str(e, &std::format!("proposal {i}"));
            governor.propose(
                &vec![e, target.address.clone()],
                &vec![e, symbol_short!("set_value")],
                &proposal_args(e),
                &description,
                &proposer,
            )
        })
        .collect()
}

#[test]
fn proposals_are_listed_in_creation_order_from_chain_state() {
    let (e, token, _treasury, governor, target, owner) = setup();
    assert_eq!(governor.proposal_count(), 0);
    assert_eq!(governor.proposal_ids(&0, &10).len(), 0);

    let ids = propose_n(&e, &token, &governor, &target, &owner, 3);
    assert_eq!(governor.proposal_count(), 3);
    let listed = governor.proposal_ids(&0, &10);
    assert_eq!(listed.len(), 3);
    for (i, id) in ids.iter().enumerate() {
        assert_eq!(listed.get(i as u32).unwrap(), *id);
        let info = governor.proposal(id);
        assert_eq!(info.id, *id);
        assert_eq!(info.seq, i as u32);
        assert_eq!(info.state, ProposalState::Pending);
        assert_eq!(info.eta, 0);
        assert!(info.vote_end > info.vote_start);
    }
    // Pages: an offset, a short tail and a start past the end.
    assert_eq!(governor.proposal_ids(&1, &1), vec![&e, ids[1].clone()]);
    assert_eq!(governor.proposal_ids(&2, &10), vec![&e, ids[2].clone()]);
    assert_eq!(governor.proposal_ids(&5, &10).len(), 0);
    assert_eq!(governor.proposal_ids(&u32::MAX, &u32::MAX).len(), 0);
}

#[test]
fn proposal_ids_pages_are_capped() {
    let (e, token, _treasury, governor, target, owner) = setup();
    e.cost_estimate().budget().reset_unlimited();
    let n = crate::MAX_PROPOSAL_IDS_PAGE + 2;
    let ids = propose_n(&e, &token, &governor, &target, &owner, n);
    let page = governor.proposal_ids(&0, &u32::MAX);
    assert_eq!(page.len(), crate::MAX_PROPOSAL_IDS_PAGE);
    let rest = governor.proposal_ids(&crate::MAX_PROPOSAL_IDS_PAGE, &u32::MAX);
    assert_eq!(rest, vec![&e, ids[50].clone(), ids[51].clone()]);
}

#[test]
fn proposal_of_an_unknown_id_is_not_found() {
    let (e, _token, _treasury, governor, _target, _owner) = setup();
    assert!(governor
        .try_proposal(&BytesN::from_array(&e, &[7u8; 32]))
        .is_err());
}

/// The id entry renews with the proposal core on every lifecycle touch.
#[test]
fn proposal_id_entry_renews_with_the_core() {
    use soroban_sdk::testutils::storage::Persistent as _;
    let (e, token, _treasury, governor, target, owner) = setup();
    let id = propose_n(&e, &token, &governor, &target, &owner, 1).remove(0);
    let ttl_of = |key: crate::storage::GovernorKey| {
        e.as_contract(&governor.address, || {
            e.storage().persistent().get_ttl(&common::ns(&e, key))
        })
    };
    let fresh = ttl_of(crate::storage::GovernorKey::ProposalId(0));
    assert!(fresh >= crate::storage::PROPOSAL_TTL_EXTEND_TO - 1);
    // Age past the renewal threshold, then touch the proposal.
    let age = crate::storage::PROPOSAL_TTL_EXTEND_TO - crate::storage::PROPOSAL_TTL_THRESHOLD + 1;
    e.ledger().with_mut(|l| l.sequence_number += age);
    governor.proposal_state(&id);
    assert_eq!(
        ttl_of(crate::storage::GovernorKey::ProposalId(0)),
        crate::storage::PROPOSAL_TTL_EXTEND_TO
    );
    assert_eq!(
        ttl_of(crate::storage::GovernorKey::ProposalTime(id.clone())),
        crate::storage::PROPOSAL_TTL_EXTEND_TO
    );
}

/// docs/designs/membership-models.md, Success Criteria (vote tally
/// lifetime): after a proposal's first and only vote, the OpenZeppelin tally
/// lives as long as the proposal does, not the network's minimum, so `queue`
/// after a full 30-day voting period finds it without a restore.
#[test]
fn the_vote_tally_lives_as_long_as_the_proposal() {
    use soroban_sdk::testutils::storage::Persistent as _;
    let (e, token, _treasury, governor, target, owner) = setup();
    let proposer = Address::generate(&e);
    token.mint(&owner, &proposer);
    e.ledger().set_sequence_number(200);
    e.ledger().set_timestamp(2_000);
    let id = governor.propose(
        &vec![&e, target.address.clone()],
        &vec![&e, symbol_short!("set_value")],
        &proposal_args(&e),
        &String::from_str(&e, "One early vote"),
        &proposer,
    );
    e.ledger().set_timestamp(2_301);
    governor.cast_vote(&id, &1, &String::from_str(&e, "yes"), &proposer);
    let tally_ttl = e.as_contract(&governor.address, || {
        e.storage().persistent().get_ttl(
            &stellar_governance::governor::storage::GovernorStorageKey::ProposalVote(id.clone()),
        )
    });
    assert!(tally_ttl >= crate::storage::PROPOSAL_TTL_EXTEND_TO - 1);
    // Longer than the longest voting period plus the longest queue delay.
    assert!(tally_ttl > 2 * 30 * common::ttl::DAY_IN_LEDGERS);
}

/// D38: a proposal is stored as `(proposer, 49 packed bytes)`, and every
/// field survives the round trip through each lifecycle write.
#[test]
fn stored_proposals_are_packed_and_round_trip() {
    use crate::storage::{GovernorKey, StoredProposal, PACKED_PROPOSAL_LEN};
    let (e, token, _treasury, governor, target, owner) = setup();
    let ids = propose_n(&e, &token, &governor, &target, &owner, 1);
    let id = ids[0].clone();
    let raw = |id: &soroban_sdk::BytesN<32>| -> StoredProposal {
        e.as_contract(&governor.address, || {
            e.storage()
                .persistent()
                .get(&common::ns(&e, GovernorKey::ProposalTime(id.clone())))
                .unwrap()
        })
    };
    let stored = raw(&id);
    assert_eq!(stored.1.len() as usize, PACKED_PROPOSAL_LEN);
    let info = governor.proposal(&id);
    assert_eq!(stored.0, info.proposer);
    assert_eq!(info.state, ProposalState::Pending);
    // Big-endian fields where the packer put them.
    let mut buf = [0u8; PACKED_PROPOSAL_LEN];
    stored.1.copy_into_slice(&mut buf);
    assert_eq!(
        u32::from_be_bytes(buf[0..4].try_into().unwrap()),
        info.vote_snapshot
    );
    assert_eq!(
        u64::from_be_bytes(buf[4..12].try_into().unwrap()),
        info.vote_start
    );
    assert_eq!(
        u64::from_be_bytes(buf[12..20].try_into().unwrap()),
        info.vote_end
    );
    assert_eq!(buf[28], 0);
    assert_eq!(u32::from_be_bytes(buf[29..33].try_into().unwrap()), 0);
    assert_eq!(
        u128::from_be_bytes(buf[33..49].try_into().unwrap()),
        info.quorum
    );
    assert_eq!(info.eta, 0);
}

/// D38: every `ProposalState` discriminant survives packing; an OpenZeppelin
/// reorder would be caught here before it corrupted stored states.
#[test]
fn every_proposal_state_code_round_trips() {
    use crate::storage::{ProposalCoreTime, PACKED_PROPOSAL_LEN};
    let e = Env::default();
    let proposer = Address::generate(&e);
    let states = [
        (ProposalState::Pending, 0u8),
        (ProposalState::Active, 1),
        (ProposalState::Defeated, 2),
        (ProposalState::Canceled, 3),
        (ProposalState::Succeeded, 4),
        (ProposalState::Queued, 5),
        (ProposalState::Expired, 6),
        (ProposalState::Executed, 7),
    ];
    for (state, code) in states {
        let core = ProposalCoreTime {
            proposer: proposer.clone(),
            vote_snapshot: 1,
            vote_start: 2,
            vote_end: 3,
            eta: 4,
            state,
            seq: 5,
            quorum: 6,
        };
        let stored = core.pack(&e);
        let mut buf = [0u8; PACKED_PROPOSAL_LEN];
        stored.1.copy_into_slice(&mut buf);
        assert_eq!(buf[28], code);
        assert_eq!(ProposalCoreTime::unpack(&e, &stored).state, state);
    }
}

// ---------------------------------------------------------------------------
// Vote source adapters (docs/designs/governance-adapter.md)
// ---------------------------------------------------------------------------

use vote_adapter_mock::{VoteAdapterMock, VoteAdapterMockClient};

/// A launched Governor whose vote source is the mock adapter.
fn setup_with_adapter() -> (
    Env,
    VoteAdapterMockClient<'static>,
    DaoTreasuryContractClient<'static>,
    DaoGovernorContractClient<'static>,
    TargetContractClient<'static>,
) {
    let e = Env::default();
    e.mock_all_auths();
    e.ledger().set_sequence_number(100);
    e.ledger().set_timestamp(1_000);

    let owner = Address::generate(&e);
    let adapter_id = e.register(VoteAdapterMock, (owner.clone(), 0u32));
    let adapter = VoteAdapterMockClient::new(&e, &adapter_id);

    let governor_id = Address::generate(&e);
    let treasury_id = e.register(
        DaoTreasuryContract,
        (
            owner.clone(),
            governor_id.clone(),
            Address::generate(&e),
            BytesN::from_array(&e, &[0u8; 32]),
        ),
    );
    let treasury = DaoTreasuryContractClient::new(&e, &treasury_id);
    e.register_at(
        &governor_id,
        DaoGovernorContract,
        (
            owner.clone(),
            adapter_id.clone(),
            treasury_id.clone(),
            300_u32,
            300_u32,
            300_u32,
            1_u128,
            5_000_u32, // 50% quorum
            Address::generate(&e),
            BytesN::from_array(&e, &[0u8; 32]),
        ),
    );
    let governor = DaoGovernorContractClient::new(&e, &governor_id);
    let target = TargetContractClient::new(&e, &e.register(TargetContract, ()));
    governor.launch(&treasury_id);
    treasury.launch(&treasury_id);
    (e, adapter, treasury, governor, target)
}

fn next_ledger(e: &Env, seconds: u64) {
    e.ledger().set_sequence_number(e.ledger().sequence() + 1);
    e.ledger().set_timestamp(e.ledger().timestamp() + seconds);
}

#[test]
fn vote_source_defaults_to_the_token() {
    let (_e, token, _treasury, governor, _target, _owner) = setup();
    assert_eq!(governor.vote_source(), token.address);
}

#[test]
fn adapter_weights_drive_propose_vote_quorum_and_execution() {
    let (e, adapter, treasury, governor, target) = setup_with_adapter();
    let alice = Address::generate(&e);
    let bob = Address::generate(&e);
    let carol = Address::generate(&e);
    adapter.set_votes(&alice, &30);
    adapter.set_votes(&bob, &50);
    adapter.set_votes(&carol, &20);
    next_ledger(&e, 5);
    assert_eq!(governor.vote_source(), adapter.address);

    let targets = vec![&e, target.address.clone()];
    let functions = vec![&e, symbol_short!("set_value")];
    let args = proposal_args(&e);
    let description = String::from_str(&e, "Adapter proposal");
    let id = governor.propose(&targets, &functions, &args, &description, &alice);

    // Quorum fixed at proposal time from the adapter's previous-ledger supply.
    let info = governor.proposal(&id);
    assert_eq!(info.quorum, 50); // ceil(100 * 50%)
    assert_eq!(info.quorum, governor.quorum(&info.vote_snapshot));

    // Weights changed after the snapshot don't count.
    adapter.set_votes(&carol, &1_000);
    e.ledger().set_timestamp(e.ledger().timestamp() + 301);
    next_ledger(&e, 0);
    governor.cast_vote(&id, &1, &String::from_str(&e, ""), &bob);
    governor.cast_vote(&id, &0, &String::from_str(&e, ""), &carol);
    e.ledger().set_timestamp(e.ledger().timestamp() + 301);
    next_ledger(&e, 0);
    assert_eq!(governor.proposal_state(&id), ProposalState::Succeeded);

    let desc_hash = e.crypto().keccak256(&description.to_bytes()).to_bytes();
    governor.queue(&targets, &functions, &args, &desc_hash, &0, &alice);
    e.ledger().set_timestamp(e.ledger().timestamp() + 301);
    treasury.execute(&targets, &functions, &args, &desc_hash);
    assert_eq!(target.get_value(), 42);
}

#[test]
fn adapter_quorum_matches_the_snapshot_when_weights_change_in_the_proposing_ledger() {
    let (e, adapter, _treasury, governor, target) = setup_with_adapter();
    let alice = Address::generate(&e);
    adapter.set_votes(&alice, &10);
    next_ledger(&e, 5);
    // Raised in the proposing ledger: neither quorum nor weight sees it.
    adapter.set_votes(&Address::generate(&e), &90);
    let id = governor.propose(
        &vec![&e, target.address.clone()],
        &vec![&e, symbol_short!("set_value")],
        &proposal_args(&e),
        &String::from_str(&e, "Same-ledger change"),
        &alice,
    );
    let info = governor.proposal(&id);
    assert_eq!(info.quorum, 5);
    next_ledger(&e, 0);
    assert_eq!(info.quorum, governor.quorum(&info.vote_snapshot));
}

#[test]
fn account_without_adapter_weight_cannot_propose_or_vote() {
    let (e, adapter, _treasury, governor, target) = setup_with_adapter();
    let alice = Address::generate(&e);
    let nobody = Address::generate(&e);
    adapter.set_votes(&alice, &10);
    next_ledger(&e, 5);
    let targets = vec![&e, target.address.clone()];
    let functions = vec![&e, symbol_short!("set_value")];
    assert!(governor
        .try_propose(
            &targets,
            &functions,
            &proposal_args(&e),
            &String::from_str(&e, "No weight"),
            &nobody,
        )
        .is_err());
    let id = governor.propose(
        &targets,
        &functions,
        &proposal_args(&e),
        &String::from_str(&e, "Weighted"),
        &alice,
    );
    e.ledger().set_timestamp(e.ledger().timestamp() + 301);
    next_ledger(&e, 0);
    assert_eq!(
        governor.try_cast_vote(&id, &1, &String::from_str(&e, ""), &nobody),
        Err(Ok(CustomGovernorError::ZeroVotingWeight.into()))
    );
}

#[test]
fn proposal_threshold_is_checked_against_the_adapter_supply() {
    let (e, adapter, treasury, governor, _target) = setup_with_adapter();
    adapter.set_votes(&Address::generate(&e), &10);
    // The admin is the Treasury once live; mock_all_auths covers it.
    let _ = treasury;
    assert_eq!(
        governor.try_set_proposal_threshold(&11),
        Err(Ok(CustomGovernorError::InvalidProposalThreshold.into()))
    );
    governor.set_proposal_threshold(&10);
}

// ============================================================================
// Proposal lifetime, refused actions, the storage-layout gate, and vote and
// cancel errors
// ============================================================================

mod hardening {
    use super::*;
    use crate::storage::{GovernorKey, PROPOSAL_TTL_EXTEND_TO};
    use soroban_sdk::{testutils::storage::Persistent as _, Symbol};
    use stellar_governance::governor::GovernorError;

    /// Testnet's entry TTL limits (2026-10-12), so TTLs behave as on chain.
    fn network_ttls(e: &Env) {
        e.ledger().with_mut(|l| {
            l.max_entry_ttl = 3_110_400;
            l.min_persistent_entry_ttl = 120_960;
        });
    }

    /// Moves the clock by `seconds` and the ledger by the ledgers that close
    /// in that time at `ledger_ms` milliseconds per ledger.
    /// ... and archives the Governor's expired entries.
    fn elapse(e: &Env, governor: &Address, seconds: u64, ledger_ms: u64) {
        e.ledger().with_mut(|l| {
            l.timestamp += seconds;
            l.sequence_number += (seconds * 1_000 / ledger_ms) as u32;
        });
        archive_expired(e, governor);
    }

    /// Deletes every persistent or temporary entry of `contract` whose TTL
    /// has run out. The test host does not archive; on the network a call
    /// that reads an archived entry fails, and here the read finds nothing,
    /// so a proposal that archived fails `ProposalNotFound`. Only the
    /// Governor's entries are archived: the Token's votes are renewed by the
    /// DAO's sweep, and the proposal must not depend on that.
    fn archive_expired(e: &Env, contract: &Address) {
        use soroban_sdk::xdr::{ContractDataDurability, LedgerKey, ScVal};
        use soroban_sdk::TryFromVal;
        let now = e.ledger().sequence();
        for (key, (_, live_until)) in e.to_ledger_snapshot().ledger_entries.iter() {
            let (Some(live_until), LedgerKey::ContractData(d)) = (live_until, key.as_ref()) else {
                continue;
            };
            if *live_until >= now
                || d.contract != soroban_sdk::xdr::ScAddress::from(contract)
                || d.key == ScVal::LedgerKeyContractInstance
                || matches!(d.key, ScVal::LedgerKeyNonce(_))
            {
                continue;
            }
            let owner = Address::try_from_val(e, &ScVal::Address(d.contract.clone())).unwrap();
            let k = Val::try_from_val(e, &d.key).unwrap();
            e.as_contract(&owner, || match d.durability {
                ContractDataDurability::Persistent => e.storage().persistent().remove(&k),
                ContractDataDurability::Temporary => e.storage().temporary().remove(&k),
            });
        }
    }

    fn proposal_ttl(e: &Env, governor: &DaoGovernorContractClient, key: GovernorKey) -> u32 {
        e.as_contract(&governor.address, || {
            e.storage().persistent().get_ttl(&common::ns(e, key))
        })
    }

    fn set_stored_layout(e: &Env, contract: &Address, version: u32) {
        e.as_contract(contract, || {
            e.storage().instance().set(
                &common::ns(e, common::upgrade::UpgradeKey::StorageVersion),
                &version,
            );
        });
    }

    /// Runs a proposal with the longest timings through its whole lifecycle,
    /// touching it only to propose, vote once, queue at the last moment and
    /// execute at the last moment, with ledgers closing every `ledger_ms`.
    fn run_longest_lifecycle(ledger_ms: u64) {
        let (e, token, treasury, governor, target, owner) = setup();
        network_ttls(&e);
        governor.set_voting_delay(&crate::MAX_VOTING_DELAY);
        governor.set_voting_period(&crate::MAX_VOTING_PERIOD);
        governor.set_queue_delay(&crate::MAX_QUEUE_DELAY);
        // The target's instance lives as long as any real contract's would.
        e.as_contract(&target.address, || {
            e.storage().instance().extend_ttl(1, 3_000_000)
        });
        let proposer = Address::generate(&e);
        token.mint(&owner, &proposer);
        elapse(&e, &governor.address, 10, ledger_ms);

        let targets = vec![&e, target.address.clone()];
        let functions = vec![&e, symbol_short!("set_value")];
        let args = proposal_args(&e);
        let description = String::from_str(&e, "Longest lifecycle");
        let hash = description_hash(&e, &description);
        let id = governor.propose(&targets, &functions, &args, &description, &proposer);

        elapse(
            &e,
            &governor.address,
            crate::MAX_VOTING_DELAY as u64,
            ledger_ms,
        );
        governor.cast_vote(&id, &1, &String::from_str(&e, "yes"), &proposer);
        // The last second the Succeeded proposal can still be queued.
        elapse(
            &e,
            &governor.address,
            crate::MAX_VOTING_PERIOD as u64 + crate::storage::PROPOSAL_EXPIRATION_PERIOD - 1,
            ledger_ms,
        );
        governor.queue(&targets, &functions, &args, &hash, &0, &proposer);
        // The last second of the execution window.
        elapse(
            &e,
            &governor.address,
            crate::MAX_QUEUE_DELAY as u64 + crate::storage::PROPOSAL_EXPIRATION_PERIOD - 1,
            ledger_ms,
        );
        treasury.execute(&targets, &functions, &args, &hash);
        assert_eq!(target.get_value(), 42);
        assert_eq!(governor.proposal_state(&id), ProposalState::Executed);
    }

    /// A proposal at the 118-day maximum lifetime (30-day voting delay,
    /// voting period and queue delay, queued and executed at the last
    /// second) is still live at execution, at the nominal 5-second ledgers
    /// and when ledgers close 10% faster. With only the TTL from `propose`,
    /// the faster ledgers archive it two weeks before it can execute.
    #[test]
    fn a_proposal_lives_through_its_maximum_lifetime() {
        assert_eq!(crate::MAX_PROPOSAL_LIFETIME, 118 * 86_400);
        run_longest_lifecycle(5_000);
        run_longest_lifecycle(4_500);
    }

    /// `queue` renews the proposal and its id entry to the full TTL, even
    /// when the TTL left from `propose` is above the renewal threshold.
    #[test]
    fn queue_renews_the_proposal_for_the_rest_of_its_life() {
        let (e, token, _treasury, governor, target, owner) = setup();
        network_ttls(&e);
        governor.set_voting_delay(&crate::MAX_VOTING_DELAY);
        governor.set_voting_period(&crate::MAX_VOTING_PERIOD);
        let proposer = Address::generate(&e);
        token.mint(&owner, &proposer);
        elapse(&e, &governor.address, 10, 5_000);
        let targets = vec![&e, target.address.clone()];
        let functions = vec![&e, symbol_short!("set_value")];
        let args = proposal_args(&e);
        let description = String::from_str(&e, "Renewed at queue");
        let hash = description_hash(&e, &description);
        let id = governor.propose(&targets, &functions, &args, &description, &proposer);
        elapse(&e, &governor.address, crate::MAX_VOTING_DELAY as u64, 5_000);
        governor.cast_vote(&id, &1, &String::from_str(&e, ""), &proposer);
        elapse(
            &e,
            &governor.address,
            crate::MAX_VOTING_PERIOD as u64 + crate::storage::PROPOSAL_EXPIRATION_PERIOD - 1,
            5_000,
        );
        // 74 days in: about 46 days of TTL left, above the 30-day threshold.
        let left = proposal_ttl(&e, &governor, GovernorKey::ProposalTime(id.clone()));
        assert!(left > crate::storage::PROPOSAL_TTL_THRESHOLD, "{left}");
        governor.queue(&targets, &functions, &args, &hash, &0, &proposer);
        assert_eq!(
            proposal_ttl(&e, &governor, GovernorKey::ProposalTime(id.clone())),
            PROPOSAL_TTL_EXTEND_TO
        );
        assert_eq!(
            proposal_ttl(&e, &governor, GovernorKey::ProposalId(0)),
            PROPOSAL_TTL_EXTEND_TO
        );
    }

    fn consume_args(e: &Env, target: &Address) -> Vec<Val> {
        vec![
            e,
            vec![e, target.clone()].into_val(e),
            vec![e, symbol_short!("set_value")].into_val(e),
            proposal_args(e).into_val(e),
            BytesN::from_array(e, &[9u8; 32]).into_val(e),
        ]
    }

    /// An action aimed at the Governor's own `consume` is refused at
    /// `propose`, alone or after other actions.
    #[test]
    fn propose_refuses_an_action_that_calls_consume() {
        let (e, token, _treasury, governor, target, owner) = setup();
        let proposer = Address::generate(&e);
        token.mint(&owner, &proposer);
        e.ledger().set_sequence_number(200);
        let consume = Symbol::new(&e, "consume");
        let cases = [
            (
                vec![&e, governor.address.clone()],
                vec![&e, consume.clone()],
                vec![&e, consume_args(&e, &target.address)],
            ),
            (
                vec![&e, target.address.clone(), governor.address.clone()],
                vec![&e, symbol_short!("set_value"), consume.clone()],
                vec![
                    &e,
                    vec![&e, 1u32.into_val(&e)],
                    consume_args(&e, &target.address),
                ],
            ),
        ];
        for (targets, functions, args) in cases {
            let r = governor.try_propose(
                &targets,
                &functions,
                &args,
                &String::from_str(&e, "consume another"),
                &proposer,
            );
            assert_eq!(
                r.err().unwrap().unwrap(),
                CustomGovernorError::CannotConsume.into()
            );
        }
        assert_eq!(governor.proposal_count(), 0);
        // A function named `consume` on another contract is an ordinary action.
        governor.propose(
            &vec![&e, target.address.clone()],
            &vec![&e, consume],
            &vec![&e, Vec::<Val>::new(&e)],
            &String::from_str(&e, "consume elsewhere"),
            &proposer,
        );
        assert_eq!(governor.proposal_count(), 1);
    }

    fn batch_mint_args(e: &Env, minter: &Address, recipients: u32, each: u32) -> Vec<Val> {
        let mut to = Vec::new(e);
        let mut amounts = Vec::new(e);
        for _ in 0..recipients {
            to.push_back(Address::generate(e));
            amounts.push_back(each as u128);
        }
        vec![
            e,
            minter.clone().into_val(e),
            to.into_val(e),
            amounts.into_val(e),
        ]
    }

    fn try_propose_calls(
        e: &Env,
        governor: &DaoGovernorContractClient,
        proposer: &Address,
        target: &Address,
        calls: &[(&str, Vec<Val>)],
        description: &str,
    ) -> Result<(), soroban_sdk::Error> {
        let mut targets = Vec::new(e);
        let mut functions = Vec::new(e);
        let mut args = Vec::new(e);
        for (function, call_args) in calls {
            targets.push_back(target.clone());
            functions.push_back(Symbol::new(e, function));
            args.push_back(call_args.clone());
        }
        match governor.try_propose(
            &targets,
            &functions,
            &args,
            &String::from_str(e, description),
            proposer,
        ) {
            Ok(_) => Ok(()),
            Err(err) => Err(err.unwrap()),
        }
    }

    /// Mints that each fit the Token's per-call budget but could not publish
    /// their events together in one `treasury.execute` are refused at
    /// `propose`; the largest accepted shapes are accepted.
    #[test]
    fn propose_refuses_mints_that_cannot_execute_together() {
        let (e, token, treasury, governor, _target, owner) = setup();
        let proposer = Address::generate(&e);
        token.mint(&owner, &proposer);
        e.ledger().set_sequence_number(200);
        let minter = treasury.address.clone();
        let t = token.address.clone();
        let max = common::MAX_BATCH_MINT;
        let too_large: soroban_sdk::Error = CustomGovernorError::MintsTooLarge.into();
        let mint = || {
            vec![
                &e,
                minter.clone().into_val(&e),
                Address::generate(&e).into_val(&e),
            ]
        };
        let other = || ("set_value", vec![&e, 1u32.into_val(&e)]);

        // Refused: two near-maximum batches, a maximum batch beside three
        // other actions, eleven single mints, six mints among 20 actions.
        let two_max = [
            ("batch_mint", batch_mint_args(&e, &minter, 1, max)),
            ("batch_mint", batch_mint_args(&e, &minter, 1, max - 1)),
        ];
        let mut max_and_three = std::vec![("batch_mint", batch_mint_args(&e, &minter, 1, max))];
        max_and_three.extend((0..3).map(|_| other()));
        let eleven: std::vec::Vec<_> = (0..11).map(|_| ("mint", mint())).collect();
        let mut six_of_twenty: std::vec::Vec<_> = (0..6).map(|_| ("mint", mint())).collect();
        six_of_twenty.extend((0..14).map(|_| other()));
        for (i, calls) in [two_max.to_vec(), max_and_three, eleven, six_of_twenty]
            .iter()
            .enumerate()
        {
            assert_eq!(
                try_propose_calls(&e, &governor, &proposer, &t, calls, &std::format!("no {i}")),
                Err(too_large),
                "case {i}"
            );
        }

        // Accepted: one maximum batch beside two other actions, two batches
        // of 21, ten single mints, five mints among 20 actions, one batch to
        // the most recipients.
        let mut max_and_two = std::vec![("batch_mint", batch_mint_args(&e, &minter, 1, max))];
        max_and_two.extend((0..2).map(|_| other()));
        let two_21 = std::vec![
            ("batch_mint", batch_mint_args(&e, &minter, 1, 21)),
            ("batch_mint", batch_mint_args(&e, &minter, 1, 21)),
        ];
        let ten: std::vec::Vec<_> = (0..10).map(|_| ("mint", mint())).collect();
        let mut five_of_twenty: std::vec::Vec<_> = (0..5).map(|_| ("mint", mint())).collect();
        five_of_twenty.extend((0..15).map(|_| other()));
        let widest = std::vec![(
            "batch_mint",
            batch_mint_args(&e, &minter, common::MAX_BATCH_RECIPIENTS, 1)
        )];
        for (i, calls) in [max_and_two, two_21, ten, five_of_twenty, widest]
            .iter()
            .enumerate()
        {
            assert_eq!(
                try_propose_calls(&e, &governor, &proposer, &t, calls, &std::format!("ok {i}")),
                Ok(()),
                "case {i}"
            );
        }
    }

    /// Only calls shaped like the Token's mints are counted: twenty
    /// Stellar Asset Contract `mint(to, amount)` actions, or `batch_mint`
    /// actions with other arguments, are ordinary actions.
    #[test]
    fn other_mint_shapes_are_not_counted() {
        let (e, token, _treasury, governor, target, owner) = setup();
        let proposer = Address::generate(&e);
        token.mint(&owner, &proposer);
        e.ledger().set_sequence_number(200);
        let sac_mint: std::vec::Vec<_> = (0..20)
            .map(|_| {
                (
                    "mint",
                    vec![&e, Address::generate(&e).into_val(&e), 5i128.into_val(&e)],
                )
            })
            .collect();
        assert_eq!(
            try_propose_calls(&e, &governor, &proposer, &target.address, &sac_mint, "sac"),
            Ok(())
        );
        let odd_batches: std::vec::Vec<_> = (0..20)
            .map(|_| ("batch_mint", vec![&e, 43u32.into_val(&e)]))
            .collect();
        assert_eq!(
            try_propose_calls(
                &e,
                &governor,
                &proposer,
                &target.address,
                &odd_batches,
                "odd"
            ),
            Ok(())
        );
    }

    /// While the stored layout is behind the code's (a skipped migration),
    /// the Governor refuses every proposal entry point; anyone can run the
    /// migration, with no authorization, and proposals work again.
    #[test]
    fn a_skipped_migration_halts_proposals_until_anyone_migrates() {
        let (e, token, treasury, governor, target, owner) = setup();
        let proposer = Address::generate(&e);
        token.mint(&owner, &proposer);
        e.ledger().set_sequence_number(200);
        e.ledger().set_timestamp(2_000);
        let targets = vec![&e, target.address.clone()];
        let functions = vec![&e, symbol_short!("set_value")];
        let args = proposal_args(&e);
        let description = String::from_str(&e, "before the upgrade");
        let hash = description_hash(&e, &description);
        let id = governor.propose(&targets, &functions, &args, &description, &proposer);

        set_stored_layout(&e, &governor.address, crate::STORAGE_VERSION - 1);
        let mismatch: soroban_sdk::Error = CustomGovernorError::StorageVersionMismatch.into();
        let reason = String::from_str(&e, "");
        e.ledger().set_timestamp(2_301);
        assert_eq!(
            governor
                .try_cast_vote(&id, &1, &reason, &proposer)
                .err()
                .unwrap()
                .unwrap(),
            mismatch
        );
        assert_eq!(
            governor
                .try_propose(
                    &targets,
                    &functions,
                    &args,
                    &String::from_str(&e, "new"),
                    &proposer
                )
                .err()
                .unwrap()
                .unwrap(),
            mismatch
        );
        assert_eq!(
            governor.try_proposal_state(&id).err().unwrap().unwrap(),
            mismatch
        );
        assert_eq!(
            governor.try_set_quorum_bps(&500).err().unwrap().unwrap(),
            mismatch
        );
        assert_eq!(
            governor
                .try_cancel(&targets, &functions, &args, &hash, &proposer)
                .err()
                .unwrap()
                .unwrap(),
            mismatch
        );
        // The upgrade views still answer.
        assert_eq!(governor.storage_version(), crate::STORAGE_VERSION - 1);
        assert_eq!(governor.wasm_hash(), BytesN::from_array(&e, &[0u8; 32]));

        // No authorization at all: anyone completes the migration.
        e.set_auths(&[]);
        governor.migrate();
        assert_eq!(governor.storage_version(), crate::STORAGE_VERSION);
        e.mock_all_auths();
        governor.cast_vote(&id, &1, &reason, &proposer);
        e.ledger().set_timestamp(2_601);
        governor.queue(&targets, &functions, &args, &hash, &0, &proposer);
        e.ledger().set_timestamp(2_901);
        treasury.execute(&targets, &functions, &args, &hash);
        assert_eq!(target.get_value(), 42);
    }

    /// Code older than the stored layout (an upgrade to an earlier release)
    /// refuses to run, and `migrate` cannot move the layout backwards.
    #[test]
    fn code_older_than_the_layout_refuses_to_run() {
        let (e, token, _treasury, governor, target, owner) = setup();
        let proposer = Address::generate(&e);
        token.mint(&owner, &proposer);
        e.ledger().set_sequence_number(200);
        set_stored_layout(&e, &governor.address, crate::STORAGE_VERSION + 1);
        assert_eq!(
            governor
                .try_propose(
                    &vec![&e, target.address.clone()],
                    &vec![&e, symbol_short!("set_value")],
                    &proposal_args(&e),
                    &String::from_str(&e, "newer layout"),
                    &proposer,
                )
                .err()
                .unwrap()
                .unwrap(),
            CustomGovernorError::StorageVersionMismatch.into()
        );
        assert_eq!(
            governor.try_migrate().err().unwrap().unwrap(),
            common::CommonError::NothingToMigrate.into()
        );
        assert_eq!(governor.storage_version(), crate::STORAGE_VERSION + 1);
    }

    /// A proposal Active for voting, with one For vote cast by the proposer,
    /// and a second holder (`voter`) who has not voted.
    fn active_with_vote() -> (
        Env,
        DaoGovernorContractClient<'static>,
        BytesN<32>,
        Address,
        Address,
    ) {
        let (e, token, _treasury, governor, target, owner) = setup();
        let proposer = Address::generate(&e);
        let voter = Address::generate(&e);
        token.mint(&owner, &proposer);
        token.mint(&owner, &voter);
        e.ledger().set_sequence_number(200);
        e.ledger().set_timestamp(2_000);
        let id = governor.propose(
            &vec![&e, target.address.clone()],
            &vec![&e, symbol_short!("set_value")],
            &proposal_args(&e),
            &String::from_str(&e, "vote errors"),
            &proposer,
        );
        e.ledger().set_timestamp(2_301);
        governor.cast_vote(&id, &1, &String::from_str(&e, ""), &proposer);
        (e, governor, id, proposer, voter)
    }

    /// A second vote by the same voter fails `AlreadyVoted` (5016), whatever
    /// its type, and the tally keeps only the first.
    #[test]
    fn a_second_vote_fails_already_voted() {
        let (e, governor, id, proposer, _voter) = active_with_vote();
        for vote_type in [0u32, 1, 2] {
            let r = governor.try_cast_vote(&id, &vote_type, &String::from_str(&e, ""), &proposer);
            assert_eq!(
                r.err().unwrap().unwrap(),
                GovernorError::AlreadyVoted.into()
            );
        }
        let counts = e.as_contract(&governor.address, || {
            stellar_governance::governor::get_proposal_vote_counts(&e, &id)
        });
        assert_eq!(
            (counts.for_votes, counts.against_votes, counts.abstain_votes),
            (1, 0, 0)
        );
    }

    /// A vote type other than 0 (Against), 1 (For) or 2 (Abstain) fails
    /// `InvalidVoteType` (5017) and records nothing.
    #[test]
    fn an_unknown_vote_type_fails_invalid_vote_type() {
        let (e, governor, id, _proposer, voter) = active_with_vote();
        for vote_type in [3u32, 4, u32::MAX] {
            let r = governor.try_cast_vote(&id, &vote_type, &String::from_str(&e, ""), &voter);
            assert_eq!(
                r.err().unwrap().unwrap(),
                GovernorError::InvalidVoteType.into()
            );
        }
        assert!(!governor.has_voted(&id, &voter));
        // The same voter can still cast a valid vote.
        governor.cast_vote(&id, &0, &String::from_str(&e, ""), &voter);
        assert!(governor.has_voted(&id, &voter));
    }

    /// Only the proposer can cancel. Another account fails
    /// `ProposalNotCancellable` (5009) even with its own authorization, and
    /// the proposal is unchanged.
    #[test]
    fn only_the_proposer_can_cancel() {
        let (e, token, _treasury, governor, target, owner) = setup();
        let proposer = Address::generate(&e);
        let other = Address::generate(&e);
        token.mint(&owner, &proposer);
        token.mint(&owner, &other);
        e.ledger().set_sequence_number(200);
        let targets = vec![&e, target.address.clone()];
        let functions = vec![&e, symbol_short!("set_value")];
        let args = proposal_args(&e);
        let description = String::from_str(&e, "cancel by another");
        let hash = description_hash(&e, &description);
        let id = governor.propose(&targets, &functions, &args, &description, &proposer);

        // `other` authorizes its own call and still cannot cancel.
        e.mock_auths(&[MockAuth {
            address: &other,
            invoke: &MockAuthInvoke {
                contract: &governor.address,
                fn_name: "cancel",
                args: (
                    targets.clone(),
                    functions.clone(),
                    args.clone(),
                    hash.clone(),
                    other.clone(),
                )
                    .into_val(&e),
                sub_invokes: &[],
            },
        }]);
        let r = governor.try_cancel(&targets, &functions, &args, &hash, &other);
        assert_eq!(
            r.err().unwrap().unwrap(),
            GovernorError::ProposalNotCancellable.into()
        );
        assert_eq!(governor.proposal_state(&id), ProposalState::Pending);

        // The proposer can.
        e.mock_all_auths();
        governor.cancel(&targets, &functions, &args, &hash, &proposer);
        assert_eq!(governor.proposal_state(&id), ProposalState::Canceled);
    }
}
