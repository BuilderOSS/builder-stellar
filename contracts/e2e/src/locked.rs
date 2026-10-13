//! Membership token settings end to end on the built WASMs
//! (docs/designs/locked-tokens.md, Next Steps 3): a locked DAO created
//! through the factory with its switches and transfer agents, its sales still
//! running while resale is refused, a DAO-approved transfer and a recovery by
//! real proposals, and unlocking by vote.

use super::*;
use common::modules::TokenSettings;

const ALL_ON: TokenSettings = TokenSettings {
    transfers_locked: true,
    members_only_delegation: true,
    dao_recovery: false,
};

/// A factory DAO ("locked-dao") with `settings`, all three modules, and
/// `agents` named as transfer agents at creation. One founder token, Setup.
fn locked_factory(settings: TokenSettings, agents: &[&str]) -> DaoFixture {
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
    let deployer = Address::generate(&e);
    let payment = e.register_stellar_asset_contract_v2(Address::generate(&e));
    let mut params = slug_params(&e, &deployer, 1, "locked-dao", &payment.address());
    params.initial_config.token_settings = settings;
    for kind in agents {
        params
            .initial_config
            .transfer_agents
            .push_back(Symbol::new(&e, kind));
    }
    let dao = manager.create_dao(&params);
    DaoTokenContractClient::new(&e, &dao.token).mint(&deployer, &deployer);
    DaoFixture {
        e,
        manager,
        dao,
        deployer,
        payment,
    }
}

/// Propose, vote (the founder), queue and execute `actions` in one
/// proposal, executing with nothing but the Treasury's own authorization.
fn pass_proposal(f: &DaoFixture, actions: &[(&Address, &str, Vec<Val>)], description: &str) {
    let e = &f.e;
    let governor = DaoGovernorContractClient::new(e, &f.dao.governor);
    let mut targets = Vec::new(e);
    let mut functions = Vec::new(e);
    let mut args = Vec::new(e);
    for (target, function, call_args) in actions {
        targets.push_back((*target).clone());
        functions.push_back(Symbol::new(e, function));
        args.push_back(call_args.clone());
    }
    e.mock_all_auths();
    e.ledger().with_mut(|l| l.sequence_number += 10);
    let now = e.ledger().timestamp();
    let description = String::from_str(e, description);
    let desc_hash = description_hash(e, &description);
    let id = governor.propose(&targets, &functions, &args, &description, &f.deployer);
    e.ledger().with_mut(|l| {
        l.timestamp = now + 301;
        l.sequence_number += 10;
    });
    governor.cast_vote(&id, &1, &String::from_str(e, "yes"), &f.deployer);
    e.ledger().with_mut(|l| {
        l.timestamp = now + 601;
        l.sequence_number += 10;
    });
    governor.queue(&targets, &functions, &args, &desc_hash, &0, &f.deployer);
    e.ledger().with_mut(|l| {
        l.timestamp = now + 901;
        l.sequence_number += 10;
    });
    e.set_auths(&[]);
    DaoTreasuryContractClient::new(e, &f.dao.treasury)
        .execute(&targets, &functions, &args, &desc_hash);
    assert_eq!(governor.proposal_state(&id), ProposalState::Executed);
    e.mock_all_auths();
}

fn locked() -> soroban_sdk::Error {
    soroban_sdk::Error::from_contract_error(7216)
}

/// Success Criteria: the switches and creation-time agents arrive through
/// `create_dao`; a kind not created is refused; a module added later in
/// Setup is not an agent.
#[test]
fn the_factory_creates_a_dao_with_its_switches_and_agents() {
    let f = locked_factory(ALL_ON, &["claims"]);
    let token = DaoTokenContractClient::new(&f.e, &f.dao.token);
    assert_eq!(token.settings(), ALL_ON);
    assert_eq!(token.transfer_agents(), vec![&f.e, f.claims()]);

    // An agent kind the call does not create is refused before deploying.
    let e = &f.e;
    let mut params = slug_params(e, &f.deployer, 2, "other-dao", &f.payment.address());
    params.initial_config.modules.remove(2); // no ClaimMinter
    params.initial_config.transfer_agents = vec![e, Symbol::new(e, "claims")];
    assert_eq!(
        f.manager.try_create_dao(&params),
        Err(Ok(manager::ManagerError::UnknownAgentKind))
    );

    // A ClaimMinter added in Setup later is not an agent.
    params.initial_config.transfer_agents = vec![e, Symbol::new(e, "marketplace")];
    let other = f.manager.create_dao(&params);
    let other_token = DaoTokenContractClient::new(e, &other.token);
    let cm = f.manager.create_module(
        &other.token,
        &manager::ModuleSpec::Claims(manager::ClaimsConfig {
            payment_asset: f.payment.address(),
        }),
        &0,
    );
    assert_eq!(
        other_token.transfer_agents(),
        vec![e, other.marketplace.clone().unwrap()]
    );
    assert!(!other_token.transfer_agents().contains(&cm));
}

