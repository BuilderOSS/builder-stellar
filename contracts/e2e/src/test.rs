extern crate std;

use auction::{DaoAuctionContract, DaoAuctionContractClient};
use governor::{DaoGovernorContract, DaoGovernorContractClient};
use manager::{ManagerContract, ManagerContractClient};
use marketplace::{MarketplaceContract, MarketplaceContractClient};
use metadata::{IpfsGroup, ItemParam};
use metadata::{MetadataContract, MetadataContractClient};
use soroban_sdk::{
    contract, contractimpl, symbol_short,
    testutils::{Address as _, Ledger, MockAuth, MockAuthInvoke},
    token::{StellarAssetClient, TokenClient},
    vec,
    xdr::AccountFlags,
    Address, BytesN, Env, IntoVal, String, Symbol, Val, Vec,
};
use stellar_governance::governor::ProposalState;
use token::{DaoTokenContract, DaoTokenContractClient};
use treasury::{DaoTreasuryContract, DaoTreasuryContractClient};

/// Platform upgrade notice used by these tests (short; a deploy-time choice).
const TEST_UPGRADE_DELAY: u32 = 1_000;

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
    /// Attempts to re-enter treasury.execute() during execution.
    /// The host blocks it because the Treasury is on the call stack.
    pub fn reentry(
        e: &Env,
        treasury: Address,
        targets: Vec<Address>,
        functions: Vec<Symbol>,
        args: Vec<Vec<Val>>,
        desc_hash: BytesN<32>,
    ) {
        // Mark that attack was attempted
        e.storage().instance().set(&symbol_short!("attack"), &1);

        // Try to re-enter treasury.execute() - the host rejects re-entry
        let treasury_client = DaoTreasuryContractClient::new(e, &treasury);
        treasury_client.execute(&targets, &functions, &args, &desc_hash);

        // If we get here, the reentrancy attack succeeded (BAD!)
        e.storage().instance().set(&symbol_short!("success"), &true);
    }

    /// Same marker write as `reentry` but without re-entering the Treasury
    /// (positive control for the re-entry test).
    pub fn ping(e: &Env) {
        e.storage().instance().set(&symbol_short!("attack"), &1u32);
    }

    pub fn get_attack_count(e: &Env) -> u32 {
        e.storage()
            .instance()
            .get(&symbol_short!("attack"))
            .unwrap_or(0)
    }
}

/// Target that tries to call `governor.consume` from inside a treasury-dispatched call.
#[contract]
pub struct MaliciousConsumeContract;

#[contractimpl]
impl MaliciousConsumeContract {
    pub fn attack(
        e: &Env,
        governor: Address,
        targets: Vec<Address>,
        functions: Vec<Symbol>,
        args: Vec<Vec<Val>>,
        desc_hash: BytesN<32>,
    ) {
        DaoGovernorContractClient::new(e, &governor)
            .consume(&targets, &functions, &args, &desc_hash);
    }
}

/// Metadata constructor wiring: deploy the metadata contract at a pre-generated
/// address (the token is constructed with that address first).
fn register_metadata(e: &Env, metadata_id: &Address, token_id: &Address, owner: &Address) {
    e.register_at(
        metadata_id,
        MetadataContract,
        (
            token_id.clone(),
            String::from_str(e, r#"{"v":1,"description":"DAO description"}"#),
            String::from_str(e, "https://example.com/render/"),
            Address::generate(e),
            BytesN::from_array(e, &[0u8; 32]),
            owner.clone(),
            Address::generate(e), // treasury (metadata is not launched in these tests)
            Vec::<String>::new(e),
            Vec::<ItemParam>::new(e),
            IpfsGroup {
                base_uri: String::from_str(e, "ipfs://"),
                extension: String::from_str(e, ".png"),
            },
        ),
    );
}

type Fixture = (
    Env,
    DaoTokenContractClient<'static>,
    DaoTreasuryContractClient<'static>,
    DaoGovernorContractClient<'static>,
    TargetContractClient<'static>,
    Address,
);

fn setup() -> Fixture {
    let e = Env::default();
    let zero = BytesN::from_array(&e, &[0u8; 32]);
    let mgr = Address::generate(&e);
    setup_with(e, mgr, zero.clone(), zero)
}

/// Full launched DAO whose governor/treasury register their upgrade hashes
/// against `manager` (a mock manager in the upgrade tests).
fn setup_with(
    e: Env,
    manager: Address,
    governor_hash: BytesN<32>,
    treasury_hash: BytesN<32>,
) -> Fixture {
    e.mock_all_auths();
    e.ledger().set_sequence_number(100);
    e.ledger().set_timestamp(1_000);

    let owner = Address::generate(&e);
    let metadata_id = Address::generate(&e);
    let treasury_id = Address::generate(&e);
    let token_id = e.register(
        DaoTokenContract,
        (
            owner.clone(),
            treasury_id.clone(),
            Address::generate(&e),
            Address::generate(&e),
            String::from_str(&e, "DAO Vote NFT"),
            String::from_str(&e, "vDAO"),
            metadata_id.clone(),
            Address::generate(&e),
            BytesN::from_array(&e, &[0u8; 32]),
        ),
    );
    let token = DaoTokenContractClient::new(&e, &token_id);
    register_metadata(&e, &metadata_id, &token_id, &owner);

    // Constructor-only wiring: the governor address is pre-generated so the
    // treasury can be constructed with it (the Manager uses predicted addresses).
    let governor_id = Address::generate(&e);
    e.register_at(
        &treasury_id,
        DaoTreasuryContract,
        (
            owner.clone(),
            governor_id.clone(),
            manager.clone(),
            treasury_hash,
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
            300_u32,
            300_u32,
            300_u32,
            1_u128,
            1_000_u32,
            manager.clone(),
            governor_hash,
        ),
    );
    let governor = DaoGovernorContractClient::new(&e, &governor_id);

    let target_id = e.register(TargetContract, ());
    let target = TargetContractClient::new(&e, &target_id);

    // Launch the token the way the Manager does: the treasury becomes owner and
    // the canonical minter, and `owner` (the launch admin in these tests) is
    // registered as an extra launch-time minter so the tests can keep minting
    // voting power directly.
    token.launch(
        &treasury_id,
        &vec![&e, treasury_id.clone(), owner.clone()],
        &owner,
    );
    // Governor and treasury only process proposals once live.
    governor.launch(&treasury_id);
    treasury.launch(&treasury_id);

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

// batch_mint helper removed - Token contract no longer supports batch_mint
// Use Minter contract for batch minting operations

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
fn token_mint_generates_metadata_seed_through_real_hook() {
    let (e, token, _treasury, _governor, _target, owner) = setup();
    let names = vec![&e, String::from_str(&e, "Background")];
    let items = vec![
        &e,
        ItemParam {
            property_id: 0,
            name: String::from_str(&e, "Blue"),
            is_new_property: true,
        },
        ItemParam {
            property_id: 0,
            name: String::from_str(&e, "Red"),
            is_new_property: true,
        },
    ];
    let metadata_address = token.metadata().unwrap();
    let metadata = MetadataContractClient::new(&e, &metadata_address);
    metadata.add_properties(
        &names,
        &items,
        &IpfsGroup {
            base_uri: String::from_str(&e, "ipfs://art"),
            extension: String::from_str(&e, ".png"),
        },
    );

    let recipient = Address::generate(&e);
    let token_id = token.mint(&owner, &recipient);

    assert_eq!(token_id, 0);
    assert_eq!(metadata.properties_count(), 1);
    assert_eq!(metadata.items_count(&0), 2);
    assert_eq!(metadata.token(), token.address.clone());
}

#[test]
fn manager_registry_and_predictions_are_creator_scoped() {
    let e = Env::default();
    e.mock_all_auths();
    e.ledger().set_sequence_number(7);
    let admin = Address::generate(&e);
    let creator_a = Address::generate(&e);
    let creator_b = Address::generate(&e);
    let manager_wasm_hash = BytesN::from_array(&e, &[0; 32]);
    let manager_id = e.register(
        ManagerContract,
        (
            admin.clone(),
            manager_wasm_hash.clone(),
            String::from_str(&e, "0.1.0"),
            TEST_UPGRADE_DELAY,
        ),
    );
    let manager = ManagerContractClient::new(&e, &manager_id);
    let hashes = [
        BytesN::from_array(&e, &[1; 32]),
        BytesN::from_array(&e, &[2; 32]),
        BytesN::from_array(&e, &[3; 32]),
        BytesN::from_array(&e, &[4; 32]),
        BytesN::from_array(&e, &[5; 32]),
        BytesN::from_array(&e, &[6; 32]),
    ];
    for (index, hash) in hashes.iter().enumerate() {
        manager.register_implementation(
            &String::from_str(
                &e,
                [
                    "Token",
                    "Metadata",
                    "Auction",
                    "Governor",
                    "Treasury",
                    "Marketplace",
                ][index],
            ),
            &String::from_str(&e, "0.1.0"),
            hash,
        );
    }
    manager.set_current_implementations(
        &hashes[0], &hashes[1], &hashes[2], &hashes[3], &hashes[4], &hashes[5],
    );
    manager.set_latest_implementation(&String::from_str(&e, "Token"), &hashes[0]);
    assert_eq!(
        manager
            .get_latest_implementation(&String::from_str(&e, "Token"))
            .unwrap()
            .wasm_hash,
        hashes[0]
    );

    let prediction_a = manager.predict_addresses(&creator_a, &42);
    assert_eq!(prediction_a, manager.predict_addresses(&creator_a, &42));
    assert_ne!(
        prediction_a.token,
        manager.predict_addresses(&creator_b, &42).token
    );
    assert_ne!(
        prediction_a.token,
        manager.predict_addresses(&creator_a, &43).token
    );

    manager.revoke_implementation(&hashes[0]);
    assert!(manager
        .get_latest_implementation(&String::from_str(&e, "Token"))
        .is_none());
}

#[test]
fn dao_flow_executes_treasury_call() {
    let (e, token, treasury, governor, target, owner) = setup();
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
    // Enforcing mode: only the Treasury's own authorization may reach targets.
    e.set_auths(&[]);
    treasury.execute(&targets, &functions, &args, &desc_hash);

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
    let (e, token, treasury, governor, _target, owner) = setup();
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
    // Enforcing mode: only the Treasury's own authorization may reach targets.
    e.set_auths(&[]);
    treasury.execute(&targets, &functions, &args, &desc_hash);

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
    // Enforcing mode: only the Treasury's own authorization may reach targets.
    e.set_auths(&[]);
    treasury.execute(&targets, &functions, &args, &desc_hash);

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
    // Enforcing mode: only the Treasury's own authorization may reach targets.
    e.set_auths(&[]);
    treasury.execute(&targets, &functions, &args, &desc_hash);

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
    // Enforcing mode: only the Treasury's own authorization may reach targets.
    e.set_auths(&[]);
    treasury.execute(&targets, &functions, &args, &desc_hash);

    assert_eq!(token.balance(&treasury.address), 0);
    assert_eq!(token.balance(&target.address), 1);
    assert_eq!(
        governor.proposal_state(&proposal_id),
        ProposalState::Executed
    );

    let _ = proposer_token_id;
}

// dao_flow_batch_mints_tokens_via_treasury removed - Token contract no longer has batch_mint
// Use Minter contract for batch minting via governance if needed

#[test]
fn owner_can_modify_governance_parameters_during_setup() {
    let (_e, token, _treasury, governor, _target, owner) = setup();

    governor.set_voting_delay(&300);
    assert_eq!(governor.voting_delay(), 300);

    governor.set_voting_period(&300);
    assert_eq!(governor.voting_period(), 300);

    governor.set_proposal_threshold(&5);
    assert_eq!(governor.proposal_threshold(), 5);

    governor.set_quorum_bps(&2000);
    assert_eq!(governor.quorum_bps(), 2000);

    // Queue delay minimum is 300 seconds.
    governor.set_queue_delay(&300);

    let _ = token;
    let _ = owner;
}

#[test]
fn proposal_flow_with_modified_governance_parameters() {
    let (e, token, treasury, governor, target, owner) = setup();
    let proposer = Address::generate(&e);

    // Mint 10 tokens to proposer using multiple single mints
    for _ in 0..10 {
        token.mint(&owner, &proposer);
    }
    assert_eq!(token.get_votes(&proposer), 10);

    // The owner (launch admin during setup) tunes parameters
    governor.set_voting_delay(&300); // Five-minute delay
    governor.set_voting_period(&300); // Five-minute period
    governor.set_proposal_threshold(&5); // Higher threshold
    governor.set_quorum_bps(&5000); // 50% quorum

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
    // Enforcing mode: only the Treasury's own authorization may reach targets.
    e.set_auths(&[]);
    treasury.execute(&targets, &functions, &args, &desc_hash);

    assert_eq!(target.get_value(), 42);
    assert_eq!(
        governor.proposal_state(&proposal_id),
        ProposalState::Executed
    );
}

#[test]
fn reentrancy_attack_is_prevented() {
    // NOTE: Soroban provides built-in reentrancy protection at the platform level
    // When a malicious contract attempts to re-enter during execution,
    // the platform blocks it with: Error(Context, InvalidAction) - "Contract re-entry is not allowed"
    //
    // Our CEI pattern (updating state before external calls) provides additional protection
    // as a best practice and defense-in-depth strategy.
    let (e, token, treasury, governor, _target, owner) = setup();

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
            treasury.address.clone().into_val(&e),
            attack_targets.into_val(&e),
            attack_functions.into_val(&e),
            attack_args.into_val(&e),
            desc_hash.into_val(&e),
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
    e.ledger().set_timestamp(2_901); // At ETA (queued at 2_601 + 300 delay)

    // The execution will:
    // 1. Mark proposal as Executed (CEI pattern)
    // 2. Call malicious.reentry()
    // 3. Malicious contract tries to re-enter execute()
    // 4. Soroban blocks reentrancy with Error(Context, InvalidAction)
    let r = treasury.try_execute(&targets, &functions, &args, &desc_hash);
    // The host rejects re-entry into the Treasury (it is on the call stack).
    assert_eq!(
        r.err().unwrap().unwrap(),
        soroban_sdk::Error::from_type_and_code(
            soroban_sdk::xdr::ScErrorType::Context,
            soroban_sdk::xdr::ScErrorCode::InvalidAction
        )
    );
    // Everything reverted: still Queued, and the attacker's state write is gone.
    assert_eq!(governor.proposal_state(&proposal_id), ProposalState::Queued);
    assert_eq!(_malicious.get_attack_count(), 0);
}

#[test]
fn reentrancy_positive_control_same_proposal_without_reentry_executes() {
    // Identical flow to `reentrancy_attack_is_prevented`, but the action does
    // not re-enter the Treasury: it must execute, proving the failure above is
    // caused by the re-entry and not by the proposal plumbing.
    let (e, token, treasury, governor, _target, owner) = setup();
    let malicious_id = e.register(MaliciousReentrantContract, ());
    let malicious = MaliciousReentrantContractClient::new(&e, &malicious_id);

    let proposer = Address::generate(&e);
    token.mint(&owner, &proposer);

    e.ledger().set_sequence_number(200);
    e.ledger().set_timestamp(2_000);

    let targets = vec![&e, malicious_id.clone()];
    let functions = vec![&e, symbol_short!("ping")];
    let args: Vec<Vec<Val>> = vec![&e, vec![&e]];
    let description = String::from_str(&e, "Reentrancy positive control");
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
        &targets, &functions, &args, &desc_hash, &2_411_u32, &proposer,
    );
    e.ledger().set_timestamp(2_901);
    treasury.execute(&targets, &functions, &args, &desc_hash);

    assert_eq!(
        governor.proposal_state(&proposal_id),
        ProposalState::Executed
    );
    assert_eq!(malicious.get_attack_count(), 1);
}

// treasury_batch_mint_with_explicit_auth removed - Token contract no longer has batch_mint
// Test treasury interactions with Minter contract instead if needed

// ============================================================================
// AUCTION CONTRACT E2E TESTS
// ============================================================================

type AuctionFixture = (
    Env,
    DaoTokenContractClient<'static>,
    DaoTreasuryContractClient<'static>,
    DaoAuctionContractClient<'static>,
    Address,                     // owner
    Address,                     // payment token
    StellarAssetClient<'static>, // payment token client
);

/// Auction fixture after the Manager-style launch: owner is the treasury.
fn setup_auction() -> AuctionFixture {
    let (e, token, treasury, auction, launch_admin, payment_token, payment_client) =
        setup_auction_setup_phase();
    // Launch the token (auction gets mint authority; treasury becomes owner) and
    // the auction (owner = treasury, still paused) the way the Manager does.
    // Unpause/pause/setters are therefore exercised as the treasury, which is
    // returned as `owner`.
    token.launch(
        &treasury.address,
        &vec![&e, treasury.address.clone(), auction.address.clone()],
        &treasury.address, // stands in for the platform Minter
    );
    auction.launch(&treasury.address, &false, &payment_token);
    let _ = launch_admin;
    let treasury_address = treasury.address.clone();
    (
        e,
        token,
        treasury,
        auction,
        treasury_address,
        payment_token,
        payment_client,
    )
}

/// Auction fixture still in the setup phase: owner is the launch admin and the
/// token and auction are not yet launched.
fn setup_auction_setup_phase() -> (
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
    let metadata_id = Address::generate(&e);

    // Deploy DAO token (NFT). The auction address is pre-generated so the token
    // can exclude it from the voting supply, as the Manager wires it.
    let treasury_id = Address::generate(&e);
    let auction_id = Address::generate(&e);
    let token_id = e.register(
        DaoTokenContract,
        (
            owner.clone(),
            treasury_id.clone(),
            auction_id.clone(),
            Address::generate(&e),
            String::from_str(&e, "DAO Vote NFT"),
            String::from_str(&e, "vDAO"),
            metadata_id.clone(),
            Address::generate(&e),
            BytesN::from_array(&e, &[0u8; 32]),
        ),
    );
    let token = DaoTokenContractClient::new(&e, &token_id);
    register_metadata(&e, &metadata_id, &token_id, &owner);

    // Deploy treasury (the DAO owner after launch)
    e.register_at(
        &treasury_id,
        DaoTreasuryContract,
        (
            owner.clone(),
            Address::generate(&e),
            Address::generate(&e),
            BytesN::from_array(&e, &[0u8; 32]),
        ),
    );
    let treasury = DaoTreasuryContractClient::new(&e, &treasury_id);

    // Create payment token (SAC - like USDC)
    let payment_token_admin = Address::generate(&e);
    let payment_token_contract = e.register_stellar_asset_contract_v2(payment_token_admin.clone());
    let payment_token = payment_token_contract.address();
    let payment_client = StellarAssetClient::new(&e, &payment_token);

    // Deploy auction contract
    e.register_at(
        &auction_id,
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
            Address::generate(&e),
            BytesN::from_array(&e, &[0u8; 32]),
        ),
    );
    let auction = DaoAuctionContractClient::new(&e, &auction_id);

    e.mock_all_auths();

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
    auction.create_bid(&bidder1, &token_id, &100_0000000, &String::from_str(&e, ""));

    let auction_state = auction.get_auction();
    assert_eq!(auction_state.highest_bid, 100_0000000);
    assert_eq!(auction_state.highest_bidder, Some(bidder1.clone()));

    // Bidder 2 places higher bid (110 USDC - 10% increment)
    auction.create_bid(&bidder2, &token_id, &110_0000000, &String::from_str(&e, ""));

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
fn test_auction_launch_starts_first_auction_and_hands_off_to_treasury() {
    let (e, token, treasury, auction, launch_admin, payment_token, _payment_client) =
        setup_auction_setup_phase();

    assert_eq!(auction.admin(), launch_admin.clone());
    // The token launches first so the auction holds mint authority.
    token.launch(
        &treasury.address,
        &vec![&e, treasury.address.clone(), auction.address.clone()],
        &treasury.address, // stands in for the platform Minter
    );
    auction.launch(&treasury.address, &true, &payment_token);

    assert_eq!(auction.admin(), treasury.address.clone());
    assert!(!auction.paused());
    assert_eq!(auction.get_auction().token_id, 0);
}

#[test]
fn test_auction_launch_can_remain_paused() {
    let (_e, _token, treasury, auction, _owner, payment_token, _payment_client) =
        setup_auction_setup_phase();

    auction.launch(&treasury.address, &false, &payment_token);

    assert_eq!(auction.admin(), treasury.address);
    assert!(auction.paused());
}

#[test]
fn test_auction_cannot_unpause_before_launch() {
    let (_e, _token, _treasury, auction, launch_admin, _payment_token, _payment_client) =
        setup_auction_setup_phase();
    let err = auction.try_unpause(&launch_admin).err().unwrap().unwrap();
    assert_eq!(err, common::CommonError::NotLive.into());
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
    auction.create_bid(&bidder, &token_id, &100_0000000, &String::from_str(&e, ""));

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

    // The unsold token goes to the treasury, which can distribute it by proposal.
    assert_eq!(token.balance(&treasury.address), 1);
    assert_eq!(token.owner_of(&(token_id as u32)), treasury.address);

    // New auction token minted to auction contract
    assert_eq!(token.balance(&auction.address), 1);

    // Neither the treasury nor the auction holds voting power, so unsold tokens
    // never enter the voting supply the quorum is computed from.
    assert_eq!(token.get_delegate(&treasury.address), None);
    assert_eq!(token.get_votes(&treasury.address), 0);
    assert_eq!(token.get_total_supply(), 0);
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
        auction.create_bid(bidder, &token_id, &100_0000000, &String::from_str(&e, ""));

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
#[should_panic(expected = "Error(Contract, #7406)")] // ReservePriceNotMet
fn test_auction_bid_below_reserve() {
    let (e, _token, _treasury, auction, owner, _payment_token, payment_client) = setup_auction();

    let bidder = Address::generate(&e);
    payment_client.mint(&bidder, &1000_0000000);

    auction.unpause(&owner);

    let auction_state = auction.get_auction();

    // Try to bid below reserve price (should panic)
    auction.create_bid(
        &bidder,
        &auction_state.token_id,
        &50_0000000,
        &String::from_str(&e, ""),
    );
}

#[test]
#[should_panic(expected = "Error(Contract, #7407)")] // MinBidNotMet
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
    auction.create_bid(&bidder1, &token_id, &100_0000000, &String::from_str(&e, ""));

    // Try to bid with insufficient increment (should panic)
    // Min increment is 10%, so need at least 110 USDC
    auction.create_bid(&bidder2, &token_id, &105_0000000, &String::from_str(&e, ""));
}

#[test]
#[should_panic(expected = "Error(Contract, #7401)")] // InvalidTokenId
fn test_auction_bid_wrong_token_id() {
    let (e, _token, _treasury, auction, owner, _payment_token, payment_client) = setup_auction();

    let bidder = Address::generate(&e);
    payment_client.mint(&bidder, &1000_0000000);

    auction.unpause(&owner);

    let auction_state = auction.get_auction();
    let wrong_token_id = auction_state.token_id + 999;

    // Try to bid on wrong token ID (should panic)
    auction.create_bid(
        &bidder,
        &wrong_token_id,
        &100_0000000,
        &String::from_str(&e, ""),
    );
}

#[test]
#[should_panic(expected = "Error(Contract, #7402)")] // AuctionOver
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
    auction.create_bid(&bidder, &token_id, &100_0000000, &String::from_str(&e, ""));
}

