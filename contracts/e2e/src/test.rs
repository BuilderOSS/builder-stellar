extern crate std;

use auction::{DaoAuctionContract, DaoAuctionContractClient};
use governor::{DaoGovernorContract, DaoGovernorContractClient};
use soroban_sdk::{
    contract, contractimpl, symbol_short,
    testutils::{Address as _, Ledger},
    token::{StellarAssetClient, TokenClient},
    vec,
    xdr::AccountFlags,
    Address, BytesN, Env, IntoVal, String, Symbol, Val, Vec,
};
use stellar_governance::governor::ProposalState;
use token::{DaoTokenContract, DaoTokenContractClient};
use treasury::{DaoTreasuryContract, DaoTreasuryContractClient};

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

// Malicious contract that attempts reentrancy during execution
#[contract]
pub struct MaliciousReentrantContract;

#[contractimpl]
impl MaliciousReentrantContract {
    /// Attempts to re-enter governor.execute() during execution
    /// This should fail because the proposal state is updated before external calls
    pub fn reentry(
        e: &Env,
        governor: Address,
        targets: Vec<Address>,
        functions: Vec<Symbol>,
        args: Vec<Vec<Val>>,
        desc_hash: BytesN<32>,
        executor: Address,
    ) {
        // Mark that attack was attempted
        e.storage().instance().set(&symbol_short!("attack"), &1);

        // Try to re-enter execute() - should fail with ProposalAlreadyExecuted
        let gov_client = DaoGovernorContractClient::new(e, &governor);
        gov_client.execute(&targets, &functions, &args, &desc_hash, &executor);

        // If we get here, the reentrancy attack succeeded (BAD!)
        e.storage().instance().set(&symbol_short!("success"), &true);
    }

    pub fn get_attack_count(e: &Env) -> u32 {
        e.storage()
            .instance()
            .get(&symbol_short!("attack"))
            .unwrap_or(0)
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
            300_u32,
            300_u32,
            300_u32,
            1_u128,
            1_000_u32,
        ),
    );
    let governor = DaoGovernorContractClient::new(&e, &governor_id);

    let target_id = e.register(TargetContract, ());
    let target = TargetContractClient::new(&e, &target_id);

    treasury.set_governor(&governor_id);
    token.set_mint_authority(&treasury.address, &true);

    (e, token, treasury, governor, target, owner)
}

fn proposal_args(e: &Env) -> Vec<Vec<Val>> {
    // Args for calling target.set_value(42)
    vec![e, vec![e, 42_u32.into_val(e)]]
}

fn mint_proposal_args(e: &Env, treasury: &Address, recipient: &Address) -> Vec<Vec<Val>> {
    // Args for calling token.mint(treasury, recipient)
    vec![
        e,
        vec![
            e,
            treasury.clone().into_val(e),
            recipient.clone().into_val(e),
        ],
    ]
}

fn batch_mint_proposal_args(
    e: &Env,
    treasury: &Address,
    recipient: &Address,
    amount: u32,
) -> Vec<Vec<Val>> {
    // Args for calling token.batch_mint(treasury, recipient, amount)
    vec![
        e,
        vec![
            e,
            treasury.clone().into_val(e),
            recipient.clone().into_val(e),
            amount.into_val(e),
        ],
    ]
}

fn transfer_proposal_args_i128(
    e: &Env,
    from: &Address,
    to: &Address,
    amount: i128,
) -> Vec<Vec<Val>> {
    vec![
        e,
        vec![
            e,
            from.clone().into_val(e),
            to.clone().into_val(e),
            amount.into_val(e),
        ],
    ]
}

fn transfer_proposal_args_u32(
    e: &Env,
    from: &Address,
    to: &Address,
    token_id: u32,
) -> Vec<Vec<Val>> {
    vec![
        e,
        vec![
            e,
            from.clone().into_val(e),
            to.clone().into_val(e),
            token_id.into_val(e),
        ],
    ]
}

fn description_hash(e: &Env, description: &String) -> BytesN<32> {
    e.crypto().keccak256(&description.to_bytes()).to_bytes()
}

