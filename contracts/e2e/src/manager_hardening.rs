//! Manager hardening on the built module WASMs: payment assets must be
//! Stellar Asset Contracts, and launch checks the code each contract runs,
//! not the hash it reports. The recovery notice is covered by
//! `membership::a_failed_drive_refunds_recovers_and_frees_its_slug`.

use super::*;
use manager::ManagerError as M;

/// A real contract that is not a Stellar Asset Contract (the factory DAO's
/// Token) is refused as a payment asset by `create_dao` and `create_module`;
/// the Stellar Asset Contract is accepted.
#[test]
fn a_payment_asset_must_be_a_stellar_asset_contract() {
    let f = factory_dao();
    let e = &f.e;
    let lookalike = f.dao.token.clone();
    let other = Address::generate(e);
    assert_eq!(
        f.manager
            .try_create_dao(&slug_params(e, &other, 2, "lookalike-dao", &lookalike)),
        Err(Ok(M::InvalidPaymentAsset))
    );
    let spec = manager::ModuleSpec::Auction(manager::AuctionConfig {
        duration: 300,
        reserve_price: 10_000_000,
        time_buffer: 60,
        payment_asset: lookalike,
    });
    assert_eq!(
        f.manager.try_create_module(&f.dao.token, &spec, &0),
        Err(Ok(M::InvalidPaymentAsset))
    );
    f.manager.create_dao(&slug_params(
        e,
        &other,
        2,
        "lookalike-dao",
        &f.payment.address(),
    ));
}

/// The Auction runs code the registry does not list while its own
/// `wasm_hash()` still reports the registered hash: launch is refused until
/// it runs registered, active code again.
#[test]
fn launch_checks_the_code_each_contract_runs() {
    let f = factory_dao();
    let e = &f.e;
    let auction = f.auction();
    let probe = WasmHashProbeClient::new(e, &auction);
    let registered = probe.wasm_hash();
    let swap = |hash: &BytesN<32>| {
        e.as_contract(&auction, || {
            e.deployer().update_current_contract_wasm(hash.clone())
        })
    };

    let other = module_wasm_variant(e, "auction", "unlisted");
    swap(&other);
    assert_eq!(probe.wasm_hash(), registered);
    assert_eq!(
        f.manager
            .try_launch_dao(&f.dao.token, &f.no_launch_modules()),
        Err(Ok(M::PendingDaoUsesRevokedImplementation))
    );
    // Registered, then revoked: still refused.
    f.manager.register_implementation(
        &String::from_str(e, "Auction"),
        &String::from_str(e, "0.1.1"),
        &other,
    );
    f.manager.revoke_implementation(&other);
    assert_eq!(
        f.manager
            .try_launch_dao(&f.dao.token, &f.no_launch_modules()),
        Err(Ok(M::PendingDaoUsesRevokedImplementation))
    );

    swap(&registered);
    f.manager.launch_dao(&f.dao.token, &f.no_launch_modules());
    assert!(f.manager.get_pending_dao(&f.dao.token).is_none());
}