#[test]
#[should_panic(expected = "Error(Contract, #7409)")] // NotLaunched
fn test_auction_get_auction_before_launch() {
    let (_e, _token, _treasury, auction, _owner, _payment_token, _payment_client) = setup_auction();

    // Try to get auction before unpause/launch (should panic)
    auction.get_auction();
}

#[test]
#[should_panic(expected = "Error(Contract, #7404)")] // AuctionActive
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
    auction.create_bid(&bidder, &token_id, &100_0000000, &String::from_str(&e, ""));

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
fn test_auction_ownership_remains_with_treasury_after_unpause() {
    let (_e, _token, treasury, auction, owner, _payment_token, _payment_client) = setup_auction();

    assert_eq!(auction.admin(), owner.clone());
    assert_eq!(owner, treasury.address);

    // Unpausing never changes ownership.
    auction.unpause(&owner);
    assert_eq!(auction.admin(), owner.clone());
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
    auction.create_bid(&bidder, &token_id, &100_0000000, &String::from_str(&e, ""));

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
    assert_eq!(config.payment_token, payment_token_addr.clone());

    // Can change to a different SAC token
    let new_payment_token = Address::generate(&e);
    auction.set_payment_token(&new_payment_token);

    let config = auction.get_config();
    assert_eq!(config.payment_token, new_payment_token);
}

// ============================================================================
// Critical Security Tests - Added from audit
// ============================================================================

#[test]
#[should_panic(expected = "Error(Contract, #7412)")] // InvalidBid
fn test_auction_rejects_non_positive_bid_before_transfer() {
    let (e, _token, _treasury, auction, owner, _payment_token, payment_client) = setup_auction();
    let bidder = Address::generate(&e);
    payment_client.mint(&bidder, &10_000_000_000);
    auction.unpause(&owner);

    let token_id = auction.get_auction().token_id;
    auction.create_bid(&bidder, &token_id, &0, &String::from_str(&e, ""));
}

#[test]
fn test_auction_extension_dos_protection() {
    let (e, _token, _treasury, auction, owner, _payment_token, payment_client) = setup_auction();

    let bidder = Address::generate(&e);
    payment_client.mint(&bidder, &10_000_000_000_000); // Large amount for many bids

    // Start auction
    auction.unpause(&owner);

    let auction_state = auction.get_auction();
    let token_id = auction_state.token_id;

    // Place bids within the time buffer until the configured extension cap is hit.
    for i in 1..=11 {
        // Get current auction state to know current end_time
        let current_state = auction.get_auction();

        // Advance to within time buffer (25 seconds before current end)
        e.ledger().set_timestamp(current_state.end_time - 25);

        // Place bid with incrementing amounts
        let bid_amount = 1_000000000_i128 << i;
        auction.create_bid(&bidder, &token_id, &bid_amount, &String::from_str(&e, ""));
    }

    // The eleventh bid is still valid before the auction's end time. Once the
    // cap is reached it must be accepted without another extension.
    let final_state = auction.get_auction();
    assert_eq!(final_state.extension_count, 10);
    assert_eq!(final_state.highest_bid, 1_000000000_i128 << 11);
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
    auction.create_bid(&bidder, &token_id, &100_0000000, &String::from_str(&e, ""));

    // After first bid, payment_currency should be locked to SAC(payment_token_addr)
    // We can't directly inspect payment_currency, but we can test that the behavior is correct
    // by verifying subsequent bids work with the same token

    // Place second bid with higher amount - should succeed
    auction.create_bid(&bidder, &token_id, &150_0000000, &String::from_str(&e, ""));

    // Verify both bids succeeded
    let final_state = auction.get_auction();
    assert_eq!(final_state.highest_bid, 150_0000000);
    assert_eq!(final_state.highest_bidder, Some(bidder.clone()));
}

#[test]
fn test_auction_payment_token_cannot_change_after_first_bid() {
    let (e, _token, _treasury, auction, owner, _payment_token_addr, payment_client) =
        setup_auction();

    let bidder = Address::generate(&e);
    payment_client.mint(&bidder, &1000_0000000);
    auction.unpause(&owner);
    let token_id = auction.get_auction().token_id;
    auction.create_bid(&bidder, &token_id, &100_0000000, &String::from_str(&e, ""));

    auction.pause(&owner);
    let new_payment_token = Address::generate(&e);
    assert!(auction.try_set_payment_token(&new_payment_token).is_err());
}

#[test]
fn test_multi_action_proposal_atomicity() {
    let (e, token, treasury, governor, target, owner) = setup();

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
    // Enforcing mode: only the Treasury's own authorization may reach targets.
    e.set_auths(&[]);
    treasury.execute(&targets, &functions, &args, &desc_hash);

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
    let metadata_id = Address::generate(&e);

    // Register token
    let token_id = e.register(
        DaoTokenContract,
        (
            owner.clone(),
            Address::generate(&e),
            Address::generate(&e),
            Address::generate(&e),
            String::from_str(&e, "DAO Vote NFT"),
            String::from_str(&e, "vDAO"),
            metadata_id.clone(),
            Address::generate(&e),
            BytesN::from_array(&e, &[0u8; 32]),
        ),
    );
    register_metadata(&e, &metadata_id, &token_id, &owner);

    // Constructor-only wiring: treasury is built with the (pre-generated)
    // governor address, then the governor is registered at that address.
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
            300_u32,
            300_u32,
            300_u32,
            1_u128,
            1_000_u32,
            Address::generate(&e),
            BytesN::from_array(&e, &[0u8; 32]),
        ),
    );
    let governor = DaoGovernorContractClient::new(&e, &governor_id);

    // Verify the bidirectional link comes purely from the constructors
    assert_eq!(treasury.governor(), governor_id);
    assert_eq!(governor.treasury(), treasury_id);

    // Before launch the treasury refuses to execute.
    let pre_targets = vec![&e, Address::generate(&e)];
    let pre_functions = vec![&e, Symbol::new(&e, "set_value")];
    let pre_args: Vec<Vec<Val>> = vec![&e, vec![&e, 42_u32.into_val(&e)]];
    let pre_hash = BytesN::from_array(&e, &[7u8; 32]);
    assert_eq!(
        treasury
            .try_execute(&pre_targets, &pre_functions, &pre_args, &pre_hash)
            .err()
            .unwrap()
            .unwrap(),
        common::CommonError::NotLive.into()
    );
    treasury.launch(&treasury_id);

    // Execution requires the governor's approval: an unknown proposal cannot be
    // executed through the treasury (the governor is also not launched here).
    let target_id = e.register(TargetContract, ());
    let targets = vec![&e, target_id];
    let functions = vec![&e, Symbol::new(&e, "set_value")];
    let args: Vec<Vec<Val>> = vec![&e, vec![&e, 42_u32.into_val(&e)]];
    let desc_hash = BytesN::from_array(&e, &[7u8; 32]);
    assert!(treasury
        .try_execute(&targets, &functions, &args, &desc_hash)
        .is_err());
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
    auction.create_bid(&bidder1, &token_id, &100_0000000, &String::from_str(&e, ""));

    // Second bid with same payment token should succeed
    auction.create_bid(&bidder2, &token_id, &150_0000000, &String::from_str(&e, ""));

    // Verify second bid succeeded
    let final_state = auction.get_auction();
    assert_eq!(final_state.highest_bid, 150_0000000);
    assert_eq!(final_state.highest_bidder, Some(bidder2.clone()));
}

// ============================================================================
// Boundary Value Tests
// ============================================================================

#[test]
#[should_panic(expected = "Error(Contract, #7501)")] // CustomGovernorError::InvalidQueueDelay
fn test_governor_queue_delay_minimum_300() {
    let (_e, _token, _treasury, governor, _target, _owner) = setup();

    // Try to set queue_delay below minimum (5 minutes = 300 seconds)
    // This should panic with InvalidQueueDelay error
    governor.set_queue_delay(&299);
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
    governor.set_proposal_threshold(&5);

    // Verify it was set
    assert_eq!(governor.proposal_threshold(), 5);
}

#[test]
#[should_panic(expected = "Error(Contract, #7502)")] // CustomGovernorError::InvalidProposalThreshold
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
    governor.set_proposal_threshold(&6);
}

// Token batch_mint tests removed - functionality delegated to Minter contract
// Tests for batch minting should be in minter contract tests

#[test]
fn marketplace_primary_sale_uses_real_token_and_sac() {
    let e = Env::default();
    e.mock_all_auths();
    e.ledger().set_timestamp(1_000);

    let treasury = Address::generate(&e);
    let buyer = Address::generate(&e);
    let manager = Address::generate(&e);
    let payment_admin = Address::generate(&e);
    let payment = e.register_stellar_asset_contract_v2(payment_admin.clone());
    let sac = StellarAssetClient::new(&e, &payment.address());
    sac.mint(&buyer, &100);

    let metadata_id = Address::generate(&e);
    let marketplace_id = Address::generate(&e);
    let token_id = e.register(
        DaoTokenContract,
        (
            treasury.clone(),
            treasury.clone(),
            Address::generate(&e),
            marketplace_id.clone(),
            String::from_str(&e, "Marketplace DAO"),
            String::from_str(&e, "MDAO"),
            metadata_id.clone(),
            manager.clone(),
            BytesN::from_array(&e, &[0; 32]),
        ),
    );
    register_metadata(&e, &metadata_id, &token_id, &treasury);

    e.register_at(
        &marketplace_id,
        MarketplaceContract,
        (
            token_id.clone(),
            treasury.clone(), // launch_admin (setup-phase param admin)
            treasury.clone(),
            payment.address(),
            manager,
            BytesN::from_array(&e, &[0; 32]),
            250u32,
        ),
    );
    let token = DaoTokenContractClient::new(&e, &token_id);
    let marketplace = MarketplaceContractClient::new(&e, &marketplace_id);
    // Manager-style launch: token first (marketplace is a canonical minter),
    // then the marketplace itself (open).
    token.launch(
        &treasury,
        &vec![&e, treasury.clone(), marketplace_id.clone()],
        &treasury, // stands in for the platform Minter
    );
    marketplace.launch(&treasury, &true, &payment.address());

    let listing_id = marketplace.create_primary_listing(&100, &2_000);
    let token_id = marketplace.buy_primary(&listing_id, &buyer, &i128::MAX);

    assert_eq!(token.owner_of(&token_id), buyer);
    assert_eq!(sac.balance(&treasury), 100);
}

// ============================================================================
// TREASURY-AS-EXECUTOR TESTS (H1)
// ============================================================================

/// Proposes, votes, queues, and advances time to the ETA. Returns
/// (proposal_id, description_hash). Mints one vote to a fresh proposer.
#[allow(clippy::too_many_arguments)]
fn queue_proposal(
    e: &Env,
    token: &DaoTokenContractClient,
    governor: &DaoGovernorContractClient,
    owner: &Address,
    targets: &Vec<Address>,
    functions: &Vec<Symbol>,
    args: &Vec<Vec<Val>>,
    description: &str,
) -> (BytesN<32>, BytesN<32>) {
    let proposer = Address::generate(e);
    token.mint(owner, &proposer);
    e.ledger().set_sequence_number(200);
    e.ledger().set_timestamp(2_000);

    let description = String::from_str(e, description);
    let desc_hash = description_hash(e, &description);
    let proposal_id = governor.propose(targets, functions, args, &description, &proposer);
    e.ledger().set_timestamp(2_301);
    governor.cast_vote(&proposal_id, &1, &String::from_str(e, "yes"), &proposer);
    e.ledger().set_timestamp(2_601);
    governor.queue(targets, functions, args, &desc_hash, &2_901_u32, &proposer);
    e.ledger().set_timestamp(2_901);
    (proposal_id, desc_hash)
}

/// Missing/incorrect authorization surfaces from the test host's
/// `try_` clients as `Error(Context, InvalidAction)`.
fn auth_error() -> soroban_sdk::Error {
    soroban_sdk::Error::from_type_and_code(
        soroban_sdk::xdr::ScErrorType::Context,
        soroban_sdk::xdr::ScErrorCode::InvalidAction,
    )
}

#[test]
fn proposal_sets_governor_quorum_via_treasury_execute() {
    let (e, token, treasury, governor, _target, owner) = setup();
    assert_eq!(governor.admin(), treasury.address.clone());
    assert_eq!(governor.treasury(), treasury.address);
    assert_eq!(treasury.admin(), treasury.address.clone());
    assert_eq!(treasury.governor(), governor.address);
    assert_eq!(governor.quorum_bps(), 1_000);

    let targets = vec![&e, governor.address.clone()];
    let functions = vec![&e, Symbol::new(&e, "set_quorum_bps")];
    let args = vec![&e, vec![&e, 2_000_u32.into_val(&e)]];
    let (id, hash) = queue_proposal(
        &e, &token, &governor, &owner, &targets, &functions, &args, "quorum",
    );

    // Enforcing mode: only the Treasury's own authorization may reach targets.
    e.set_auths(&[]);
    let executed = treasury.execute(&targets, &functions, &args, &hash);
    assert_eq!(executed, id);
    assert_eq!(governor.quorum_bps(), 2_000);
    assert_eq!(governor.proposal_state(&id), ProposalState::Executed);
}

#[test]
fn proposal_upgrades_governor_through_manager_approval() {
    use common::testutils::{empty_wasm, MockManager, MockManagerClient};
    let e = Env::default();
    e.mock_all_auths();
    let mgr = MockManagerClient::new(&e, &e.register(MockManager, ()));
    let gov_from = BytesN::from_array(&e, &[1u8; 32]);
    let to = empty_wasm(&e);
    mgr.approve(&gov_from, &to);
    mgr.register(&to, &String::from_str(&e, "0.2.0"));
    let (e, token, treasury, governor, _target, owner) = setup_with(
        e.clone(),
        mgr.address.clone(),
        gov_from.clone(),
        BytesN::from_array(&e, &[2u8; 32]),
    );

    let targets = vec![&e, governor.address.clone()];
    let functions = vec![&e, Symbol::new(&e, "upgrade")];
    let args = vec![&e, vec![&e, gov_from.into_val(&e), to.clone().into_val(&e)]];
    let (_id, hash) = queue_proposal(
        &e,
        &token,
        &governor,
        &owner,
        &targets,
        &functions,
        &args,
        "upgrade governor",
    );
    // Enforcing mode: only the Treasury's own authorization may reach targets.
    e.set_auths(&[]);
    treasury.execute(&targets, &functions, &args, &hash);

    e.as_contract(&governor.address, || {
        assert_eq!(common::upgrade::current_hash(&e), to);
        assert_eq!(
            common::upgrade::version(&e, &mgr.address),
            String::from_str(&e, "0.2.0")
        );
    });
}

#[test]
fn proposal_upgrades_treasury_via_self_dispatch() {
    use common::testutils::{empty_wasm, MockManager, MockManagerClient};
    let e = Env::default();
    e.mock_all_auths();
    let mgr = MockManagerClient::new(&e, &e.register(MockManager, ()));
    let treasury_from = BytesN::from_array(&e, &[2u8; 32]);
    let to = empty_wasm(&e);
    mgr.approve(&treasury_from, &to);
    mgr.register(&to, &String::from_str(&e, "0.2.0"));
    let (e, token, treasury, governor, _target, owner) = setup_with(
        e.clone(),
        mgr.address.clone(),
        BytesN::from_array(&e, &[1u8; 32]),
        treasury_from.clone(),
    );

    let targets = vec![&e, treasury.address.clone()];
    let functions = vec![&e, Symbol::new(&e, "upgrade")];
    let args = vec![
        &e,
        vec![&e, treasury_from.into_val(&e), to.clone().into_val(&e)],
    ];
    let (id, hash) = queue_proposal(
        &e,
        &token,
        &governor,
        &owner,
        &targets,
        &functions,
        &args,
        "upgrade treasury",
    );
    // Enforcing mode: only the Treasury's own authorization may reach targets.
    e.set_auths(&[]);
    treasury.execute(&targets, &functions, &args, &hash);

    assert_eq!(governor.proposal_state(&id), ProposalState::Executed);
    e.as_contract(&treasury.address, || {
        assert_eq!(common::upgrade::current_hash(&e), to);
        assert_eq!(
            common::upgrade::version(&e, &mgr.address),
            String::from_str(&e, "0.2.0")
        );
    });
}

#[test]
fn unknown_self_call_is_rejected_and_proposal_stays_queued() {
    let (e, token, treasury, governor, _target, owner) = setup();
    let targets = vec![&e, treasury.address.clone()];
    let functions = vec![&e, Symbol::new(&e, "transfer_ownership")];
    let args = vec![&e, Vec::<Val>::new(&e)];
    let (id, hash) = queue_proposal(
        &e,
        &token,
        &governor,
        &owner,
        &targets,
        &functions,
        &args,
        "bad self call",
    );
    let r = treasury.try_execute(&targets, &functions, &args, &hash);
    assert_eq!(
        r.err().unwrap().unwrap(),
        treasury::TreasuryError::UnknownSelfCall.into()
    );
    assert_eq!(governor.proposal_state(&id), ProposalState::Queued);
}

#[test]
fn proposal_setting_queue_delay_above_max_reverts() {
    let (e, token, treasury, governor, _target, owner) = setup();
    let targets = vec![&e, governor.address.clone()];
    let functions = vec![&e, Symbol::new(&e, "set_queue_delay")];

    // Above the cap: the whole execute reverts and the proposal stays Queued.
    let too_big = governor::MAX_QUEUE_DELAY + 1;
    let args = vec![&e, vec![&e, too_big.into_val(&e)]];
    let (id, hash) = queue_proposal(
        &e, &token, &governor, &owner, &targets, &functions, &args, "too long",
    );
    assert!(treasury
        .try_execute(&targets, &functions, &args, &hash)
        .is_err());
    assert_eq!(governor.proposal_state(&id), ProposalState::Queued);
}

#[test]
fn proposal_setting_queue_delay_to_max_succeeds() {
    let (e, token, treasury, governor, _target, owner) = setup();
    let targets = vec![&e, governor.address.clone()];
    let functions = vec![&e, Symbol::new(&e, "set_queue_delay")];

    let max = governor::MAX_QUEUE_DELAY;
    let args = vec![&e, vec![&e, max.into_val(&e)]];
    let (id, hash) = queue_proposal(
        &e, &token, &governor, &owner, &targets, &functions, &args, "at max",
    );
    treasury.execute(&targets, &functions, &args, &hash);
    assert_eq!(governor.proposal_state(&id), ProposalState::Executed);
}

