//! A tribe that votes through an adapter instead of its token, end to end on
//! the built WASMs (docs/designs/governance-adapter.md): the Manager approves
//! the mock adapter, `create_dao` names it, launch checks it, and a proposal
//! passes and executes on the adapter's weights alone.

use super::*;
use manager::ManagerError as M;
use vote_adapter_mock::{VoteAdapterMock, VoteAdapterMockClient};

struct AdapterDao {
    e: Env,
    manager: ManagerContractClient<'static>,
    adapter: VoteAdapterMockClient<'static>,
    dao: manager::DaoAddresses,
    deployer: Address,
}

/// A pending DAO created through the Manager with the approved mock adapter
/// as its vote source, and its founder token minted.
fn pending_adapter_dao() -> AdapterDao {
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
    register_factory(&e, &manager);

    let adapter_id = e.register(VoteAdapterMock, (Address::generate(&e), 0u32));
    let adapter = VoteAdapterMockClient::new(&e, &adapter_id);
    manager.approve_vote_source(&adapter_id, &true, &String::from_str(&e, "Mock adapter"));

    let deployer = Address::generate(&e);
    let mut params = slug_params_with(&e, &deployer, 1, "adapter-dao", Vec::new(&e));
    params.initial_config.governance.vote_source = Some(adapter_id.clone());
    let dao = manager.create_dao(&params);
    // The token stays the membership NFT: the founder still needs one.
    DaoTokenContractClient::new(&e, &dao.token).mint(&deployer, &deployer);

    AdapterDao {
        e,
        manager,
        adapter,
        dao,
        deployer,
    }
}

fn no_modules() -> manager::LaunchConfig {
    manager::LaunchConfig {
        launch_auction: false,
        launch_marketplace: false,
    }
}

#[test]
fn adapter_dao_votes_and_executes_on_adapter_weights() {
    let AdapterDao {
        e,
        manager,
        adapter,
        dao,
        deployer,
    } = pending_adapter_dao();
    let governor = DaoGovernorContractClient::new(&e, &dao.governor);
    let treasury = DaoTreasuryContractClient::new(&e, &dao.treasury);
    assert_eq!(governor.vote_source(), adapter.address);

    // No adapter votes yet: launching would leave no one able to propose.
    assert_eq!(
        manager.try_launch_dao(&dao.token, &no_modules()),
        Err(Ok(M::LaunchSupplyZero))
    );
    let alice = Address::generate(&e);
    let bob = Address::generate(&e);
    adapter.set_votes(&alice, &60);
    adapter.set_votes(&bob, &40);
    manager.launch_dao(&dao.token, &no_modules());

    e.ledger().set_sequence_number(200);
    e.ledger().set_timestamp(2_000);
    let target = TargetContractClient::new(&e, &e.register(TargetContract, ()));
    let targets = vec![&e, target.address.clone()];
    let functions = vec![&e, symbol_short!("set_value")];
    let args = proposal_args(&e);
    let description = String::from_str(&e, "Adapter-weighted proposal");
    let desc_hash = description_hash(&e, &description);

    // The founder holds the membership NFT but no adapter weight.
    assert!(governor
        .try_propose(&targets, &functions, &args, &description, &deployer)
        .is_err());
    let proposal_id = governor.propose(&targets, &functions, &args, &description, &alice);
    assert_eq!(governor.proposal(&proposal_id).quorum, 10); // ceil(100 * 10%)

    e.ledger().set_sequence_number(201);
    e.ledger().set_timestamp(2_301);
    assert!(governor
        .try_cast_vote(&proposal_id, &1, &String::from_str(&e, ""), &deployer)
        .is_err());
    governor.cast_vote(&proposal_id, &1, &String::from_str(&e, "yes"), &alice);
    governor.cast_vote(&proposal_id, &0, &String::from_str(&e, "no"), &bob);

    e.ledger().set_timestamp(2_601);
    assert_eq!(
        governor.proposal_state(&proposal_id),
        ProposalState::Succeeded
    );
    governor.queue(&targets, &functions, &args, &desc_hash, &0, &alice);
    e.ledger().set_timestamp(2_901);
    e.set_auths(&[]);
    treasury.execute(&targets, &functions, &args, &desc_hash);
    assert_eq!(target.get_value(), 42);
}

#[test]
fn withdrawn_approval_blocks_a_pending_adapter_dao() {
    let AdapterDao {
        e,
        manager,
        adapter,
        dao,
        ..
    } = pending_adapter_dao();
    adapter.set_votes(&Address::generate(&e), &1);
    let name = String::from_str(&e, "Mock adapter");
    manager.approve_vote_source(&adapter.address, &false, &name);
    assert_eq!(
        manager.try_launch_dao(&dao.token, &no_modules()),
        Err(Ok(M::VoteSourceNotApproved))
    );
    // A new DAO can't choose it either.
    let mut params = slug_params_with(&e, &Address::generate(&e), 2, "adapter-two", Vec::new(&e));
    params.initial_config.governance.vote_source = Some(adapter.address.clone());
    assert_eq!(
        manager.try_create_dao(&params),
        Err(Ok(M::VoteSourceNotApproved))
    );
    // Approved again, the pending DAO launches.
    manager.approve_vote_source(&adapter.address, &true, &name);
    manager.launch_dao(&dao.token, &no_modules());
}

#[test]
fn token_weighted_dao_reports_the_token_as_its_vote_source() {
    let e = Env::default();
    e.mock_all_auths();
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
    register_factory(&e, &manager);
    let deployer = Address::generate(&e);
    let dao = manager.create_dao(&slug_params_with(
        &e,
        &deployer,
        1,
        "token-dao",
        Vec::new(&e),
    ));
    let governor = DaoGovernorContractClient::new(&e, &dao.governor);
    assert_eq!(governor.vote_source(), dao.token);
}