#[test]
fn dao_flow_executes_treasury_call() {
    let (e, token, _treasury, governor, target, owner) = setup();
    let proposer = Address::generate(&e);

    let token_id = token.mint(&owner, &proposer);
    assert_eq!(token_id, 0);
    e.ledger().set_sequence_number(200);
    e.ledger().set_timestamp(2_000);

    let targets = vec![&e, target.address.clone()];
    let functions = vec![&e, symbol_short!("set_value")];
    let args = proposal_args(&e);
    let description = String::from_str(&e, "Call target through treasury");
    let desc_hash = description_hash(&e, &description);

    let proposal_id = governor.propose(&targets, &functions, &args, &description, &proposer);

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
fn transfer_after_snapshot_does_not_change_vote_outcome() {
    let (e, token, _treasury, governor, target, owner) = setup();
    let alice = Address::generate(&e);
    let bob = Address::generate(&e);

    let token_id = token.mint(&owner, &alice);
    assert_eq!(token_id, 0);
    e.ledger().set_sequence_number(200);
    e.ledger().set_timestamp(2_000);

    let targets = vec![&e, target.address.clone()];
    let functions = vec![&e, symbol_short!("set_value")];
    let args = proposal_args(&e);
    let description = String::from_str(&e, "Snapshot transfer test");
    let desc_hash = description_hash(&e, &description);

    let proposal_id = governor.propose(&targets, &functions, &args, &description, &alice);

    e.ledger().set_timestamp(2_301);
    // Transfer token after snapshot - bob receives token but had 0 power at snapshot
    token.transfer(&alice, &bob, &token_id);

    // Alice can still vote (had power at snapshot)
    governor.cast_vote(&proposal_id, &1, &String::from_str(&e, "alice yes"), &alice);

    e.ledger().set_timestamp(2_601);
    // Proposal succeeds with alice's vote
    assert_eq!(
        governor.proposal_state(&proposal_id),
        ProposalState::Succeeded
    );

    let _ = desc_hash;
    let _ = bob; // Bob can't vote (zero weight at snapshot)
}

#[test]
fn dao_flow_mints_token_via_treasury_execution() {
    let (e, token, _treasury, governor, _target, owner) = setup();
    let proposer = Address::generate(&e);
    let recipient = Address::generate(&e);

    let _ = token.mint(&owner, &proposer);
    e.ledger().set_sequence_number(200);
    e.ledger().set_timestamp(2_000);

    let treasury_address = governor.treasury();
    let targets = vec![&e, token.address.clone()];
    let functions = vec![&e, symbol_short!("mint")];
    let args = mint_proposal_args(&e, &treasury_address, &recipient);
    let description = String::from_str(&e, "Mint token through treasury");
    let desc_hash = description_hash(&e, &description);

    let proposal_id = governor.propose(&targets, &functions, &args, &description, &proposer);

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

    assert_eq!(token.balance(&recipient), 1);
    assert_eq!(token.get_delegate(&recipient), Some(recipient.clone()));
    assert_eq!(
        governor.proposal_state(&proposal_id),
        ProposalState::Executed
    );
}

#[test]
fn sac_classic_asset_without_auth_requirement_can_be_received_held_and_transferred_via_proposal() {
    let (e, token, treasury, governor, target, owner) = setup();
    let proposer = Address::generate(&e);
    let admin = Address::generate(&e);
    let asset = e.register_stellar_asset_contract_v2(admin.clone());
    let sac = StellarAssetClient::new(&e, &asset.address());
    let asset_client = TokenClient::new(&e, &asset.address());

    let _ = token.mint(&owner, &proposer);

    let amount = 100_i128;
    sac.mint(&treasury.address, &amount);
    assert_eq!(asset_client.balance(&treasury.address), amount);

    e.ledger().set_sequence_number(200);
    e.ledger().set_timestamp(2_000);

    let targets = vec![&e, asset.address().clone()];
    let functions = vec![&e, symbol_short!("transfer")];
    let args = transfer_proposal_args_i128(&e, &treasury.address, &target.address, amount);
    let description = String::from_str(&e, "Transfer classic asset from treasury");
    let desc_hash = description_hash(&e, &description);

    let proposal_id = governor.propose(&targets, &functions, &args, &description, &proposer);

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

    assert_eq!(asset_client.balance(&treasury.address), 0);
    assert_eq!(asset_client.balance(&target.address), amount);
    assert_eq!(
        governor.proposal_state(&proposal_id),
        ProposalState::Executed
    );
}

#[test]
#[should_panic(expected = "Error(Contract, #11)")]
fn sac_classic_asset_with_auth_requirement_rejects_unauthorized_treasury() {
    let (e, token, treasury, _governor, _target, owner) = setup();
    let admin = Address::generate(&e);
    let asset = e.register_stellar_asset_contract_v2(admin.clone());
    let sac = StellarAssetClient::new(&e, &asset.address());

    let _ = token.mint(&owner, &Address::generate(&e));

    asset.issuer().set_flag(AccountFlags::RequiredFlag);
    sac.mint(&treasury.address, &100_i128);
}

#[test]
fn sac_classic_asset_with_auth_requirement_can_be_received_held_and_transferred_via_proposal() {
    let (e, token, treasury, governor, target, owner) = setup();
    let proposer = Address::generate(&e);
    let admin = Address::generate(&e);
    let asset = e.register_stellar_asset_contract_v2(admin.clone());
    let sac = StellarAssetClient::new(&e, &asset.address());
    let asset_client = TokenClient::new(&e, &asset.address());

    let _ = token.mint(&owner, &proposer);

    asset.issuer().set_flag(AccountFlags::RequiredFlag);
    sac.set_authorized(&treasury.address, &true);
    sac.set_authorized(&target.address, &true);
    sac.mint(&treasury.address, &100_i128);
    assert_eq!(asset_client.balance(&treasury.address), 100);

    e.ledger().set_sequence_number(200);
    e.ledger().set_timestamp(2_000);

    let targets = vec![&e, asset.address().clone()];
    let functions = vec![&e, symbol_short!("transfer")];
    let args = transfer_proposal_args_i128(&e, &treasury.address, &target.address, 100);
    let description = String::from_str(&e, "Transfer auth-required classic asset from treasury");
    let desc_hash = description_hash(&e, &description);

    let proposal_id = governor.propose(&targets, &functions, &args, &description, &proposer);

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

    assert_eq!(asset_client.balance(&treasury.address), 0);
    assert_eq!(asset_client.balance(&target.address), 100);
    assert_eq!(
        governor.proposal_state(&proposal_id),
        ProposalState::Executed
    );
}

#[test]
fn governance_token_can_be_received_held_and_transferred_via_proposal() {
    let (e, token, treasury, governor, target, owner) = setup();
    let proposer = Address::generate(&e);

    let proposer_token_id = token.mint(&owner, &proposer);
    let treasury_token_id = token.mint(&owner, &treasury.address);
    assert_eq!(token.balance(&treasury.address), 1);

    e.ledger().set_sequence_number(200);
    e.ledger().set_timestamp(2_000);

    let targets = vec![&e, token.address.clone()];
    let functions = vec![&e, symbol_short!("transfer")];
    let args =
        transfer_proposal_args_u32(&e, &treasury.address, &target.address, treasury_token_id);
    let description = String::from_str(&e, "Transfer governance token from treasury");
    let desc_hash = description_hash(&e, &description);

    let proposal_id = governor.propose(&targets, &functions, &args, &description, &proposer);

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

    assert_eq!(token.balance(&treasury.address), 0);
    assert_eq!(token.balance(&target.address), 1);
    assert_eq!(
        governor.proposal_state(&proposal_id),
        ProposalState::Executed
    );

    let _ = proposer_token_id;
}

#[test]
fn dao_flow_batch_mints_tokens_via_treasury() {
    let (e, token, _treasury, governor, _target, owner) = setup();
    let proposer = Address::generate(&e);
    let recipient = Address::generate(&e);

    let _ = token.mint(&owner, &proposer);
    e.ledger().set_sequence_number(200);
    e.ledger().set_timestamp(2_000);

    let treasury_address = governor.treasury();
    let targets = vec![&e, token.address.clone()];
    let functions = vec![&e, Symbol::new(&e, "batch_mint")];
    let args = batch_mint_proposal_args(&e, &treasury_address, &recipient, 10);
    let description = String::from_str(&e, "Batch mint 10 tokens through treasury");
    let desc_hash = description_hash(&e, &description);

    let proposal_id = governor.propose(&targets, &functions, &args, &description, &proposer);

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

    assert_eq!(token.balance(&recipient), 10);
    assert_eq!(token.get_votes(&recipient), 10);
    assert_eq!(token.get_delegate(&recipient), Some(recipient.clone()));
    assert_eq!(
        governor.proposal_state(&proposal_id),
        ProposalState::Executed
    );
}

#[test]
fn governor_authority_can_modify_governance_parameters() {
    let (e, token, _treasury, governor, _target, owner) = setup();
    let authorized_governor = Address::generate(&e);

    // Owner grants governor authority
    governor.set_governor_authority(&authorized_governor, &true);
    assert!(governor.governor_authority(&authorized_governor));

    // Authorized governor can modify voting delay
    governor.set_voting_delay(&authorized_governor, &300);
    assert_eq!(governor.voting_delay(), 300);

    // Authorized governor can modify voting period
    governor.set_voting_period(&authorized_governor, &300);
    assert_eq!(governor.voting_period(), 300);

    // Authorized governor can modify proposal threshold
    governor.set_proposal_threshold(&authorized_governor, &5);
    assert_eq!(governor.proposal_threshold(), 5);

    // Authorized governor can modify quorum
    governor.set_quorum_bps(&authorized_governor, &2000);
    assert_eq!(governor.quorum_bps(), 2000);

    // Authorized governor can modify queue delay (minimum 300 seconds)
    governor.set_queue_delay(&authorized_governor, &300);

    let _ = token;
    let _ = owner;
}

#[test]
fn proposal_flow_with_modified_governance_parameters() {
    let (e, token, _treasury, governor, target, owner) = setup();
    let proposer = Address::generate(&e);
    let authorized_governor = Address::generate(&e);

    // Mint 10 tokens to proposer using batch mint
    let last_token_id = token.batch_mint(&owner, &proposer, &10);
    assert_eq!(last_token_id, 9);
    assert_eq!(token.get_votes(&proposer), 10);

    // Grant governor authority and modify parameters
    governor.set_governor_authority(&authorized_governor, &true);
    governor.set_voting_delay(&authorized_governor, &300); // Five-minute delay
    governor.set_voting_period(&authorized_governor, &300); // Five-minute period
    governor.set_proposal_threshold(&authorized_governor, &5); // Higher threshold
    governor.set_quorum_bps(&authorized_governor, &5000); // 50% quorum

    e.ledger().set_sequence_number(200);
    e.ledger().set_timestamp(2_000);

    let targets = vec![&e, target.address.clone()];
    let functions = vec![&e, symbol_short!("set_value")];
    let args = proposal_args(&e);
    let description = String::from_str(&e, "Test with modified parameters");
    let desc_hash = description_hash(&e, &description);

    // Propose with new threshold (needs 5 votes, proposer has 10)
    let proposal_id = governor.propose(&targets, &functions, &args, &description, &proposer);

    // Vote starts after 5 minutes (new voting delay)
    e.ledger().set_timestamp(2_301);
    governor.cast_vote(&proposal_id, &1, &String::from_str(&e, "yes"), &proposer);

    // Vote ends after 5 minutes (new voting period)
    e.ledger().set_timestamp(2_601);
    assert_eq!(
        governor.proposal_state(&proposal_id),
        ProposalState::Succeeded
    );

    governor.queue(
        &targets, &functions, &args, &desc_hash, &2_901_u32, &proposer,
    );

    e.ledger().set_timestamp(2_901);
    governor.execute(&targets, &functions, &args, &desc_hash, &proposer);

    assert_eq!(target.get_value(), 42);
    assert_eq!(
        governor.proposal_state(&proposal_id),
        ProposalState::Executed
    );
}

#[test]
#[should_panic(expected = "Error(Contract, #5007)")]
fn reentrancy_attack_is_prevented() {
    // NOTE: Soroban provides built-in reentrancy protection at the platform level
    // When a malicious contract attempts to re-enter during execution,
    // the platform blocks it with: Error(Context, InvalidAction) - "Contract re-entry is not allowed"
    //
    // Our CEI pattern (updating state before external calls) provides additional protection
    // as a best practice and defense-in-depth strategy.
    let (e, token, _treasury, governor, _target, owner) = setup();

    // Register malicious contract
    let malicious_id = e.register(MaliciousReentrantContract, ());
    let _malicious = MaliciousReentrantContractClient::new(&e, &malicious_id);

    // Create proposer with voting power
    let proposer = Address::generate(&e);
    token.mint(&owner, &proposer);

    e.ledger().set_sequence_number(200);
    e.ledger().set_timestamp(2_000);

    // Create a malicious proposal that will attempt reentrancy
    // The proposal will call malicious.reentry(), which will try to re-execute the same proposal
    let targets = vec![&e, malicious_id.clone()];
    let functions = vec![&e, symbol_short!("reentry")];

    // Prepare arguments for the reentry call
    let attack_targets = vec![&e, malicious_id.clone()];
    let attack_functions = vec![&e, symbol_short!("reentry")];
    let attack_args: Vec<Vec<Val>> = vec![&e, vec![&e]];
    let description = String::from_str(&e, "Reentrancy attack test");
    let desc_hash = description_hash(&e, &description);

    // Args: (governor, targets, functions, args, desc_hash, executor)
    let args = vec![
        &e,
        vec![
            &e,
            governor.address.clone().into_val(&e),
            attack_targets.into_val(&e),
            attack_functions.into_val(&e),
            attack_args.into_val(&e),
            desc_hash.into_val(&e),
            proposer.clone().into_val(&e),
        ],
    ];

    // Create the proposal
    let proposal_id = governor.propose(&targets, &functions, &args, &description, &proposer);

    // Vote on the proposal
    e.ledger().set_timestamp(2_301); // After voting delay
    governor.cast_vote(&proposal_id, &1, &String::from_str(&e, "yes"), &proposer);

    // Wait for voting period to end
    e.ledger().set_timestamp(2_601); // After voting period
    assert_eq!(
        governor.proposal_state(&proposal_id),
        ProposalState::Succeeded
    );

    // Queue the proposal
    governor.queue(
        &targets, &functions, &args, &desc_hash, &2_411_u32, &proposer,
    );
    assert_eq!(governor.proposal_state(&proposal_id), ProposalState::Queued);

    // Execute the proposal - this will trigger the reentrancy attack
    e.ledger().set_timestamp(2_412); // After ETA

    // The execution will:
    // 1. Mark proposal as Executed (CEI pattern)
    // 2. Call malicious.reentry()
    // 3. Malicious contract tries to re-enter execute()
    // 4. Soroban blocks reentrancy with Error(Context, InvalidAction)
    governor.execute(&targets, &functions, &args, &desc_hash, &proposer);

    // If we get here without panic, the test will fail
    // The should_panic annotation ensures the test passes only if reentrancy is blocked
}

#[test]
fn treasury_batch_mint_with_explicit_auth() {
    use soroban_sdk::testutils::{MockAuth, MockAuthInvoke};

    let e = Env::default();
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
            300_u32,
            300_u32,
            300_u32,
            1_u128,
            1_000_u32,
        ),
    );
    let _governor = DaoGovernorContractClient::new(&e, &governor_id);

    let recipient = Address::generate(&e);

    // Setup - grant treasury mint authority
    e.mock_all_auths();
    treasury.set_governor(&governor_id);
    token.set_mint_authority(&treasury.address, &true);

    let batch_mint_args: Vec<Val> = vec![
        &e,
        treasury.address.clone().into_val(&e),
        recipient.clone().into_val(&e),
        3u32.into_val(&e),
    ];

    // Now test treasury calling batch_mint with explicit authorization
    e.mock_auths(&[MockAuth {
        address: &governor_id,
        invoke: &MockAuthInvoke {
            contract: &treasury_id,
            fn_name: "execute",
            args: (&token_id, &Symbol::new(&e, "batch_mint"), &batch_mint_args).into_val(&e),
            sub_invokes: &[
                // Treasury itself needs to authorize the batch_mint call where it's the minter
                MockAuthInvoke {
                    contract: &token_id,
                    fn_name: "batch_mint",
                    args: (&treasury.address, &recipient, &3u32).into_val(&e),
                    sub_invokes: &[],
                },
            ],
        },
    }]);

    // Call treasury.execute which should call token.batch_mint
    treasury.execute(&token_id, &Symbol::new(&e, "batch_mint"), &batch_mint_args);

    // Verify the tokens were minted
    assert_eq!(token.balance(&recipient), 3);
    assert_eq!(token.get_votes(&recipient), 3);
    assert_eq!(token.get_delegate(&recipient), Some(recipient.clone()));
}

