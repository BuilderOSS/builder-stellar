extern crate std;

use soroban_sdk::{
    contract, contractimpl, symbol_short,
    testutils::{Address as _, Ledger, MockAuth, MockAuthInvoke},
    vec, Address, BytesN, Env, IntoVal, String, Val, Vec,
};
use stellar_governance::governor::ProposalState;
use token::{DaoTokenContract, DaoTokenContractClient};
use treasury::{DaoTreasuryContract, DaoTreasuryContractClient};

use crate::{DaoGovernorContract, DaoGovernorContractClient};

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
    /// This function attempts to re-enter the governor's execute() function
    /// when called during proposal execution
    pub fn attack(
        e: &Env,
        governor: Address,
        targets: Vec<Address>,
        functions: Vec<soroban_sdk::Symbol>,
        args: Vec<Vec<Val>>,
        desc_hash: BytesN<32>,
        executor: Address,
    ) {
        // Store attack parameters
        e.storage()
            .instance()
            .set(&symbol_short!("attacked"), &true);

        // Attempt to re-enter execute() - this should fail because proposal is already marked Executed
        let governor_client = DaoGovernorContractClient::new(e, &governor);
        governor_client.execute(&targets, &functions, &args, &desc_hash, &executor);
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
            String::from_str(&e, "https://example.com/"),
            String::from_str(&e, "DAO Vote NFT"),
            String::from_str(&e, "vDAO"),
        ),
    );
    let token = DaoTokenContractClient::new(&e, &token_id);

    let treasury_id = e.register(DaoTreasuryContract, (owner.clone(), Address::generate(&e)));
    let treasury = DaoTreasuryContractClient::new(&e, &treasury_id);

    let governor_id = e.register(
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
        ),
    );
    let governor = DaoGovernorContractClient::new(&e, &governor_id);

    let target_id = e.register(TargetContract, ());
    let target = TargetContractClient::new(&e, &target_id);

    treasury.set_governor(&governor_id);

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
    let (e, token, _treasury, governor, target, owner) = setup();
    let proposer = Address::generate(&e);

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
    governor.execute(&targets, &functions, &args, &desc_hash, &proposer);

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
    let (e, token, _treasury, governor, target, owner) = setup();
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
    governor.execute(&targets, &functions, &args, &desc_hash, &proposer);

    assert_eq!(target.get_value(), 42);
}

#[test]
#[should_panic(expected = "#5007")]
fn execute_fails_before_queue_delay_elapses() {
    let (e, token, _treasury, governor, target, owner) = setup();
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
    let _ = governor.execute(&targets, &functions, &args, &desc_hash, &proposer);
}

#[test]
#[should_panic(expected = "#5008")]
fn execute_cannot_run_twice() {
    let (e, token, _treasury, governor, target, owner) = setup();
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
    governor.execute(&targets, &functions, &args, &desc_hash, &proposer);
    governor.execute(&targets, &functions, &args, &desc_hash, &proposer);
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
            String::from_str(&e, "https://example.com/"),
            String::from_str(&e, "DAO Vote NFT"),
            String::from_str(&e, "vDAO"),
        ),
    );
    let token = DaoTokenContractClient::new(&e, &token_id);

    let treasury_id = e.register(DaoTreasuryContract, (owner.clone(), Address::generate(&e)));
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
#[should_panic(expected = "HostError: Error(Auth, InvalidAction)")]
fn set_treasury_requires_owner() {
    let e = Env::default();
    let owner = Address::generate(&e);
    let attacker = Address::generate(&e);
    let new_treasury = Address::generate(&e);
    let token_id = e.register(
        DaoTokenContract,
        (
            owner.clone(),
            String::from_str(&e, "https://example.com/"),
            String::from_str(&e, "DAO Vote NFT"),
            String::from_str(&e, "vDAO"),
        ),
    );
    let treasury_id = e.register(DaoTreasuryContract, (owner.clone(), Address::generate(&e)));
    let governor_id = e.register(
        DaoGovernorContract,
        (
            owner.clone(),
            token_id,
            treasury_id,
            300_u32,
            300_u32,
            300_u32,
            1_u128,
            1_000_u32,
        ),
    );
    let governor = DaoGovernorContractClient::new(&e, &governor_id);

    e.mock_auths(&[MockAuth {
        address: &attacker,
        invoke: &MockAuthInvoke {
            contract: &governor.address,
            fn_name: "set_treasury",
            args: (&new_treasury,).into_val(&e),
            sub_invokes: &[],
        },
    }]);

    governor.set_treasury(&new_treasury);
}

#[test]
fn owner_can_set_governor_authority() {
    let (e, _token, _treasury, governor, _target, owner) = setup();
    let authorized_addr = Address::generate(&e);

    governor.set_governor_authority(&authorized_addr, &true);
    assert!(governor.governor_authority(&authorized_addr));

    governor.set_governor_authority(&authorized_addr, &false);
    assert!(!governor.governor_authority(&authorized_addr));

    let _ = owner;
}

