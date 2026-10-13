#![cfg(test)]
extern crate std;

use soroban_sdk::{
    contract, contractimpl,
    testutils::{Address as _, Events, Ledger, MockAuth, MockAuthInvoke},
    token::{StellarAssetClient, TokenClient},
    vec,
    xdr::ToXdr,
    Address, Bytes, BytesN, Env, Event, IntoVal, String, Symbol, Val, Vec,
};
use token::{DaoTokenContract, DaoTokenContractClient};

use crate::{
    AssuranceState, AssuranceTerms, ClaimMinter, ClaimMinterClient, ClaimMinterError as E,
    ClaimRecord, Claimed, EscrowReleased, ListOpened, Refunded,
};
use common::testutils::{MockManager, MockManagerClient};

/// Artwork stand-in: the ClaimMinter asks it for `properties_count`; the
/// Token's mint hooks call it and ignore failures.
#[contract]
struct MockMetadata;

#[contractimpl]
impl MockMetadata {
    pub fn set_properties(e: Env, count: u32) {
        e.storage().instance().set(&1u32, &count);
    }
    pub fn properties_count(e: Env) -> u32 {
        e.storage().instance().get(&1u32).unwrap_or(1)
    }
}

const NOW: u64 = 1_000;
const DAY: u64 = 86_400;

struct Dao {
    env: Env,
    token: DaoTokenContractClient<'static>,
    cm: ClaimMinterClient<'static>,
    mgr: MockManagerClient<'static>,
    metadata: Address,
    launch_admin: Address,
    treasury: Address,
    asset: Address,
}

impl Dao {
    fn new() -> Self {
        let env = Env::default();
        env.mock_all_auths();
        env.ledger().set_timestamp(NOW);
        env.ledger().set_sequence_number(100);
        let launch_admin = Address::generate(&env);
        let treasury = Address::generate(&env);
        let metadata = env.register(MockMetadata, ());
        let mgr = MockManagerClient::new(&env, &env.register(MockManager, ()));
        mgr.register(&hash(&env), &String::from_str(&env, "0.1.0"));
        let token_id = env.register(
            DaoTokenContract,
            (
                launch_admin.clone(),
                treasury.clone(),
                env.register(MockMetadata, ()), // auction stand-in
                env.register(MockMetadata, ()), // marketplace stand-in
                String::from_str(&env, "Claims"),
                String::from_str(&env, "CLM"),
                metadata.clone(),
                mgr.address.clone(),
                BytesN::from_array(&env, &[0u8; 32]),
            ),
        );
        let asset = env
            .register_stellar_asset_contract_v2(Address::generate(&env))
            .address();
        let cm_id = env.register(
            ClaimMinter,
            (
                launch_admin.clone(),
                token_id.clone(),
                treasury.clone(),
                mgr.address.clone(),
                asset.clone(),
                hash(&env),
            ),
        );
        let token = DaoTokenContractClient::new(&env, &token_id);
        token.register_module(&Symbol::new(&env, "claims"), &cm_id, &false);
        token.increase_mint_allowance(&cm_id, &1_000);
        Dao {
            token,
            cm: ClaimMinterClient::new(&env, &cm_id),
            mgr,
            metadata,
            launch_admin,
            treasury,
            asset,
            env,
        }
    }

    /// The Manager's launch: the Token first, then this module.
    fn launch(&self) {
        self.token.launch(&self.treasury, &Vec::new(&self.env));
        self.cm.launch(&self.treasury, &false);
    }

    fn fund(&self, who: &Address, amount: i128) {
        StellarAssetClient::new(&self.env, &self.asset).mint(who, &amount);
    }

    fn balance(&self, who: &Address) -> i128 {
        TokenClient::new(&self.env, &self.asset).balance(who)
    }

    /// Open a list over `leaves` in Setup or Live (whoever the admin is).
    fn open(
        &self,
        leaves: &[(&Address, u128)],
        price: i128,
        assurance: Option<AssuranceTerms>,
    ) -> (u32, Tree) {
        let tree = Tree::new(&self.env, leaves);
        let id = self.cm.open_list(
            &tree.root,
            &uri(&self.env),
            &self.asset,
            &price,
            &(NOW + 30 * DAY),
            &100,
            &assurance,
        );
        (id, tree)
    }
}