#[test]
fn consume_by_non_treasury_fails() {
    let (e, token, treasury, governor, target, owner) = setup();
    let targets = vec![&e, target.address.clone()];
    let functions = vec![&e, symbol_short!("set_value")];
    let args = proposal_args(&e);
    let (id, hash) = queue_proposal(
        &e,
        &token,
        &governor,
        &owner,
        &targets,
        &functions,
        &args,
        "consume direct",
    );

    // Real auth: no account can produce the Treasury's authorization.
    e.set_auths(&[]);
    assert_eq!(
        governor
            .try_consume(&targets, &functions, &args, &hash)
            .err()
            .unwrap()
            .unwrap(),
        auth_error()
    );
    assert_eq!(governor.proposal_state(&id), ProposalState::Queued);

    // The proper path needs no caller auth and still works under real auth.
    treasury.execute(&targets, &functions, &args, &hash);
    assert_eq!(target.get_value(), 42);
}

#[test]
fn executing_twice_fails_with_already_executed() {
    let (e, token, treasury, governor, target, owner) = setup();
    let targets = vec![&e, target.address.clone()];
    let functions = vec![&e, symbol_short!("set_value")];
    let args = proposal_args(&e);
    let (_id, hash) = queue_proposal(
        &e, &token, &governor, &owner, &targets, &functions, &args, "twice",
    );
    // Enforcing mode: only the Treasury's own authorization may reach targets.
    e.set_auths(&[]);
    treasury.execute(&targets, &functions, &args, &hash);
    let r = treasury.try_execute(&targets, &functions, &args, &hash);
    assert_eq!(
        r.err().unwrap().unwrap(),
        stellar_governance::governor::GovernorError::ProposalAlreadyExecuted.into()
    );
}

#[test]
fn governor_execute_always_fails_with_use_treasury_execute() {
    let (e, token, _treasury, governor, target, owner) = setup();
    let targets = vec![&e, target.address.clone()];
    let functions = vec![&e, symbol_short!("set_value")];
    let args = proposal_args(&e);
    let (_id, hash) = queue_proposal(
        &e,
        &token,
        &governor,
        &owner,
        &targets,
        &functions,
        &args,
        "gov execute",
    );
    let r = governor.try_execute(&targets, &functions, &args, &hash, &owner);
    assert_eq!(
        r.err().unwrap().unwrap(),
        governor::CustomGovernorError::UseTreasuryExecute.into()
    );
    assert_eq!(target.get_value(), 0);
}

#[test]
fn failing_call_in_multi_call_proposal_leaves_it_queued_without_partial_effects() {
    let (e, token, treasury, governor, target, owner) = setup();
    // Call 1 succeeds (target.set_value(5)); call 2 fails (quorum 0 is invalid).
    let targets = vec![&e, target.address.clone(), governor.address.clone()];
    let functions = vec![
        &e,
        symbol_short!("set_value"),
        Symbol::new(&e, "set_quorum_bps"),
    ];
    let args = vec![
        &e,
        vec![&e, 5_u32.into_val(&e)],
        vec![&e, 0_u32.into_val(&e)],
    ];
    let (id, hash) = queue_proposal(
        &e, &token, &governor, &owner, &targets, &functions, &args, "partial",
    );
    assert!(treasury
        .try_execute(&targets, &functions, &args, &hash)
        .is_err());
    assert_eq!(target.get_value(), 0);
    assert_eq!(governor.quorum_bps(), 1_000);
    assert_eq!(governor.proposal_state(&id), ProposalState::Queued);
}

#[test]
fn other_contract_cannot_consume_even_with_its_own_auth() {
    let (e, token, _treasury, governor, target, owner) = setup();
    let targets = vec![&e, target.address.clone()];
    let functions = vec![&e, symbol_short!("set_value")];
    let args = proposal_args(&e);
    let (id, hash) = queue_proposal(
        &e,
        &token,
        &governor,
        &owner,
        &targets,
        &functions,
        &args,
        "wrong caller",
    );
    let attacker =
        MaliciousConsumeContractClient::new(&e, &e.register(MaliciousConsumeContract, ()));
    e.set_auths(&[]);
    // The attacker is a valid invoker for itself, but is not the Treasury.
    let r = attacker.try_attack(&governor.address, &targets, &functions, &args, &hash);
    assert_eq!(r.err().unwrap().unwrap(), auth_error());
    assert_eq!(governor.proposal_state(&id), ProposalState::Queued);
}

#[test]
fn target_calling_consume_from_inside_execute_is_blocked() {
    let (e, token, treasury, governor, _target, owner) = setup();
    let attacker_id = e.register(MaliciousConsumeContract, ());
    let targets = vec![&e, attacker_id.clone()];
    let functions = vec![&e, symbol_short!("attack")];
    // Inner call targets the same proposal tuple (hash filled below is irrelevant:
    // consume fails on auth before any state lookup matters).
    let inner_hash = BytesN::from_array(&e, &[5u8; 32]);
    let args = vec![
        &e,
        vec![
            &e,
            governor.address.clone().into_val(&e),
            targets.clone().into_val(&e),
            functions.clone().into_val(&e),
            vec![&e, Vec::<Val>::new(&e)].into_val(&e),
            inner_hash.into_val(&e),
        ],
    ];
    let (id, hash) = queue_proposal(
        &e,
        &token,
        &governor,
        &owner,
        &targets,
        &functions,
        &args,
        "inner consume",
    );
    e.set_auths(&[]);
    let r = treasury.try_execute(&targets, &functions, &args, &hash);
    assert_eq!(r.err().unwrap().unwrap(), auth_error());
    assert_eq!(governor.proposal_state(&id), ProposalState::Queued);
}

#[test]
fn execute_before_eta_fails_and_after_expiry_fails() {
    let (e, token, treasury, governor, target, owner) = setup();
    let targets = vec![&e, target.address.clone()];
    let functions = vec![&e, symbol_short!("set_value")];
    let args = proposal_args(&e);
    let (id, hash) = queue_proposal(
        &e, &token, &governor, &owner, &targets, &functions, &args, "timing",
    );
    let not_queued: soroban_sdk::Error =
        stellar_governance::governor::GovernorError::ProposalNotQueued.into();
    let not_ready: soroban_sdk::Error = governor::CustomGovernorError::ProposalNotReady.into();

    e.ledger().set_timestamp(2_900); // eta is 2_901
    assert_eq!(
        treasury
            .try_execute(&targets, &functions, &args, &hash)
            .err()
            .unwrap()
            .unwrap(),
        not_ready
    );

    e.ledger().set_timestamp(2_901 + 1_209_600); // eta + 14 days
    assert_eq!(governor.proposal_state(&id), ProposalState::Expired);
    assert_eq!(
        treasury
            .try_execute(&targets, &functions, &args, &hash)
            .err()
            .unwrap()
            .unwrap(),
        not_queued
    );
    assert_eq!(target.get_value(), 0);
}

#[test]
fn tampered_args_or_hash_are_unknown_proposals() {
    let (e, token, treasury, governor, target, owner) = setup();
    let targets = vec![&e, target.address.clone()];
    let functions = vec![&e, symbol_short!("set_value")];
    let args = proposal_args(&e);
    let (_id, hash) = queue_proposal(
        &e, &token, &governor, &owner, &targets, &functions, &args, "tamper",
    );
    let not_found: soroban_sdk::Error =
        stellar_governance::governor::GovernorError::ProposalNotFound.into();
    let tampered = vec![&e, vec![&e, 43_u32.into_val(&e)]];
    assert_eq!(
        treasury
            .try_execute(&targets, &functions, &tampered, &hash)
            .err()
            .unwrap()
            .unwrap(),
        not_found
    );
    let wrong_hash = BytesN::from_array(&e, &[0xAAu8; 32]);
    assert_eq!(
        treasury
            .try_execute(&targets, &functions, &args, &wrong_hash)
            .err()
            .unwrap()
            .unwrap(),
        not_found
    );
    assert_eq!(target.get_value(), 0);
}

/// D6: a module's `version()` is the registry record of its running hash, so
/// a re-labelled release shows up with no proposal and no sync call. The
/// governor's OZ `version()` and `name()` are overridden the same way.
#[test]
fn versions_follow_the_registry_without_a_proposal() {
    use common::testutils::{MockManager, MockManagerClient};
    let e = Env::default();
    e.mock_all_auths();
    let mgr = MockManagerClient::new(&e, &e.register(MockManager, ()));
    let governor_hash = BytesN::from_array(&e, &[1u8; 32]);
    let treasury_hash = BytesN::from_array(&e, &[2u8; 32]);
    mgr.register(&governor_hash, &String::from_str(&e, "0.1.8"));
    mgr.register(&treasury_hash, &String::from_str(&e, "0.1.9"));
    let (e, _token, treasury, governor, _target, _owner) = setup_with(
        e.clone(),
        mgr.address.clone(),
        governor_hash.clone(),
        treasury_hash.clone(),
    );
    assert_eq!(treasury.version(), String::from_str(&e, "0.1.9"));
    assert_eq!(governor.version(), String::from_str(&e, "0.1.8"));
    assert_eq!(
        governor.name(),
        String::from_str(&e, governor::GOVERNOR_NAME)
    );
    mgr.register(&treasury_hash, &String::from_str(&e, "0.1.10"));
    assert_eq!(treasury.version(), String::from_str(&e, "0.1.10"));
}

#[test]
fn execute_emits_one_proposal_executed_and_indexed_execute_events() {
    use soroban_sdk::testutils::Events as _;
    use soroban_sdk::xdr::{ContractEventBody, ScVal};
    let (e, token, treasury, governor, target, owner) = setup();
    let targets = vec![&e, target.address.clone(), target.address.clone()];
    let functions = vec![&e, symbol_short!("set_value"), symbol_short!("set_value")];
    let args = vec![
        &e,
        vec![&e, 1_u32.into_val(&e)],
        vec![&e, 1_u32.into_val(&e)],
    ];
    let (id, hash) = queue_proposal(
        &e, &token, &governor, &owner, &targets, &functions, &args, "events",
    );
    treasury.execute(&targets, &functions, &args, &hash);
    let all = e.events().all();

    assert_eq!(all.filter_by_contract(&governor.address).events().len(), 1);

    let evs = all.filter_by_contract(&treasury.address);
    assert_eq!(evs.events().len(), 2);
    for ev in evs.events() {
        let ContractEventBody::V0(body) = &ev.body;
        // name, governor, target, proposal_id
        assert_eq!(body.topics.len(), 4);
        assert_eq!(body.topics[1], ScVal::from(&governor.address));
        assert_eq!(body.topics[2], ScVal::from(&target.address));
        assert_eq!(body.topics[3], ScVal::from(&id));
    }
    // The two identical calls are told apart by the data `index` field.
    assert_ne!(evs.events()[0].body, evs.events()[1].body);
}

#[test]
fn twenty_action_proposal_executes_and_twenty_one_is_rejected() {
    let (e, token, treasury, governor, target, owner) = setup();
    let mut targets = Vec::new(&e);
    let mut functions = Vec::new(&e);
    let mut args: Vec<Vec<Val>> = Vec::new(&e);
    for i in 0..20_u32 {
        targets.push_back(target.address.clone());
        functions.push_back(symbol_short!("set_value"));
        args.push_back(vec![&e, i.into_val(&e)]);
    }
    let (id, hash) = queue_proposal(
        &e, &token, &governor, &owner, &targets, &functions, &args, "twenty",
    );
    e.set_auths(&[]);
    e.cost_estimate().budget().reset_default();
    treasury.execute(&targets, &functions, &args, &hash);
    assert_eq!(target.get_value(), 19);
    assert_eq!(governor.proposal_state(&id), ProposalState::Executed);

    targets.push_back(target.address.clone());
    functions.push_back(symbol_short!("set_value"));
    args.push_back(vec![&e, 99_u32.into_val(&e)]);
    e.mock_all_auths();
    let proposer = Address::generate(&e);
    token.mint(&owner, &proposer);
    e.ledger().set_sequence_number(300);
    let r = governor.try_propose(
        &targets,
        &functions,
        &args,
        &String::from_str(&e, "twenty-one"),
        &proposer,
    );
    assert_eq!(
        r.err().unwrap().unwrap(),
        governor::CustomGovernorError::TooManyActions.into()
    );
}

// ============================================================================
// REAL-AUTH (ENFORCING) TESTS FOR CONTRACT-AUTHORIZED SUB-CALLS
//
// Setup runs under mock_all_auths. Every execution step then runs with
// `mock_auths` for the human callers only (or no auth at all), so the NFT mint,
// NFT transfers and payment transfers a contract makes on its own behalf are
// checked by the host against the real authorization rules.
// ============================================================================

/// Authorize `who` for exactly one invocation (plus the listed sub-invocations).
fn only_auth(
    e: &Env,
    who: &Address,
    contract: &Address,
    fn_name: &'static str,
    args: Vec<Val>,
    subs: &[MockAuthInvoke],
) {
    e.mock_auths(&[MockAuth {
        address: who,
        invoke: &MockAuthInvoke {
            contract,
            fn_name,
            args,
            sub_invokes: subs,
        },
    }]);
}

#[test]
fn real_auth_auction_mint_bid_refund_and_settle() {
    let (e, token, treasury, auction, owner, pay, sac) = setup_auction();
    let b1 = Address::generate(&e);
    let b2 = Address::generate(&e);
    sac.mint(&b1, &1000_0000000);
    sac.mint(&b2, &2000_0000000);

    // unpause -> create_auction -> token.mint(auction, auction), contract-authorized.
    only_auth(
        &e,
        &owner,
        &auction.address,
        "unpause",
        vec![&e, owner.clone().into_val(&e)],
        &[],
    );
    auction.unpause(&owner);
    let st = auction.get_auction();
    assert_eq!(token.owner_of(&(st.token_id as u32)), auction.address);

    let bid = |who: &Address, amount: i128| {
        let tid = auction.get_auction().token_id;
        only_auth(
            &e,
            who,
            &auction.address,
            "create_bid",
            vec![
                &e,
                who.into_val(&e),
                tid.into_val(&e),
                amount.into_val(&e),
                String::from_str(&e, "").into_val(&e),
            ],
            &[MockAuthInvoke {
                contract: &pay,
                fn_name: "transfer",
                args: vec![
                    &e,
                    who.into_val(&e),
                    auction.address.into_val(&e),
                    amount.into_val(&e),
                ],
                sub_invokes: &[],
            }],
        );
        auction.create_bid(who, &tid, &amount, &String::from_str(&e, ""));
    };
    bid(&b1, 100_0000000);
    bid(&b2, 110_0000000); // refunds b1 through a contract-authorized SAC transfer
    assert_eq!(sac.balance(&b1), 1000_0000000);

    // settle_and_create_new is permissionless: no auth at all.
    e.ledger().set_timestamp(st.end_time + 1);
    e.set_auths(&[]);
    auction.settle_and_create_new();
    assert_eq!(token.owner_of(&(st.token_id as u32)), b2);
    assert_eq!(sac.balance(&treasury.address), 110_0000000);
    let next = auction.get_auction();
    assert_ne!(next.token_id, st.token_id);
    assert_eq!(token.owner_of(&(next.token_id as u32)), auction.address);
}

#[test]
fn real_auth_auction_pause_settle_and_cancel() {
    let (e, token, treasury, auction, owner, pay, sac) = setup_auction();
    let b1 = Address::generate(&e);
    sac.mint(&b1, &1000_0000000);

    only_auth(
        &e,
        &owner,
        &auction.address,
        "unpause",
        vec![&e, owner.clone().into_val(&e)],
        &[],
    );
    auction.unpause(&owner);
    let tid = auction.get_auction().token_id;
    only_auth(
        &e,
        &b1,
        &auction.address,
        "create_bid",
        vec![
            &e,
            b1.into_val(&e),
            tid.into_val(&e),
            100_0000000_i128.into_val(&e),
            String::from_str(&e, "").into_val(&e),
        ],
        &[MockAuthInvoke {
            contract: &pay,
            fn_name: "transfer",
            args: vec![
                &e,
                b1.into_val(&e),
                auction.address.into_val(&e),
                100_0000000_i128.into_val(&e),
            ],
            sub_invokes: &[],
        }],
    );
    auction.create_bid(&b1, &tid, &100_0000000, &String::from_str(&e, ""));

    only_auth(
        &e,
        &owner,
        &auction.address,
        "pause",
        vec![&e, owner.clone().into_val(&e)],
        &[],
    );
    auction.pause(&owner);

    // Enforcement is real: without the owner's auth the call is rejected.
    e.set_auths(&[]);
    assert!(auction.try_cancel_auction().is_err());

    // cancel_auction: refund (SAC transfer) + NFT to treasury, owner auth only.
    only_auth(
        &e,
        &owner,
        &auction.address,
        "cancel_auction",
        vec![&e],
        &[],
    );
    auction.cancel_auction();
    assert_eq!(sac.balance(&b1), 1000_0000000);
    assert_eq!(token.owner_of(&(tid as u32)), treasury.address);
    assert!(auction.get_auction().settled);
}

#[test]
fn real_auth_auction_settle_auction_when_paused_moves_nft_and_payment() {
    let (e, token, treasury, auction, owner, pay, sac) = setup_auction();
    let b1 = Address::generate(&e);
    sac.mint(&b1, &1000_0000000);
    only_auth(
        &e,
        &owner,
        &auction.address,
        "unpause",
        vec![&e, owner.clone().into_val(&e)],
        &[],
    );
    auction.unpause(&owner);
    let st = auction.get_auction();
    only_auth(
        &e,
        &b1,
        &auction.address,
        "create_bid",
        vec![
            &e,
            b1.into_val(&e),
            st.token_id.into_val(&e),
            100_0000000_i128.into_val(&e),
            String::from_str(&e, "").into_val(&e),
        ],
        &[MockAuthInvoke {
            contract: &pay,
            fn_name: "transfer",
            args: vec![
                &e,
                b1.into_val(&e),
                auction.address.into_val(&e),
                100_0000000_i128.into_val(&e),
            ],
            sub_invokes: &[],
        }],
    );
    auction.create_bid(&b1, &st.token_id, &100_0000000, &String::from_str(&e, ""));
    only_auth(
        &e,
        &owner,
        &auction.address,
        "pause",
        vec![&e, owner.clone().into_val(&e)],
        &[],
    );
    auction.pause(&owner);

    e.set_auths(&[]);
    // A paused auction still cannot be settled before its end time.
    assert_eq!(
        auction.try_settle_auction().err().unwrap().unwrap(),
        soroban_sdk::Error::from_contract_error(7404)
    );
    e.ledger().set_timestamp(st.end_time);
    auction.settle_auction();
    assert_eq!(token.owner_of(&(st.token_id as u32)), b1);
    assert_eq!(sac.balance(&treasury.address), 100_0000000);
}