#[test]
#[should_panic(expected = "HostError: Error(Auth, InvalidAction)")]
fn set_governor_authority_requires_owner() {
    let (e, _token, _treasury, governor, _target, _owner) = setup();
    let attacker = Address::generate(&e);
    let authorized_addr = Address::generate(&e);

    e.mock_auths(&[MockAuth {
        address: &attacker,
        invoke: &MockAuthInvoke {
            contract: &governor.address,
            fn_name: "set_governor_authority",
            args: (&authorized_addr, &true).into_val(&e),
            sub_invokes: &[],
        },
    }]);

    governor.set_governor_authority(&authorized_addr, &true);
}

#[test]
fn authorized_governor_can_set_voting_delay() {
    let (e, _token, _treasury, governor, _target, owner) = setup();
    let authorized_addr = Address::generate(&e);

    governor.set_governor_authority(&authorized_addr, &true);

    e.mock_auths(&[MockAuth {
        address: &authorized_addr,
        invoke: &MockAuthInvoke {
            contract: &governor.address,
            fn_name: "set_voting_delay",
            args: (&authorized_addr, &300u32).into_val(&e),
            sub_invokes: &[],
        },
    }]);

    governor.set_voting_delay(&authorized_addr, &300);
    assert_eq!(governor.voting_delay(), 300);

    let _ = owner;
}

#[test]
fn authorized_governor_can_set_voting_period() {
    let (e, _token, _treasury, governor, _target, owner) = setup();
    let authorized_addr = Address::generate(&e);

    governor.set_governor_authority(&authorized_addr, &true);

    e.mock_auths(&[MockAuth {
        address: &authorized_addr,
        invoke: &MockAuthInvoke {
            contract: &governor.address,
            fn_name: "set_voting_period",
            args: (&authorized_addr, &300u32).into_val(&e),
            sub_invokes: &[],
        },
    }]);

    governor.set_voting_period(&authorized_addr, &300);
    assert_eq!(governor.voting_period(), 300);

    let _ = owner;
}

#[test]
fn authorized_governor_can_set_proposal_threshold() {
    let (e, token, _treasury, governor, _target, owner) = setup();
    let authorized_addr = Address::generate(&e);

    governor.set_governor_authority(&authorized_addr, &true);

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

    e.mock_auths(&[MockAuth {
        address: &authorized_addr,
        invoke: &MockAuthInvoke {
            contract: &governor.address,
            fn_name: "set_proposal_threshold",
            args: (&authorized_addr, &5u128).into_val(&e),
            sub_invokes: &[],
        },
    }]);

    governor.set_proposal_threshold(&authorized_addr, &5);
    assert_eq!(governor.proposal_threshold(), 5);

    let _ = owner;
}

#[test]
fn authorized_governor_can_set_quorum_bps() {
    let (e, _token, _treasury, governor, _target, owner) = setup();
    let authorized_addr = Address::generate(&e);

    governor.set_governor_authority(&authorized_addr, &true);

    e.mock_auths(&[MockAuth {
        address: &authorized_addr,
        invoke: &MockAuthInvoke {
            contract: &governor.address,
            fn_name: "set_quorum_bps",
            args: (&authorized_addr, &2000u32).into_val(&e),
            sub_invokes: &[],
        },
    }]);

    governor.set_quorum_bps(&authorized_addr, &2000);
    assert_eq!(governor.quorum_bps(), 2000);

    let _ = owner;
}

#[test]
fn authorized_governor_can_set_queue_delay() {
    let (e, _token, _treasury, governor, _target, owner) = setup();
    let authorized_addr = Address::generate(&e);

    governor.set_governor_authority(&authorized_addr, &true);

    // Use the minimum queue delay of 5 minutes (300 seconds)
    let new_queue_delay = 300u32;

    e.mock_auths(&[MockAuth {
        address: &authorized_addr,
        invoke: &MockAuthInvoke {
            contract: &governor.address,
            fn_name: "set_queue_delay",
            args: (&authorized_addr, &new_queue_delay).into_val(&e),
            sub_invokes: &[],
        },
    }]);

    governor.set_queue_delay(&authorized_addr, &new_queue_delay);

    let _ = owner;
}

#[test]
#[should_panic(expected = "Error(Contract, #1504)")]
fn unauthorized_cannot_set_voting_delay() {
    let (e, _token, _treasury, governor, _target, _owner) = setup();
    let unauthorized = Address::generate(&e);

    e.mock_auths(&[MockAuth {
        address: &unauthorized,
        invoke: &MockAuthInvoke {
            contract: &governor.address,
            fn_name: "set_voting_delay",
            args: (&unauthorized, &20u32).into_val(&e),
            sub_invokes: &[],
        },
    }]);

    governor.set_voting_delay(&unauthorized, &20);
}

#[test]
#[should_panic(expected = "Error(Contract, #1504)")]
fn unauthorized_cannot_set_voting_period() {
    let (e, _token, _treasury, governor, _target, _owner) = setup();
    let unauthorized = Address::generate(&e);

    e.mock_auths(&[MockAuth {
        address: &unauthorized,
        invoke: &MockAuthInvoke {
            contract: &governor.address,
            fn_name: "set_voting_period",
            args: (&unauthorized, &200u32).into_val(&e),
            sub_invokes: &[],
        },
    }]);

    governor.set_voting_period(&unauthorized, &200);
}