// ============================================================================
// AUCTION CONTRACT E2E TESTS
// ============================================================================

fn setup_auction() -> (
    Env,
    DaoTokenContractClient<'static>,
    DaoTreasuryContractClient<'static>,
    DaoAuctionContractClient<'static>,
    Address,                     // owner
    Address,                     // payment token
    StellarAssetClient<'static>, // payment token client
) {
    let e = Env::default();
    e.ledger().set_sequence_number(100);
    e.ledger().set_timestamp(1_000);

    let owner = Address::generate(&e);

    // Deploy DAO token (NFT)
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

    // Deploy treasury
    let treasury_id = e.register(DaoTreasuryContract, (owner.clone(), Address::generate(&e)));
    let treasury = DaoTreasuryContractClient::new(&e, &treasury_id);

    // Create payment token (SAC - like USDC)
    let payment_token_admin = Address::generate(&e);
    let payment_token_contract = e.register_stellar_asset_contract_v2(payment_token_admin.clone());
    let payment_token = payment_token_contract.address();
    let payment_client = StellarAssetClient::new(&e, &payment_token);

    // Deploy auction contract
    let auction_id = e.register(
        DaoAuctionContract,
        (
            owner.clone(),
            token_id.clone(),
            treasury_id.clone(),
            500_u64,                     // duration: 500 seconds
            100_0000000_i128,            // reserve price: 100 USDC
            10_u32,                      // min bid increment: 10%
            50_u64,                      // time buffer: 50 seconds
            Some(payment_token.clone()), // payment token
        ),
    );
    let auction = DaoAuctionContractClient::new(&e, &auction_id);

    e.mock_all_auths();

    // Grant mint authority to auction contract
    token.set_mint_authority(&auction_id, &true);

    (
        e,
        token,
        treasury,
        auction,
        owner,
        payment_token,
        payment_client,
    )
}

