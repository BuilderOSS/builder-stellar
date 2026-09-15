use soroban_sdk::{
    auth::{ContractContext, InvokerContractAuthEntry, SubContractInvocation},
    panic_with_error, Address, Env, IntoVal, Symbol,
};

use crate::{
    error::AuctionError,
    events::{emit_auction_created, emit_auction_settled, emit_bid_placed, emit_bid_refunded},
    storage::{
        get_auction, get_config, set_auction, AuctionConfig, AuctionState, PaymentType,
        MAX_AUCTION_EXTENSIONS, PERCENT_DENOMINATOR,
    },
};

// Internal implementation helpers
pub(crate) fn create_auction(e: &Env) {
    let config = get_config(e);

    // Mint new token - authorize auction contract to call mint
    let mint_symbol = Symbol::new(e, "mint");
    let auction_address = e.current_contract_address();
    let mint_args = soroban_sdk::vec![e, auction_address.to_val(), auction_address.to_val()];

    // Authorize auction contract to call token.mint()
    e.authorize_as_current_contract(soroban_sdk::vec![
        e,
        InvokerContractAuthEntry::Contract(SubContractInvocation {
            context: ContractContext {
                contract: config.token_contract.clone(),
                fn_name: mint_symbol.clone(),
                args: mint_args.clone(),
            },
            sub_invocations: soroban_sdk::vec![e],
        }),
    ]);

    // SECURITY: Call the mint function - it returns the token ID as u32
    // u32 always fits in u128, so this conversion is safe
    let token_id_u32: u32 = e.invoke_contract(&config.token_contract, &mint_symbol, mint_args);
    let token_id: u128 = token_id_u32 as u128;

    let now = e.ledger().timestamp();

    // SECURITY: Use checked arithmetic for duration calculation
    let end_time = now
        .checked_add(config.duration)
        .unwrap_or_else(|| panic_with_error!(e, AuctionError::ArithmeticOverflow));

    let auction = AuctionState {
        token_id,
        highest_bid: 0,
        highest_bidder: None,
        start_time: now,
        end_time,
        settled: false,
        // SECURITY: Will be locked to SAC token on first bid
        payment_currency: PaymentType::Native, // Placeholder only
        extension_count: 0,
    };

    set_auction(e, &auction);
    emit_auction_created(e, token_id, now, end_time);
}

pub(crate) fn process_bid(
    e: &Env,
    auction: &mut AuctionState,
    config: &AuctionConfig,
    bidder: &Address,
    amount: i128,
    payment_type: &PaymentType,
) {
    let last_bidder = auction.highest_bidder.clone();
    let last_bid = auction.highest_bid;

    // Validate bid amount
    if last_bidder.is_none() {
        // SECURITY: First bid - check reserve price and lock payment currency
        if amount < config.reserve_price {
            panic_with_error!(e, AuctionError::ReservePriceNotMet);
        }

        // SECURITY: Lock payment currency on first bid to prevent switching
        auction.payment_currency = payment_type.clone();
    } else {
        // SECURITY: Subsequent bid - verify payment type matches locked currency
        if &auction.payment_currency != payment_type {
            panic_with_error!(e, AuctionError::InconsistentPaymentType);
        }

        // SECURITY: Check minimum increment with overflow protection
        // Calculate: min_bid = last_bid + (last_bid * percent / PERCENT_DENOMINATOR)
        let increment = last_bid
            .checked_mul(config.min_bid_increment_percent as i128)
            .and_then(|v| v.checked_div(PERCENT_DENOMINATOR))
            .unwrap_or_else(|| panic_with_error!(e, AuctionError::ArithmeticOverflow));

        let min_bid = last_bid
            .checked_add(increment)
            .unwrap_or_else(|| panic_with_error!(e, AuctionError::ArithmeticOverflow));

        if amount < min_bid {
            panic_with_error!(e, AuctionError::MinBidNotMet);
        }
    }

    // Update auction state BEFORE refund (CEI pattern)
    auction.highest_bid = amount;
    auction.highest_bidder = Some(bidder.clone());

    // SECURITY: Check if we need to extend, with max extension limit to prevent DoS
    let now = e.ledger().timestamp();
    let remaining = auction.end_time.saturating_sub(now);
    let extended = remaining < config.time_buffer;

    if extended {
        // SECURITY: Enforce maximum extensions to prevent auction extension DoS
        if auction.extension_count >= MAX_AUCTION_EXTENSIONS {
            panic_with_error!(e, AuctionError::MaxExtensionsExceeded);
        }

        // SECURITY: Use checked arithmetic for time extension
        auction.end_time = now
            .checked_add(config.time_buffer)
            .unwrap_or_else(|| panic_with_error!(e, AuctionError::ArithmeticOverflow));

        auction.extension_count += 1;
    }

    // Save state
    set_auction(e, auction);

    // Refund previous bidder AFTER state update (CEI pattern)
    if let Some(prev_bidder) = last_bidder {
        refund_bid(e, &prev_bidder, last_bid, &auction.payment_currency);
    }

    emit_bid_placed(
        e,
        auction.token_id,
        bidder,
        amount,
        payment_type,
        extended,
        auction.end_time,
    );
}