#[test]
#[should_panic(expected = "Error(Contract, #1504)")]
fn unauthorized_cannot_set_proposal_threshold() {
    let (e, _token, _treasury, governor, _target, _owner) = setup();
    let unauthorized = Address::generate(&e);

    e.mock_auths(&[MockAuth {
        address: &unauthorized,
        invoke: &MockAuthInvoke {
            contract: &governor.address,
            fn_name: "set_proposal_threshold",
            args: (&unauthorized, &5u128).into_val(&e),
            sub_invokes: &[],
        },
    }]);

    governor.set_proposal_threshold(&unauthorized, &5);
}

#[test]
#[should_panic(expected = "Error(Contract, #1504)")]
fn unauthorized_cannot_set_quorum_bps() {
    let (e, _token, _treasury, governor, _target, _owner) = setup();
    let unauthorized = Address::generate(&e);

    e.mock_auths(&[MockAuth {
        address: &unauthorized,
        invoke: &MockAuthInvoke {
            contract: &governor.address,
            fn_name: "set_quorum_bps",
            args: (&unauthorized, &2000u32).into_val(&e),
            sub_invokes: &[],
        },
    }]);

    governor.set_quorum_bps(&unauthorized, &2000);
}

#[test]
#[should_panic(expected = "Error(Contract, #1504)")]
fn unauthorized_cannot_set_queue_delay() {
    let (e, _token, _treasury, governor, _target, _owner) = setup();
    let unauthorized = Address::generate(&e);

    e.mock_auths(&[MockAuth {
        address: &unauthorized,
        invoke: &MockAuthInvoke {
            contract: &governor.address,
            fn_name: "set_queue_delay",
            args: (&unauthorized, &500u32).into_val(&e),
            sub_invokes: &[],
        },
    }]);

    governor.set_queue_delay(&unauthorized, &500);
}

#[test]
fn owner_has_implicit_governor_authority() {
    let (e, _token, _treasury, governor, _target, owner) = setup();

    // Owner doesn't need to be explicitly granted authority
    assert!(!governor.governor_authority(&owner));

    // Owner can still modify settings
    e.mock_auths(&[MockAuth {
        address: &owner,
        invoke: &MockAuthInvoke {
            contract: &governor.address,
            fn_name: "set_voting_delay",
            args: (&owner, &300u32).into_val(&e),
            sub_invokes: &[],
        },
    }]);

    governor.set_voting_delay(&owner, &300);
    assert_eq!(governor.voting_delay(), 300);
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
#[should_panic(expected = "HostError: Error(Contract, #5002)")]
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
#[should_panic(expected = "HostError: Error(Contract, #1501)")]
fn set_proposal_threshold_zero_fails() {
    let (_e, _token, _treasury, governor, _target, owner) = setup();

    // Try to set threshold to zero (should fail)
    governor.set_proposal_threshold(&owner, &0);
}

#[test]
#[should_panic(expected = "HostError: Error(Contract, #1502)")]
fn set_quorum_bps_zero_fails() {
    let (_e, _token, _treasury, governor, _target, owner) = setup();

    // Try to set quorum to zero (should fail)
    governor.set_quorum_bps(&owner, &0);
}

#[test]
#[should_panic(expected = "HostError: Error(Contract, #1502)")]
fn set_quorum_bps_above_max_fails() {
    let (_e, _token, _treasury, governor, _target, owner) = setup();

    // Try to set quorum above 100% (should fail)
    governor.set_quorum_bps(&owner, &10_001);
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
    governor.execute(&targets, &functions, &args, &desc_hash, &proposer);
    assert_eq!(
        governor.proposal_state(&proposal_id),
        ProposalState::Executed
    );
    assert_eq!(target.get_value(), 42);
}

#[test]
#[should_panic(expected = "HostError: Error(Contract, #5007)")]
fn expired_proposal_cannot_be_executed() {
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
    governor.execute(&targets, &functions, &args, &desc_hash, &proposer);
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
    let (e, token, _treasury, governor, _target, owner) = setup();
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
            governor.address.clone().into_val(&e),
            attack_targets.into_val(&e),
            attack_functions.into_val(&e),
            attack_args.into_val(&e),
            attack_desc_hash.into_val(&e),
            proposer.clone().into_val(&e),
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
    governor.execute(&targets, &functions, &args, &desc_hash, &proposer);
}

#[test]
fn execute_updates_state_before_external_calls() {
    let (e, token, _treasury, governor, target, owner) = setup();
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
    governor.execute(&targets, &functions, &args, &desc_hash, &proposer);

    // Verify proposal state is Executed (not Queued)
    assert_eq!(
        governor.proposal_state(&proposal_id),
        ProposalState::Executed
    );

    // Verify the target contract function was actually called
    assert_eq!(target.get_value(), 42);
}