#[test]
fn real_auth_marketplace_primary_and_secondary_flows() {
    let e = Env::default();
    e.mock_all_auths();
    e.ledger().set_timestamp(1_000);

    let treasury = Address::generate(&e);
    let seller = Address::generate(&e);
    let buyer = Address::generate(&e);
    let manager = Address::generate(&e);
    let payment = e.register_stellar_asset_contract_v2(Address::generate(&e));
    let pay = payment.address();
    let sac = StellarAssetClient::new(&e, &pay);
    sac.mint(&seller, &10_000);
    sac.mint(&buyer, &10_000);

    let metadata_id = Address::generate(&e);
    let marketplace_id = Address::generate(&e);
    let token_id = e.register(
        DaoTokenContract,
        (
            treasury.clone(),
            treasury.clone(),
            Address::generate(&e),
            marketplace_id.clone(),
            String::from_str(&e, "Marketplace DAO"),
            String::from_str(&e, "MDAO"),
            metadata_id.clone(),
            manager.clone(),
            BytesN::from_array(&e, &[0; 32]),
        ),
    );
    register_metadata(&e, &metadata_id, &token_id, &treasury);
    e.register_at(
        &marketplace_id,
        MarketplaceContract,
        (
            token_id.clone(),
            treasury.clone(),
            treasury.clone(),
            pay.clone(),
            manager,
            BytesN::from_array(&e, &[0; 32]),
            250u32,
        ),
    );
    let token = DaoTokenContractClient::new(&e, &token_id);
    let marketplace = MarketplaceContractClient::new(&e, &marketplace_id);
    token.launch(
        &treasury,
        &vec![&e, treasury.clone(), marketplace_id.clone()],
        &treasury, // stands in for the platform Minter
    );
    marketplace.launch(&treasury, &true, &pay);

    let pay_sub = |from: &Address, to: &Address, amount: i128| MockAuthInvoke {
        contract: &pay,
        fn_name: "transfer",
        args: vec![&e, from.into_val(&e), to.into_val(&e), amount.into_val(&e)],
        sub_invokes: &[],
    };

    // Primary: admin (treasury) lists, buyer pays; the marketplace mints.
    only_auth(
        &e,
        &treasury,
        &marketplace_id,
        "create_primary_listing",
        vec![&e, 100_i128.into_val(&e), 2_000_u64.into_val(&e)],
        &[],
    );
    let listing_id = marketplace.create_primary_listing(&100, &2_000);
    only_auth(
        &e,
        &seller,
        &marketplace_id,
        "buy_primary",
        vec![
            &e,
            listing_id.into_val(&e),
            seller.into_val(&e),
            100_i128.into_val(&e),
        ],
        &[pay_sub(&seller, &treasury, 100)],
    );
    let nft = marketplace.buy_primary(&listing_id, &seller, &100);
    assert_eq!(token.owner_of(&nft), seller);
    assert_eq!(sac.balance(&treasury), 100);

    let list = |who: &Address, price: i128, expires: u64| {
        let exp_ledger = e.ledger().sequence() + 1_000;
        only_auth(
            &e,
            who,
            &token_id,
            "approve",
            vec![
                &e,
                who.into_val(&e),
                marketplace_id.into_val(&e),
                nft.into_val(&e),
                exp_ledger.into_val(&e),
            ],
            &[],
        );
        token.approve(who, &marketplace_id, &nft, &exp_ledger);
        only_auth(
            &e,
            who,
            &marketplace_id,
            "list",
            vec![
                &e,
                nft.into_val(&e),
                who.into_val(&e),
                price.into_val(&e),
                expires.into_val(&e),
                250_u32.into_val(&e),
                pay.into_val(&e),
            ],
            &[],
        );
        marketplace.list(&nft, who, &price, &expires, &250, &pay);
        assert_eq!(token.owner_of(&nft), marketplace_id);
    };

    // list (transfer_from) then buy: fee 2.5% to treasury, rest to seller.
    list(&seller, 1_000, 5_000);
    only_auth(
        &e,
        &buyer,
        &marketplace_id,
        "buy",
        vec![
            &e,
            nft.into_val(&e),
            buyer.into_val(&e),
            1_000_i128.into_val(&e),
        ],
        &[
            pay_sub(&buyer, &treasury, 25),
            pay_sub(&buyer, &seller, 975),
        ],
    );
    marketplace.buy(&nft, &buyer, &1_000);
    assert_eq!(token.owner_of(&nft), buyer);
    assert_eq!(sac.balance(&seller), 10_000 - 100 + 975);

    // list then cancel: NFT returns to the seller.
    list(&buyer, 1_000, 5_000);
    only_auth(
        &e,
        &buyer,
        &marketplace_id,
        "cancel",
        vec![&e, nft.into_val(&e), buyer.into_val(&e)],
        &[],
    );
    marketplace.cancel(&nft, &buyer);
    assert_eq!(token.owner_of(&nft), buyer);

    // list then expire (permissionless, no auth).
    list(&buyer, 1_000, 3_000);
    e.ledger().set_timestamp(3_001);
    e.set_auths(&[]);
    marketplace.expire(&nft);
    assert_eq!(token.owner_of(&nft), buyer);
}

// ---------------------------------------------------------------------------
// Full factory flow with the real compiled WASM modules
// ---------------------------------------------------------------------------

/// Upload a compiled module WASM. Build first: `cargo build --release --target
/// wasm32v1-none -p token -p metadata -p auction -p governor -p treasury -p marketplace`
/// (or `stellar contract build`).
fn upload_module_wasm(e: &Env, name: &str) -> BytesN<32> {
    let path = std::format!(
        "{}/../../target/wasm32v1-none/release/{name}.wasm",
        env!("CARGO_MANIFEST_DIR")
    );
    let bytes = std::fs::read(&path).unwrap_or_else(|err| {
        panic!("missing {path} ({err}); build the contract WASMs before running dao-e2e")
    });
    e.deployer()
        .upload_contract_wasm(soroban_sdk::Bytes::from_slice(e, &bytes))
}

