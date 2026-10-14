//! Membership models end to end on the built WASMs
//! (docs/designs/membership-models.md, Success Criteria): the assurance launch
//! with a 1,000-leaf tree, a failed drive with refunds and recovery, a
//! 100-token quick-buy pool against 16-trait artwork, and allowance
//! exhaustion.

use super::*;
use manager::ManagerError as M;
use minter::{AssuranceState, ClaimMinterClient};

const DAY: u64 = 86_400;
const PRICE: i128 = 10;

/// A sorted-pair merkle tree in the ClaimMinter's format: the leaf is
/// `sha256(xdr(claimer) || amount_be_u128)`, a node hashes its sorted pair,
/// and an odd node moves up a level unpaired.
struct Tree {
    layers: std::vec::Vec<std::vec::Vec<[u8; 32]>>,
}

impl Tree {
    fn new(e: &Env, leaves: &[(Address, u128)]) -> Self {
        use soroban_sdk::xdr::ToXdr;
        let hash = |bytes: soroban_sdk::Bytes| -> [u8; 32] { e.crypto().sha256(&bytes).to_array() };
        let mut level: std::vec::Vec<[u8; 32]> = leaves
            .iter()
            .map(|(who, amount)| {
                let mut b = who.clone().to_xdr(e);
                b.extend_from_array(&amount.to_be_bytes());
                hash(b)
            })
            .collect();
        let mut layers = std::vec![level.clone()];
        while level.len() > 1 {
            level = level
                .chunks(2)
                .map(|pair| match pair {
                    [a, b] => {
                        let (lo, hi) = if a <= b { (a, b) } else { (b, a) };
                        let mut bytes = soroban_sdk::Bytes::from_array(e, lo);
                        bytes.extend_from_array(hi);
                        hash(bytes)
                    }
                    [only] => *only,
                    _ => unreachable!(),
                })
                .collect();
            layers.push(level.clone());
        }
        Tree { layers }
    }

    fn root(&self, e: &Env) -> BytesN<32> {
        BytesN::from_array(e, &self.layers.last().unwrap()[0])
    }

    fn proof(&self, e: &Env, mut index: usize) -> Vec<BytesN<32>> {
        let mut proof = Vec::new(e);
        for layer in &self.layers[..self.layers.len() - 1] {
            let sibling = index ^ 1;
            if sibling < layer.len() {
                proof.push_back(BytesN::from_array(e, &layer[sibling]));
            }
            index /= 2;
        }
        proof
    }
}