fn hash(env: &Env) -> BytesN<32> {
    BytesN::from_array(env, &[0x31; 32])
}

fn uri(env: &Env) -> String {
    String::from_str(env, "ipfs://bafytree")
}

fn terms(threshold: u32) -> Option<AssuranceTerms> {
    Some(AssuranceTerms {
        threshold_claimers: threshold,
        deadline: NOW + 10 * DAY,
    })
}

// ============================================================================
// The merkle tree (same leaf and node rules as the web's lib/minter/tree.ts)
// ============================================================================

fn leaf(env: &Env, claimer: &Address, amount: u128) -> BytesN<32> {
    let mut data = Bytes::new(env);
    data.append(&claimer.clone().to_xdr(env));
    data.extend_from_array(&amount.to_be_bytes());
    env.crypto().sha256(&data).into()
}

fn hash_pair(env: &Env, x: &BytesN<32>, y: &BytesN<32>) -> BytesN<32> {
    let (a, b) = if x.to_array() <= y.to_array() {
        (x, y)
    } else {
        (y, x)
    };
    let mut data = Bytes::new(env);
    data.extend_from_array(&a.to_array());
    data.extend_from_array(&b.to_array());
    env.crypto().sha256(&data).into()
}

/// A sorted-pair tree over up to four leaves (padded by duplicating).
struct Tree {
    root: BytesN<32>,
    proofs: std::vec::Vec<Vec<BytesN<32>>>,
}

impl Tree {
    fn new(env: &Env, leaves: &[(&Address, u128)]) -> Self {
        assert!(!leaves.is_empty() && leaves.len() <= 4);
        let mut level: std::vec::Vec<BytesN<32>> =
            leaves.iter().map(|(a, n)| leaf(env, a, *n)).collect();
        let count = leaves.len();
        if count == 1 {
            return Tree {
                root: level[0].clone(),
                proofs: std::vec![Vec::new(env)],
            };
        }
        while level.len() < 4 {
            level.push(level[level.len() - 1].clone());
        }
        let l1 = [
            hash_pair(env, &level[0], &level[1]),
            hash_pair(env, &level[2], &level[3]),
        ];
        let root = hash_pair(env, &l1[0], &l1[1]);
        let proofs = (0..count)
            .map(|i| {
                let sibling = level[i ^ 1].clone();
                let uncle = l1[1 - i / 2].clone();
                Vec::from_array(env, [sibling, uncle])
            })
            .collect();
        Tree { root, proofs }
    }
}

// ============================================================================
// Free lists before launch
// ============================================================================

#[test]
fn a_free_setup_list_is_claimed_in_parts() {
    let d = Dao::new();
    let alice = Address::generate(&d.env);
    let bob = Address::generate(&d.env);
    let (id, tree) = d.open(&[(&alice, 5), (&bob, 1)], 0, None);

    let ids = d.cm.claim(&id, &alice, &5, &2, &tree.proofs[0], &0);
    assert_eq!(ids, vec![&d.env, 0, 1]);
    d.cm.claim(&id, &alice, &5, &3, &tree.proofs[0], &0);
    assert_eq!(d.token.balance(&alice), 5);
    assert_eq!(
        d.cm.get_claim(&id, &alice),
        ClaimRecord {
            claimed: 5,
            escrowed: 0
        }
    );
    // The leaf is used up.
    assert_eq!(
        d.cm.try_claim(&id, &alice, &5, &1, &tree.proofs[0], &0)
            .err()
            .unwrap()
            .unwrap(),
        E::AlreadyClaimed
    );
    d.cm.claim(&id, &bob, &1, &1, &tree.proofs[1], &0);
    let list = d.cm.get_list(&id).unwrap();
    assert_eq!((list.minted, list.claimers), (6, 2));
    // Five of the module's allowance of 1,000 are left after six mints.
    assert_eq!(d.token.mint_allowance(&d.cm.address), 994);
}