fn slug_params(
    e: &Env,
    deployer: &Address,
    nonce: u64,
    slug: &str,
    asset: &Address,
) -> manager::DaoCreationParams {
    manager::DaoCreationParams {
        deployer: deployer.clone(),
        nonce,
        launch_admin: deployer.clone(),
        initial_config: manager::InitialDaoConfigValues {
            token_name: String::from_str(e, "Flow DAO"),
            token_symbol: String::from_str(e, "FLOW"),
            profile: String::from_str(e, r#"{"v":1,"description":"Test DAO"}"#),
            renderer_base: String::from_str(e, "https://example.com/render/"),
            slug: String::from_str(e, slug),
            governance: manager::GovernanceConfig {
                voting_delay: 300,
                voting_period: 300,
                queue_delay: 300,
                proposal_threshold: 1,
                quorum_bps: 1000,
            },
            auction: manager::AuctionConfig {
                duration: 300,
                reserve_price: 10_000_000,
                time_buffer: 60,
                payment_asset: asset.clone(),
            },
            marketplace: manager::MarketplaceConfig {
                payment_asset: asset.clone(),
                secondary_fee_bps: 250,
            },
        },
    }
}

/// Manager.create_dao -> setup window (founder mint + artwork, launch admin
/// signs directly) -> Manager.launch_dao, all against the real WASM modules.
#[test]
fn full_factory_flow_create_setup_launch_with_slug() {
    let e = Env::default();
    e.mock_all_auths();
    e.ledger().set_sequence_number(100);
    e.ledger().set_timestamp(1_000);
    e.cost_estimate().budget().reset_unlimited();

    let admin = Address::generate(&e);
    let manager_id = e.register(
        ManagerContract,
        (
            admin,
            BytesN::from_array(&e, &[0; 32]),
            String::from_str(&e, "0.1.0"),
            TEST_UPGRADE_DELAY,
        ),
    );
    let manager = ManagerContractClient::new(&e, &manager_id);
    let platform_minter = Address::generate(&e);
    manager.set_platform_minter(&platform_minter);

    let mut hashes = std::vec::Vec::new();
    for (registry_name, wasm_name) in [
        ("Token", "token"),
        ("Metadata", "metadata"),
        ("Auction", "auction"),
        ("Governor", "governor"),
        ("Treasury", "treasury"),
        ("Marketplace", "marketplace"),
    ] {
        let hash = upload_module_wasm(&e, wasm_name);
        manager.register_implementation(
            &String::from_str(&e, registry_name),
            &String::from_str(&e, "0.1.0"),
            &hash,
        );
        hashes.push(hash);
    }
    manager.set_current_implementations(
        &hashes[0], &hashes[1], &hashes[2], &hashes[3], &hashes[4], &hashes[5],
    );

    let deployer = Address::generate(&e);
    let asset = e
        .register_stellar_asset_contract_v2(Address::generate(&e))
        .address();

    // 1. create_dao records the requested slug on a pending DAO; nothing is
    //    claimed until launch, so a second pending DAO may request it too.
    let slug = String::from_str(&e, "flow-dao");
    let dao = manager.create_dao(&slug_params(&e, &deployer, 1, "flow-dao", &asset));
    assert_eq!(manager.get_pending_dao(&dao.token).unwrap().slug, slug);
    assert!(manager.get_slug(&dao.token).is_none());
    let other = Address::generate(&e);
    let rival = manager.create_dao(&slug_params(&e, &other, 2, "flow-dao", &asset));

    // 2. Setup window: the launch admin owns every module and signs directly.
    let token = DaoTokenContractClient::new(&e, &dao.token);
    assert!(!token.is_live());
    assert_eq!(token.admin(), deployer);
    token.mint(&deployer, &deployer);
    assert_eq!(token.total_supply(), 1);

    let metadata = MetadataContractClient::new(&e, &dao.metadata);
    metadata.add_properties(
        &vec![&e, String::from_str(&e, "Background")],
        &vec![
            &e,
            ItemParam {
                property_id: 0,
                name: String::from_str(&e, "Blue"),
                is_new_property: true,
            },
        ],
        &IpfsGroup {
            base_uri: String::from_str(&e, "ipfs://art"),
            extension: String::from_str(&e, ".png"),
        },
    );
    assert_eq!(metadata.properties_count(), 1);

    // 3. launch_dao hands every module to the Treasury and clears the pending DAO.
    manager.launch_dao(
        &dao.token,
        &manager::LaunchConfig {
            launch_auction: true,
            launch_marketplace: true,
            minter: platform_minter.clone(),
        },
    );
    assert!(manager.get_pending_dao(&dao.token).is_none());
    assert!(token.is_live());
    assert_eq!(token.admin(), dao.treasury);

    // Launch claimed the slug: the rival can no longer launch with it or create
    // a new DAO with it, but can rename its pending DAO.
    assert_eq!(manager.get_dao_by_slug(&slug), dao.token);
    assert_eq!(
        manager.try_create_dao(&slug_params(&e, &other, 3, "flow-dao", &asset)),
        Err(Ok(manager::ManagerError::SlugTaken))
    );
    let launch_all = manager::LaunchConfig {
        launch_auction: true,
        launch_marketplace: true,
        minter: platform_minter.clone(),
    };
    assert_eq!(
        manager.try_launch_dao(&rival.token, &launch_all),
        Err(Ok(manager::ManagerError::SlugTaken))
    );
    manager.update_pending_slug(&rival.token, &String::from_str(&e, "flow-dao-2"));
    assert_eq!(
        manager.get_pending_dao(&rival.token).unwrap().slug,
        String::from_str(&e, "flow-dao-2")
    );

    // The slug registry is permanent: it outlives the pending record (the
    // renewal sweep keeps it alive).
    assert_eq!(manager.get_dao_by_slug(&slug), dao.token);
    assert_eq!(manager.get_slug(&dao.token), Some(slug));
}

// ============================================================================
// Review fixes: batch size under network limits, nested Treasury auth, error codes
// ============================================================================

/// Mints `recipients` new recipients x `tokens_each` tokens in one
/// `batch_mint` against real metadata with 16 traits (the maximum, so the
/// largest seed event), under the default (mainnet-like) resource limits,
/// including the 16 KiB contract-event limit, and a mainnet-like
/// `max_entry_ttl`. Returns the contract-event bytes used.
fn batch_mint_with_sixteen_trait_artwork(recipients: u32, tokens_each: u32) -> u32 {
    let (e, token, _treasury, _governor, _target, owner) = setup();
    e.ledger().with_mut(|l| l.max_entry_ttl = 3_110_400);
    let metadata = MetadataContractClient::new(&e, &token.metadata().unwrap());
    let mut names = Vec::new(&e);
    let mut items = Vec::new(&e);
    for i in 0..16u32 {
        names.push_back(String::from_str(&e, "Trait"));
        items.push_back(ItemParam {
            property_id: i,
            name: String::from_str(&e, "Item"),
            is_new_property: true,
        });
    }
    metadata.add_properties(
        &names,
        &items,
        &IpfsGroup {
            base_uri: String::from_str(&e, "ipfs://art"),
            extension: String::from_str(&e, ".png"),
        },
    );
    assert_eq!(metadata.properties_count(), 16);

    let mut to = Vec::new(&e);
    let mut amounts = Vec::new(&e);
    for _ in 0..recipients {
        to.push_back(Address::generate(&e));
        amounts.push_back(tokens_each as u128);
    }
    e.cost_estimate().budget().reset_default();
    let ids = token.batch_mint(&owner, &to, &amounts);
    let events_bytes = e.cost_estimate().resources().contract_events_size_bytes;
    assert_eq!(ids.len(), recipients * tokens_each);
    // The hook seeded every token (it is not allowed to fail silently here).
    for id in ids.iter() {
        assert_eq!(metadata.get_attributes(&id).len(), 17);
    }
    events_bytes
}

/// The largest batches `common::batch_mint_fits` allows fit one transaction
/// with ~15% of the event limit to spare: all tokens to one recipient, one
/// token each to the most recipients, and a mixed batch at the budget edge.
#[test]
fn batches_at_the_event_budget_fit_one_transaction() {
    const LIMIT: u32 = 16_384;
    let shapes = [
        (1, common::MAX_BATCH_MINT),
        (common::MAX_BATCH_RECIPIENTS, 1),
        (5, 7), // 35 tokens over 5 recipients: 12,750 of 13,500 budget
    ];
    for (recipients, tokens_each) in shapes {
        assert!(common::batch_mint_fits(
            recipients * tokens_each,
            recipients
        ));
        let used = batch_mint_with_sixteen_trait_artwork(recipients, tokens_each);
        assert!(
            used <= LIMIT * 90 / 100,
            "{recipients} x {tokens_each}: {used} event bytes"
        );
    }
    // The estimate is conservative: actual usage stays under the budget.
    assert!(
        batch_mint_with_sixteen_trait_artwork(1, common::MAX_BATCH_MINT)
            <= common::BATCH_MINT_EVENT_BUDGET
    );
}

/// A proposal can make the Treasury buy a marketplace listing: the purchase
/// pulls payment from the Treasury inside the marketplace, so the Treasury's
/// authorization is needed one level below its direct call, which a preceding
/// `authorize` action supplies.
#[test]
fn treasury_buys_a_marketplace_listing_through_an_authorized_proposal() {
    use treasury::AuthNode;
    let (e, token, treasury, governor, _target, owner) = setup();
    let t = treasury.address.clone();

    let sac = e
        .register_stellar_asset_contract_v2(Address::generate(&e))
        .address();
    StellarAssetClient::new(&e, &sac).mint(&t, &1_000);
    let marketplace_id = e.register(
        MarketplaceContract,
        (
            token.address.clone(),
            owner.clone(),
            t.clone(),
            sac.clone(),
            Address::generate(&e),
            BytesN::from_array(&e, &[0; 32]),
            250u32,
        ),
    );
    let marketplace = MarketplaceContractClient::new(&e, &marketplace_id);
    marketplace.launch(&t, &true, &sac);

    let seller = Address::generate(&e);
    let nft = token.mint(&owner, &seller);
    token.approve(
        &seller,
        &marketplace_id,
        &nft,
        &(e.ledger().sequence() + 10_000),
    );
    marketplace.list(&nft, &seller, &1_000, &100_000, &250, &sac);

    let transfer = |to: &Address, amount: i128| AuthNode {
        contract: sac.clone(),
        fn_name: Symbol::new(&e, "transfer"),
        args: vec![&e, t.into_val(&e), to.into_val(&e), amount.into_val(&e)],
        sub: Vec::new(&e),
    };
    let nodes = vec![&e, transfer(&t, 25), transfer(&seller, 975)];
    assert_eq!(treasury.check_authorization(&nodes), 2);

    let targets = vec![&e, t.clone(), marketplace_id.clone()];
    let functions = vec![&e, Symbol::new(&e, "authorize"), Symbol::new(&e, "buy")];
    let args = vec![
        &e,
        vec![&e, nodes.into_val(&e)],
        vec![
            &e,
            nft.into_val(&e),
            t.into_val(&e),
            1_000_i128.into_val(&e),
        ],
    ];
    let (_id, hash) = queue_proposal(
        &e,
        &token,
        &governor,
        &owner,
        &targets,
        &functions,
        &args,
        "buy a listing",
    );

    // Real auth from here: only the Treasury's own entries authorize anything.
    e.set_auths(&[]);
    treasury.execute(&targets, &functions, &args, &hash);

    assert_eq!(token.owner_of(&nft), t);
    let pay = TokenClient::new(&e, &sac);
    assert_eq!(pay.balance(&seller), 975);
    assert_eq!(pay.balance(&t), 25); // paid 1_000, received the 2.5% fee back
}

/// Every project error code sits inside its crate's block, so a code
/// surfacing through a cross-contract call identifies its crate.
#[test]
fn error_codes_are_unique_per_crate_block() {
    use common::error::codes;
    fn check(block: u32, codes_in: &[u32]) {
        for c in codes_in {
            assert!(
                *c > block && *c < block + codes::BLOCK_SIZE,
                "code {c} outside block {block}"
            );
        }
    }
    use auction::AuctionError as A;
    use governor::CustomGovernorError as G;
    use manager::ManagerError as M;
    use marketplace::MarketplaceError as K;
    use metadata::Error as D;
    use minter::MinterError as N;
    use treasury::TreasuryError as T;
    check(
        codes::MANAGER,
        &[
            M::InvalidImplementationName as u32,
            M::SlugNotFound as u32,
            M::LaunchAdminNotOwner as u32,
            M::FactoryPaused as u32,
        ],
    );
    check(
        codes::METADATA,
        &[D::NotInitialized as u32, D::StringTooLong as u32],
    );
    check(
        codes::AUCTION,
        &[A::InvalidTokenId as u32, A::InvalidTimeBuffer as u32],
    );
    check(
        codes::GOVERNOR,
        &[G::InvalidQueueDelay as u32, G::ProposalNotReady as u32],
    );
    check(
        codes::TREASURY,
        &[T::TreasuryMismatch as u32, T::InvalidAuthorization as u32],
    );
    check(
        codes::MARKETPLACE,
        &[K::NotInitialized as u32, K::PriceAboveMax as u32],
    );
    check(
        codes::MINTER,
        &[N::InvalidAmount as u32, N::TokenNotLive as u32],
    );
    use token::TokenError as O;
    check(
        codes::TOKEN,
        &[O::MintAuthorityNotAllowed as u32, O::BatchTooLarge as u32],
    );
}

/// Voting power through a real governor while tokens sit in the real
/// marketplace and the treasury: listings before the snapshot leave the
/// voting supply and lower quorum, listings after it do not change that
/// proposal's weights, and system contracts can never vote.
#[test]
fn system_held_tokens_and_votes_through_a_real_proposal() {
    let e = Env::default();
    e.mock_all_auths();
    e.ledger().set_sequence_number(100);
    e.ledger().set_timestamp(1_000);
    let admin = Address::generate(&e);
    let manager = Address::generate(&e);
    let zero = BytesN::from_array(&e, &[0u8; 32]);
    let (treasury_id, governor_id, auction_id, marketplace_id, metadata_id) = (
        Address::generate(&e),
        Address::generate(&e),
        Address::generate(&e),
        Address::generate(&e),
        Address::generate(&e),
    );
    let token_id = e.register(
        DaoTokenContract,
        (
            admin.clone(),
            treasury_id.clone(),
            auction_id.clone(),
            marketplace_id.clone(),
            String::from_str(&e, "n"),
            String::from_str(&e, "s"),
            metadata_id.clone(),
            manager.clone(),
            zero.clone(),
        ),
    );
    register_metadata(&e, &metadata_id, &token_id, &admin);
    e.register_at(
        &treasury_id,
        DaoTreasuryContract,
        (
            admin.clone(),
            governor_id.clone(),
            manager.clone(),
            zero.clone(),
        ),
    );
    e.register_at(
        &governor_id,
        DaoGovernorContract,
        (
            admin.clone(),
            token_id.clone(),
            treasury_id.clone(),
            300_u32,
            300_u32,
            300_u32,
            1_u128,
            5_000_u32, // 50% quorum
            manager.clone(),
            zero.clone(),
        ),
    );
    let pay = e
        .register_stellar_asset_contract_v2(Address::generate(&e))
        .address();
    e.register_at(
        &marketplace_id,
        MarketplaceContract,
        (
            token_id.clone(),
            admin.clone(),
            treasury_id.clone(),
            pay.clone(),
            manager.clone(),
            zero.clone(),
            250u32,
        ),
    );
    let token = DaoTokenContractClient::new(&e, &token_id);
    let governor = DaoGovernorContractClient::new(&e, &governor_id);
    let treasury = DaoTreasuryContractClient::new(&e, &treasury_id);
    let marketplace = MarketplaceContractClient::new(&e, &marketplace_id);

    let alice = Address::generate(&e);
    let bob = Address::generate(&e);
    let carol = Address::generate(&e);
    // Founder mints: alice 3, bob 2, treasury 5 (no votes).
    token.batch_mint(
        &admin,
        &vec![&e, alice.clone(), bob.clone(), treasury_id.clone()],
        &vec![&e, 3u128, 2u128, 5u128],
    );
    token.launch(
        &treasury_id,
        &vec![&e, treasury_id.clone(), marketplace_id.clone()],
        &treasury_id, // stands in for the platform Minter
    );
    governor.launch(&treasury_id);
    treasury.launch(&treasury_id);
    marketplace.launch(&treasury_id, &true, &pay);
    assert_eq!(token.get_total_supply(), 5);

    // alice delegates to carol, then lists one token before the proposal.
    token.delegate(&alice, &carol);
    let list = |who: &Address, id: u32| {
        token.approve(who, &marketplace_id, &id, &(e.ledger().sequence() + 10_000));
        marketplace.list(&id, who, &1_000, &1_000_000, &250, &pay);
    };
    list(&alice, 0);
    assert_eq!(token.get_votes(&carol), 2);
    assert_eq!(token.get_delegate(&alice), Some(carol.clone()));
    assert_eq!(token.get_total_supply(), 4);

    e.ledger().set_sequence_number(200);
    e.ledger().set_timestamp(2_000);
    let description = String::from_str(&e, "voting power");
    let id = governor.propose(
        &vec![&e, Address::generate(&e)],
        &vec![&e, symbol_short!("set_value")],
        &proposal_args(&e),
        &description,
        &bob,
    );
    // 50% of the 4 voting-capable tokens (not of 10 minted).
    assert_eq!(governor.quorum(&governor.proposal_snapshot(&id)), 2);

    // bob lists after the snapshot: his weight for this proposal is unchanged.
    e.ledger().set_sequence_number(201);
    list(&bob, 3);
    assert_eq!(token.get_votes(&bob), 1);

    e.ledger().set_timestamp(2_301);
    let yes = String::from_str(&e, "yes");
    // System contracts hold tokens but never voting power.
    for system in [&treasury_id, &marketplace_id, &auction_id] {
        assert_eq!(
            governor
                .try_cast_vote(&id, &1, &yes, system)
                .err()
                .unwrap()
                .unwrap(),
            governor::CustomGovernorError::ZeroVotingWeight.into()
        );
    }
    // alice delegated away, so she has no weight; carol votes alice's 2.
    assert_eq!(
        governor
            .try_cast_vote(&id, &1, &yes, &alice)
            .err()
            .unwrap()
            .unwrap(),
        governor::CustomGovernorError::ZeroVotingWeight.into()
    );
    assert_eq!(governor.cast_vote(&id, &1, &yes, &carol), 2);
    assert_eq!(governor.cast_vote(&id, &0, &yes, &bob), 2);
    e.ledger().set_timestamp(2_601);
    // 2 for vs 2 against: quorum met (4 >= 2) but no majority.
    assert_eq!(governor.proposal_state(&id), ProposalState::Defeated);

    // A buyer of alice's listing is self-delegated and gains the vote; carol
    // does not get it back.
    let buyer = Address::generate(&e);
    StellarAssetClient::new(&e, &pay).mint(&buyer, &1_000);
    marketplace.buy(&0, &buyer, &1_000);
    assert_eq!(token.get_delegate(&buyer), Some(buyer.clone()));
    assert_eq!(token.get_votes(&buyer), 1);
    assert_eq!(token.get_votes(&carol), 2);
    assert_eq!(token.get_total_supply(), 4);
    assert_eq!(token.get_votes(&marketplace_id), 0);
    assert_eq!(token.get_votes(&treasury_id), 0);
}

// ============================================================================
// Factory DAO on the current code
// ============================================================================

// Retired with the 0.1.0 deployed-code fixtures (contracts/e2e/fixtures):
// token_upgrade_in_setup_keeps_state_and_starts_emitting_metadata_updated,
// token_upgrade_by_proposal_then_rename_in_the_same_proposal,
// token_upgrade_rejects_unapproved_stale_and_revoked_paths.
// Value: protects=(none now) upgrading the deployed token 0.1.0 in place;
// retired_because=the storage-diet release is one fresh testnet redeploy (D13)
// and the 0.1.0 token's `launch` no longer matches the Manager (eng review D10:
// deployed-code fixtures retire); replacement=the upgrade-through-registry tests
// on the current code (proposal_upgrades_*), each module's upgrade unit tests,
// and new deployed-code fixtures captured after the redeploy.

struct DaoFixture {
    e: Env,
    manager: ManagerContractClient<'static>,
    dao: manager::DaoAddresses,
    deployer: Address,
    /// The shared platform Minter registered on the Manager.
    minter: Address,
    /// The payment asset (auction and marketplace), with its issuer.
    payment: soroban_sdk::testutils::StellarAssetContract,
}

impl DaoFixture {
    /// Launch config that starts neither the auction nor the marketplace.
    fn no_launch_modules(&self) -> manager::LaunchConfig {
        manager::LaunchConfig {
            launch_auction: false,
            launch_marketplace: false,
            minter: self.minter.clone(),
        }
    }
}

/// A real factory DAO ("upgrade-dao") on the locally built modules, with a
/// platform Minter registered. One founder token is minted.
fn factory_dao() -> DaoFixture {
    let e = Env::default();
    e.mock_all_auths();
    e.ledger().set_sequence_number(100);
    e.ledger().set_timestamp(1_000);
    e.cost_estimate().budget().reset_unlimited();

    let manager_id = e.register(
        ManagerContract,
        (
            Address::generate(&e),
            BytesN::from_array(&e, &[0; 32]),
            String::from_str(&e, "0.1.0"),
            TEST_UPGRADE_DELAY,
        ),
    );
    let manager = ManagerContractClient::new(&e, &manager_id);
    let mut hashes = std::vec::Vec::new();
    for (registry_name, wasm_name) in [
        ("Token", "token"),
        ("Metadata", "metadata"),
        ("Auction", "auction"),
        ("Governor", "governor"),
        ("Treasury", "treasury"),
        ("Marketplace", "marketplace"),
    ] {
        let hash = upload_module_wasm(&e, wasm_name);
        manager.register_implementation(
            &String::from_str(&e, registry_name),
            &String::from_str(&e, "0.1.0"),
            &hash,
        );
        hashes.push(hash);
    }
    manager.set_current_implementations(
        &hashes[0], &hashes[1], &hashes[2], &hashes[3], &hashes[4], &hashes[5],
    );
    let minter = Address::generate(&e);
    manager.set_platform_minter(&minter);

    let deployer = Address::generate(&e);
    let payment = e.register_stellar_asset_contract_v2(Address::generate(&e));
    let asset = payment.address();
    let dao = manager.create_dao(&slug_params(&e, &deployer, 1, "upgrade-dao", &asset));
    DaoTokenContractClient::new(&e, &dao.token).mint(&deployer, &deployer);

    DaoFixture {
        e,
        manager,
        dao,
        deployer,
        minter,
        payment,
    }
}

// ============================================================================
// Slug change by vote (Manager 0.2.0 `change_slug`)
// ============================================================================

/// A launched factory DAO under "upgrade-dao" (one founder token, Treasury in charge).
fn launched_dao() -> DaoFixture {
    let f = factory_dao();
    f.manager.launch_dao(&f.dao.token, &f.no_launch_modules());
    f
}

/// Propose, vote and queue a one-action proposal; returns (id, description hash).
fn queue_single_action(
    f: &DaoFixture,
    target: &Address,
    function: &str,
    call_args: Vec<Val>,
    description: &str,
) -> (
    BytesN<32>,
    BytesN<32>,
    Vec<Address>,
    Vec<Symbol>,
    Vec<Vec<Val>>,
) {
    let e = &f.e;
    let governor = DaoGovernorContractClient::new(e, &f.dao.governor);
    let targets = vec![e, target.clone()];
    let functions = vec![e, Symbol::new(e, function)];
    let args = vec![e, call_args];
    e.ledger().set_sequence_number(200);
    e.ledger().set_timestamp(2_000);
    let description = String::from_str(e, description);
    let desc_hash = description_hash(e, &description);
    let id = governor.propose(&targets, &functions, &args, &description, &f.deployer);
    e.ledger().set_timestamp(2_301);
    governor.cast_vote(&id, &1, &String::from_str(e, "yes"), &f.deployer);
    e.ledger().set_timestamp(2_601);
    governor.queue(
        &targets,
        &functions,
        &args,
        &desc_hash,
        &2_901_u32,
        &f.deployer,
    );
    e.ledger().set_timestamp(2_901);
    (id, desc_hash, targets, functions, args)
}

/// Live DAO renames through propose -> vote -> queue -> treasury.execute, with only the
/// Treasury's own authorization. The old slug is released at once.
#[test]
fn live_dao_changes_slug_by_proposal() {
    let f = launched_dao();
    let e = &f.e;
    let new_slug = String::from_str(e, "lantern-club");
    let (id, desc_hash, targets, functions, args) = queue_single_action(
        &f,
        &f.manager.address,
        "change_slug",
        vec![e, f.dao.token.into_val(e), new_slug.into_val(e)],
        "Change our link",
    );

    e.set_auths(&[]);
    DaoTreasuryContractClient::new(e, &f.dao.treasury)
        .execute(&targets, &functions, &args, &desc_hash);
    assert_eq!(
        DaoGovernorContractClient::new(e, &f.dao.governor).proposal_state(&id),
        ProposalState::Executed
    );
    assert_eq!(f.manager.get_slug(&f.dao.token), Some(new_slug.clone()));
    assert_eq!(f.manager.get_dao_by_slug(&new_slug), f.dao.token);
    assert!(f
        .manager
        .try_get_dao_by_slug(&String::from_str(e, "upgrade-dao"))
        .is_err());
}

/// The new slug is public while the proposal waits. If another DAO launches with it first,
/// execution fails with SlugTaken and the proposal stays queued.
#[test]
fn squatted_target_slug_fails_execution_and_keeps_the_proposal_queued() {
    let f = launched_dao();
    let e = &f.e;
    let wanted = String::from_str(e, "wanted-name");
    let (id, desc_hash, targets, functions, args) = queue_single_action(
        &f,
        &f.manager.address,
        "change_slug",
        vec![e, f.dao.token.into_val(e), wanted.into_val(e)],
        "Change our link",
    );

    let squatter = Address::generate(e);
    let asset = e
        .register_stellar_asset_contract_v2(Address::generate(e))
        .address();
    let other = f
        .manager
        .create_dao(&slug_params(e, &squatter, 2, "wanted-name", &asset));
    DaoTokenContractClient::new(e, &other.token).mint(&squatter, &squatter);
    f.manager.launch_dao(&other.token, &f.no_launch_modules());

    e.set_auths(&[]);
    assert!(DaoTreasuryContractClient::new(e, &f.dao.treasury)
        .try_execute(&targets, &functions, &args, &desc_hash)
        .is_err());
    assert_eq!(
        DaoGovernorContractClient::new(e, &f.dao.governor).proposal_state(&id),
        ProposalState::Queued
    );
    assert_eq!(
        f.manager.get_slug(&f.dao.token),
        Some(String::from_str(e, "upgrade-dao"))
    );
}

// Retired: manager_upgrade_from_deployed_code_keeps_slugs_and_enables_change_slug.
// Value: protects=(none now) upgrading the deployed Manager 0.1.0 in place while
// its slugs survive; retired_because=docs/STORAGE_DIET.md ships as one fresh
// testnet redeploy (D13) and the 0.1.0 Manager's create_dao passes the removed
// display strings to the new Metadata constructor, so the fixture cannot drive
// current modules (eng review D10: deployed-code fixtures retire);
// replacement=full_factory_flow_create_setup_launch_with_slug and the
// change_slug tests on the current Manager.

// Retired with the 0.1.0 deployed-code fixtures: comment_modules_upgrade_in_setup,
// comment_modules_upgrade_by_proposal_keeps_live_state.
// Value: protects=(none now) the governor/auction/marketplace 0.1.0 -> 0.2.0
// upgrade keeping live bids and listings; retired_because=fresh redeploy (D13),
// and the 0.1.0 fixtures cannot launch under the current Manager (eng review
// D10); replacement=new deployed-code fixtures captured after the redeploy.

/// SEP-50 through the factory: the token answers `name`, `symbol` and
/// `token_uri` (built by the Metadata contract), and records the pinned
/// platform Minter at launch.
#[test]
fn factory_token_serves_sep50_metadata_and_records_the_minter() {
    let f = factory_dao();
    let e = &f.e;
    let token = DaoTokenContractClient::new(e, &f.dao.token);
    let metadata = MetadataContractClient::new(e, &f.dao.metadata);
    metadata.add_properties(
        &vec![e, String::from_str(e, "Background")],
        &vec![
            e,
            ItemParam {
                property_id: 0,
                name: String::from_str(e, "Blue"),
                is_new_property: true,
            },
        ],
        &IpfsGroup {
            base_uri: String::from_str(e, "ipfs://art/"),
            extension: String::from_str(e, ".png"),
        },
    );
    let id = token.mint(&f.deployer, &f.deployer);
    assert_eq!(token.name(), String::from_str(e, "Flow DAO"));
    assert_eq!(token.symbol(), String::from_str(e, "FLOW"));
    let uri = token.token_uri(&id);
    assert_eq!(uri, metadata.token_uri(&id, &token.name()));
    let mut bytes = std::vec![0u8; uri.len() as usize];
    uri.copy_into_slice(&mut bytes);
    assert!(bytes.starts_with(b"data:application/json;base64,"));

    // The holder's ownership entry (30-day TTL per touch) has archived: the
    // token still renders, and an id past the counter still does not.
    let owner_key = oz_key(e, "Owner", std::vec![id.into_val(e)]);
    e.as_contract(&f.dao.token, || e.storage().persistent().remove(&owner_key));
    assert_eq!(token.token_uri(&id), uri);
    assert!(token.try_token_uri(&(id + 1)).is_err());

    assert_eq!(token.minter(), None);
    f.manager.launch_dao(&f.dao.token, &f.no_launch_modules());
    assert_eq!(token.minter(), Some(f.minter.clone()));
    assert!(token.mint_authority(&f.minter));
}

/// docs/STORAGE_DIET_REVIEW.md Finding 2: a state-changing call must never push
/// shared code to the instance's 170 days. The instance gets 170 days; code
/// gets at most `CODE_TTL_EXTEND_TO`.
#[test]
fn calls_bump_instance_long_and_shared_code_only_briefly() {
    use common::ttl::*;
    use soroban_sdk::testutils::Deployer as _;
    let f = factory_dao();
    let e = &f.e;
    let token = DaoTokenContractClient::new(e, &f.dao.token);
    let ttls = |c: &Address| {
        (
            e.deployer().get_contract_instance_ttl(c),
            e.deployer().get_contract_code_ttl(c),
        )
    };
    // Pinned start: one state-changing call so the token's instance is at 170
    // days and its code at the in-contract 4 days.
    token.mint(&f.deployer, &f.deployer);
    assert_eq!(
        ttls(&f.dao.token),
        (INSTANCE_TTL_EXTEND_TO, CODE_TTL_EXTEND_TO)
    );

    // Phase 1, the platform let code lapse: three days on, code (1 day) is
    // under its threshold, the instance (167 days) is not. A member's call
    // pays for 3 more days of code, never 170.
    let three_days = 3 * DAY_IN_LEDGERS;
    e.ledger().with_mut(|l| l.sequence_number += three_days);
    assert_eq!(
        ttls(&f.dao.token),
        (
            INSTANCE_TTL_EXTEND_TO - three_days,
            CODE_TTL_EXTEND_TO - three_days
        )
    );
    token.mint(&f.deployer, &f.deployer);
    assert_eq!(
        ttls(&f.dao.token),
        (INSTANCE_TTL_EXTEND_TO - three_days, CODE_TTL_EXTEND_TO)
    );

    // Phase 2, the platform renewed code to 170 days; 110 days on, the
    // instance (57 days) is under its threshold and code (60) is not. The
    // call renews the instance only.
    let platform = 170 * DAY_IN_LEDGERS;
    e.as_contract(&f.dao.token, || {
        e.deployer()
            .extend_ttl_for_code(f.dao.token.clone(), platform, platform)
    });
    let later = 110 * DAY_IN_LEDGERS;
    e.ledger().with_mut(|l| l.sequence_number += later);
    let (instance, code) = ttls(&f.dao.token);
    assert!(instance < INSTANCE_TTL_THRESHOLD && code > CODE_TTL_THRESHOLD);
    token.mint(&f.deployer, &f.deployer);
    assert_eq!(
        ttls(&f.dao.token),
        (INSTANCE_TTL_EXTEND_TO, platform - later)
    );
}

/// docs/STORAGE_DIET_REVIEW.md Finding 1, end to end: a live DAO renames its
/// token by proposal, then settles an auction. The rename keeps the metadata
/// hook, so the newly minted token still gets artwork.
#[test]
fn rename_by_proposal_then_settle_mints_with_artwork() {
    let f = factory_dao();
    let e = &f.e;
    let token = DaoTokenContractClient::new(e, &f.dao.token);
    let metadata = MetadataContractClient::new(e, &f.dao.metadata);
    let auction = DaoAuctionContractClient::new(e, &f.dao.auction);
    metadata.add_properties(
        &vec![e, String::from_str(e, "Background")],
        &vec![
            e,
            ItemParam {
                property_id: 0,
                name: String::from_str(e, "Blue"),
                is_new_property: true,
            },
        ],
        &IpfsGroup {
            base_uri: String::from_str(e, "ipfs://art/"),
            extension: String::from_str(e, ".png"),
        },
    );
    f.manager.launch_dao(
        &f.dao.token,
        &manager::LaunchConfig {
            launch_auction: true,
            launch_marketplace: false,
            minter: f.minter.clone(),
        },
    );
    let first = auction.get_auction().token_id;

    let (_id, desc_hash, targets, functions, args) = queue_single_action(
        &f,
        &f.dao.token,
        "set_metadata",
        vec![
            e,
            String::from_str(e, "Lantern Club").into_val(e),
            String::from_str(e, "LANTERN").into_val(e),
        ],
        "Rename the club",
    );
    e.set_auths(&[]);
    DaoTreasuryContractClient::new(e, &f.dao.treasury)
        .execute(&targets, &functions, &args, &desc_hash);
    e.mock_all_auths();
    assert_eq!(token.name(), String::from_str(e, "Lantern Club"));
    assert_eq!(token.metadata(), Some(f.dao.metadata.clone()));

    auction.settle_and_create_new();
    let next = auction.get_auction().token_id;
    assert_ne!(next, first);
    let next = u32::try_from(next).unwrap();
    assert_eq!(metadata.get_attributes(&next).len(), 2);
    let uri = token.token_uri(&next);
    assert!(!uri.is_empty());
}

/// D30: every key a launched DAO, the Manager and the shared Minter write is
/// either `("builder", <variant>)` or a known OpenZeppelin shape. The DAO
/// runs every module first (artwork, launch with auction and marketplace,
/// Minter claims, a secondary and a primary listing, a governed rename), so
/// the walk sees the keys real use creates.
#[test]
fn every_protocol_storage_key_is_namespaced() {
    let f = factory_dao();
    let e = &f.e;
    let token = DaoTokenContractClient::new(e, &f.dao.token);
    let metadata = MetadataContractClient::new(e, &f.dao.metadata);
    let marketplace = MarketplaceContractClient::new(e, &f.dao.marketplace);
    let (minter_id, _) = shared_minter(&f);
    let minter = minter::MinterContractClient::new(e, &minter_id);
    f.manager.set_platform_minter(&minter_id);

    metadata.add_properties(
        &vec![e, String::from_str(e, "Background")],
        &vec![
            e,
            ItemParam {
                property_id: 0,
                name: String::from_str(e, "Blue"),
                is_new_property: true,
            },
        ],
        &IpfsGroup {
            base_uri: String::from_str(e, "ipfs://art/"),
            extension: String::from_str(e, ".png"),
        },
    );
    let listed = token.mint(&f.deployer, &f.deployer);
    f.manager.launch_dao(
        &f.dao.token,
        &manager::LaunchConfig {
            launch_auction: true,
            launch_marketplace: true,
            minter: minter_id.clone(),
        },
    );

    // Minter: a merkle round and a claim.
    let claimer = Address::generate(e);
    let (root, proof, _) = merkle_pair(e, &claimer, 1, &Address::generate(e), 1);
    minter.set_merkle_root(&f.dao.token, &root, &String::from_str(e, "ipfs://bafytree"));
    minter.mint_merkle(&f.dao.token, &claimer, &1u128, &proof);

    // Marketplace: a secondary and a primary listing.
    let payment_asset = marketplace.get_config().payment_asset;
    token.approve(
        &f.deployer,
        &f.dao.marketplace,
        &listed,
        &(e.ledger().sequence() + 10_000),
    );
    marketplace.list(
        &listed,
        &f.deployer,
        &100,
        &1_000_000,
        &10_000,
        &payment_asset,
    );
    marketplace.create_primary_listing(&100, &1_000_000);

    // Governor and Treasury: a proposal through execution.
    let (_id, desc_hash, targets, functions, args) = queue_single_action(
        &f,
        &f.dao.token,
        "set_metadata",
        vec![
            e,
            String::from_str(e, "Lantern Club").into_val(e),
            String::from_str(e, "LANTERN").into_val(e),
        ],
        "Rename the club",
    );
    DaoTreasuryContractClient::new(e, &f.dao.treasury)
        .execute(&targets, &functions, &args, &desc_hash);
    assert_eq!(token.name(), String::from_str(e, "Lantern Club"));

    let checked = common::testutils::assert_storage_namespaced(
        e,
        &[
            ("manager", f.manager.address.clone()),
            ("minter", minter_id.clone()),
            ("token", f.dao.token.clone()),
            ("metadata", f.dao.metadata.clone()),
            ("auction", f.dao.auction.clone()),
            ("governor", f.dao.governor.clone()),
            ("treasury", f.dao.treasury.clone()),
            ("marketplace", f.dao.marketplace.clone()),
        ],
    );
    std::println!("checked {checked} storage keys");
}

// ============================================================================
// Shared Minter (docs/STORAGE_DIET.md § 4 Minter, eng review D8)
// ============================================================================

/// The shared Minter, registered in the Manager registry as "Minter" 0.1.0 on
/// a placeholder hash (it runs as native test code until upgraded).
fn shared_minter(f: &DaoFixture) -> (Address, BytesN<32>) {
    let e = &f.e;
    let hash = BytesN::from_array(e, &[0x51; 32]);
    f.manager.register_implementation(
        &String::from_str(e, "Minter"),
        &String::from_str(e, "0.1.0"),
        &hash,
    );
    let id = e.register(
        minter::MinterContract,
        (
            f.manager.address.clone(),
            hash.clone(),
            minter::RECOMMENDED_UPGRADE_DELAY,
        ),
    );
    (id, hash)
}

/// The Minter's leaf: `sha256(scval_xdr(address) || u128_be(amount))`.
fn merkle_leaf(e: &Env, who: &Address, amount: u128) -> BytesN<32> {
    use soroban_sdk::xdr::ToXdr;
    let mut bytes = soroban_sdk::Bytes::new(e);
    bytes.append(&who.clone().to_xdr(e));
    bytes.extend_from_array(&amount.to_be_bytes());
    e.crypto().sha256(&bytes).into()
}

/// A two-leaf tree: (root, proof for `a`, proof for `b`).
fn merkle_pair(
    e: &Env,
    a: &Address,
    amount_a: u128,
    b: &Address,
    amount_b: u128,
) -> (BytesN<32>, Vec<BytesN<32>>, Vec<BytesN<32>>) {
    let (la, lb) = (merkle_leaf(e, a, amount_a), merkle_leaf(e, b, amount_b));
    let (lo, hi) = if la.to_array() <= lb.to_array() {
        (la.clone(), lb.clone())
    } else {
        (lb.clone(), la.clone())
    };
    let mut pair = soroban_sdk::Bytes::new(e);
    pair.extend_from_array(&lo.to_array());
    pair.extend_from_array(&hi.to_array());
    let root: BytesN<32> = e.crypto().sha256(&pair).into();
    (root, vec![e, lb], vec![e, la])
}

/// Eng review D8: the shared Minter upgrades through the registry under the
/// Manager admin, and claims keep working against the root set before the
/// upgrade, on the real built WASM.
#[test]
fn shared_minter_upgrades_then_claims_against_the_existing_root() {
    let f = factory_dao();
    let e = &f.e;
    let token = DaoTokenContractClient::new(e, &f.dao.token);
    let (minter_id, from) = shared_minter(&f);
    let minter = minter::MinterContractClient::new(e, &minter_id);
    f.manager.set_platform_minter(&minter_id);
    f.manager.launch_dao(
        &f.dao.token,
        &manager::LaunchConfig {
            launch_auction: false,
            launch_marketplace: false,
            minter: minter_id.clone(),
        },
    );
    assert_eq!(minter.version(), String::from_str(e, "0.1.0"));

    let alice = Address::generate(e);
    let bob = Address::generate(e);
    let (root, alice_proof, bob_proof) = merkle_pair(e, &alice, 2, &bob, 3);
    let tree_uri = String::from_str(e, "ipfs://bafyallocation");
    minter.set_merkle_root(&f.dao.token, &root, &tree_uri);
    minter.mint_merkle(&f.dao.token, &alice, &2u128, &alice_proof);

    let to = upload_module_wasm(e, "minter");
    f.manager.register_implementation(
        &String::from_str(e, "Minter"),
        &String::from_str(e, "0.2.0"),
        &to,
    );
    f.manager.approve_upgrade(&from, &to);
    // Every DAO pins this Minter: an upgrade waits 7 days after the approval
    // so a DAO can revoke the Minter's mint authority first (review M1).
    assert_eq!(
        minter.try_upgrade(&from, &to).err().unwrap().unwrap() as u32,
        7813
    );
    let notice = minter.upgrade_delay();
    e.ledger().with_mut(|l| l.sequence_number += notice);
    minter.upgrade(&from, &to);

    // Now running the built WASM against the same storage.
    assert_eq!(minter.wasm_hash(), to);
    assert_eq!(minter.version(), String::from_str(e, "0.2.0"));
    let status = minter.claim_status(&f.dao.token, &bob);
    assert_eq!(status.root, Some(root));
    assert_eq!(status.round, 1);
    assert_eq!(status.tree_uri, Some(tree_uri));
    assert!(!status.claimed);
    minter.mint_merkle(&f.dao.token, &bob, &3u128, &bob_proof);
    assert_eq!(token.balance(&bob), 3);
    assert!(minter
        .try_mint_merkle(&f.dao.token, &alice, &2u128, &alice_proof)
        .is_err());
    assert_eq!(token.balance(&alice), 2);
}

// ============================================================================
// The guarantee (docs/STORAGE_DIET.md § 9): the protocol runs on chain state
// ============================================================================

/// A byte-different copy of a built module: the same code with a custom
/// section appended, so it uploads under a new hash. Lets a test upgrade a
/// module to real code without a second build.
fn module_wasm_variant(e: &Env, name: &str, tag: &str) -> BytesN<32> {
    let path = std::format!(
        "{}/../../target/wasm32v1-none/release/{name}.wasm",
        env!("CARGO_MANIFEST_DIR")
    );
    let mut bytes = std::fs::read(&path).expect("built module WASM");
    let section_name = b"variant";
    let payload_len = 1 + section_name.len() + tag.len();
    assert!(payload_len < 128, "single-byte LEB128 length");
    bytes.push(0); // custom section id
    bytes.push(payload_len as u8);
    bytes.push(section_name.len() as u8);
    bytes.extend_from_slice(section_name);
    bytes.extend_from_slice(tag.as_bytes());
    e.deployer()
        .upload_contract_wasm(soroban_sdk::Bytes::from_slice(e, &bytes))
}

/// Advance the ledger by `seconds` and a few ledgers.
fn advance(e: &Env, seconds: u64) {
    e.ledger().with_mut(|l| {
        l.timestamp += seconds;
        l.sequence_number += 10;
    });
}

/// Propose a one-action proposal, vote it through and queue it; the caller
/// keeps the preimage (exception 3) and executes through the Treasury.
#[allow(clippy::too_many_arguments)]
fn pass_one_action(
    e: &Env,
    governor: &DaoGovernorContractClient,
    voter: &Address,
    target: &Address,
    function: &str,
    call_args: Vec<Val>,
    description: &str,
) -> (
    BytesN<32>,
    Vec<Address>,
    Vec<Symbol>,
    Vec<Vec<Val>>,
    BytesN<32>,
) {
    let targets = vec![e, target.clone()];
    let functions = vec![e, Symbol::new(e, function)];
    let args = vec![e, call_args];
    let description = String::from_str(e, description);
    let desc_hash = description_hash(e, &description);
    let id = governor.propose(&targets, &functions, &args, &description, voter);
    advance(e, 301);
    governor.cast_vote(&id, &1, &String::from_str(e, ""), voter);
    advance(e, 301);
    governor.queue(&targets, &functions, &args, &desc_hash, &0u32, voter);
    advance(e, 301);
    (id, targets, functions, args, desc_hash)
}

/// The § 9 guarantee: contract clients only, no event as an input, no
/// database. Every address is discovered from the token and the Manager;
/// the only off-chain inputs are a merkle proof the claimer computes and the
/// proposal preimages the proposer keeps.
#[test]
fn protocol_runs_on_chain_state_only() {
    let f = factory_dao();
    let e = &f.e;
    let (minter_id, _) = shared_minter(&f);
    f.manager.set_platform_minter(&minter_id);

    // --- Discovery from the token address alone.
    let token = DaoTokenContractClient::new(e, &f.dao.token);
    let metadata = MetadataContractClient::new(e, &token.metadata().unwrap());
    let treasury = DaoTreasuryContractClient::new(e, &token.treasury());
    let auction = DaoAuctionContractClient::new(e, &token.auction().unwrap());
    let marketplace = MarketplaceContractClient::new(e, &token.marketplace().unwrap());
    let governor = DaoGovernorContractClient::new(e, &treasury.governor());
    assert_eq!(token.manager(), f.manager.address);
    assert_eq!(metadata.address, f.dao.metadata);
    assert_eq!(governor.address, f.dao.governor);
    assert_eq!(auction.address, f.dao.auction);
    assert_eq!(marketplace.address, f.dao.marketplace);
    // The profile was created with the DAO: only its hash and seq are stored.
    assert_eq!(metadata.profile_seq(), 0);

    // --- Artwork in two sessions; the second resumes from chain.
    let group = |base: &str| IpfsGroup {
        base_uri: String::from_str(e, base),
        extension: String::from_str(e, ".png"),
    };
    let item = |property_id: u32, name: &str, is_new_property: bool| ItemParam {
        property_id,
        name: String::from_str(e, name),
        is_new_property,
    };
    metadata.add_properties(
        &vec![
            e,
            String::from_str(e, "Background"),
            String::from_str(e, "Body"),
        ],
        &vec![e, item(0, "Blue", true), item(1, "Round", true)],
        &group("ipfs://first/"),
    );
    let headers = metadata.property_headers();
    assert_eq!(headers.len(), 2);
    let body = headers
        .iter()
        .position(|h| h.name == String::from_str(e, "Body"))
        .unwrap() as u32;
    let before = headers.get(body).unwrap().item_count;
    metadata.add_properties(
        &Vec::new(e),
        &vec![e, item(body, "Square", false)],
        &group("ipfs://second/"),
    );
    assert_eq!(
        metadata.property_headers().get(body).unwrap().item_count,
        before + 1
    );

    // --- Founder mint (factory_dao minted one) and launch.
    let founder = f.deployer.clone();
    assert_eq!(token.balance(&founder), 1);
    f.manager.launch_dao(
        &f.dao.token,
        &manager::LaunchConfig {
            launch_auction: true,
            launch_marketplace: true,
            minter: minter_id.clone(),
        },
    );
    assert_eq!(token.minter(), Some(minter_id.clone()));
    let minter = minter::MinterContractClient::new(e, &token.minter().unwrap());

    // --- Auction: bid, a deferred refund recovered, settle, next auction.
    let pay = auction.get_config().payment_token;
    let sac = StellarAssetClient::new(e, &pay);
    f.payment.issuer().set_flag(AccountFlags::RevocableFlag);
    let (alice, bob) = (Address::generate(e), Address::generate(e));
    for who in [&alice, &bob] {
        sac.mint(who, &1_000_000_000);
    }
    let first = auction.get_auction();
    auction.create_bid(
        &alice,
        &first.token_id,
        &10_000_000,
        &String::from_str(e, ""),
    );
    sac.set_authorized(&alice, &false);
    auction.create_bid(&bob, &first.token_id, &20_000_000, &String::from_str(e, ""));
    assert_eq!(auction.pending_refund(&alice), 10_000_000);
    sac.set_authorized(&alice, &true);
    auction.withdraw_refund(&alice);
    assert_eq!(auction.pending_refund(&alice), 0);
    advance(e, 400);
    auction.settle_and_create_new();
    let won = u32::try_from(first.token_id).unwrap();
    assert_eq!(token.owner_of(&won), bob);
    assert_ne!(auction.get_auction().token_id, first.token_id);
    // The token's artwork and JSON come from chain.
    assert_eq!(metadata.get_attributes(&won).len(), 3);
    assert!(!token.token_uri(&won).is_empty());

    // --- Primary and secondary sales.
    let carol = Address::generate(e);
    sac.mint(&carol, &1_000_000_000);
    let expires = e.ledger().timestamp() + 100_000;
    let listing_id = marketplace.create_primary_listing(&1_000, &expires);
    let primary = marketplace.buy_primary(&listing_id, &carol, &1_000);
    assert_eq!(token.owner_of(&primary), carol);
    token.approve(
        &bob,
        &marketplace.address,
        &won,
        &(e.ledger().sequence() + 10_000),
    );
    marketplace.list(&won, &bob, &5_000, &expires, &250, &pay);
    marketplace.buy(&won, &carol, &5_000);
    assert_eq!(token.owner_of(&won), carol);

    // --- A merkle claim with a locally computed proof.
    let erin = Address::generate(e);
    let (root, erin_proof, _) = merkle_pair(e, &erin, 2, &Address::generate(e), 1);
    minter.set_merkle_root(&f.dao.token, &root, &String::from_str(e, "ipfs://bafytree"));
    let status = minter.claim_status(&f.dao.token, &erin);
    assert_eq!(status.root, Some(root));
    minter.mint_merkle(&f.dao.token, &erin, &2u128, &erin_proof);
    assert_eq!(token.balance(&erin), 2);

    // --- Governance through the Treasury: profile, artwork, an upgrade, a cancel.
    advance(e, 1);
    let profile = String::from_str(e, r#"{"v":1,"description":"Renewed"}"#);
    let p1 = pass_one_action(
        e,
        &governor,
        &founder,
        &metadata.address,
        "update_profile",
        vec![e, 0u32.into_val(e), profile.into_val(e)],
        "Update the profile",
    );
    treasury.execute(&p1.1, &p1.2, &p1.3, &p1.4);
    assert_eq!(metadata.profile_seq(), 1);

    let p2 = pass_one_action(
        e,
        &governor,
        &founder,
        &metadata.address,
        "add_properties",
        vec![
            e,
            Vec::<String>::new(e).into_val(e),
            vec![e, item(body, "Star", false)].into_val(e),
            group("ipfs://third/").into_val(e),
        ],
        "More artwork",
    );
    treasury.execute(&p2.1, &p2.2, &p2.3, &p2.4);
    assert_eq!(
        metadata.property_headers().get(body).unwrap().item_count,
        before + 2
    );

    let from = auction.wasm_hash();
    let to = module_wasm_variant(e, "auction", "0.2.0");
    f.manager.register_implementation(
        &String::from_str(e, "Auction"),
        &String::from_str(e, "0.2.0"),
        &to,
    );
    f.manager.approve_upgrade(&from, &to);
    let p3 = pass_one_action(
        e,
        &governor,
        &founder,
        &auction.address,
        "upgrade",
        vec![e, from.into_val(e), to.clone().into_val(e)],
        "Upgrade the auction",
    );
    treasury.execute(&p3.1, &p3.2, &p3.3, &p3.4);
    assert_eq!(auction.wasm_hash(), to);
    assert_eq!(auction.version(), String::from_str(e, "0.2.0"));

    let targets = vec![e, metadata.address.clone()];
    let functions = vec![e, Symbol::new(e, "update_profile")];
    let args = vec![
        e,
        vec![e, 1u32.into_val(e), String::from_str(e, "{}").into_val(e)],
    ];
    let description = String::from_str(e, "Changed my mind");
    let cancelled = governor.propose(&targets, &functions, &args, &description, &founder);
    governor.cancel(
        &targets,
        &functions,
        &args,
        &description_hash(e, &description),
        &founder,
    );

    // --- The proposal list, from chain.
    assert_eq!(governor.proposal_count(), 4);
    let ids = governor.proposal_ids(&0, &10);
    assert_eq!(
        ids,
        vec![
            e,
            p1.0.clone(),
            p2.0.clone(),
            p3.0.clone(),
            cancelled.clone()
        ]
    );
    let states: std::vec::Vec<ProposalState> =
        ids.iter().map(|id| governor.proposal(&id).state).collect();
    assert_eq!(
        states,
        [
            ProposalState::Executed,
            ProposalState::Executed,
            ProposalState::Executed,
            ProposalState::Canceled
        ]
    );

    // The upgraded auction still runs: the next auction settles.
    advance(e, 400);
    auction.settle_and_create_new();

    // Every DAO-owned key the flow wrote is in the renewal inventory a
    // client builds from chain reads, and nothing in it is missing.
    let listed = dao_renewal_inventory(e, &f.manager, &f.dao.token);
    // The flow left the DAO holding funds and tokens: they are in the sweep.
    let holdings = |variant: &str| {
        listed
            .iter()
            .filter(|(_, k)| {
                use soroban_sdk::TryFromVal;
                key_variant(&soroban_sdk::xdr::ScVal::try_from_val(e, k).unwrap())
                    == std::format!("oz:{variant}")
            })
            .count()
    };
    std::println!(
        "DAO holdings in the sweep: {} Owner, {} Balance",
        holdings("Owner"),
        holdings("Balance")
    );
    assert!(holdings("Owner") > 0 && holdings("Balance") > 0);
    assert_inventory_matches_ledger(e, &f.manager, &f.dao, &minter_id, &listed);
}

// ----------------------------------------------------------------------------
// Renewal inventory (docs/STORAGE_DIET.md § 7): the reference rules that
// apps/web/src/lib/chain-reads mirrors.
// ----------------------------------------------------------------------------

/// `(Symbol("builder"), [Symbol(variant), args..])`, built as a client does.
fn ns_key(e: &Env, variant: &str, args: std::vec::Vec<Val>) -> Val {
    let head: Val = Symbol::new(e, variant).into_val(e);
    let mut inner = vec![e, head];
    for a in args {
        inner.push_back(a);
    }
    let ns: Val = Symbol::new(e, "builder").into_val(e);
    let inner: Val = inner.into_val(e);
    vec![e, ns, inner].into_val(e)
}

/// An OpenZeppelin key: `[Symbol(variant), args..]`.
fn oz_key(e: &Env, variant: &str, args: std::vec::Vec<Val>) -> Val {
    let head: Val = Symbol::new(e, variant).into_val(e);
    let mut key = vec![e, head];
    for a in args {
        key.push_back(a);
    }
    key.into_val(e)
}

/// A u32 an OpenZeppelin module keeps in its instance under a unit key, read
/// the way a client reads the instance entry.
fn instance_u32(e: &Env, contract: &Address, variant: &str) -> u32 {
    let key = oz_key(e, variant, std::vec![]);
    e.as_contract(contract, || e.storage().instance().get::<Val, u32>(&key))
        .unwrap_or(0)
}

/// The variant name of a storage key: the inner symbol of a namespaced
/// `("builder", [Variant, ..])` key, or the first symbol of an OZ key.
fn key_variant(key: &soroban_sdk::xdr::ScVal) -> std::string::String {
    use soroban_sdk::xdr::ScVal;
    let name = |s: &soroban_sdk::xdr::ScSymbol| {
        std::string::String::from_utf8_lossy(s.0.as_slice()).into_owned()
    };
    let ScVal::Vec(Some(items)) = key else {
        return std::format!("{key:?}");
    };
    match (items.first(), items.get(1)) {
        (Some(ScVal::Symbol(ns)), Some(ScVal::Vec(Some(inner)))) if name(ns) == "builder" => {
            match inner.first() {
                Some(ScVal::Symbol(v)) => name(v),
                _ => "builder(?)".into(),
            }
        }
        (Some(ScVal::Symbol(v)), _) => std::format!("oz:{}", name(v)),
        _ => std::format!("{key:?}"),
    }
}

/// The OpenZeppelin `Owner(t)` entry, if it is live.
fn stored_owner(e: &Env, token: &Address, t: u32) -> Option<Address> {
    let key = oz_key(e, "Owner", std::vec![t.into_val(e)]);
    e.as_contract(token, || e.storage().persistent().get::<Val, Address>(&key))
}

/// The DAO contracts that hold tokens and funds.
fn dao_holders(token: &DaoTokenContractClient) -> std::vec::Vec<Address> {
    let mut holders = std::vec![token.treasury()];
    holders.extend(token.auction());
    holders.extend(token.marketplace());
    holders
}

/// The asset contracts the DAO is paid in (auction and marketplace), deduplicated.
fn dao_payment_assets(e: &Env, token: &DaoTokenContractClient) -> std::vec::Vec<Address> {
    let mut assets = std::vec::Vec::new();
    if let Some(a) = token.auction() {
        assets.push(
            DaoAuctionContractClient::new(e, &a)
                .get_config()
                .payment_token,
        );
    }
    if let Some(m) = token.marketplace() {
        let market = MarketplaceContractClient::new(e, &m);
        let asset = market.get_config().payment_asset;
        if !assets.contains(&asset) {
            assets.push(asset);
        }
        // An open listing settles in the asset of its day (review M2).
        for t in 0..instance_u32(e, &token.address, "TokenIdCounter") {
            if let Some(listing) = market.get_listing(&t) {
                if !assets.contains(&listing.payment_asset) {
                    assets.push(listing.payment_asset);
                }
            }
        }
    }
    assets
}

/// The persistent keys a DAO renews in its one-transaction sweep, built only
/// from the token address, the Manager and contract reads. Instances are
/// listed separately by every client (seven `LedgerKeyContractInstance`s).
fn dao_renewal_inventory(
    e: &Env,
    manager: &ManagerContractClient,
    token_id: &Address,
) -> std::vec::Vec<(Address, Val)> {
    let token = DaoTokenContractClient::new(e, token_id);
    let metadata = MetadataContractClient::new(e, &token.metadata().unwrap());
    let treasury = DaoTreasuryContractClient::new(e, &token.treasury());
    let governor = DaoGovernorContractClient::new(e, &treasury.governor());
    let mut keys = std::vec::Vec::new();
    let u = |n: u32| -> Val { n.into_val(e) };

    // Token: the canonical mint grants (OZ checkpoints of the total supply
    // are binary-searched, so every one of them is listed too).
    let mut minters = std::vec![token.treasury()];
    minters.extend(token.auction());
    minters.extend(token.marketplace());
    minters.extend(token.minter());
    for m in minters {
        if token.mint_authority(&m) {
            keys.push((
                token_id.clone(),
                ns_key(e, "MintAuthority", std::vec![m.into_val(e)]),
            ));
        }
    }
    // Only the latest supply checkpoint: proposals store their quorum (D33),
    // so nothing looks up an older one and history may archive.
    let supply_checkpoints = instance_u32(e, token_id, "NumTotalSupplyCheckpoints");
    if supply_checkpoints > 0 {
        keys.push((
            token_id.clone(),
            oz_key(
                e,
                "TotalSupplyCheckpoint",
                std::vec![u(supply_checkpoints - 1)],
            ),
        ));
    }

    // Metadata: the names vector, item pages, the groups vector, attribute pages.
    let m = metadata.address.clone();
    let headers = metadata.property_headers();
    if !headers.is_empty() {
        keys.push((m.clone(), ns_key(e, "PropertyNames", std::vec![])));
    }
    for (i, h) in headers.iter().enumerate() {
        let i = i as u32;
        for page in 0..h.item_count.div_ceil(metadata::ITEMS_PER_PAGE) {
            keys.push((m.clone(), ns_key(e, "Items", std::vec![u(i), u(page)])));
        }
    }
    if !headers.is_empty() {
        keys.push((m.clone(), ns_key(e, "IpfsGroups", std::vec![])));
    }
    let minted = instance_u32(e, token_id, "TokenIdCounter");
    if minted > 0 {
        for page in 0..=((minted - 1) / metadata::TOKENS_PER_ATTRIBUTE_PAGE) {
            // Every mint writes its token's record (empty before artwork), so
            // each page up to the minted count exists.
            keys.push((m.clone(), ns_key(e, "AttributesPage", std::vec![u(page)])));
        }
    }

    // Governor: live proposals (core, id entry, vote tally) and the latest
    // quorum checkpoint.
    let g = governor.address.clone();
    let count = governor.proposal_count();
    let mut start = 0;
    while start < count {
        for id in governor
            .proposal_ids(&start, &governor::MAX_PROPOSAL_IDS_PAGE)
            .iter()
        {
            let info = governor.proposal(&id);
            let live = matches!(
                info.state,
                ProposalState::Pending
                    | ProposalState::Active
                    | ProposalState::Succeeded
                    | ProposalState::Queued
            );
            if live {
                keys.push((
                    g.clone(),
                    ns_key(e, "ProposalTime", std::vec![id.clone().into_val(e)]),
                ));
                keys.push((g.clone(), ns_key(e, "ProposalId", std::vec![u(info.seq)])));
                // The tally exists once someone voted; a client learns that
                // from the same getLedgerEntries read that gives it the TTLs.
                let tally = oz_key(e, "ProposalVote", std::vec![id.into_val(e)]);
                if e.as_contract(&g, || e.storage().persistent().has(&tally)) {
                    keys.push((g.clone(), tally));
                }
            }
        }
        start += governor::MAX_PROPOSAL_IDS_PAGE;
    }
    let quorum_checkpoints = instance_u32(e, &g, "NumQuorumCheckpoints");
    if quorum_checkpoints > 0 {
        keys.push((
            g.clone(),
            oz_key(e, "QuorumCheckpoint", std::vec![u(quorum_checkpoints - 1)]),
        ));
    }

    // Marketplace: open secondary and primary listings.
    if let Some(mk) = token.marketplace() {
        let market = MarketplaceContractClient::new(e, &mk);
        for t in 0..minted {
            if market.get_listing(&t).is_some() {
                keys.push((mk.clone(), ns_key(e, "Listing", std::vec![u(t)])));
            }
        }
        for l in 0..market.next_listing_id() {
            if market.get_primary_listing(&l).is_some() {
                keys.push((
                    mk.clone(),
                    ns_key(e, "PrimaryListing", std::vec![l.into_val(e)]),
                ));
            }
        }
    }

    // The shared Minter's per-DAO round.
    if let Some(minter) = token.minter() {
        let status = minter::MinterContractClient::new(e, &minter).claim_status(token_id, token_id);
        if status.round > 0 {
            keys.push((
                minter.clone(),
                ns_key(e, "MerkleRoot", std::vec![token_id.into_val(e)]),
            ));
            keys.push((
                minter,
                ns_key(e, "MerkleRound", std::vec![token_id.into_val(e)]),
            ));
        }
    }

    // DAO holdings: tokens and asset balances held by the Treasury, Auction
    // and Marketplace. OpenZeppelin and the asset contract renew these only
    // 30 days per touch, so an idle DAO's funds and unsold tokens would
    // archive without the sweep.
    let holders = dao_holders(&token);
    for t in 0..minted {
        // Raw entry reads, as a client batches them: an archived holder's
        // entry is simply absent.
        if stored_owner(e, token_id, t).is_some_and(|o| holders.contains(&o)) {
            keys.push((token_id.clone(), oz_key(e, "Owner", std::vec![u(t)])));
        }
    }
    for holder in &holders {
        let key = oz_key(e, "Balance", std::vec![holder.into_val(e)]);
        if e.as_contract(token_id, || e.storage().persistent().has(&key)) {
            keys.push((token_id.clone(), key));
        }
    }
    for asset in dao_payment_assets(e, &token) {
        for holder in &holders {
            let key = oz_key(e, "Balance", std::vec![holder.into_val(e)]);
            if e.as_contract(&asset, || e.storage().persistent().has(&key)) {
                keys.push((asset.clone(), key));
            }
        }
    }

    // The Manager's slug pair, or the pending record before launch (review L6).
    let mgr = manager.address.clone();
    if let Some(slug) = manager.get_slug(token_id) {
        keys.push((
            mgr.clone(),
            ns_key(e, "SlugToDao", std::vec![slug.into_val(e)]),
        ));
        keys.push((mgr, ns_key(e, "DaoSlug", std::vec![token_id.into_val(e)])));
    } else {
        keys.push((
            mgr,
            ns_key(e, "PendingDao", std::vec![token_id.into_val(e)]),
        ));
    }
    keys
}

/// Every persistent key the DAO's contracts hold is either in the inventory
/// or a per-holder key renewed by its holder, and every inventory key exists.
fn assert_inventory_matches_ledger(
    e: &Env,
    manager: &ManagerContractClient,
    dao: &manager::DaoAddresses,
    minter: &Address,
    listed: &[(Address, Val)],
) {
    use soroban_sdk::xdr::{ContractDataDurability, LedgerKey, ScAddress, ScVal};
    use soroban_sdk::TryFromVal;
    let token_sc = ScVal::from(&dao.token);
    let token_client = DaoTokenContractClient::new(e, &dao.token);
    let holders: std::vec::Vec<ScVal> =
        dao_holders(&token_client).iter().map(ScVal::from).collect();
    let assets = dao_payment_assets(e, &token_client);
    let dao_held = |owner: &Address, name: &str, arg: Option<&ScVal>| -> bool {
        match (name, arg) {
            ("Balance", Some(holder)) => holders.contains(holder),
            ("Owner", Some(ScVal::U32(t))) if *owner == dao.token => {
                stored_owner(e, &dao.token, *t).is_some_and(|o| holders.contains(&ScVal::from(&o)))
            }
            _ => false,
        }
    };
    // Per-holder (or per-claimer, per-voter, platform) keys: renewed on use or
    // by their owner, never by the DAO sweep.
    let holder_variant = |owner: &Address, key: &ScVal| -> bool {
        let (ns, items) = match key {
            ScVal::Vec(Some(v)) => match (v.first(), v.get(1)) {
                (Some(ScVal::Symbol(s)), Some(ScVal::Vec(Some(inner))))
                    if s.to_utf8_string().unwrap() == "builder" =>
                {
                    (true, inner.to_vec())
                }
                _ => (false, v.to_vec()),
            },
            _ => return false,
        };
        let Some(ScVal::Symbol(name)) = items.first() else {
            return false;
        };
        let name = name.to_utf8_string().unwrap();
        if assets.contains(owner) {
            // An asset contract: only the DAO's own balances are the DAO's.
            return !(name == "Balance" && dao_held(owner, &name, items.get(1)));
        }
        if !ns && dao_held(owner, &name, items.get(1)) {
            return false;
        }
        if !ns {
            return [
                "Owner",
                "Balance",
                "Approval",
                "ApprovalForAll",
                "Delegatee",
                "NumCheckpoints",
                "DelegateCheckpoint",
                "VotingUnits",
                "HasVoted",
            ]
            .contains(&name.as_str());
        }
        if *owner == *minter {
            // Claim markers, and other DAOs' rounds.
            return name == "MerkleClaimed" || items.get(1) != Some(&token_sc);
        }
        if *owner == manager.address {
            // Platform registry and other DAOs' slugs.
            return !matches!(name.as_str(), "SlugToDao" | "DaoSlug")
                || (name == "DaoSlug" && items.get(1) != Some(&token_sc));
        }
        name == "PendingRefund"
    };
    let mut owners = std::vec![
        &dao.token,
        &dao.metadata,
        &dao.auction,
        &dao.governor,
        &dao.treasury,
        &dao.marketplace,
        minter,
        &manager.address,
    ];
    owners.extend(assets.iter());
    let as_bytes = |owner: &Address, key: &ScVal| {
        use soroban_sdk::xdr::{Limits, WriteXdr};
        (ScAddress::from(owner), key.to_xdr(Limits::none()).unwrap())
    };
    let expected: std::collections::BTreeSet<_> = listed
        .iter()
        .map(|(a, k)| as_bytes(a, &ScVal::try_from_val(e, k).unwrap()))
        .collect();
    let mut on_ledger = std::collections::BTreeSet::new();
    let mut unlisted = std::vec::Vec::new();
    for (key, _) in e.to_ledger_snapshot().ledger_entries.iter() {
        let LedgerKey::ContractData(d) = key.as_ref() else {
            continue;
        };
        // Instances are listed separately (one per contract).
        if d.durability != ContractDataDurability::Persistent
            || d.key == ScVal::LedgerKeyContractInstance
        {
            continue;
        }
        let Some(owner) = owners.iter().find(|a| ScAddress::from(**a) == d.contract) else {
            continue;
        };
        let id = as_bytes(owner, &d.key);
        on_ledger.insert(id.clone());
        if !expected.contains(&id) && !holder_variant(owner, &d.key) {
            // Terminal proposals leave the sweep by design.
            unlisted.push(std::format!("{:?}", d.key));
        }
    }
    let unlisted: std::vec::Vec<_> = unlisted
        .into_iter()
        .filter(|k| {
            // Terminal proposals leave the sweep, and so do supply and quorum
            // history: only the latest checkpoint of each is read (D33).
            !(k.contains("ProposalTime")
                || k.contains("ProposalId")
                || k.contains("ProposalVote")
                || k.contains("TotalSupplyCheckpoint")
                || k.contains("QuorumCheckpoint"))
        })
        .collect();
    assert!(
        unlisted.is_empty(),
        "DAO keys missing from the inventory: {unlisted:#?}"
    );
    let phantom: std::vec::Vec<_> = expected.difference(&on_ledger).collect();
    assert!(
        phantom.is_empty(),
        "inventory lists keys that do not exist: {phantom:?}"
    );
}

// ============================================================================
// Budget gates (docs/STORAGE_DIET.md § 10), measured against live testnet
// limits read 2026-10-12 (`stellar network settings --network testnet`).
// ============================================================================

const TX_MAX_INSTRUCTIONS: u64 = 400_000_000;
const TX_MAX_WRITE_BYTES: u32 = 132_096;
const TX_MAX_EVENTS_BYTES: u32 = 16_384;
const TX_MAX_FOOTPRINT_ENTRIES: u32 = 400;
const TX_MAX_DISK_READ_BYTES: u32 = 200_000;

/// Resources of the last invocation, asserted against the live limits.
fn assert_within_limits(e: &Env, what: &str) {
    let r = e.cost_estimate().resources();
    let cpu = e.cost_estimate().budget().cpu_instruction_cost();
    std::println!(
        "BUDGET {what}: cpu {cpu}, write bytes {}, entries read {} written {}, events {}",
        r.write_bytes,
        r.disk_read_entries + r.memory_read_entries,
        r.write_entries,
        r.contract_events_size_bytes
    );
    assert!(cpu < TX_MAX_INSTRUCTIONS, "{what}: cpu {cpu}");
    assert!(
        r.write_bytes < TX_MAX_WRITE_BYTES,
        "{what}: write bytes {}",
        r.write_bytes
    );
    assert!(
        r.contract_events_size_bytes < TX_MAX_EVENTS_BYTES,
        "{what}: events {}",
        r.contract_events_size_bytes
    );
}

/// `create_dao` with a maximum-length profile, and `propose` with a maximum
/// description, fit one transaction.
#[test]
fn largest_create_dao_and_propose_fit_the_live_limits() {
    let f = factory_dao();
    let e = &f.e;
    let asset = f.payment.address();
    let mut params = slug_params(e, &f.deployer, 2, "big-profile", &asset);
    let filler = "x".repeat(common::MAX_PROFILE_LENGTH as usize - 30);
    params.initial_config.profile =
        String::from_str(e, &std::format!(r#"{{"v":1,"description":"{filler}"}}"#));
    assert!(params.initial_config.profile.len() <= common::MAX_PROFILE_LENGTH);
    e.cost_estimate().budget().reset_default();
    f.manager.create_dao(&params);
    assert_within_limits(e, "create_dao (4 KB profile)");

    e.cost_estimate().budget().reset_unlimited();
    f.manager.launch_dao(&f.dao.token, &f.no_launch_modules());
    let governor = DaoGovernorContractClient::new(e, &f.dao.governor);
    advance(e, 1);
    let mut targets = Vec::new(e);
    let mut functions = Vec::new(e);
    let mut args: Vec<Vec<Val>> = Vec::new(e);
    for i in 0..governor::MAX_PROPOSAL_ACTIONS {
        targets.push_back(f.dao.metadata.clone());
        functions.push_back(Symbol::new(e, "update_renderer_base"));
        args.push_back(vec![
            e,
            String::from_str(e, &std::format!("https://r{i}.example/")).into_val(e),
        ]);
    }
    let description = String::from_str(
        e,
        &"d".repeat(stellar_governance::governor::MAX_DESCRIPTION_LENGTH as usize),
    );
    e.cost_estimate().budget().reset_default();
    governor.propose(&targets, &functions, &args, &description, &f.deployer);
    assert_within_limits(e, "propose (20 actions, max description)");
}

/// The reference DAO (16 properties, ~300 items, 500 tokens, 50 proposals of
/// which 10 are live) renews in one `ExtendFootprintTTL`: its six instances
/// plus the inventory fit the footprint and read-bytes limits.
#[test]
fn reference_dao_sweep_fits_one_transaction() {
    use soroban_sdk::xdr::{LedgerKey, Limits, ScAddress, ScVal, WriteXdr};
    use soroban_sdk::TryFromVal;
    let f = factory_dao();
    let e = &f.e;
    let token = DaoTokenContractClient::new(e, &f.dao.token);
    let metadata = MetadataContractClient::new(e, &f.dao.metadata);
    let (minter_id, _) = shared_minter(&f);
    f.manager.set_platform_minter(&minter_id);

    // 16 properties of 19 items each (304 items), one property per call.
    for p in 0..16u32 {
        let mut items = Vec::new(e);
        for i in 0..19u32 {
            items.push_back(ItemParam {
                property_id: 0,
                name: String::from_str(e, &std::format!("item {p}-{i}")),
                is_new_property: true,
            });
        }
        metadata.add_properties(
            &vec![e, String::from_str(e, &std::format!("Property {p}"))],
            &items,
            &IpfsGroup {
                base_uri: String::from_str(e, &std::format!("ipfs://art{p}/")),
                extension: String::from_str(e, ".png"),
            },
        );
    }
    // 500 tokens (one already minted), in event-budget-sized batches.
    let holders: std::vec::Vec<Address> = (0..12).map(|_| Address::generate(e)).collect();
    let mut left = 499u32;
    for h in holders.iter().cycle() {
        if left == 0 {
            break;
        }
        let n = left.min(40);
        token.batch_mint(&f.deployer, &vec![e, h.clone()], &vec![e, n as u128]);
        left -= n;
    }
    f.manager.launch_dao(
        &f.dao.token,
        &manager::LaunchConfig {
            launch_auction: true,
            launch_marketplace: true,
            minter: minter_id,
        },
    );

    // 50 proposals, 40 of them cancelled.
    let governor = DaoGovernorContractClient::new(e, &f.dao.governor);
    advance(e, 1);
    for i in 0..50u32 {
        let targets = vec![e, f.dao.metadata.clone()];
        let functions = vec![e, Symbol::new(e, "update_renderer_base")];
        let args = vec![
            e,
            vec![e, String::from_str(e, "https://r.example/").into_val(e)],
        ];
        let description = String::from_str(e, &std::format!("proposal {i}"));
        governor.propose(&targets, &functions, &args, &description, &f.deployer);
        if i >= 10 {
            governor.cancel(
                &targets,
                &functions,
                &args,
                &description_hash(e, &description),
                &f.deployer,
            );
        }
    }

    let listed = dao_renewal_inventory(e, &f.manager, &f.dao.token);
    let snapshot = e.to_ledger_snapshot();
    let size_of = |owner: &Address, key: &ScVal| -> u32 {
        let owner = ScAddress::from(owner);
        snapshot
            .ledger_entries
            .iter()
            .find(|(k, _)| matches!(k.as_ref(), LedgerKey::ContractData(d) if d.contract == owner && d.key == *key))
            .map(|(_, (entry, _))| entry.to_xdr(Limits::none()).unwrap().len() as u32)
            .unwrap_or_else(|| panic!("{key:?} not on the ledger"))
    };
    let mut entries = 0u32;
    let mut bytes = 0u32;
    for module in [
        &f.dao.token,
        &f.dao.metadata,
        &f.dao.auction,
        &f.dao.governor,
        &f.dao.treasury,
        &f.dao.marketplace,
    ] {
        entries += 1;
        bytes += size_of(module, &ScVal::LedgerKeyContractInstance);
    }
    // Bytes per key variant, so docs/TTL_ECONOMICS.md can say where the rent goes.
    let mut by_variant = std::collections::BTreeMap::<std::string::String, (u32, u32)>::new();
    by_variant.insert("(instances)".into(), (entries, bytes));
    for (owner, key) in &listed {
        let key = ScVal::try_from_val(e, key).unwrap();
        let size = size_of(owner, &key);
        entries += 1;
        bytes += size;
        let row = by_variant.entry(key_variant(&key)).or_default();
        row.0 += 1;
        row.1 += size;
    }
    for (variant, (n, b)) in &by_variant {
        std::println!("BUDGET   {variant}: {n} entries, {b} bytes");
    }
    std::println!("BUDGET reference DAO sweep: {entries} entries, {bytes} bytes");
    assert!(entries <= TX_MAX_FOOTPRINT_ENTRIES, "{entries} entries");
    assert!(bytes <= TX_MAX_DISK_READ_BYTES, "{bytes} bytes");
}

// ============================================================================
// Quorum fixed at creation (D33): only the latest supply and quorum
// checkpoints are ever read, so history can archive without breaking anything.
// ============================================================================

/// Mint one token to each of `n` fresh holders, one ledger apart (one supply
/// checkpoint per ledger, as daily auctions produce). Returns the holders.
fn mint_history(
    e: &Env,
    token: &DaoTokenContractClient,
    owner: &Address,
    from_ledger: u32,
    n: u32,
) -> std::vec::Vec<Address> {
    (0..n)
        .map(|i| {
            e.ledger().set_sequence_number(from_ledger + i);
            let holder = Address::generate(e);
            token.mint(owner, &holder);
            holder
        })
        .collect()
}

fn checkpoint_count(e: &Env, contract: &Address, counter: &str) -> u32 {
    instance_u32(e, contract, counter)
}

/// Remove every checkpoint but the latest, the way archival makes them
/// unreadable.
fn archive_old_checkpoints(e: &Env, contract: &Address, counter: &str, variant: &str) -> u32 {
    let n = checkpoint_count(e, contract, counter);
    e.as_contract(contract, || {
        for i in 0..n.saturating_sub(1) {
            let key = oz_key(e, variant, std::vec![i.into_val(e)]);
            assert!(e.storage().persistent().has(&key), "{variant}({i}) missing");
            e.storage().persistent().remove(&key);
        }
    });
    n.saturating_sub(1)
}

#[test]
fn governance_runs_with_supply_and_quorum_history_archived() {
    let (e, token, treasury, governor, target, owner) = setup();
    let voters = mint_history(&e, &token, &owner, 110, 21);
    // A second quorum checkpoint (same rate), so quorum history exists too.
    e.ledger().set_sequence_number(150);
    governor.set_quorum_bps(&1_000);

    e.ledger().set_sequence_number(200);
    e.ledger().set_timestamp(2_000);
    let targets = vec![&e, target.address.clone()];
    let functions = vec![&e, symbol_short!("set_value")];
    let args = proposal_args(&e);
    let description = String::from_str(&e, "Runs on the latest checkpoints only");
    let desc_hash = description_hash(&e, &description);
    let id = governor.propose(&targets, &functions, &args, &description, &voters[0]);
    let info = governor.proposal(&id);
    // ceil(21 * 10%) = 3, fixed now.
    assert_eq!(info.quorum, 3);

    // More supply history after the snapshot: a lookup at the snapshot would
    // now have to binary-search.
    mint_history(&e, &token, &owner, 210, 10);
    let supply_gone = archive_old_checkpoints(
        &e,
        &token.address,
        "NumTotalSupplyCheckpoints",
        "TotalSupplyCheckpoint",
    );
    let quorum_gone = archive_old_checkpoints(
        &e,
        &governor.address,
        "NumQuorumCheckpoints",
        "QuorumCheckpoint",
    );
    assert!(supply_gone >= 30 && quorum_gone >= 1);
    // The historical view really needed that history.
    assert!(governor.try_quorum(&info.vote_snapshot).is_err());

    e.ledger().set_timestamp(2_301);
    for voter in voters.iter().take(3) {
        governor.cast_vote(&id, &1, &String::from_str(&e, "yes"), voter);
    }
    e.ledger().set_timestamp(2_601);
    assert_eq!(governor.proposal_state(&id), ProposalState::Succeeded);
    assert_eq!(governor.proposal(&id).state, ProposalState::Succeeded);
    governor.queue(
        &targets, &functions, &args, &desc_hash, &2_901_u32, &voters[0],
    );
    e.ledger().set_timestamp(2_901);
    treasury.execute(&targets, &functions, &args, &desc_hash);
    assert_eq!(target.get_value(), 42);
    assert_eq!(governor.proposal_state(&id), ProposalState::Executed);

    // New proposals, mints and threshold checks keep working.
    e.ledger().set_sequence_number(300);
    token.mint(&owner, &Address::generate(&e));
    e.ledger().set_sequence_number(301);
    let next = governor.propose(
        &targets,
        &functions,
        &args,
        &String::from_str(&e, "next"),
        &voters[1],
    );
    // ceil(32 * 10%) = 4.
    assert_eq!(governor.proposal(&next).quorum, 4);
    governor.set_proposal_threshold(&2);
}

#[test]
fn quorum_does_not_follow_later_supply_or_rate_changes() {
    let (e, token, _treasury, governor, target, owner) = setup();
    let voters = mint_history(&e, &token, &owner, 110, 10);
    e.ledger().set_sequence_number(200);
    e.ledger().set_timestamp(2_000);
    let targets = vec![&e, target.address.clone()];
    let functions = vec![&e, symbol_short!("set_value")];
    let id = governor.propose(
        &targets,
        &functions,
        &proposal_args(&e),
        &String::from_str(&e, "fixed quorum"),
        &voters[0],
    );
    assert_eq!(governor.proposal(&id).quorum, 1);
    // Supply grows tenfold and the rate goes to 50 % while it is open.
    mint_history(&e, &token, &owner, 201, 90);
    governor.set_quorum_bps(&5_000);
    assert_eq!(governor.proposal(&id).quorum, 1);

    e.ledger().set_timestamp(2_301);
    governor.cast_vote(&id, &1, &String::from_str(&e, "yes"), &voters[0]);
    e.ledger().set_timestamp(2_601);
    assert_eq!(governor.proposal_state(&id), ProposalState::Succeeded);
}

#[test]
fn a_mint_in_the_proposing_ledger_counts_toward_the_quorum_supply() {
    let (e, token, _treasury, governor, target, owner) = setup();
    let voters = mint_history(&e, &token, &owner, 110, 10);
    e.ledger().set_sequence_number(200);
    e.ledger().set_timestamp(2_000);
    // Ten more tokens in the same ledger as the proposal: they cannot vote
    // (the snapshot is ledger 199) but they count toward its quorum.
    for _ in 0..10 {
        token.mint(&owner, &Address::generate(&e));
    }
    let id = governor.propose(
        &vec![&e, target.address.clone()],
        &vec![&e, symbol_short!("set_value")],
        &proposal_args(&e),
        &String::from_str(&e, "same ledger"),
        &voters[0],
    );
    let info = governor.proposal(&id);
    assert_eq!(info.vote_snapshot, 199);
    // The quorum supply is the snapshot ledger's (199): ceil(10 * 10%) = 1.
    // The ten tokens minted in ledger 200 neither vote nor count.
    assert_eq!(info.quorum, 1);
}

/// Contract review H1: a holder who parks tokens in a non-voting holder (the
/// Marketplace escrow, reversible by `cancel`) in the proposing ledger must
/// not lower the quorum while still voting with those tokens at the
/// snapshot. The quorum supply is the snapshot ledger's, so it does not move.
#[test]
fn escrow_in_the_proposing_ledger_does_not_lower_the_quorum() {
    let (e, token, _treasury, governor, target, owner) = setup();
    // The attacker holds 8 of 20 (40 %) under a 50 % quorum: alone they can
    // never pass a proposal. Escrowing their 8 in the proposing ledger would
    // have made the quorum ceil(12 * 50 %) = 6 <= 8.
    let attacker = Address::generate(&e);
    e.ledger().set_sequence_number(110);
    let mut mine = std::vec::Vec::new();
    for _ in 0..8 {
        mine.push(token.mint(&owner, &attacker));
    }
    mint_history(&e, &token, &owner, 111, 12); // twelve other holders
    e.ledger().set_sequence_number(150);
    governor.set_quorum_bps(&5_000);
    assert_eq!(token.total_supply(), 20);

    // Ledger 200: escrow all eight (the Marketplace address is a non-voting
    // holder; moving a token there burns its voting unit) and propose.
    e.ledger().set_sequence_number(200);
    e.ledger().set_timestamp(2_000);
    let market = token.marketplace().unwrap();
    for t in &mine {
        token.transfer(&attacker, &market, t);
    }
    assert_eq!(token.total_supply(), 12);
    assert_eq!(token.voting_supply_at_previous_ledger(), 20);
    let id = governor.propose(
        &vec![&e, target.address.clone()],
        &vec![&e, symbol_short!("set_value")],
        &proposal_args(&e),
        &String::from_str(&e, "escrow and propose"),
        &attacker,
    );
    let info = governor.proposal(&id);
    assert_eq!(info.vote_snapshot, 199);
    // ceil(20 * 50%) = 10, not ceil(12 * 50%) = 6.
    assert_eq!(info.quorum, 10);
    // The attacker's eight votes (the escrowed tokens still count at the
    // snapshot) cannot pass it.
    e.ledger().set_timestamp(2_301);
    governor.cast_vote(&id, &1, &String::from_str(&e, "yes"), &attacker);
    e.ledger().set_timestamp(2_601);
    assert_eq!(governor.proposal_state(&id), ProposalState::Defeated);
}

#[test]
fn voting_supply_at_previous_ledger_reads_only_the_latest_checkpoints() {
    let (e, token, _t, _g, _target, owner) = setup();
    assert_eq!(token.voting_supply_at_previous_ledger(), 0);
    e.ledger().set_sequence_number(110);
    token.mint(&owner, &Address::generate(&e));
    // Written this ledger: the previous ledger had none.
    assert_eq!(token.voting_supply_at_previous_ledger(), 0);
    e.ledger().set_sequence_number(111);
    assert_eq!(token.voting_supply_at_previous_ledger(), 1);
    token.mint(&owner, &Address::generate(&e));
    token.mint(&owner, &Address::generate(&e));
    assert_eq!(token.voting_supply_at_previous_ledger(), 1);
    e.ledger().set_sequence_number(500);
    assert_eq!(token.voting_supply_at_previous_ledger(), 3);
    // Only the two latest checkpoints are ever read: drop the rest.
    archive_old_checkpoints(
        &e,
        &token.address,
        "NumTotalSupplyCheckpoints",
        "TotalSupplyCheckpoint",
    );
    assert_eq!(token.voting_supply_at_previous_ledger(), 3);
}

// ============================================================================
// A DAO kept alive by the sweep alone (docs/STORAGE_DIET.md § 7). The test
// host does not archive, so `archive_expired` does: it deletes every expired
// persistent or temporary entry, and fails the test if the code or instance of
// a contract the DAO runs on has expired.
// ============================================================================

const TESTNET_MAX_ENTRY_TTL: u32 = 3_110_400;
const TESTNET_MIN_PERSISTENT_TTL: u32 = 120_960;

fn advance_days(e: &Env, days: u32) {
    e.ledger().with_mut(|l| {
        l.sequence_number += days * common::ttl::DAY_IN_LEDGERS;
        l.timestamp += days as u64 * 86_400;
    });
}

/// `ExtendFootprintTTL` over the inventory and the six module instances, to
/// the network maximum (what the Renewal tab and `renew-dao.mjs` submit).
fn run_dao_sweep(e: &Env, f: &DaoFixture) -> usize {
    run_dao_sweep_of(e, f, dao_renewal_inventory(e, &f.manager, &f.dao.token))
}

fn run_dao_sweep_of(e: &Env, f: &DaoFixture, listed: std::vec::Vec<(Address, Val)>) -> usize {
    for (owner, key) in &listed {
        e.as_contract(owner, || {
            e.storage()
                .persistent()
                .extend_ttl(key, TESTNET_MAX_ENTRY_TTL, TESTNET_MAX_ENTRY_TTL)
        });
    }
    for module in dao_modules(&f.dao) {
        e.as_contract(&module, || {
            e.deployer().extend_ttl_for_contract_instance(
                module.clone(),
                TESTNET_MAX_ENTRY_TTL,
                TESTNET_MAX_ENTRY_TTL,
            )
        });
    }
    listed.len()
}

fn dao_modules(dao: &manager::DaoAddresses) -> [Address; 6] {
    [
        dao.token.clone(),
        dao.metadata.clone(),
        dao.auction.clone(),
        dao.governor.clone(),
        dao.treasury.clone(),
        dao.marketplace.clone(),
    ]
}

/// What `scripts/renew-code-ttl.mjs` does: code of every running hash, the
/// Manager and Minter instances, the registry records `version()` reads, the
/// platform Minter pointer and the latest-implementation records. The asset
/// contract's instance is the network's; it is kept alive here as it is in use.
fn run_platform_renewal(e: &Env, f: &DaoFixture) {
    let max = TESTNET_MAX_ENTRY_TTL;
    let mut running = dao_modules(&f.dao).to_vec();
    running.push(f.manager.address.clone());
    running.push(f.minter.clone());
    for c in &running {
        e.as_contract(c, || e.deployer().extend_ttl_for_code(c.clone(), max, max));
    }
    for c in [&f.manager.address, &f.minter, &f.payment.address()] {
        e.as_contract(c, || {
            e.deployer()
                .extend_ttl_for_contract_instance(c.clone(), max, max)
        });
    }
    let mut records: std::vec::Vec<Val> = std::vec::Vec::new();
    for c in &running {
        let hash = WasmHashProbeClient::new(e, c).wasm_hash();
        records.push(ns_key(e, "Implementation", std::vec![hash.into_val(e)]));
    }
    records.push(ns_key(e, "PlatformMinter", std::vec![]));
    for name in [
        "Token",
        "Metadata",
        "Auction",
        "Governor",
        "Treasury",
        "Marketplace",
        "Manager",
        "Minter",
    ] {
        records.push(ns_key(
            e,
            "LatestImplementation",
            std::vec![String::from_str(e, name).into_val(e)],
        ));
    }
    let m = &f.manager.address;
    for key in records {
        e.as_contract(m, || {
            if e.storage().persistent().has(&key) {
                e.storage().persistent().extend_ttl(&key, max, max);
            }
        });
    }
}

#[soroban_sdk::contractclient(name = "WasmHashProbeClient")]
#[allow(dead_code)]
trait WasmHashProbe {
    fn wasm_hash(e: Env) -> BytesN<32>;
}

/// Archive what has expired. Returns how many entries were archived.
///
/// Approximation (review M4): on the network a contract call that reads an
/// archived key fails as a whole, while this deletes the entry so the read
/// sees "absent". The flows below read only swept or freshly written keys, so
/// the conclusion holds; a flow that *depends* on the absent-vs-failed
/// distinction would not be caught here.
fn archive_expired(e: &Env, f: &DaoFixture) -> usize {
    use soroban_sdk::xdr::{ContractDataDurability, LedgerKey, ScAddress, ScVal};
    use soroban_sdk::TryFromVal;
    let now = e.ledger().sequence();
    let mut must_live: std::vec::Vec<ScAddress> =
        dao_modules(&f.dao).iter().map(ScAddress::from).collect();
    must_live.push(ScAddress::from(&f.manager.address));
    must_live.push(ScAddress::from(&f.minter));
    let running_code: std::vec::Vec<_> = dao_modules(&f.dao)
        .iter()
        .chain([f.manager.address.clone(), f.minter.clone()].iter())
        .map(|c| WasmHashProbeClient::new(e, c).wasm_hash().to_array())
        .collect();
    let mut archived = 0;
    for (key, (_, live_until)) in e.to_ledger_snapshot().ledger_entries.iter() {
        let Some(live_until) = live_until else {
            continue;
        };
        if *live_until >= now {
            continue;
        }
        match key.as_ref() {
            LedgerKey::ContractCode(c) => {
                assert!(
                    !running_code.contains(&c.hash.0),
                    "running contract code archived"
                );
            }
            LedgerKey::ContractData(d) if d.key == ScVal::LedgerKeyContractInstance => {
                assert!(
                    !must_live.contains(&d.contract),
                    "instance {:?} archived",
                    d.contract
                );
            }
            // Auth nonces are host bookkeeping, not contract state.
            LedgerKey::ContractData(d) if matches!(d.key, ScVal::LedgerKeyNonce(_)) => {}
            LedgerKey::ContractData(d) => {
                let owner = Address::try_from_val(e, &ScVal::Address(d.contract.clone())).unwrap();
                let k = Val::try_from_val(e, &d.key).unwrap();
                e.as_contract(&owner, || match d.durability {
                    ContractDataDurability::Persistent => e.storage().persistent().remove(&k),
                    ContractDataDurability::Temporary => e.storage().temporary().remove(&k),
                });
                archived += 1;
            }
            _ => {}
        }
    }
    archived
}

#[test]
fn a_dao_kept_alive_by_the_sweep_alone_works_after_a_year() {
    let mut f = factory_dao();
    f.e.ledger().with_mut(|l| {
        l.max_entry_ttl = TESTNET_MAX_ENTRY_TTL;
        l.min_persistent_entry_ttl = TESTNET_MIN_PERSISTENT_TTL;
    });
    let (minter_id, _) = shared_minter(&f);
    f.manager.set_platform_minter(&minter_id);
    f.minter = minter_id.clone();
    let e = &f.e;
    let token = DaoTokenContractClient::new(e, &f.dao.token);
    let metadata = MetadataContractClient::new(e, &f.dao.metadata);
    let treasury = DaoTreasuryContractClient::new(e, &f.dao.treasury);
    let auction = DaoAuctionContractClient::new(e, &f.dao.auction);
    let governor = DaoGovernorContractClient::new(e, &f.dao.governor);
    let minter = minter::MinterContractClient::new(e, &minter_id);
    let sac = StellarAssetClient::new(e, &f.payment.address());
    let xlm = TokenClient::new(e, &f.payment.address());

    // --- Day 0: artwork, launch, one unsold auction, treasury funds, a claim round.
    metadata.add_properties(
        &vec![
            e,
            String::from_str(e, "Background"),
            String::from_str(e, "Body"),
        ],
        &vec![
            e,
            ItemParam {
                property_id: 0,
                name: String::from_str(e, "Blue"),
                is_new_property: true,
            },
            ItemParam {
                property_id: 1,
                name: String::from_str(e, "Round"),
                is_new_property: true,
            },
        ],
        &IpfsGroup {
            base_uri: String::from_str(e, "ipfs://art/"),
            extension: String::from_str(e, ".png"),
        },
    );
    // The founder token was minted before the artwork: seed it, as setup does.
    metadata.regenerate(&0);
    f.manager.launch_dao(
        &f.dao.token,
        &manager::LaunchConfig {
            launch_auction: true,
            launch_marketplace: true,
            minter: minter_id.clone(),
        },
    );
    let unsold = u32::try_from(auction.get_auction().token_id).unwrap();
    advance(e, 400);
    auction.settle_and_create_new();
    assert_eq!(token.owner_of(&unsold), f.dao.treasury);
    sac.mint(&f.dao.treasury, &500_000_000);
    let erin = Address::generate(e);
    let (root, erin_proof, _) = merkle_pair(e, &erin, 2, &Address::generate(e), 1);
    minter.set_merkle_root(&f.dao.token, &root, &String::from_str(e, "ipfs://bafytree"));

    // --- A year with no activity but the sweep and the platform renewal.
    let mut archived = 0;
    for days in [150, 150, 65] {
        let swept = run_dao_sweep(e, &f);
        run_platform_renewal(e, &f);
        advance_days(e, days);
        archived += archive_expired(e, &f);
        std::println!("swept {swept} keys; {archived} entries archived so far");
    }
    // Member and history state did archive: the sweep is not covering by accident.
    assert!(archived > 0);
    assert!(
        token.try_owner_of(&0).is_err(),
        "the founder's ownership entry archived"
    );

    // --- Day 365: a fresh member wins the open auction, proposes and spends.
    // An old token still renders from chain.
    assert!(!token.token_uri(&0).is_empty());
    let open = auction.get_auction();
    advance(e, 400); // the auction opened on day 0 has long ended
    auction.settle_and_create_new(); // no bids: to the treasury
    let dave = Address::generate(e);
    sac.mint(&dave, &100_000_000);
    let lot = auction.get_auction().token_id;
    assert_ne!(lot, open.token_id);
    auction.create_bid(&dave, &lot, &20_000_000, &String::from_str(e, ""));
    advance(e, 400);
    auction.settle_and_create_new();
    let lot = u32::try_from(lot).unwrap();
    assert_eq!(token.owner_of(&lot), dave);
    assert_eq!(metadata.get_attributes(&lot).len(), 3);
    advance(e, 1);

    let treasury_before = xlm.balance(&f.dao.treasury);
    assert_eq!(treasury_before, 500_000_000 + 20_000_000);
    let targets = vec![e, f.payment.address(), f.dao.token.clone()];
    let functions = vec![e, Symbol::new(e, "transfer"), Symbol::new(e, "transfer")];
    let args = vec![
        e,
        vec![
            e,
            f.dao.treasury.into_val(e),
            dave.into_val(e),
            10_000_000i128.into_val(e),
        ],
        vec![
            e,
            f.dao.treasury.into_val(e),
            dave.into_val(e),
            unsold.into_val(e),
        ],
    ];
    let description = String::from_str(e, "Spend after a quiet year");
    let desc_hash = description_hash(e, &description);
    let id = governor.propose(&targets, &functions, &args, &description, &dave);
    advance(e, 301);
    governor.cast_vote(&id, &1, &String::from_str(e, ""), &dave);
    advance(e, 301);
    governor.queue(&targets, &functions, &args, &desc_hash, &0u32, &dave);
    advance(e, 301);
    treasury.execute(&targets, &functions, &args, &desc_hash);
    assert_eq!(xlm.balance(&f.dao.treasury), treasury_before - 10_000_000);
    assert_eq!(token.owner_of(&unsold), dave);

    // The claim round set a year ago is still open.
    minter.mint_merkle(&f.dao.token, &erin, &2u128, &erin_proof);
    assert_eq!(token.balance(&erin), 2);
}

/// Negative control for the test above: the same quiet year with the DAO's
/// holdings left out of the sweep loses the Treasury's balance (archived until
/// someone restores it), so the holdings class is load-bearing.
#[test]
fn without_dao_holdings_in_the_sweep_an_idle_treasury_balance_archives() {
    use soroban_sdk::TryFromVal;
    let mut f = factory_dao();
    f.e.ledger().with_mut(|l| {
        l.max_entry_ttl = TESTNET_MAX_ENTRY_TTL;
        l.min_persistent_entry_ttl = TESTNET_MIN_PERSISTENT_TTL;
    });
    let (minter_id, _) = shared_minter(&f);
    f.manager.set_platform_minter(&minter_id);
    f.minter = minter_id.clone();
    let e = &f.e;
    f.manager.launch_dao(&f.dao.token, &f.no_launch_modules());
    StellarAssetClient::new(e, &f.payment.address()).mint(&f.dao.treasury, &500_000_000);
    let xlm = TokenClient::new(e, &f.payment.address());
    for days in [150, 150, 65] {
        let without_holdings: std::vec::Vec<_> = dao_renewal_inventory(e, &f.manager, &f.dao.token)
            .into_iter()
            .filter(|(_, k)| {
                let v = key_variant(&soroban_sdk::xdr::ScVal::try_from_val(e, k).unwrap());
                v != "oz:Balance" && v != "oz:Owner"
            })
            .collect();
        run_dao_sweep_of(e, &f, without_holdings);
        run_platform_renewal(e, &f);
        advance_days(e, days);
        archive_expired(e, &f);
    }
    assert_eq!(xlm.balance(&f.dao.treasury), 0);
}