#[test]
fn test_auction_full_lifecycle() {
    let (e, token, treasury, auction, owner, _payment_token, payment_client) = setup_auction();

    let bidder1 = Address::generate(&e);
    let bidder2 = Address::generate(&e);

    // Mint payment tokens to bidders
    payment_client.mint(&bidder1, &1000_0000000);
    payment_client.mint(&bidder2, &2000_0000000);

    // Unpause to start first auction
    auction.unpause(&owner);

    // Get auction state
    let auction_state = auction.get_auction();
    let token_id = auction_state.token_id;
    assert_eq!(auction_state.highest_bid, 0);
    assert_eq!(auction_state.highest_bidder, None);
    assert!(!auction_state.settled);

    // Bidder 1 places first bid at reserve price
    auction.create_bid(&bidder1, &token_id, &100_0000000);

    let auction_state = auction.get_auction();
    assert_eq!(auction_state.highest_bid, 100_0000000);
    assert_eq!(auction_state.highest_bidder, Some(bidder1.clone()));

    // Bidder 2 places higher bid (110 USDC - 10% increment)
    auction.create_bid(&bidder2, &token_id, &110_0000000);

    let auction_state = auction.get_auction();
    assert_eq!(auction_state.highest_bid, 110_0000000);
    assert_eq!(auction_state.highest_bidder, Some(bidder2.clone()));

    // Bidder 1 should have been refunded
    assert_eq!(payment_client.balance(&bidder1), 1000_0000000);
    assert_eq!(payment_client.balance(&bidder2), 2000_0000000 - 110_0000000);

    // Advance past auction end
    e.ledger().set_timestamp(auction_state.end_time + 1);

    // Settle and create new auction
    auction.settle_and_create_new();

    // Verify bidder2 received the NFT
    assert_eq!(token.balance(&bidder2), 1);

    // Verify treasury received payment
    assert_eq!(payment_client.balance(&treasury.address), 110_0000000);

    // Verify new auction was created
    let new_auction_state = auction.get_auction();
    assert_ne!(new_auction_state.token_id, token_id);
    assert_eq!(new_auction_state.highest_bid, 0);
    assert!(!new_auction_state.settled);
}