pub(crate) fn settle_auction_internal(e: &Env) {
    let mut auction = get_auction(e);

    // Ensure not already settled
    if auction.settled {
        panic_with_error!(e, AuctionError::AuctionSettled);
    }

    // Ensure auction has started
    if auction.start_time == 0 {
        panic_with_error!(e, AuctionError::AuctionNotStarted);
    }

    // Mark as settled BEFORE transfers (CEI pattern)
    auction.settled = true;
    set_auction(e, &auction);

    let config = get_config(e);

    if let Some(winner) = &auction.highest_bidder {
        // Transfer NFT token to winner - authorize the transfer
        let transfer_symbol = Symbol::new(e, "transfer");
        let nft_transfer_args = soroban_sdk::vec![
            e,
            e.current_contract_address().to_val(),
            winner.to_val(),
            (auction.token_id as u32).into_val(e)
        ];

        e.authorize_as_current_contract(soroban_sdk::vec![
            e,
            InvokerContractAuthEntry::Contract(SubContractInvocation {
                context: ContractContext {
                    contract: config.token_contract.clone(),
                    fn_name: transfer_symbol.clone(),
                    args: nft_transfer_args.clone(),
                },
                sub_invocations: soroban_sdk::vec![e],
            }),
        ]);

        e.invoke_contract::<()>(&config.token_contract, &transfer_symbol, nft_transfer_args);

        // Transfer proceeds to treasury
        if auction.highest_bid > 0 {
            // SECURITY: Native XLM payment removed - only SAC tokens supported
            // This ensures we never hit incomplete payment code paths
            match &auction.payment_currency {
                PaymentType::Native => {
                    // Should never reach here due to constructor validation
                    panic_with_error!(e, AuctionError::NoPaymentTokenSet);
                }
                PaymentType::SAC(token_addr) => {
                    let payment_transfer_args = soroban_sdk::vec![
                        e,
                        e.current_contract_address().to_val(),
                        config.treasury.to_val(),
                        auction.highest_bid.into_val(e)
                    ];

                    e.authorize_as_current_contract(soroban_sdk::vec![
                        e,
                        InvokerContractAuthEntry::Contract(SubContractInvocation {
                            context: ContractContext {
                                contract: token_addr.clone(),
                                fn_name: transfer_symbol.clone(),
                                args: payment_transfer_args.clone(),
                            },
                            sub_invocations: soroban_sdk::vec![e],
                        }),
                    ]);

                    e.invoke_contract::<()>(token_addr, &transfer_symbol, payment_transfer_args);
                }
            }
        }

        emit_auction_settled(
            e,
            auction.token_id,
            &Some(winner.clone()),
            auction.highest_bid,
            &auction.payment_currency,
        );
    } else {
        // No bids - transfer token to treasury for DAO governance use
        // The treasury can use these tokens for voting, redistribution via proposals, or hold them
        let transfer_symbol = Symbol::new(e, "transfer");
        let nft_transfer_args = soroban_sdk::vec![
            e,
            e.current_contract_address().to_val(),
            config.treasury.to_val(),
            (auction.token_id as u32).into_val(e)
        ];

        e.authorize_as_current_contract(soroban_sdk::vec![
            e,
            InvokerContractAuthEntry::Contract(SubContractInvocation {
                context: ContractContext {
                    contract: config.token_contract.clone(),
                    fn_name: transfer_symbol.clone(),
                    args: nft_transfer_args.clone(),
                },
                sub_invocations: soroban_sdk::vec![e],
            }),
        ]);

        e.invoke_contract::<()>(&config.token_contract, &transfer_symbol, nft_transfer_args);

        emit_auction_settled(e, auction.token_id, &None, 0, &auction.payment_currency);
    }
}

pub(crate) fn refund_bid(e: &Env, bidder: &Address, amount: i128, payment_type: &PaymentType) {
    if amount == 0 {
        return;
    }

    // SECURITY: Native XLM payment removed - only SAC tokens supported
    match payment_type {
        PaymentType::Native => {
            // Should never reach here due to constructor validation
            panic_with_error!(e, AuctionError::NoPaymentTokenSet);
        }
        PaymentType::SAC(token_addr) => {
            // Authorize refund transfer
            let transfer_symbol = Symbol::new(e, "transfer");
            let refund_args = soroban_sdk::vec![
                e,
                e.current_contract_address().to_val(),
                bidder.to_val(),
                amount.into_val(e)
            ];

            e.authorize_as_current_contract(soroban_sdk::vec![
                e,
                InvokerContractAuthEntry::Contract(SubContractInvocation {
                    context: ContractContext {
                        contract: token_addr.clone(),
                        fn_name: transfer_symbol.clone(),
                        args: refund_args.clone(),
                    },
                    sub_invocations: soroban_sdk::vec![e],
                }),
            ]);

            e.invoke_contract::<()>(token_addr, &transfer_symbol, refund_args);

            // IMPROVEMENT: Emit refund event for observability
            emit_bid_refunded(e, bidder, amount, payment_type);
        }
    }
}