#[test]
fn claims_emit_the_claim_and_the_list_its_terms() {
    let d = Dao::new();
    let alice = Address::generate(&d.env);
    let (id, tree) = d.open(&[(&alice, 2)], 0, None);
    let opened = d.env.events().all();
    assert_eq!(
        opened.events().last().unwrap(),
        &ListOpened {
            list_id: id,
            root: tree.root.clone(),
            tree_uri: uri(&d.env),
            asset: d.asset.clone(),
            price: 0,
            expires_at: NOW + 30 * DAY,
            total: 100,
            assurance: None,
        }
        .to_xdr(&d.env, &d.cm.address)
    );
    d.cm.claim(&id, &alice, &2, &2, &tree.proofs[0], &0);
    let events = d.env.events().all();
    assert_eq!(
        events.events().last().unwrap(),
        &Claimed {
            list_id: id,
            claimer: alice,
            amount: 2,
            first_token_id: 0,
            paid: 0,
            escrowed: false,
            claimed: 2,
        }
        .to_xdr(&d.env, &d.cm.address)
    );
}

#[test]
fn setup_lists_need_artwork_and_the_configured_asset() {
    let d = Dao::new();
    let alice = Address::generate(&d.env);
    let tree = Tree::new(&d.env, &[(&alice, 1)]);
    let other = Address::generate(&d.env);
    let open = |asset: &Address| {
        d.cm.try_open_list(
            &tree.root,
            &uri(&d.env),
            asset,
            &0,
            &(NOW + DAY),
            &10,
            &None,
        )
    };
    assert_eq!(
        open(&other).err().unwrap().unwrap(),
        E::PaymentAssetMismatch
    );
    MockMetadataClient::new(&d.env, &d.metadata).set_properties(&0);
    assert_eq!(open(&d.asset).err().unwrap().unwrap(), E::ArtworkMissing);
    MockMetadataClient::new(&d.env, &d.metadata).set_properties(&3);
    assert_eq!(open(&d.asset).unwrap().unwrap(), 0);
}

#[test]
fn a_setup_list_with_a_price_or_assurance_needs_the_manager() {
    let d = Dao::new();
    let alice = Address::generate(&d.env);
    let tree = Tree::new(&d.env, &[(&alice, 1)]);
    let expires = NOW + 30 * DAY;
    // Only the launch admin signs: a priced list and an assurance list fail.
    for (price, assurance) in [(5i128, None), (0i128, terms(1))] {
        let args: Vec<Val> = (
            tree.root.clone(),
            uri(&d.env),
            d.asset.clone(),
            price,
            expires,
            10u32,
            assurance.clone(),
        )
            .into_val(&d.env);
        d.env.mock_auths(&[MockAuth {
            address: &d.launch_admin,
            invoke: &MockAuthInvoke {
                contract: &d.cm.address,
                fn_name: "open_list",
                args,
                sub_invokes: &[],
            },
        }]);
        assert!(d
            .cm
            .try_open_list(
                &tree.root,
                &uri(&d.env),
                &d.asset,
                &price,
                &expires,
                &10,
                &assurance
            )
            .is_err());
    }
    assert_eq!(d.cm.next_list_id(), 0);
}

// ============================================================================
// Lists after launch
// ============================================================================

#[test]
fn a_live_list_pays_the_treasury_in_any_asset() {
    let d = Dao::new();
    d.launch();
    assert_eq!(d.cm.admin(), d.treasury);
    let alice = Address::generate(&d.env);
    let tree = Tree::new(&d.env, &[(&alice, 3)]);
    let usd = d
        .env
        .register_stellar_asset_contract_v2(Address::generate(&d.env))
        .address();
    let id =
        d.cm.open_list(&tree.root, &uri(&d.env), &usd, &7, &(NOW + DAY), &10, &None);
    StellarAssetClient::new(&d.env, &usd).mint(&alice, &100);
    assert_eq!(
        d.cm.try_claim(&id, &alice, &3, &3, &tree.proofs[0], &6)
            .err()
            .unwrap()
            .unwrap(),
        E::PriceAboveMax
    );
    d.cm.claim(&id, &alice, &3, &3, &tree.proofs[0], &7);
    assert_eq!(TokenClient::new(&d.env, &usd).balance(&d.treasury), 21);
    assert_eq!(d.cm.get_list(&id).unwrap().escrow, 0);
}