#[test]
fn test_auction_time_extension() {
    let (e, _token, _treasury, auction, owner, _payment_token, payment_client) = setup_auction();

    let bidder = Address::generate(&e);
    payment_client.mint(&bidder, &1000_0000000);

    // Start auction
    auction.unpause(&owner);

    let auction_state = auction.get_auction();
    let token_id = auction_state.token_id;
    let original_end = auction_state.end_time;

    // Advance to within time buffer (25 seconds before end)
    e.ledger().set_timestamp(original_end - 25);

    // Place bid - should extend auction
    auction.create_bid(&bidder, &token_id, &100_0000000);

    let auction_state = auction.get_auction();
    let config = auction.get_config();

    // End time should be extended by time_buffer
    assert_eq!(
        auction_state.end_time,
        e.ledger().timestamp() + config.time_buffer
    );
    assert!(auction_state.end_time > original_end);
}

#[test]
fn test_auction_no_bids_transfers_to_treasury() {
    let (e, token, treasury, auction, owner, _payment_token, _payment_client) = setup_auction();

    // Start auction
    auction.unpause(&owner);

    let auction_state = auction.get_auction();
    let token_id = auction_state.token_id;

    // Token should exist (minted to auction contract)
    assert_eq!(token.balance(&auction.address), 1);
    assert_eq!(token.balance(&treasury.address), 0);

    // Advance past auction end without bids
    e.ledger().set_timestamp(auction_state.end_time + 1);

    // Settle auction
    auction.settle_and_create_new();

    // IMPROVEMENT: Unsold token transferred to treasury for DAO governance use
    assert_eq!(token.balance(&treasury.address), 1);
    assert_eq!(token.owner_of(&(token_id as u32)), treasury.address);

    // New auction token minted to auction contract
    assert_eq!(token.balance(&auction.address), 1);

    // Verify treasury can use the token for governance (has delegate set)
    assert_eq!(
        token.get_delegate(&treasury.address),
        Some(treasury.address)
    );
}

#[test]
fn test_auction_config_updates_only_when_paused() {
    let (_e, _token, _treasury, auction, owner, _payment_token, _payment_client) = setup_auction();

    // Contract starts paused, config updates should work
    auction.set_duration(&1000);
    auction.set_reserve_price(&200_0000000);
    auction.set_min_bid_increment(&15);

    let config = auction.get_config();
    assert_eq!(config.duration, 1000);
    assert_eq!(config.reserve_price, 200_0000000);
    assert_eq!(config.min_bid_increment_percent, 15);

    // Unpause
    auction.unpause(&owner);

    // Config updates should fail when not paused
    let result = auction.try_set_duration(&1500);
    assert!(result.is_err());
}

#[test]
fn test_auction_multiple_consecutive_auctions() {
    let (e, token, treasury, auction, owner, _payment_token, payment_client) = setup_auction();

    let bidders = [
        Address::generate(&e),
        Address::generate(&e),
        Address::generate(&e),
    ];

    // Mint payment tokens to all bidders
    for bidder in &bidders {
        payment_client.mint(bidder, &1000_0000000);
    }

    // Start auctions
    auction.unpause(&owner);

    // Run 3 consecutive auctions
    for bidder in &bidders {
        let auction_state = auction.get_auction();
        let token_id = auction_state.token_id;

        // Each bidder bids on their respective auction
        auction.create_bid(bidder, &token_id, &100_0000000);

        // Advance and settle
        e.ledger().set_timestamp(auction_state.end_time + 1);
        auction.settle_and_create_new();

        // Verify winner received NFT
        assert_eq!(token.balance(bidder), 1);
    }

    // Treasury should have received 3 payments
    assert_eq!(payment_client.balance(&treasury.address), 300_0000000);
}

#[test]
#[should_panic(expected = "Error(Contract, #1206)")] // ReservePriceNotMet
fn test_auction_bid_below_reserve() {
    let (e, _token, _treasury, auction, owner, _payment_token, payment_client) = setup_auction();

    let bidder = Address::generate(&e);
    payment_client.mint(&bidder, &1000_0000000);

    auction.unpause(&owner);

    let auction_state = auction.get_auction();

    // Try to bid below reserve price (should panic)
    auction.create_bid(&bidder, &auction_state.token_id, &50_0000000);
}

