//! Custody and payment-asset rules end to end on the built WASMs: payment
//! assets must be Stellar Asset Contracts, the Token refuses to unregister a
//! non-voting module while it holds tokens, and an auction whose allowance is
//! cut mid-auction still settles. Treasury calls stand in for passed
//! proposals (its authorization is mocked).

use super::*;

/// A Wasm contract posing as a payment asset: it reports any balance and
/// accepts every transfer without moving anything.
#[contract]
pub struct HostileAsset;

#[contractimpl]
impl HostileAsset {
    pub fn balance(_e: Env, _id: Address) -> i128 {
        i128::MAX
    }
    pub fn transfer(_e: Env, _from: Address, _to: Address, _amount: i128) {}
}

/// A factory DAO ("custody-dao") with all three modules, paid in a Stellar
/// Asset Contract. One founder token (id 0), Setup.
fn factory() -> DaoFixture {
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
    let params = slug_params(&e, &deployer, 1, "custody-dao", &payment.address());
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

fn launch_all(f: &DaoFixture) {
    f.manager.launch_dao(
        &f.dao.token,
        &manager::LaunchConfig {
            launch_auction: true,
            launch_marketplace: true,
        },
    );
}

/// A lookalike asset is refused at creation and wherever a live module's
/// asset can change, so it never prices a bid, a listing, or a pool.
#[test]
fn a_payment_asset_that_is_not_a_stellar_asset_is_refused_everywhere() {
    let f = factory();
    let e = &f.e;
    let hostile = e.register(HostileAsset, ());

    // A DAO priced in the lookalike asset is never created.
    let params = slug_params(e, &f.deployer, 2, "lookalike-dao", &hostile);
    assert!(f.manager.try_create_dao(&params).is_err());

    launch_all(&f);
    let auction = DaoAuctionContractClient::new(e, &f.auction());
    let market = MarketplaceContractClient::new(e, &f.marketplace());
    let token = DaoTokenContractClient::new(e, &f.dao.token);

    assert_eq!(
        market
            .try_set_payment_asset(&hostile)
            .err()
            .unwrap()
            .unwrap(),
        soroban_sdk::Error::from(marketplace::MarketplaceError::NotStellarAsset)
    );
    token.increase_mint_allowance(&market.address, &2);
    assert_eq!(
        market
            .try_open_pool(
                &1_000,
                &hostile,
                &(e.ledger().timestamp() + 86_400),
                &2,
                &1,
                &2,
                &3_600
            )
            .err()
            .unwrap()
            .unwrap(),
        soroban_sdk::Error::from(marketplace::MarketplaceError::NotStellarAsset)
    );
    auction.pause(&f.dao.treasury);
    assert_eq!(
        auction
            .try_set_payment_token(&hostile)
            .err()
            .unwrap()
            .unwrap(),
        soroban_sdk::Error::from(auction::AuctionError::NotStellarAsset)
    );
    assert_eq!(market.payment_asset(), f.payment.address());
    assert_eq!(auction.payment_asset(), f.payment.address());
}

/// A listing made before the DAO locked transfers, pool stock, and a token
/// no listing records sit in the Marketplace's custody. The Token refuses to
/// unregister it until the DAO has emptied it, so no seller's token is
/// stranded behind the lock, and the stray token cannot keep it registered.
/// A member's direct send is refused (`ModuleCustodyClosed`), so a stray
/// token is one sent before the Token refused them.
#[test]
fn unregistering_the_marketplace_while_it_holds_escrow_under_a_lock_is_refused() {
    let f = factory();
    let e = &f.e;
    let token = DaoTokenContractClient::new(e, &f.dao.token);
    let market = MarketplaceContractClient::new(e, &f.marketplace());
    let seller = Address::generate(e);
    let listed = token.mint(&f.deployer, &seller);
    let stray = token.mint(&f.deployer, &seller);
    launch_all(&f);

    // Listed while unlocked, with no end date.
    token.approve(
        &seller,
        &market.address,
        &listed,
        &(e.ledger().sequence() + 10_000),
    );
    market.list(
        &listed,
        &seller,
        &50_000_000,
        &u64::MAX,
        &250,
        &f.payment.address(),
    );
    // A pool stocked into custody.
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
    // A member cannot send it straight to the Marketplace.
    assert_eq!(
        token
            .try_transfer(&seller, &market.address, &stray)
            .err()
            .unwrap()
            .unwrap(),
        soroban_sdk::Error::from(token::TokenError::ModuleCustodyClosed)
    );
    // A token in custody that no listing records, as one sent before that
    // rule would be: the Marketplace's own pull, outside `list`.
    token.approve(
        &seller,
        &market.address,
        &stray,
        &(e.ledger().sequence() + 10_000),
    );
    token.transfer_from(&market.address, &seller, &market.address, &stray);
    assert_eq!(token.balance(&market.address), 4);

    // The DAO locks transfers, then tries to remove the Marketplace.
    token.set_transfers_locked(&true);
    assert_eq!(
        token
            .try_unregister_module(&market.address)
            .err()
            .unwrap()
            .unwrap(),
        soroban_sdk::Error::from(token::TokenError::ModuleHoldsTokens)
    );
    assert_eq!(token.marketplace(), Some(market.address.clone()));

    // The DAO empties it: the listing goes back to its seller, the stock to
    // the Treasury. Still custody, so the lock lets the tokens out.
    market.pause();
    market.return_listing(&listed);
    assert_eq!(token.owner_of(&listed), seller);
    assert_eq!(token.get_votes(&seller), 1);
    market.close_pool(&pool);
    assert_eq!(market.sweep_pool(&pool), 0);
    market.recover_token(&stray);
    assert_eq!(token.owner_of(&stray), f.dao.treasury);
    assert_eq!(token.balance(&market.address), 0);

    token.unregister_module(&market.address);
    assert_eq!(token.marketplace(), None);
    assert_eq!(token.mint_allowance(&market.address), 0);
}

/// A proposal cuts the Auction's allowance while an auction runs. The
/// auction still settles to its winner and the Auction pauses instead of
/// minting the next token. The same happens when a finite allowance runs out
/// by use. A direct send to the Auction is refused; a token in its custody
/// that no auction records is recovered to the Treasury, and then, holding
/// nothing, the Auction can be unregistered.
#[test]
fn cutting_the_auction_allowance_mid_auction_still_settles_it() {
    let f = factory();
    let e = &f.e;
    let token = DaoTokenContractClient::new(e, &f.dao.token);
    let auction = DaoAuctionContractClient::new(e, &f.auction());
    let sac = StellarAssetClient::new(e, &f.payment.address());
    let pay = TokenClient::new(e, &f.payment.address());
    launch_all(&f);

    let bidder = Address::generate(e);
    sac.mint(&bidder, &1_000_000_000);
    let lot = auction.get_auction();
    let lot_id = u32::try_from(lot.token_id).unwrap();
    auction.create_bid(
        &bidder,
        &lot.token_id,
        &20_000_000,
        &String::from_str(e, ""),
    );
    // While it holds the auctioned token, the Auction cannot be unregistered.
    assert_eq!(
        token
            .try_unregister_module(&auction.address)
            .err()
            .unwrap()
            .unwrap(),
        soroban_sdk::Error::from(token::TokenError::ModuleHoldsTokens)
    );

    // The proposal lowers the allowance to zero mid-auction.
    token.decrease_mint_allowance(&auction.address, &u32::MAX);
    assert_eq!(token.mint_allowance(&auction.address), 0);

    e.ledger().with_mut(|l| {
        l.timestamp = lot.end_time;
        l.sequence_number += 10;
    });
    let minted = token.minted();
    auction.settle_and_create_new();
    assert_eq!(token.owner_of(&lot_id), bidder);
    assert_eq!(pay.balance(&f.dao.treasury), 20_000_000);
    assert!(auction.get_auction().settled);
    assert!(auction.paused());
    assert_eq!(token.minted(), minted, "no next token was minted");
    assert_eq!(token.balance(&auction.address), 0);

    // An allowance of one restored, the admin resumes the auction; its
    // mint spends the allowance to zero.
    token.increase_mint_allowance(&auction.address, &1);
    auction.unpause(&f.dao.treasury);
    let next = auction.get_auction();
    let next_id = u32::try_from(next.token_id).unwrap();
    assert_eq!(next.token_id, lot.token_id + 1);
    assert!(!next.settled);
    assert_eq!(token.mint_allowance(&auction.address), 0);

    // The bidder cannot send their token straight to the Auction.
    assert_eq!(
        token
            .try_transfer(&bidder, &auction.address, &lot_id)
            .err()
            .unwrap()
            .unwrap(),
        soroban_sdk::Error::from(token::TokenError::ModuleCustodyClosed)
    );
    // A token no auction records, as one sent before that rule would be,
    // can be recovered; the running lot cannot.
    token.approve(
        &bidder,
        &auction.address,
        &lot_id,
        &(e.ledger().sequence() + 100),
    );
    token.transfer_from(&auction.address, &bidder, &auction.address, &lot_id);
    auction.pause(&f.dao.treasury);
    assert_eq!(
        auction.try_recover_token(&next_id).err().unwrap().unwrap(),
        soroban_sdk::Error::from(auction::AuctionError::TokenInAuction)
    );
    auction.recover_token(&lot_id);
    assert_eq!(token.owner_of(&lot_id), f.dao.treasury);
    auction.unpause(&f.dao.treasury);

    // The allowance ran out by use, not by a cut: the next settlement still
    // completes (no bids, so the lot goes to the Treasury) and pauses.
    e.ledger().with_mut(|l| {
        l.timestamp = next.end_time;
        l.sequence_number += 10;
    });
    auction.settle_and_create_new();
    assert_eq!(token.owner_of(&next_id), f.dao.treasury);
    assert!(auction.paused());
    assert_eq!(
        token.minted(),
        minted + 1,
        "only the resumed lot was minted"
    );

    // Empty, the Auction can leave.
    assert_eq!(token.balance(&auction.address), 0);
    token.unregister_module(&auction.address);
    assert_eq!(token.auction(), None);
}