#[test]
fn assurance_terms_are_only_for_setup() {
    let d = Dao::new();
    d.launch();
    let alice = Address::generate(&d.env);
    let tree = Tree::new(&d.env, &[(&alice, 1)]);
    assert_eq!(
        d.cm.try_open_list(
            &tree.root,
            &uri(&d.env),
            &d.asset,
            &0,
            &(NOW + 30 * DAY),
            &10,
            &terms(1)
        )
        .err()
        .unwrap()
        .unwrap(),
        E::AssuranceNotAllowed
    );
}

#[test]
fn open_list_validates_its_terms() {
    let d = Dao::new();
    let alice = Address::generate(&d.env);
    let tree = Tree::new(&d.env, &[(&alice, 1)]);
    let open = |uri: &str, price: i128, expires_at: u64, total: u32, a: Option<AssuranceTerms>| {
        d.cm.try_open_list(
            &tree.root,
            &String::from_str(&d.env, uri),
            &d.asset,
            &price,
            &expires_at,
            &total,
            &a,
        )
        .err()
        .unwrap()
        .unwrap()
    };
    let later = NOW + 30 * DAY;
    assert_eq!(open("ipfs://x", -1, later, 10, None), E::InvalidPrice);
    assert_eq!(open("ipfs://x", 0, later, 0, None), E::InvalidAmount);
    assert_eq!(open("ipfs://x", 0, NOW, 10, None), E::InvalidExpiry);
    assert_eq!(open("https://x", 0, later, 10, None), E::InvalidTreeUri);
    assert_eq!(open("ipfs://", 0, later, 10, None), E::InvalidTreeUri);
    let bad = |threshold, deadline| {
        Some(AssuranceTerms {
            threshold_claimers: threshold,
            deadline,
        })
    };
    assert_eq!(
        open("ipfs://x", 1, later, 10, bad(0, NOW + DAY)),
        E::InvalidAssurance
    );
    assert_eq!(
        open("ipfs://x", 1, later, 10, bad(1, NOW)),
        E::InvalidAssurance
    );
    assert_eq!(
        open("ipfs://x", 1, later, 10, bad(1, later + 1)),
        E::InvalidAssurance
    );
}

#[test]
fn claims_check_the_proof_the_list_and_the_batch_size() {
    let d = Dao::new();
    let alice = Address::generate(&d.env);
    let bob = Address::generate(&d.env);
    let tree = Tree::new(&d.env, &[(&alice, 50), (&bob, 60)]);
    let id = d.cm.open_list(
        &tree.root,
        &uri(&d.env),
        &d.asset,
        &0,
        &(NOW + DAY),
        &60,
        &None,
    );
    let err = |who: &Address, leaf: u128, n: u32, proof: &Vec<BytesN<32>>| {
        d.cm.try_claim(&id, who, &leaf, &n, proof, &0)
            .err()
            .unwrap()
            .unwrap()
    };
    // Someone else's proof, or a different amount, does not verify.
    assert_eq!(err(&bob, 50, 1, &tree.proofs[0]), E::MerkleProofInvalid);
    assert_eq!(err(&alice, 51, 1, &tree.proofs[0]), E::MerkleProofInvalid);
    assert_eq!(err(&alice, 50, 0, &tree.proofs[0]), E::InvalidAmount);
    assert_eq!(
        err(&alice, 50, common::MAX_BATCH_MINT + 1, &tree.proofs[0]),
        E::BatchTooLarge
    );
    assert_eq!(err(&alice, 50, 1, &Vec::new(&d.env)), E::MerkleProofInvalid);
    let deep: Vec<BytesN<32>> = (0..33).fold(Vec::new(&d.env), |mut v, _| {
        v.push_back(BytesN::from_array(&d.env, &[0; 32]));
        v
    });
    assert_eq!(err(&alice, 50, 1, &deep), E::MerkleProofInvalid);
    // The list total caps all claimers together.
    d.cm.claim(&id, &alice, &50, &40, &tree.proofs[0], &0);
    assert_eq!(err(&bob, 60, 21, &tree.proofs[1]), E::ListSoldOut);
    d.cm.claim(&id, &bob, &60, &20, &tree.proofs[1], &0);
    // And claims stop at the expiry.
    d.env.ledger().set_timestamp(NOW + DAY);
    assert_eq!(err(&alice, 50, 1, &tree.proofs[0]), E::ListExpired);
    assert_eq!(err(&alice, 50, 1, &tree.proofs[0]), E::ListExpired);
    assert_eq!(
        d.cm.try_claim(&9, &alice, &50, &1, &tree.proofs[0], &0)
            .err()
            .unwrap()
            .unwrap(),
        E::ListNotFound
    );
}

