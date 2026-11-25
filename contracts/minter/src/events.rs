//! Events of the ClaimMinter module. The emitting contract is the DAO's
//! ClaimMinter, which the indexer learns from the Token's `ModuleRegistered`.

use soroban_sdk::{contractevent, Address, BytesN, String};

use crate::storage::AssuranceTerms;

/// A list opened (`open_list`): its root, where the full tree is published,
/// and its terms. The terms never change afterwards, except that
/// `close_list` can move `expires_at` earlier (`ListClosed`). `assurance` is
/// set only on the assurance list.
#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ListOpened {
    #[topic]
    pub list_id: u32,
    pub root: BytesN<32>,
    pub tree_uri: String,
    pub asset: Address,
    pub price: i128,
    pub expires_at: u64,
    pub total: u32,
    pub assurance: Option<AssuranceTerms>,
}

/// A claim (`claim`): `amount` tokens minted to `claimer`, with consecutive
/// ids from `first_token_id`, in the same transaction as the payment.
#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Claimed {
    #[topic]
    pub list_id: u32,
    #[topic]
    pub claimer: Address,
    pub amount: u32,
    pub first_token_id: u32,
    /// Paid for this claim, in the list's asset.
    pub paid: i128,
    /// Whether the payment went to escrow (assurance list before launch)
    /// rather than the Treasury.
    pub escrowed: bool,
    /// The claimer's total on this list after this claim.
    pub claimed: u32,
}

/// A list closed early by the admin (`close_list`): no claims after this.
/// `minted` of `total` were claimed; the rest can no longer be minted from it.
#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ListClosed {
    #[topic]
    pub list_id: u32,
    pub minted: u32,
    pub total: u32,
}

/// A list's escrow moved to the Treasury (`release`, also from `launch`).
/// Emitted only when `amount` is above zero; the list's escrow is now zero.
#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct EscrowReleased {
    #[topic]
    pub list_id: u32,
    pub treasury: Address,
    pub amount: i128,
}

/// A failed list's escrow returned to the claimer who paid it (`refund`).
/// The claimer's escrow on this list is now zero.
#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Refunded {
    #[topic]
    pub list_id: u32,
    #[topic]
    pub claimer: Address,
    pub amount: i128,
}

/// `<Module>Launched`: the ClaimMinter went Live with the DAO (`launch`).
/// The Treasury is now its admin.
#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ClaimMinterLaunched {
    #[topic]
    pub treasury: Address,
}