/// One artwork property, so Setup lists may open.
fn add_artwork(f: &DaoFixture) {
    let e = &f.e;
    MetadataContractClient::new(e, &f.dao.metadata).add_properties(
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
}

/// 1,000 leaves: the first ten claim three tokens each, the rest one.
fn thousand_leaves(e: &Env) -> std::vec::Vec<(Address, u128)> {
    (0..1_000)
        .map(|i| (Address::generate(e), if i < 10 { 3 } else { 1 }))
        .collect()
}

fn drive_params(
    e: &Env,
    tree: &Tree,
    threshold: u32,
    deadline: u64,
) -> manager::AssuranceListParams {
    manager::AssuranceListParams {
        root: tree.root(e),
        tree_uri: String::from_str(e, "ipfs://bafythousand"),
        price: PRICE,
        expires_at: e.ledger().timestamp() + 30 * DAY,
        total: 1_100,
        threshold_claimers: threshold,
        deadline,
    }
}

fn launch_all() -> manager::LaunchConfig {
    manager::LaunchConfig {
        launch_auction: true,
        launch_marketplace: true,
    }
}

/// Fund `who` in the DAO's payment asset and claim `n` of leaf `i`.
fn claim(
    f: &DaoFixture,
    claims: &ClaimMinterClient,
    tree: &Tree,
    leaves: &[(Address, u128)],
    i: usize,
    n: u32,
) {
    let (who, amount) = &leaves[i];
    StellarAssetClient::new(&f.e, &f.payment.address()).mint(who, &1_000);
    claims.claim(&0, who, amount, &n, &tree.proof(&f.e, i), &PRICE);
}

/// Success Criteria "Assurance launch, end to end": distinct claimers
/// (partial claims count once) meet the threshold, the DAO is frozen until
/// then, anyone launches with the stored config, and the escrow arrives
/// with the launch.
#[test]
fn an_assurance_drive_of_a_thousand_leaves_meets_and_anyone_launches() {
    let f = factory_dao();
    let e = &f.e;
    e.cost_estimate().budget().reset_unlimited();
    add_artwork(&f);
    let token = DaoTokenContractClient::new(e, &f.dao.token);
    let claims = ClaimMinterClient::new(e, &f.claims());
    let leaves = thousand_leaves(e);
    let tree = Tree::new(e, &leaves);
    let now = e.ledger().timestamp();

    assert_eq!(
        f.manager.try_open_assurance(
            &f.dao.token,
            &drive_params(e, &tree, 5, now + manager::MAX_ASSURANCE_WINDOW + 1),
            &launch_all()
        ),
        Err(Ok(M::DeadlineTooFar))
    );
    let list = f.manager.open_assurance(
        &f.dao.token,
        &drive_params(e, &tree, 5, now + 10 * DAY),
        &launch_all(),
    );
    assert_eq!(list, 0);
    assert_eq!(token.mint_allowance(&f.claims()), 1_100);

    // Frozen: the launch admin alone can no longer mint or change artwork.
    let deployer = f.deployer.clone();
    e.mock_auths(&[MockAuth {
        address: &deployer,
        invoke: &MockAuthInvoke {
            contract: &f.dao.token,
            fn_name: "mint",
            args: (deployer.clone(), deployer.clone()).into_val(e),
            sub_invokes: &[],
        },
    }]);
    assert!(token.try_mint(&deployer, &deployer).is_err());
    e.mock_all_auths();
    assert_eq!(
        f.manager
            .try_update_pending_slug(&f.dao.token, &String::from_str(e, "renamed")),
        Err(Ok(M::AssuranceOpen))
    );

    // Four distinct claimers, one claiming in parts (1 then 2 of 3).
    claim(&f, &claims, &tree, &leaves, 0, 1);
    claim(&f, &claims, &tree, &leaves, 0, 2);
    for i in [10, 500, 999] {
        claim(&f, &claims, &tree, &leaves, i, 1);
    }
    assert_eq!(claims.assurance_state(&list), AssuranceState::Open);
    assert_eq!(
        f.manager.try_launch_when_ready(&f.dao.token),
        Err(Ok(M::AssuranceNotMet))
    );
    assert_eq!(
        f.manager.try_launch_dao(&f.dao.token, &launch_all()),
        Err(Ok(M::AssuranceNotMet))
    );
    claim(&f, &claims, &tree, &leaves, 1, 3);
    assert_eq!(claims.assurance_state(&list), AssuranceState::Met);

    // Anyone launches: no signature at all.
    // The test budget's default sits below the network's; measure unlimited
    // and check against the live limits.
    e.set_auths(&[]);
    e.cost_estimate().budget().reset_unlimited();
    f.manager.launch_when_ready(&f.dao.token);
    assert_within_limits(e, "launch_when_ready (escrow released)");
    e.mock_all_auths();
    let pay = TokenClient::new(e, &f.payment.address());
    assert_eq!(pay.balance(&f.dao.treasury), PRICE * 9);
    assert_eq!(pay.balance(&f.claims()), 0);
    assert!(token.is_live());
    assert_eq!(token.total_supply(), 10); // founder + 9 claimed
    assert_eq!(
        claims
            .try_refund(&list, &leaves[0].0)
            .err()
            .unwrap()
            .unwrap(),
        minter::ClaimMinterError::NotFailed
    );
    // Claims continue after launch and pay the Treasury directly.
    claim(&f, &claims, &tree, &leaves, 2, 3);
    assert_eq!(pay.balance(&f.dao.treasury), PRICE * 12);
}

/// Success Criteria: a missed deadline fails the drive; both launch paths
/// refuse; refunds pay out, also after the launch admin's recovery upgrade
/// of the ClaimMinter; the slug is freed for another DAO.
#[test]
fn a_failed_drive_refunds_recovers_and_frees_its_slug() {
    let f = factory_dao();
    let e = &f.e;
    e.cost_estimate().budget().reset_unlimited();
    add_artwork(&f);
    let claims = ClaimMinterClient::new(e, &f.claims());
    let leaves = thousand_leaves(e);
    let tree = Tree::new(e, &leaves);
    let now = e.ledger().timestamp();
    f.manager.open_assurance(
        &f.dao.token,
        &drive_params(e, &tree, 3, now + 10 * DAY),
        &launch_all(),
    );
    claim(&f, &claims, &tree, &leaves, 0, 3);
    claim(&f, &claims, &tree, &leaves, 10, 1);

    let from = claims.wasm_hash();
    let to = module_wasm_variant(e, "minter", "recovery");
    f.manager.register_implementation(
        &String::from_str(e, "ClaimMinter"),
        &String::from_str(e, "0.1.1"),
        &to,
    );
    f.manager.approve_upgrade(&from, &to);
    // Not before the drive has failed.
    assert_eq!(
        f.manager.try_recover_claims(&f.dao.token, &from, &to),
        Err(Ok(M::AssuranceNotFailed))
    );

    advance(e, 10 * DAY + 1);
    assert_eq!(claims.assurance_state(&0), AssuranceState::Failed);
    assert_eq!(
        f.manager.try_launch_when_ready(&f.dao.token),
        Err(Ok(M::AssuranceFailed))
    );
    assert_eq!(
        f.manager.try_launch_dao(&f.dao.token, &launch_all()),
        Err(Ok(M::AssuranceFailed))
    );
    let pay = TokenClient::new(e, &f.payment.address());
    let first = leaves[0].0.clone();
    assert_eq!(claims.refund(&0, &first), PRICE * 3);
    assert_eq!(pay.balance(&first), 1_000);

    // Only the recorded launch admin recovers, to the approved hash.
    let stranger = Address::generate(e);
    e.mock_auths(&[MockAuth {
        address: &stranger,
        invoke: &MockAuthInvoke {
            contract: &f.manager.address,
            fn_name: "recover_claims",
            args: (f.dao.token.clone(), from.clone(), to.clone()).into_val(e),
            sub_invokes: &[],
        },
    }]);
    assert!(f
        .manager
        .try_recover_claims(&f.dao.token, &from, &to)
        .is_err());
    e.mock_all_auths();
    f.manager.recover_claims(&f.dao.token, &from, &to);
    assert_eq!(claims.wasm_hash(), to);
    // The upgraded code refunds the rest from the same storage.
    let second = leaves[10].0.clone();
    assert_eq!(claims.refund(&0, &second), PRICE);
    assert_eq!(pay.balance(&f.claims()), 0);

    // The reserved slug is freed, and another DAO launches with it.
    let slug = String::from_str(e, "upgrade-dao");
    assert_eq!(f.manager.get_dao_by_slug(&slug), f.dao.token);
    f.manager.release_slug(&f.dao.token);
    let other = Address::generate(e);
    let rival = f.manager.create_dao(&slug_params(
        e,
        &other,
        9,
        "upgrade-dao",
        &f.payment.address(),
    ));
    DaoTokenContractClient::new(e, &rival.token).mint(&other, &other);
    f.manager.launch_dao(&rival.token, &f.no_launch_modules());
    assert_eq!(f.manager.get_dao_by_slug(&slug), rival.token);
}

/// Success Criteria "Quick-buy": a 100-token pool is stocked by repeated
/// restocks at the event-budget edge against 16-trait artwork; a buyer
/// picks an id within the caps; closing and sweeping return unsold stock
/// to the Treasury and leave no allowance behind; the renewal inventory
/// covers the pool pages.
#[test]
fn a_hundred_token_pool_restocks_sells_closes_and_sweeps() {
    let f = factory_dao();
    let e = &f.e;
    e.cost_estimate().budget().reset_unlimited();
    e.ledger().with_mut(|l| l.max_entry_ttl = 3_110_400);
    let metadata = MetadataContractClient::new(e, &f.dao.metadata);
    let mut names = Vec::new(e);
    let mut items = Vec::new(e);
    for i in 0..16u32 {
        names.push_back(String::from_str(e, "Trait"));
        items.push_back(ItemParam {
            property_id: i,
            name: String::from_str(e, "Item"),
            is_new_property: true,
        });
    }
    metadata.add_properties(
        &names,
        &items,
        &IpfsGroup {
            base_uri: String::from_str(e, "ipfs://art"),
            extension: String::from_str(e, ".png"),
        },
    );
    metadata.regenerate(&0);
    f.manager.launch_dao(
        &f.dao.token,
        &manager::LaunchConfig {
            launch_auction: false,
            launch_marketplace: true,
        },
    );
    let token = DaoTokenContractClient::new(e, &f.dao.token);
    let market = MarketplaceContractClient::new(e, &f.marketplace());
    let supply = token.total_supply();

    // The proposal's two actions.
    token.increase_mint_allowance(&market.address, &100);
    let pool = market.open_pool(
        &1_000,
        &f.payment.address(),
        &(e.ledger().timestamp() + 30 * DAY),
        &100,
        &2,
        &50,
        &DAY,
    );

    // Restocks at the budget edge fit one transaction.
    for expected in [common::MAX_RESTOCK, common::MAX_RESTOCK, 16] {
        e.cost_estimate().budget().reset_default();
        assert_eq!(market.restock(&pool), expected);
        assert_within_limits(e, "restock");
        assert!(
            e.cost_estimate().resources().contract_events_size_bytes
                <= common::BATCH_MINT_EVENT_BUDGET
        );
    }
    e.cost_estimate().budget().reset_unlimited();
    assert_eq!(market.pool_stock(&pool, &0).len(), 64);
    assert_eq!(market.pool_stock(&pool, &1).len(), 36);
    assert_eq!(token.total_supply(), supply); // custody holds no votes
    assert_eq!(token.mint_allowance(&market.address), 0);
    let listed = dao_renewal_inventory(e, &f.manager, &f.dao.token);
    assert_inventory_matches_ledger(e, &f.manager, &f.dao, &listed);

    // A buyer picks a specific id, at most two.
    let buyer = Address::generate(e);
    StellarAssetClient::new(e, &f.payment.address()).mint(&buyer, &10_000);
    let picks: std::vec::Vec<u32> = market.pool_stock(&pool, &1).iter().take(3).collect();
    market.buy_from_pool(&pool, &1, &picks[0], &buyer, &1_000);
    market.buy_from_pool(&pool, &1, &picks[1], &buyer, &1_000);
    assert_eq!(
        market
            .try_buy_from_pool(&pool, &1, &picks[2], &buyer, &1_000)
            .err()
            .unwrap()
            .unwrap(),
        marketplace::MarketplaceError::BuyerLimitReached.into()
    );
    assert_eq!(token.balance(&buyer), 2);
    assert_eq!(token.get_votes(&buyer), 2);
    assert_eq!(
        TokenClient::new(e, &f.payment.address()).balance(&f.dao.treasury),
        2_000
    );

    // Close (the Treasury) and sweep (anyone) the 98 unsold.
    market.close_pool(&pool);
    let mut sweeps = 0;
    while market.sweep_pool(&pool) > 0 {
        sweeps += 1;
    }
    assert_eq!(sweeps, 3); // 25 + 25 + 25 + 23
    assert_eq!(token.balance(&market.address), 0);
    assert_eq!(token.balance(&f.dao.treasury), 98);
    assert_eq!(token.mint_allowance(&market.address), 0);
    assert!(market.open_pools().is_empty());
    assert_eq!(token.total_supply(), supply + 2);
}

/// Success Criteria "Allowances hold": a module mints only within its
/// allowance; more needs a new grant by proposal.
#[test]
fn a_claim_minter_stops_at_its_allowance() {
    let f = factory_dao();
    let e = &f.e;
    e.cost_estimate().budget().reset_unlimited();
    add_artwork(&f);
    f.manager.launch_dao(&f.dao.token, &f.no_launch_modules());
    let token = DaoTokenContractClient::new(e, &f.dao.token);
    let claims = ClaimMinterClient::new(e, &f.claims());
    token.increase_mint_allowance(&f.claims(), &2);
    let leaves = thousand_leaves(e);
    let tree = Tree::new(e, &leaves);
    let list = claims.open_list(
        &tree.root(e),
        &String::from_str(e, "ipfs://bafythousand"),
        &f.payment.address(),
        &0,
        &(e.ledger().timestamp() + DAY),
        &1_100,
        &None,
    );
    let (who, amount) = &leaves[0];
    claims.claim(&list, who, amount, &2, &tree.proof(e, 0), &0);
    // The Token's AllowanceExceeded (7215) propagates.
    let r = claims.try_claim(&list, who, amount, &1, &tree.proof(e, 0), &0);
    assert!(matches!(
        r,
        Err(Err(soroban_sdk::InvokeError::Contract(7215)))
    ));
    token.increase_mint_allowance(&f.claims(), &1);
    claims.claim(&list, who, amount, &1, &tree.proof(e, 0), &0);
    assert_eq!(token.balance(who), 3);
}

/// A pending DAO in an assurance drive is in one-click renewal (eng review
/// R3, review 2 B4/B5): the Manager's pending record, the drive, the reserved
/// slug and the module counter, the ClaimMinter's list and its escrow
/// balance. The DAO adds its ClaimMinter in Setup with `create_module`, a
/// second one of the kind is refused atomically, and the drive freezes
/// `create_module` for the launch admin.
#[test]
fn a_pending_drive_is_covered_by_the_renewal_inventory() {
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
    let founder = Address::generate(&e);
    let asset = e
        .register_stellar_asset_contract_v2(Address::generate(&e))
        .address();
    let modules = vec![
        &e,
        manager::ModuleSpec::Auction(manager::AuctionConfig {
            duration: 300,
            reserve_price: 10_000_000,
            time_buffer: 60,
            payment_asset: asset.clone(),
        }),
        manager::ModuleSpec::Marketplace(manager::MarketplaceConfig {
            payment_asset: asset.clone(),
            secondary_fee_bps: 250,
        }),
    ];
    let dao = manager.create_dao(&slug_params_with(&e, &founder, 1, "drive-dao", modules));
    assert_eq!(dao.claims, None);
    let token = DaoTokenContractClient::new(&e, &dao.token);
    token.mint(&founder, &founder);

    // The ClaimMinter, added in Setup by the launch admin.
    let claims_kind = Symbol::new(&e, "claims");
    let spec = manager::ModuleSpec::Claims(manager::ClaimsConfig {
        payment_asset: asset.clone(),
    });
    let cm = manager.create_module(&dao.token, &spec, &0);
    assert_eq!(token.module(&claims_kind), Some(cm.clone()));
    let pending = manager.get_pending_dao(&dao.token).unwrap();
    assert_eq!(pending.addresses.claims, Some(cm.clone()));
    assert_eq!(pending.claims_payment_asset, Some(asset.clone()));
    // A second ClaimMinter cannot register (one per kind): nothing changes.
    assert!(manager.try_create_module(&dao.token, &spec, &1).is_err());
    assert_eq!(manager.module_count(&dao.token, &claims_kind), 1);

    MetadataContractClient::new(&e, &dao.metadata).add_properties(
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
            base_uri: String::from_str(&e, "ipfs://art/"),
            extension: String::from_str(&e, ".png"),
        },
    );
    let leaves = thousand_leaves(&e);
    let tree = Tree::new(&e, &leaves);
    let now = e.ledger().timestamp();
    manager.open_assurance(
        &dao.token,
        &drive_params(&e, &tree, 5, now + 10 * DAY),
        &launch_all(),
    );

    // Frozen: the launch admin can no longer add modules.
    e.mock_auths(&[MockAuth {
        address: &founder,
        invoke: &MockAuthInvoke {
            contract: &manager.address,
            fn_name: "create_module",
            args: (dao.token.clone(), spec.clone(), 1u32).into_val(&e),
            sub_invokes: &[],
        },
    }]);
    assert!(manager.try_create_module(&dao.token, &spec, &1).is_err());
    e.mock_all_auths();

    // Two claims put fees in escrow.
    let claims = ClaimMinterClient::new(&e, &cm);
    for i in [0usize, 10] {
        let (who, amount) = &leaves[i];
        StellarAssetClient::new(&e, &asset).mint(who, &1_000);
        claims.claim(&0, who, amount, &1, &tree.proof(&e, i), &PRICE);
    }
    assert_eq!(TokenClient::new(&e, &asset).balance(&cm), PRICE * 2);

    let listed = dao_renewal_inventory(&e, &manager, &dao.token);
    let has = |owner: &Address, key: Val| {
        use soroban_sdk::xdr::{Limits, ScVal, WriteXdr};
        use soroban_sdk::TryFromVal;
        let want = ScVal::try_from_val(&e, &key)
            .unwrap()
            .to_xdr(Limits::none())
            .unwrap();
        listed.iter().any(|(o, k)| {
            o == owner
                && ScVal::try_from_val(&e, k)
                    .unwrap()
                    .to_xdr(Limits::none())
                    .unwrap()
                    == want
        })
    };
    let t: Val = dao.token.clone().into_val(&e);
    for (name, args) in [
        ("PendingDao", std::vec![t]),
        ("Assurance", std::vec![t]),
        ("DaoSlug", std::vec![t]),
        ("ModuleCount", std::vec![t, claims_kind.into_val(&e)]),
    ] {
        assert!(has(&manager.address, ns_key(&e, name, args)), "{name}");
    }
    assert!(has(&cm, ns_key(&e, "List", std::vec![0u32.into_val(&e)])));
    assert!(has(
        &asset,
        oz_key(&e, "Balance", std::vec![cm.clone().into_val(&e)])
    ));
    assert_inventory_matches_ledger(&e, &manager, &pending.addresses, &listed);
}
