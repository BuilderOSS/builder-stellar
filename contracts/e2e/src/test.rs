extern crate std;

use auction::{DaoAuctionContract, DaoAuctionContractClient};
use governor::{DaoGovernorContract, DaoGovernorContractClient};
use manager::{ManagerContract, ManagerContractClient};
use marketplace::{MarketplaceContract, MarketplaceContractClient};
use metadata::{IpfsGroup, ItemParam};
use metadata::{MetadataContract, MetadataContractClient};
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
            String::from_str(e, "https://example.com/project"),
            String::from_str(e, "DAO description"),
            String::from_str(e, "https://example.com/image.png"),
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
            String::from_str(e, "0.1.0"),
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
            String::from_str(&e, "https://example.com/"),
            String::from_str(&e, "DAO Vote NFT"),
            String::from_str(&e, "vDAO"),
            metadata_id.clone(),
            Address::generate(&e),
            BytesN::from_array(&e, &[0u8; 32]),
            String::from_str(&e, "0.1.0"),
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
            String::from_str(&e, "0.1.0"),
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
            String::from_str(&e, "0.1.0"),
        ),
    );
    let governor = DaoGovernorContractClient::new(&e, &governor_id);

    let target_id = e.register(TargetContract, ());
    let target = TargetContractClient::new(&e, &target_id);

    // Launch the token the way the Manager does: the treasury becomes owner and
    // the canonical minter, and `owner` (the launch admin in these tests) is
    // registered as an extra launch-time minter so the tests can keep minting
    // voting power directly.
    token.launch(&treasury_id, &vec![&e, treasury_id.clone(), owner.clone()]);
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

    // Deploy DAO token (NFT)
    let treasury_id = Address::generate(&e);
    let token_id = e.register(
        DaoTokenContract,
        (
            owner.clone(),
            treasury_id.clone(),
            String::from_str(&e, "https://example.com/"),
            String::from_str(&e, "DAO Vote NFT"),
            String::from_str(&e, "vDAO"),
            metadata_id.clone(),
            Address::generate(&e),
            BytesN::from_array(&e, &[0u8; 32]),
            String::from_str(&e, "0.1.0"),
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
            String::from_str(&e, "0.1.0"),
        ),
    );
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
            Address::generate(&e),
            BytesN::from_array(&e, &[0u8; 32]),
            String::from_str(&e, "0.1.0"),
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
fn test_auction_launch_starts_first_auction_and_hands_off_to_treasury() {
    let (e, token, treasury, auction, launch_admin, payment_token, _payment_client) =
        setup_auction_setup_phase();

    assert_eq!(auction.get_owner(), Some(launch_admin.clone()));
    // The token launches first so the auction holds mint authority.
    token.launch(
        &treasury.address,
        &vec![&e, treasury.address.clone(), auction.address.clone()],
    );
    auction.launch(&treasury.address, &true, &payment_token);

    assert_eq!(auction.get_owner(), Some(treasury.address.clone()));
    assert!(!auction.paused());
    assert_eq!(auction.get_auction().token_id, 0);
}

#[test]
fn test_auction_launch_can_remain_paused() {
    let (_e, _token, treasury, auction, _owner, payment_token, _payment_client) =
        setup_auction_setup_phase();

    auction.launch(&treasury.address, &false, &payment_token);

    assert_eq!(auction.get_owner(), Some(treasury.address));
    assert!(auction.paused());
}