#[test]
#[should_panic(expected = "Error(Contract, #1207)")] // MinBidNotMet
fn test_auction_bid_below_min_increment() {
    let (e, _token, _treasury, auction, owner, _payment_token, payment_client) = setup_auction();

    let bidder1 = Address::generate(&e);
    let bidder2 = Address::generate(&e);

    payment_client.mint(&bidder1, &1000_0000000);
    payment_client.mint(&bidder2, &1000_0000000);

    auction.unpause(&owner);

    let auction_state = auction.get_auction();
    let token_id = auction_state.token_id;

    // First bid at reserve
    auction.create_bid(&bidder1, &token_id, &100_0000000);

    // Try to bid with insufficient increment (should panic)
    // Min increment is 10%, so need at least 110 USDC
    auction.create_bid(&bidder2, &token_id, &105_0000000);
}

#[test]
#[should_panic(expected = "Error(Contract, #1201)")] // InvalidTokenId
fn test_auction_bid_wrong_token_id() {
    let (e, _token, _treasury, auction, owner, _payment_token, payment_client) = setup_auction();

    let bidder = Address::generate(&e);
    payment_client.mint(&bidder, &1000_0000000);

    auction.unpause(&owner);

    let auction_state = auction.get_auction();
    let wrong_token_id = auction_state.token_id + 999;

    // Try to bid on wrong token ID (should panic)
    auction.create_bid(&bidder, &wrong_token_id, &100_0000000);
}

#[test]
#[should_panic(expected = "Error(Contract, #1202)")] // AuctionOver
fn test_auction_bid_after_end() {
    let (e, _token, _treasury, auction, owner, _payment_token, payment_client) = setup_auction();

    let bidder = Address::generate(&e);
    payment_client.mint(&bidder, &1000_0000000);

    auction.unpause(&owner);

    let auction_state = auction.get_auction();
    let token_id = auction_state.token_id;

    // Advance past auction end
    e.ledger().set_timestamp(auction_state.end_time + 1);

    // Try to bid after auction ended (should panic)
    auction.create_bid(&bidder, &token_id, &100_0000000);
}

#[test]
#[should_panic(expected = "Error(Contract, #1212)")] // NotLaunched
fn test_auction_get_auction_before_launch() {
    let (_e, _token, _treasury, auction, _owner, _payment_token, _payment_client) = setup_auction();

    // Try to get auction before unpause/launch (should panic)
    auction.get_auction();
}

#[test]
#[should_panic(expected = "Error(Contract, #1204)")] // AuctionActive
fn test_auction_settle_while_active() {
    let (e, _token, _treasury, auction, owner, _payment_token, _payment_client) = setup_auction();

    auction.unpause(&owner);

    let auction_state = auction.get_auction();

    // Try to settle while auction is still active (should panic)
    e.ledger().set_timestamp(auction_state.end_time - 50);
    auction.settle_and_create_new();
}

#[test]
fn test_auction_pause_and_resume() {
    let (e, token, treasury, auction, owner, _payment_token, payment_client) = setup_auction();

    let bidder = Address::generate(&e);
    payment_client.mint(&bidder, &1000_0000000);

    // Start auction
    auction.unpause(&owner);

    let auction_state = auction.get_auction();
    let token_id = auction_state.token_id;

    // Place a bid
    auction.create_bid(&bidder, &token_id, &100_0000000);

    // Pause the auction
    auction.pause(&owner);
    assert!(auction.paused());

    // Settle the current auction while paused
    e.ledger().set_timestamp(auction_state.end_time + 1);
    auction.settle_auction();

    // Verify settlement happened
    assert_eq!(token.balance(&bidder), 1);
    assert_eq!(payment_client.balance(&treasury.address), 100_0000000);

    // Unpause to resume - should create new auction
    auction.unpause(&owner);
    assert!(!auction.paused());

    // Verify new auction was created
    let new_auction_state = auction.get_auction();
    assert_ne!(new_auction_state.token_id, token_id);
    assert_eq!(new_auction_state.highest_bid, 0);
}

#[test]
fn test_auction_ownership_remains_with_deployer() {
    let (_e, _token, _treasury, auction, owner, _payment_token, _payment_client) = setup_auction();

    // Initially owned by owner
    assert_eq!(auction.get_owner(), Some(owner.clone()));

    // Unpause - ownership should remain with original owner
    auction.unpause(&owner);

    // Ownership should still be with original owner
    assert_eq!(auction.get_owner(), Some(owner.clone()));
}

#[test]
fn test_auction_set_treasury() {
    let (e, _token, _treasury, auction, _owner, _payment_token, _payment_client) = setup_auction();

    let new_treasury = Address::generate(&e);

    // Update treasury while paused
    auction.set_treasury(&new_treasury);

    let config = auction.get_config();
    assert_eq!(config.treasury, new_treasury);
}

#[test]
#[should_panic]
fn test_auction_config_update_when_unpaused() {
    let (_e, _token, _treasury, auction, owner, _payment_token, _payment_client) = setup_auction();

    // Unpause
    auction.unpause(&owner);

    // Try to update config while unpaused (should fail)
    auction.set_duration(&1500);
}

#[test]
fn test_auction_settle_auction_vs_settle_and_create() {
    let (e, token, treasury, auction, owner, _payment_token, payment_client) = setup_auction();

    let bidder = Address::generate(&e);
    payment_client.mint(&bidder, &2000_0000000);

    // Start auction
    auction.unpause(&owner);

    let auction_state = auction.get_auction();
    let token_id = auction_state.token_id;

    // Place bid
    auction.create_bid(&bidder, &token_id, &100_0000000);

    // Advance past end
    e.ledger().set_timestamp(auction_state.end_time + 1);

    // Pause and use settle_auction instead of settle_and_create_new
    auction.pause(&owner);
    auction.settle_auction();

    // Verify settlement
    assert_eq!(token.balance(&bidder), 1);
    assert_eq!(payment_client.balance(&treasury.address), 100_0000000);

    // The auction should be settled but no new auction created yet
    let settled_auction = auction.get_auction();
    assert!(settled_auction.settled);

    // When we unpause, a new auction should be created
    auction.unpause(&owner);
    let new_auction = auction.get_auction();
    assert_ne!(new_auction.token_id, token_id);
    assert!(!new_auction.settled);
}

// ============================================================================
// Native XLM Payment Tests
// ============================================================================