#[test]
fn claims_spend_the_token_allowance() {
    let d = Dao::new();
    d.token.decrease_mint_allowance(&d.cm.address, &998);
    let alice = Address::generate(&d.env);
    let (id, tree) = d.open(&[(&alice, 5)], 0, None);
    d.cm.claim(&id, &alice, &5, &2, &tree.proofs[0], &0);
    // The Token's AllowanceExceeded (7215) propagates.
    assert!(d
        .cm
        .try_claim(&id, &alice, &5, &1, &tree.proofs[0], &0)
        .is_err());
    assert_eq!(d.token.balance(&alice), 2);
}

#[test]
fn claims_need_the_claimer() {
    let d = Dao::new();
    let alice = Address::generate(&d.env);
    let (id, tree) = d.open(&[(&alice, 1)], 0, None);
    let stranger = Address::generate(&d.env);
    let args: Vec<Val> = (
        id,
        alice.clone(),
        1u128,
        1u32,
        tree.proofs[0].clone(),
        0i128,
    )
        .into_val(&d.env);
    d.env.mock_auths(&[MockAuth {
        address: &stranger,
        invoke: &MockAuthInvoke {
            contract: &d.cm.address,
            fn_name: "claim",
            args,
            sub_invokes: &[],
        },
    }]);
    assert!(d
        .cm
        .try_claim(&id, &alice, &1, &1, &tree.proofs[0], &0)
        .is_err());
}

// ============================================================================
// The assurance list
// ============================================================================

#[test]
fn a_met_drive_launches_and_the_escrow_moves_to_the_treasury() {
    let d = Dao::new();
    let alice = Address::generate(&d.env);
    let bob = Address::generate(&d.env);
    let carol = Address::generate(&d.env);
    for who in [&alice, &bob, &carol] {
        d.fund(who, 1_000);
    }
    let (id, tree) = d.open(&[(&alice, 2), (&bob, 1), (&carol, 1)], 10, terms(2));
    assert_eq!(d.cm.assurance_list(), Some(id));
    assert_eq!(d.cm.assurance_state(&id), AssuranceState::Open);

    d.cm.claim(&id, &alice, &2, &1, &tree.proofs[0], &10);
    d.cm.claim(&id, &alice, &2, &1, &tree.proofs[0], &10);
    // A partial claimer counts once.
    assert_eq!(d.cm.assurance_state(&id), AssuranceState::Open);
    d.cm.claim(&id, &bob, &1, &1, &tree.proofs[1], &10);
    assert_eq!(d.cm.assurance_state(&id), AssuranceState::Met);
    assert_eq!(d.balance(&d.cm.address), 30);
    assert_eq!(d.cm.get_claim(&id, &alice).escrowed, 20);
    assert_eq!(
        d.cm.try_refund(&id, &alice).err().unwrap().unwrap(),
        E::NotFailed
    );
    assert_eq!(
        d.cm.try_release(&id).err().unwrap().unwrap(),
        E::TokenNotLive
    );

    d.launch();
    // Events of the last call: the ClaimMinter's launch.
    let released = d.env.events().all();
    assert_eq!(d.balance(&d.treasury), 30);
    assert_eq!(d.balance(&d.cm.address), 0);
    assert!(released.events().contains(
        &EscrowReleased {
            list_id: id,
            treasury: d.treasury.clone(),
            amount: 30,
        }
        .to_xdr(&d.env, &d.cm.address)
    ));
    // Live past the deadline is never Failed; later claims pay the Treasury.
    d.env.ledger().set_timestamp(NOW + 20 * DAY);
    assert_eq!(d.cm.assurance_state(&id), AssuranceState::Met);
    d.cm.claim(&id, &carol, &1, &1, &tree.proofs[2], &10);
    assert_eq!(d.balance(&d.treasury), 40);
    assert_eq!(d.cm.release(&id), 0);
    assert_eq!(
        d.cm.try_refund(&id, &alice).err().unwrap().unwrap(),
        E::NotFailed
    );
}