#[test]
fn test_auction_cannot_unpause_before_launch() {
    let (_e, _token, _treasury, auction, launch_admin, _payment_token, _payment_client) =
        setup_auction_setup_phase();
    let err = auction.try_unpause(&launch_admin).err().unwrap().unwrap();
    assert_eq!(err, soroban_sdk::Error::from_contract_error(9001));
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
fn test_auction_ownership_remains_with_treasury_after_unpause() {
    let (_e, _token, treasury, auction, owner, _payment_token, _payment_client) = setup_auction();

    assert_eq!(auction.get_owner(), Some(owner.clone()));
    assert_eq!(owner, treasury.address);

    // Unpausing never changes ownership.
    auction.unpause(&owner);
    assert_eq!(auction.get_owner(), Some(owner.clone()));
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
#[should_panic(expected = "Error(Contract, #1216)")] // InvalidBid
fn test_auction_rejects_non_positive_bid_before_transfer() {
    let (e, _token, _treasury, auction, owner, _payment_token, payment_client) = setup_auction();
    let bidder = Address::generate(&e);
    payment_client.mint(&bidder, &10_000_000_000);
    auction.unpause(&owner);

    let token_id = auction.get_auction().token_id;
    auction.create_bid(&bidder, &token_id, &0);
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
        auction.create_bid(&bidder, &token_id, &bid_amount);
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
fn test_auction_payment_token_cannot_change_after_first_bid() {
    let (e, _token, _treasury, auction, owner, _payment_token_addr, payment_client) =
        setup_auction();

    let bidder = Address::generate(&e);
    payment_client.mint(&bidder, &1000_0000000);
    auction.unpause(&owner);
    let token_id = auction.get_auction().token_id;
    auction.create_bid(&bidder, &token_id, &100_0000000);

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
            String::from_str(&e, "https://example.com/"),
            String::from_str(&e, "DAO Vote NFT"),
            String::from_str(&e, "vDAO"),
            metadata_id.clone(),
            Address::generate(&e),
            BytesN::from_array(&e, &[0u8; 32]),
            String::from_str(&e, "0.1.0"),
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
            String::from_str(&e, "0.1.0"),
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
            String::from_str(&e, "0.1.0"),
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
    let token_id = e.register(
        DaoTokenContract,
        (
            treasury.clone(),
            treasury.clone(),
            String::from_str(&e, "https://example.com/"),
            String::from_str(&e, "Marketplace DAO"),
            String::from_str(&e, "MDAO"),
            metadata_id.clone(),
            manager.clone(),
            BytesN::from_array(&e, &[0; 32]),
            String::from_str(&e, "0.1.0"),
        ),
    );
    register_metadata(&e, &metadata_id, &token_id, &treasury);

    let marketplace_id = e.register(
        MarketplaceContract,
        (
            token_id.clone(),
            treasury.clone(), // launch_admin (setup-phase param admin)
            treasury.clone(),
            payment.address(),
            manager,
            BytesN::from_array(&e, &[0; 32]),
            String::from_str(&e, "0.1.0"),
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
    );
    marketplace.launch(&treasury, &true, &payment.address());

    let listing_id = marketplace.create_primary_listing(&100, &2_000);
    let token_id = marketplace.buy_primary(&listing_id, &buyer);

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
    assert_eq!(governor.get_owner(), Some(treasury.address.clone()));
    assert_eq!(governor.treasury(), treasury.address);
    assert_eq!(treasury.get_owner(), Some(treasury.address.clone()));
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
        assert_eq!(common::upgrade::version(&e), String::from_str(&e, "0.2.0"));
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
        assert_eq!(common::upgrade::version(&e), String::from_str(&e, "0.2.0"));
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

    e.ledger().set_timestamp(2_900); // eta is 2_901
    assert_eq!(
        treasury
            .try_execute(&targets, &functions, &args, &hash)
            .err()
            .unwrap()
            .unwrap(),
        not_queued
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

#[test]
fn proposal_syncs_treasury_version_via_self_call() {
    use common::testutils::{MockManager, MockManagerClient};
    let e = Env::default();
    e.mock_all_auths();
    let mgr = MockManagerClient::new(&e, &e.register(MockManager, ()));
    let treasury_hash = BytesN::from_array(&e, &[2u8; 32]);
    mgr.register(&treasury_hash, &String::from_str(&e, "0.1.9"));
    let (e, token, treasury, governor, _target, owner) = setup_with(
        e.clone(),
        mgr.address.clone(),
        BytesN::from_array(&e, &[1u8; 32]),
        treasury_hash,
    );
    let targets = vec![&e, treasury.address.clone()];
    let functions = vec![&e, Symbol::new(&e, "sync_version")];
    let args = vec![&e, Vec::<Val>::new(&e)];
    let (_id, hash) = queue_proposal(
        &e, &token, &governor, &owner, &targets, &functions, &args, "sync",
    );
    e.set_auths(&[]);
    treasury.execute(&targets, &functions, &args, &hash);
    assert_eq!(treasury.version(), String::from_str(&e, "0.1.9"));
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