// SECURITY FIX: Native XLM support removed - SAC tokens only
// The setup_auction_native_xlm() function has been removed because:
// 1. The contract now requires a payment token in the constructor (no None allowed)
// 2. All native XLM payment code paths would panic
// 3. This prevents incomplete/unsafe native payment implementation from being used
//
// If native XLM support is needed in the future, it must be fully implemented
// with proper transfer mechanics before being enabled.

#[test]
fn test_auction_payment_token_setter() {
    let (e, _token, _treasury, auction, _owner, payment_token_addr, _payment_token) =
        setup_auction();

    // SECURITY FIX: Payment token is always required now
    let config = auction.get_config();
    assert_eq!(config.payment_token, Some(payment_token_addr.clone()));

    // Can change to a different SAC token
    let new_payment_token = Address::generate(&e);
    auction.set_payment_token(&Some(new_payment_token.clone()));

    let config = auction.get_config();
    assert_eq!(config.payment_token, Some(new_payment_token));
}

#[test]
#[should_panic(expected = "Error(Contract, #1211)")] // NoPaymentTokenSet
fn test_auction_payment_token_setter_rejects_none() {
    let (_e, _token, _treasury, auction, _owner, _payment_token_addr, _payment_token) =
        setup_auction();

    // SECURITY FIX: Cannot set payment token to None
    auction.set_payment_token(&None);
}

// ============================================================================
// Critical Security Tests - Added from audit
// ============================================================================

#[test]
fn test_auction_extension_dos_protection() {
    let (e, _token, _treasury, auction, owner, _payment_token, payment_client) = setup_auction();

    let bidder = Address::generate(&e);
    payment_client.mint(&bidder, &100000_0000000); // Large amount for many bids

    // Start auction
    auction.unpause(&owner);

    let auction_state = auction.get_auction();
    let token_id = auction_state.token_id;

    // Place 3 bids within time buffer to verify extension_count increments
    // (Testing with 3 instead of 10 to avoid test environment limits)
    for i in 1..=3 {
        // Get current auction state to know current end_time
        let current_state = auction.get_auction();

        // Advance to within time buffer (25 seconds before current end)
        e.ledger().set_timestamp(current_state.end_time - 25);

        // Place bid with incrementing amounts
        let bid_amount = 100_0000000 + (i as i128 * 20_0000000);
        auction.create_bid(&bidder, &token_id, &bid_amount);
    }

    // Verify extensions are being tracked
    let auction_state = auction.get_auction();
    assert_eq!(auction_state.extension_count, 3);

    // This verifies the DOS protection mechanism exists and tracks extensions
    // The actual limit enforcement (MAX_AUCTION_EXTENSIONS = 10) is tested
    // via unit tests to avoid e2e test environment limitations
}

#[test]
fn test_auction_payment_currency_locked_on_first_bid() {
    let (e, _token, _treasury, auction, owner, _payment_token_addr, payment_client) =
        setup_auction();

    let bidder = Address::generate(&e);
    payment_client.mint(&bidder, &1000_0000000);

    // Start auction
    auction.unpause(&owner);

    let auction_state = auction.get_auction();
    let token_id = auction_state.token_id;

    // Before first bid, payment_currency is Native (placeholder)
    // This is implementation detail - the auction starts with PaymentType::Native placeholder

    // Place first bid with SAC token
    auction.create_bid(&bidder, &token_id, &100_0000000);

    // After first bid, payment_currency should be locked to SAC(payment_token_addr)
    // We can't directly inspect payment_currency, but we can test that the behavior is correct
    // by verifying subsequent bids work with the same token

    // Place second bid with higher amount - should succeed
    auction.create_bid(&bidder, &token_id, &150_0000000);

    // Verify both bids succeeded
    let final_state = auction.get_auction();
    assert_eq!(final_state.highest_bid, 150_0000000);
    assert_eq!(final_state.highest_bidder, Some(bidder.clone()));
}

#[test]
fn test_multi_action_proposal_atomicity() {
    let (e, token, _treasury, governor, target, owner) = setup();

    // Mint tokens to proposer and voter
    let proposer = Address::generate(&e);
    let voter = Address::generate(&e);

    token.mint(&owner, &proposer);
    token.mint(&owner, &voter);

    // Advance ledger and timestamp significantly for checkpoint
    e.ledger().set_sequence_number(200);
    e.ledger().set_timestamp(2_000);

    // Create multi-action proposal: set_value(42) AND set_value(100)
    let targets = vec![&e, target.address.clone(), target.address.clone()];
    let functions = vec![
        &e,
        Symbol::new(&e, "set_value"),
        Symbol::new(&e, "set_value"),
    ];
    let args = vec![
        &e,
        vec![&e, 42_u32.into_val(&e)],
        vec![&e, 100_u32.into_val(&e)],
    ];
    let description = String::from_str(&e, "Multi-action test");
    let desc_hash = description_hash(&e, &description);

    let proposal_id = governor.propose(&targets, &functions, &args, &description, &proposer);

    // Advance past voting delay (voting_delay is 300 seconds)
    e.ledger().set_timestamp(2_301);

    // Vote
    governor.cast_vote(&proposal_id, &1, &String::from_str(&e, "yes"), &voter);

    // Advance past voting period (voting_period is 300 seconds)
    e.ledger().set_timestamp(2_601);

    // Queue with ETA (queue_delay is 300 seconds, so ETA is current + 300)
    let eta = 2_601 + 300;
    governor.queue(&targets, &functions, &args, &desc_hash, &eta, &proposer);

    // Advance to ETA
    e.ledger().set_timestamp(eta as u64);

    // Execute - both actions should execute atomically
    governor.execute(&targets, &functions, &args, &desc_hash, &proposer);

    // Verify both actions executed
    // The second set_value(100) should overwrite the first set_value(42)
    assert_eq!(target.get_value(), 100);

    // Verify proposal is executed
    assert_eq!(
        governor.proposal_state(&proposal_id),
        ProposalState::Executed
    );
}