/// Success Criteria: on a locked DAO the auction settles, a pool sells and a
/// member gives back to the DAO, while resale, holder approvals and
/// Marketplace listings are refused; a DAO-approved transfer passes by a
/// real proposal; unlocking by vote restores resale.
#[test]
fn a_locked_dao_sells_and_approves_but_refuses_resale_until_unlocked() {
    let f = locked_factory(ALL_ON, &[]);
    let e = &f.e;
    let token = DaoTokenContractClient::new(e, &f.dao.token);
    let auction = DaoAuctionContractClient::new(e, &f.auction());
    let market = MarketplaceContractClient::new(e, &f.marketplace());
    let sac = StellarAssetClient::new(e, &f.payment.address());
    f.manager.launch_dao(
        &f.dao.token,
        &manager::LaunchConfig {
            launch_auction: true,
            launch_marketplace: true,
        },
    );
    let founder = f.deployer.clone();
    let founder_token = 0u32;

    // The auction settles out of custody.
    let bidder = Address::generate(e);
    sac.mint(&bidder, &1_000_000_000);
    let lot = auction.get_auction();
    auction.create_bid(
        &bidder,
        &lot.token_id,
        &10_000_000,
        &String::from_str(e, ""),
    );
    e.ledger().with_mut(|l| {
        l.timestamp += 400;
        l.sequence_number += 10;
    });
    auction.settle_and_create_new();
    let won = u32::try_from(lot.token_id).unwrap();
    assert_eq!(token.owner_of(&won), bidder);

    // A pool sells out of custody.
    token.increase_mint_allowance(&market.address, &2);
    let pool = market.open_pool(
        &1_000,
        &f.payment.address(),
        &(e.ledger().timestamp() + 86_400),
        &2,
        &1,
        &2,
        &3_600,
    );
    market.restock(&pool);
    let buyer = Address::generate(e);
    sac.mint(&buyer, &10_000);
    let picked = market.pool_stock(&pool, &0).get(0).unwrap();
    market.buy_from_pool(&pool, &0, &picked, &buyer, &1_000);
    assert_eq!(token.owner_of(&picked), buyer);

    // Resale, holder approvals and listings are refused.
    let stranger = Address::generate(e);
    assert_eq!(
        token
            .try_transfer(&bidder, &stranger, &won)
            .err()
            .unwrap()
            .unwrap(),
        locked()
    );
    let expiry = e.ledger().sequence() + 10_000;
    assert_eq!(
        token
            .try_approve(&bidder, &market.address, &won, &expiry)
            .err()
            .unwrap()
            .unwrap(),
        locked()
    );
    assert!(market
        .try_list(
            &won,
            &bidder,
            &100,
            &(e.ledger().timestamp() + 1_000),
            &250,
            &f.payment.address()
        )
        .is_err());

    // Members-only delegation: an outsider cannot receive votes.
    assert_eq!(
        token
            .try_delegate(&bidder, &stranger)
            .err()
            .unwrap()
            .unwrap(),
        soroban_sdk::Error::from_contract_error(7221)
    );

    // A DAO-approved transfer: the buyer approves the Treasury, a proposal
    // moves the token to a new member.
    let newcomer = Address::generate(e);
    token.approve(&buyer, &f.dao.treasury, &picked, &expiry);
    pass_proposal(
        &f,
        &[(
            &f.dao.token,
            "transfer_from",
            vec![
                e,
                f.dao.treasury.into_val(e),
                buyer.into_val(e),
                newcomer.into_val(e),
                picked.into_val(e),
            ],
        )],
        "Approve the sale of a membership",
    );
    assert_eq!(token.owner_of(&picked), newcomer);
    assert_eq!(token.get_votes(&newcomer), 1);

    // A member gives back to the DAO.
    token.transfer(&newcomer, &f.dao.treasury, &picked);
    assert_eq!(token.owner_of(&picked), f.dao.treasury);
    assert_eq!(token.get_votes(&newcomer), 0);
    // The founder still holds a vote to propose with.
    assert_eq!(token.owner_of(&founder_token), founder);

    // Unlocking by vote restores resale at once.
    pass_proposal(
        &f,
        &[(
            &f.dao.token,
            "set_transfers_locked",
            vec![e, false.into_val(e)],
        )],
        "Open membership",
    );
    token.transfer(&bidder, &stranger, &won);
    assert_eq!(token.owner_of(&won), stranger);
}

/// Success Criteria: `dao_transfer` fails while recovery is off, and one
/// proposal turning recovery on and moving a lost-key member's token
/// succeeds in one execution, moving the votes with it.
#[test]
fn one_proposal_turns_recovery_on_and_moves_a_membership() {
    let f = locked_factory(ALL_ON, &[]);
    let e = &f.e;
    let token = DaoTokenContractClient::new(e, &f.dao.token);
    f.manager.launch_dao(&f.dao.token, &f.no_launch_modules());
    assert!(!token.dao_recovery());
    let founder = f.deployer.clone();
    let lost_wallet = Address::generate(e);
    // A second member who lost their key (the founder keeps the vote).
    token.mint(&f.dao.treasury, &lost_wallet);
    let lost_token = 1u32;
    assert_eq!(
        token
            .try_dao_transfer(&lost_token, &founder)
            .err()
            .unwrap()
            .unwrap(),
        soroban_sdk::Error::from_contract_error(7218)
    );

    let new_wallet = Address::generate(e);
    pass_proposal(
        &f,
        &[
            (&f.dao.token, "set_dao_recovery", vec![e, true.into_val(e)]),
            (
                &f.dao.token,
                "dao_transfer",
                vec![e, lost_token.into_val(e), new_wallet.into_val(e)],
            ),
        ],
        "Recover a lost membership",
    );
    assert!(token.dao_recovery());
    assert_eq!(token.owner_of(&lost_token), new_wallet);
    assert_eq!(token.get_votes(&new_wallet), 1);
    // Moved without the lost wallet's signature.
    assert_eq!(token.get_votes(&lost_wallet), 0);
}