#[test]
fn a_missed_deadline_fails_the_drive_and_refunds_pay_out() {
    let d = Dao::new();
    let alice = Address::generate(&d.env);
    let bob = Address::generate(&d.env);
    d.fund(&alice, 100);
    let (id, tree) = d.open(&[(&alice, 3), (&bob, 1)], 10, terms(2));
    d.cm.claim(&id, &alice, &3, &3, &tree.proofs[0], &10);
    assert_eq!(d.balance(&alice), 70);

    d.env.ledger().set_timestamp(NOW + 10 * DAY + 1);
    assert_eq!(d.cm.assurance_state(&id), AssuranceState::Failed);
    assert_eq!(
        d.cm.try_claim(&id, &bob, &1, &1, &tree.proofs[1], &10)
            .err()
            .unwrap()
            .unwrap(),
        E::AssuranceFailed
    );
    // Anyone may trigger a refund; it pays the claimer.
    assert_eq!(d.cm.refund(&id, &alice), 30);
    let refunded = d.env.events().all();
    assert_eq!(d.balance(&alice), 100);
    assert_eq!(
        refunded.events().last().unwrap(),
        &Refunded {
            list_id: id,
            claimer: alice.clone(),
            amount: 30,
        }
        .to_xdr(&d.env, &d.cm.address)
    );
    assert_eq!(
        d.cm.try_refund(&id, &alice).err().unwrap().unwrap(),
        E::NothingToRefund
    );
    assert_eq!(d.cm.get_list(&id).unwrap().escrow, 0);
}

#[test]
fn a_met_drive_that_misses_its_deadline_also_fails() {
    // Eng review R1: a launch blocked by a taken slug, a paused factory or a
    // revoked hash still ends in refunds.
    let d = Dao::new();
    let alice = Address::generate(&d.env);
    d.fund(&alice, 100);
    let (id, tree) = d.open(&[(&alice, 1)], 10, terms(1));
    d.cm.claim(&id, &alice, &1, &1, &tree.proofs[0], &10);
    assert_eq!(d.cm.assurance_state(&id), AssuranceState::Met);
    d.env.ledger().set_timestamp(NOW + 10 * DAY + 1);
    assert_eq!(d.cm.assurance_state(&id), AssuranceState::Failed);
    assert_eq!(d.cm.refund(&id, &alice), 10);
}

#[test]
fn one_assurance_list_per_claim_minter() {
    let d = Dao::new();
    let alice = Address::generate(&d.env);
    d.open(&[(&alice, 1)], 10, terms(1));
    let tree = Tree::new(&d.env, &[(&alice, 1)]);
    assert_eq!(
        d.cm.try_open_list(
            &tree.root,
            &uri(&d.env),
            &d.asset,
            &10,
            &(NOW + 30 * DAY),
            &10,
            &terms(1)
        )
        .err()
        .unwrap()
        .unwrap(),
        E::AssuranceExists
    );
    // A free list beside it is fine.
    d.open(&[(&alice, 1)], 0, None);
    assert_eq!(
        d.cm.try_assurance_state(&1).err().unwrap().unwrap(),
        E::NotAssurance
    );
}

// ============================================================================
// DaoModule: launch, handoff, payment asset, renewal keys
// ============================================================================

