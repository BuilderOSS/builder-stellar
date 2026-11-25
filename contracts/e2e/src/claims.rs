//! ClaimMinter end to end on the built WASMs: the contract-event size of the
//! largest paid claim, and the assurance threshold checked through the
//! Manager's `open_assurance`.

use super::*;
use minter::{ClaimMinterClient, ClaimMinterError};
use soroban_sdk::{testutils::StellarAssetContract, xdr, xdr::ToXdr, TryFromVal};

const DAY: u64 = 86_400;
const PRICE: i128 = 10_000_000;

/// A Stellar account (`G…`) with an authorized trustline to `asset`, funded
/// with `amount` of it. An account claimer is the worst case for event size:
/// its address is 4 bytes longer than a contract's in every event that
/// names it.
fn funded_account(e: &Env, asset: &StellarAssetContract, seed: u8, amount: i128) -> Address {
    use std::rc::Rc;
    let account_id = xdr::AccountId(xdr::PublicKey::PublicKeyTypeEd25519(xdr::Uint256(
        [seed; 32],
    )));
    let line_asset = match asset.asset() {
        xdr::Asset::CreditAlphanum4(a) => xdr::TrustLineAsset::CreditAlphanum4(a),
        xdr::Asset::CreditAlphanum12(a) => xdr::TrustLineAsset::CreditAlphanum12(a),
        xdr::Asset::Native => unreachable!("the payment asset is issued"),
    };
    let entry = |data: xdr::LedgerEntryData| {
        Rc::new(xdr::LedgerEntry {
            last_modified_ledger_seq: 0,
            data,
            ext: xdr::LedgerEntryExt::V0,
        })
    };
    let host = e.host();
    host.add_ledger_entry(
        &Rc::new(xdr::LedgerKey::Account(xdr::LedgerKeyAccount {
            account_id: account_id.clone(),
        })),
        &entry(xdr::LedgerEntryData::Account(xdr::AccountEntry {
            account_id: account_id.clone(),
            balance: 100_000_000_000,
            flags: 0,
            home_domain: Default::default(),
            inflation_dest: None,
            num_sub_entries: 1,
            seq_num: xdr::SequenceNumber(0),
            thresholds: xdr::Thresholds([1; 4]),
            signers: xdr::VecM::default(),
            ext: xdr::AccountEntryExt::V0,
        })),
        None,
    )
    .unwrap();
    host.add_ledger_entry(
        &Rc::new(xdr::LedgerKey::Trustline(xdr::LedgerKeyTrustLine {
            account_id: account_id.clone(),
            asset: line_asset.clone(),
        })),
        &entry(xdr::LedgerEntryData::Trustline(xdr::TrustLineEntry {
            account_id: account_id.clone(),
            asset: line_asset,
            balance: 0,
            limit: i64::MAX,
            flags: xdr::TrustLineFlags::AuthorizedFlag as u32,
            ext: xdr::TrustLineEntryExt::V0,
        })),
        None,
    )
    .unwrap();
    let address = Address::try_from_val(e, &xdr::ScAddress::Account(account_id)).unwrap();
    StellarAssetClient::new(e, &asset.address()).mint(&address, &amount);
    address
}

/// Artwork with 16 traits, the most there can be, so each mint's seed event
/// is the largest.
fn sixteen_trait_artwork(f: &DaoFixture) {
    let e = &f.e;
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
    let metadata = MetadataContractClient::new(e, &f.dao.metadata);
    metadata.add_properties(
        &names,
        &items,
        &IpfsGroup {
            base_uri: String::from_str(e, "ipfs://art"),
            extension: String::from_str(e, ".png"),
        },
    );
    assert_eq!(metadata.properties_count(), 16);
}

/// The root of a one-leaf tree: the leaf itself, so the proof is empty.
fn single_leaf_root(e: &Env, claimer: &Address, amount: u128) -> BytesN<32> {
    let mut leaf = claimer.clone().to_xdr(e);
    leaf.extend_from_array(&amount.to_be_bytes());
    e.crypto().sha256(&leaf).into()
}

