DROP VIEW IF EXISTS auction.current_auctions;
DROP VIEW IF EXISTS auction.auctions;
DROP FUNCTION IF EXISTS auction.auction_state(text, text, text, bigint[]);
DROP VIEW IF EXISTS auction.bids;
