-- Rollback: Auction views
BEGIN;
DROP VIEW IF EXISTS auction.auctions CASCADE;
DROP VIEW IF EXISTS auction.settlements CASCADE;
DROP VIEW IF EXISTS auction.bid_refunds CASCADE;
DROP VIEW IF EXISTS auction.bids CASCADE;
COMMIT;