/// One paid claim of `MAX_BATCH_MINT` tokens by a new account claimer
/// against 16-trait artwork, under the default (mainnet-like) limits.
/// `live` picks the path: the assurance list in Setup (payment into escrow)
/// or a priced list after launch (payment to the Treasury). Returns the
/// contract-event bytes the claim published.
fn largest_paid_claim(live: bool) -> u32 {
    let f = factory_dao();
    let e = &f.e;
    e.ledger().with_mut(|l| l.max_entry_ttl = 3_110_400);
    sixteen_trait_artwork(&f);
    let claims = ClaimMinterClient::new(e, &f.claims());
    let n = common::MAX_BATCH_MINT;
    let claimer = funded_account(e, &f.payment, 0x51, PRICE * i128::from(n));
    let root = single_leaf_root(e, &claimer, u128::from(n));
    let now = e.ledger().timestamp();
    let tree_uri = String::from_str(e, "ipfs://bafylargestclaim");
    let list = if live {
        f.manager.launch_dao(&f.dao.token, &f.no_launch_modules());
        // What a proposal would do: grant the allowance, then open the list.
        DaoTokenContractClient::new(e, &f.dao.token).increase_mint_allowance(&f.claims(), &n);
        claims.open_list(
            &root,
            &tree_uri,
            &f.payment.address(),
            &PRICE,
            &(now + 30 * DAY),
            &n,
            &None,
        )
    } else {
        f.manager.open_assurance(
            &f.dao.token,
            &manager::AssuranceListParams {
                root,
                tree_uri,
                price: PRICE,
                expires_at: now + 30 * DAY,
                total: n,
                threshold_claimers: 1,
                deadline: now + 10 * DAY,
            },
            &f.no_launch_modules(),
        )
    };

    e.cost_estimate().budget().reset_default();
    let ids = claims.claim(&list, &claimer, &u128::from(n), &n, &Vec::new(e), &PRICE);
    let what = if live {
        "claim (43 tokens, paid, after launch)"
    } else {
        "claim (43 tokens, paid into escrow)"
    };
    assert_within_limits(e, what);
    let bytes = e.cost_estimate().resources().contract_events_size_bytes;
    assert_eq!(ids.len(), n);
    // The mint seeded every token with all 16 traits (plus its seed), so the
    // seed event is at its largest.
    let metadata = MetadataContractClient::new(e, &f.dao.metadata);
    for id in ids.iter() {
        assert_eq!(metadata.get_attributes(&id).len(), 17);
    }
    assert_eq!(
        claims.get_claim(&list, &claimer).escrowed,
        if live { 0 } else { PRICE * i128::from(n) }
    );
    bytes
}

/// The largest paid claim keeps well clear of the 16,384-byte event limit.
/// Measured with the worst case for a payment asset that is a Stellar Asset
/// Contract (an account claimer, 16-trait artwork, a first claim with its
/// delegation events): 13,888 bytes on both payment paths, 2,496 under the
/// limit. That is more than the batch-mint event budget
/// (`common::BATCH_MINT_EVENT_BUDGET`, 13,500), because the payment and
/// `Claimed` events come on top. The test asset's code has 3 characters; a
/// 12-character code adds about 12 bytes. An asset that is not a Stellar
/// Asset Contract, which a list opened after launch may use, can emit
/// events of any size.
#[test]
fn the_largest_paid_claim_fits_the_event_limit() {
    const LIMIT: u32 = 16_384;
    /// Spare event bytes the largest claim must keep (measured: about 2,500).
    const MIN_SPARE: u32 = 2_000;
    for live in [false, true] {
        let used = largest_paid_claim(live);
        std::println!(
            "CLAIM EVENTS live={live}: {used} bytes, {} under the limit",
            LIMIT - used
        );
        assert!(used + MIN_SPARE <= LIMIT, "live={live}: {used} event bytes");
    }
}

/// `open_assurance` refuses a drive that needs more distinct claimers than
/// the list has tokens: the ClaimMinter's `InvalidAssurance` propagates, and
/// nothing is opened, granted, reserved, or frozen.
#[test]
fn open_assurance_refuses_a_threshold_above_the_list_total() {
    let f = factory_dao();
    let e = &f.e;
    sixteen_trait_artwork(&f);
    let claims = ClaimMinterClient::new(e, &f.claims());
    let token = DaoTokenContractClient::new(e, &f.dao.token);
    let someone = Address::generate(e);
    let now = e.ledger().timestamp();
    let params = |threshold: u32| manager::AssuranceListParams {
        root: single_leaf_root(e, &someone, 5),
        tree_uri: String::from_str(e, "ipfs://bafydrive"),
        price: PRICE,
        expires_at: now + 30 * DAY,
        total: 5,
        threshold_claimers: threshold,
        deadline: now + 10 * DAY,
    };
    let allowance = token.mint_allowance(&f.claims());
    assert_eq!(
        f.manager
            .try_open_assurance(&f.dao.token, &params(6), &f.no_launch_modules())
            .err()
            .unwrap(),
        Err(soroban_sdk::InvokeError::Contract(
            ClaimMinterError::InvalidAssurance as u32
        ))
    );
    assert_eq!(claims.next_list_id(), 0);
    assert_eq!(claims.admin(), f.deployer);
    assert_eq!(token.mint_allowance(&f.claims()), allowance);
    let slug = String::from_str(e, "upgrade-dao");
    assert!(f.manager.try_get_dao_by_slug(&slug).is_err());

    // The largest threshold that can be met opens the drive.
    let list = f
        .manager
        .open_assurance(&f.dao.token, &params(5), &f.no_launch_modules());
    assert_eq!(claims.get_list(&list).unwrap().threshold_claimers, 5);
    assert_eq!(claims.admin(), f.dao.treasury);
    assert_eq!(token.mint_allowance(&f.claims()), allowance + 5);
    assert_eq!(f.manager.get_dao_by_slug(&slug), f.dao.token);
}