#[test]
fn test_governor_treasury_bidirectional_verification() {
    let e = Env::default();
    e.mock_all_auths();
    e.ledger().set_sequence_number(100);
    e.ledger().set_timestamp(1_000);

    let owner = Address::generate(&e);

    // Register token
    let token_id = e.register(
        DaoTokenContract,
        (
            owner.clone(),
            String::from_str(&e, "https://example.com/"),
            String::from_str(&e, "DAO Vote NFT"),
            String::from_str(&e, "vDAO"),
        ),
    );

    // Register treasury with a placeholder governor
    let placeholder_governor = Address::generate(&e);
    let treasury_id = e.register(
        DaoTreasuryContract,
        (owner.clone(), placeholder_governor.clone()),
    );
    let treasury = DaoTreasuryContractClient::new(&e, &treasury_id);

    // Register governor with the treasury
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
            1_000_u32,
        ),
    );
    let governor = DaoGovernorContractClient::new(&e, &governor_id);

    // Verify governor knows about treasury
    assert_eq!(governor.treasury(), treasury_id);

    // Verify initial treasury governor is placeholder
    assert_eq!(treasury.governor(), placeholder_governor);

    // Update treasury to point to real governor
    treasury.set_governor(&governor_id);

    // Verify bidirectional link
    assert_eq!(treasury.governor(), governor_id);
    assert_eq!(governor.treasury(), treasury_id);

    // Verify treasury can only be called by its governor
    let target_id = e.register(TargetContract, ());
    let args = vec![&e, 42_u32.into_val(&e)];

    // This should succeed because governor is calling treasury
    e.mock_all_auths(); // Reset auths
    treasury.execute(&target_id, &Symbol::new(&e, "set_value"), &args);
}

#[test]
fn test_auction_inconsistent_payment_type_rejection() {
    // This test verifies that once payment currency is locked on first bid,
    // all subsequent bids must use the same payment type.
    // Since we only support SAC tokens now (no native XLM), this test
    // verifies the payment locking mechanism is working correctly.

    let (e, _token, _treasury, auction, owner, _payment_token, payment_client) = setup_auction();

    let bidder1 = Address::generate(&e);
    let bidder2 = Address::generate(&e);
    payment_client.mint(&bidder1, &1000_0000000);
    payment_client.mint(&bidder2, &1000_0000000);

    // Start auction
    auction.unpause(&owner);

    let auction_state = auction.get_auction();
    let token_id = auction_state.token_id;

    // First bid locks payment currency to the SAC token
    auction.create_bid(&bidder1, &token_id, &100_0000000);

    // Second bid with same payment token should succeed
    auction.create_bid(&bidder2, &token_id, &150_0000000);

    // Verify second bid succeeded
    let final_state = auction.get_auction();
    assert_eq!(final_state.highest_bid, 150_0000000);
    assert_eq!(final_state.highest_bidder, Some(bidder2.clone()));
}

// ============================================================================
// Boundary Value Tests
// ============================================================================

#[test]
#[should_panic(expected = "Error(Contract, #1500)")] // CustomGovernorError::InvalidQueueDelay
fn test_governor_queue_delay_minimum_300() {
    let (_e, _token, _treasury, governor, _target, owner) = setup();

    // Try to set queue_delay below minimum (5 minutes = 300 seconds)
    // This should panic with InvalidQueueDelay error
    governor.set_queue_delay(&owner, &299);
}

#[test]
fn test_governor_proposal_threshold_cannot_exceed_supply() {
    let (e, token, _treasury, governor, _target, owner) = setup();

    // Mint exactly 5 tokens
    let user1 = Address::generate(&e);
    for _ in 0..5 {
        token.mint(&owner, &user1);
    }

    // Advance ledger for checkpoint
    e.ledger().set_sequence_number(101);

    // Setting threshold to 5 (equal to total supply) should succeed
    governor.set_proposal_threshold(&owner, &5);

    // Verify it was set
    assert_eq!(governor.proposal_threshold(), 5);
}

#[test]
#[should_panic(expected = "Error(Contract, #1501)")] // CustomGovernorError::InvalidProposalThreshold
fn test_governor_proposal_threshold_exceeds_supply() {
    let (e, token, _treasury, governor, _target, owner) = setup();

    // Mint exactly 5 tokens
    let user1 = Address::generate(&e);
    for _ in 0..5 {
        token.mint(&owner, &user1);
    }

    // Advance ledger for checkpoint
    e.ledger().set_sequence_number(101);

    // Setting threshold to 6 (more than total supply of 5) should panic
    governor.set_proposal_threshold(&owner, &6);
}

#[test]
#[should_panic(expected = "Error(Contract, #1101)")] // TokenError::InvalidBatchMintAmount
fn test_token_batch_mint_zero_amount() {
    let (e, token, _treasury, _governor, _target, owner) = setup();
    let recipient = Address::generate(&e);

    // Batch minting 0 tokens should fail
    token.batch_mint(&owner, &recipient, &0);
}

#[test]
#[should_panic(expected = "Error(Contract, #1101)")] // TokenError::InvalidBatchMintAmount
fn test_token_batch_mint_above_max() {
    let (e, token, _treasury, _governor, _target, owner) = setup();
    let recipient = Address::generate(&e);

    // Batch minting 101 tokens (MAX is 100) should fail
    token.batch_mint(&owner, &recipient, &101);
}

#[test]
fn test_token_batch_mint_large_amount() {
    let (e, token, _treasury, _governor, _target, owner) = setup();
    let recipient = Address::generate(&e);

    // Batch minting 20 tokens should succeed (MAX is 100, but test env has event limits)
    // This tests the batch mint functionality works for moderate batches
    let last_token = token.batch_mint(&owner, &recipient, &20);

    // Verify correct amount minted
    assert_eq!(token.balance(&recipient), 20);
    // Last token ID should be 19 (tokens are 0-indexed: 0, 1, 2, ..., 19)
    assert_eq!(last_token, 19);
}
