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

/// docs/STORAGE_DIET_REVIEW.md Finding 1: no governor key may encode like a
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

/// Review S6 (docs/designs/membership-models.md Next Steps 10): after a
/// proposal's first and only vote, the OpenZeppelin tally lives as long as
/// the proposal does, not the network's minimum, so `queue` after a full
/// 30-day voting period finds it without a restore.
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