#[test]
fn handoff_freezes_the_lists_until_launch() {
    let d = Dao::new();
    d.cm.handoff(&d.treasury);
    assert_eq!(d.cm.admin(), d.treasury);
    let alice = Address::generate(&d.env);
    let tree = Tree::new(&d.env, &[(&alice, 1)]);
    let args: Vec<Val> = (
        tree.root.clone(),
        uri(&d.env),
        d.asset.clone(),
        0i128,
        NOW + DAY,
        10u32,
        Option::<AssuranceTerms>::None,
    )
        .into_val(&d.env);
    d.env.mock_auths(&[MockAuth {
        address: &d.launch_admin,
        invoke: &MockAuthInvoke {
            contract: &d.cm.address,
            fn_name: "open_list",
            args,
            sub_invokes: &[],
        },
    }]);
    assert!(d
        .cm
        .try_open_list(
            &tree.root,
            &uri(&d.env),
            &d.asset,
            &0,
            &(NOW + DAY),
            &10,
            &None
        )
        .is_err());
    d.env.mock_all_auths();
    assert_eq!(
        d.cm.try_handoff(&Address::generate(&d.env))
            .err()
            .unwrap()
            .unwrap(),
        E::TreasuryMismatch
    );
    d.launch();
    assert_eq!(d.cm.admin(), d.treasury);
    assert!(d.cm.try_handoff(&d.treasury).is_err());
    assert!(d.cm.try_launch(&d.treasury, &false).is_err());
}

#[test]
fn launch_and_handoff_need_the_manager() {
    let d = Dao::new();
    for name in ["launch", "handoff"] {
        let args: Vec<Val> = if name == "launch" {
            (d.treasury.clone(), false).into_val(&d.env)
        } else {
            (d.treasury.clone(),).into_val(&d.env)
        };
        d.env.mock_auths(&[MockAuth {
            address: &d.launch_admin,
            invoke: &MockAuthInvoke {
                contract: &d.cm.address,
                fn_name: name,
                args,
                sub_invokes: &[],
            },
        }]);
        let r = if name == "launch" {
            d.cm.try_launch(&d.treasury, &false).is_err()
        } else {
            d.cm.try_handoff(&d.treasury).is_err()
        };
        assert!(r, "{name} must need the Manager");
    }
    assert_eq!(d.cm.admin(), d.launch_admin);
}

#[test]
fn payment_asset_and_renewal_keys() {
    let d = Dao::new();
    assert_eq!(d.cm.payment_asset(), d.asset);
    let alice = Address::generate(&d.env);
    for _ in 0..3 {
        d.open(&[(&alice, 1)], 0, None);
    }
    let first = d.cm.renewal_keys(&0, &2);
    assert_eq!(first.next_cursor, Some(2));
    assert_eq!(first.assets, vec![&d.env, d.asset.clone()]);
    let last = d.cm.renewal_keys(&2, &2);
    assert_eq!(last.next_cursor, None);
    let encoded = |page: &common::modules::RenewalPage| {
        let mut vals: Vec<Val> = Vec::new(&d.env);
        for (key, persistent) in page.keys.iter() {
            assert!(persistent);
            vals.push_back(key);
        }
        vals.to_xdr(&d.env)
    };
    let expect = |ids: &[u32]| {
        let mut vals: Vec<Val> = Vec::new(&d.env);
        for id in ids {
            vals.push_back(common::ns(&d.env, crate::ClaimsKey::List(*id)).into_val(&d.env));
        }
        vals.to_xdr(&d.env)
    };
    assert_eq!(encoded(&first), expect(&[0, 1]));
    assert_eq!(encoded(&last), expect(&[2]));
    // The listed keys are the entries the lists live in.
    d.env.as_contract(&d.cm.address, || {
        assert!(d
            .env
            .storage()
            .persistent()
            .has(&common::ns(&d.env, crate::ClaimsKey::List(2))));
    });
}

// ============================================================================
// Upgrades
// ============================================================================

