//! # DAO Treasury Contract
//!
//! An execution boundary contract that acts as the authorized caller for proposals
//! approved by the Governor. This separation provides security isolation by ensuring
//! the Governor contract cannot directly execute arbitrary actions - instead, approved
//! proposals are executed through this Treasury with the Treasury's authority.
//!
//! ## Key Features
//!
//! - **Governor-Controlled Execution**: Only the designated Governor contract can
//!   invoke the `execute()` function
//! - **Authorization Delegation**: The Treasury authorizes itself as the caller when
//!   invoking target contracts, allowing it to act on behalf of the DAO
//! - **Flexible Actions**: Can invoke any function on any contract with arbitrary arguments
//! - **Owner Management**: The owner can update the Governor address if needed
//!
//! ## Security Model
//!
//! The Treasury holds the DAO's authority and assets. By requiring Governor approval
//! for all actions, it ensures:
//! 1. All state changes go through the governance process
//! 2. The Governor cannot directly manipulate Treasury authority
//! 3. A compromised Governor can be replaced by the owner without losing Treasury assets
//!
//! ## Typical Flow
//!
//! 1. Governor contract approves and executes a proposal
//! 2. Governor calls `treasury.execute(target, function, args)`
//! 3. Treasury verifies the caller is the authorized Governor
//! 4. Treasury authorizes itself and invokes `target.function(args)`
//! 5. The target contract sees the Treasury as the authenticated caller

#![no_std]

mod contract;
mod error;
mod events;
mod storage;

pub use contract::*;

#[cfg(test)]
mod test;
