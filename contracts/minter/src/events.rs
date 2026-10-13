//! Events of the ClaimMinter module. The emitting contract is the DAO's
//! ClaimMinter, which the indexer learns from the Token's `ModuleRegistered`.

use soroban_sdk::{contractevent, Address, BytesN, String};

use crate::storage::AssuranceTerms;

/// A list opened: its root, where the full tree is published, and its terms.
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

/// A claim: `amount` tokens minted from `first_token_id` to `claimer`.
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

/// The assurance escrow moved to the Treasury (at launch).
#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct EscrowReleased {
    #[topic]
    pub list_id: u32,
    pub treasury: Address,
    pub amount: i128,
}

/// A failed list's escrow returned to a claimer.
#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Refunded {
    #[topic]
    pub list_id: u32,
    #[topic]
    pub claimer: Address,
    pub amount: i128,
}

/// `<Module>Launched`: the ClaimMinter went Live with the DAO.
#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ClaimMinterLaunched {
    #[topic]
    pub treasury: Address,
}