#[test]
fn the_dao_admin_upgrades_to_an_approved_hash() {
    use common::testutils::empty_wasm;
    let d = Dao::new();
    assert_eq!(d.cm.version(), String::from_str(&d.env, "0.1.0"));
    assert_eq!(d.cm.wasm_hash(), hash(&d.env));
    assert_eq!(d.cm.storage_version(), crate::STORAGE_VERSION);
    let to = empty_wasm(&d.env);
    assert_eq!(
        d.cm.try_upgrade(&hash(&d.env), &to).err().unwrap().unwrap(),
        common::CommonError::UpgradeNotApproved.into()
    );
    d.mgr.approve(&hash(&d.env), &to);
    d.mgr.register(&to, &String::from_str(&d.env, "0.2.0"));
    let args: Vec<Val> = (hash(&d.env), to.clone()).into_val(&d.env);
    let stranger = Address::generate(&d.env);
    d.env.mock_auths(&[MockAuth {
        address: &stranger,
        invoke: &MockAuthInvoke {
            contract: &d.cm.address,
            fn_name: "upgrade",
            args,
            sub_invokes: &[],
        },
    }]);
    assert!(d.cm.try_upgrade(&hash(&d.env), &to).is_err());
    d.env.mock_all_auths();
    d.cm.upgrade(&hash(&d.env), &to);
    d.env.as_contract(&d.cm.address, || {
        assert_eq!(common::upgrade::current_hash(&d.env), to);
    });
}

#[test]
fn recovery_upgrade_is_the_managers_and_only_before_launch() {
    use common::testutils::empty_wasm;
    let d = Dao::new();
    d.cm.handoff(&d.treasury); // frozen, as during an assurance drive
    let to = empty_wasm(&d.env);
    d.mgr.approve(&hash(&d.env), &to);
    d.mgr.register(&to, &String::from_str(&d.env, "0.2.0"));
    // The launch admin cannot use it.
    let args: Vec<Val> = (hash(&d.env), to.clone()).into_val(&d.env);
    d.env.mock_auths(&[MockAuth {
        address: &d.launch_admin,
        invoke: &MockAuthInvoke {
            contract: &d.cm.address,
            fn_name: "recovery_upgrade",
            args,
            sub_invokes: &[],
        },
    }]);
    assert!(d.cm.try_recovery_upgrade(&hash(&d.env), &to).is_err());
    d.env.mock_all_auths();
    // Live modules never take it.
    let live = Dao::new();
    live.launch();
    let live_to = empty_wasm(&live.env);
    live.mgr.approve(&hash(&live.env), &live_to);
    assert_eq!(
        live.cm
            .try_recovery_upgrade(&hash(&live.env), &live_to)
            .err()
            .unwrap()
            .unwrap(),
        common::CommonError::AlreadyLive.into()
    );
    d.cm.recovery_upgrade(&hash(&d.env), &to);
    d.env.as_contract(&d.cm.address, || {
        assert_eq!(common::upgrade::current_hash(&d.env), to);
    });
}

#[test]
fn migrate_needs_a_newer_layout() {
    let d = Dao::new();
    assert_eq!(
        d.cm.try_migrate().err().unwrap().unwrap(),
        common::CommonError::NothingToMigrate.into()
    );
}

#[test]
fn entry_points_renew_the_instance() {
    use common::testutils::{advance_ledgers, instance_ttl};
    let d = Dao::new();
    let alice = Address::generate(&d.env);
    let (id, tree) = d.open(&[(&alice, 2)], 0, None);
    d.cm.claim(&id, &alice, &2, &1, &tree.proofs[0], &0);
    let fresh = instance_ttl(&d.env, &d.cm.address);
    assert!(fresh >= common::ttl::INSTANCE_TTL_THRESHOLD);
    // Age it below the threshold; the next call renews it.
    advance_ledgers(&d.env, fresh - common::ttl::INSTANCE_TTL_THRESHOLD + 1);
    let aged = instance_ttl(&d.env, &d.cm.address);
    d.cm.handoff(&d.treasury);
    assert!(instance_ttl(&d.env, &d.cm.address) > aged);
}

#[test]
fn storage_keys_do_not_collide() {
    use common::testutils::{assert_keys_disjoint, common_key_shapes, key_shapes};
    let e = Env::default();
    // The ClaimMinter writes `common` keys beside its own.
    assert_keys_disjoint(&[
        (
            "ClaimsKey",
            key_shapes(&e, crate::storage::key_samples::all(&e)),
        ),
        ("common", common_key_shapes(&e)),
    ]);
}
