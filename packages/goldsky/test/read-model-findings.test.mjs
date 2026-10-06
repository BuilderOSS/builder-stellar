import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const sql = name => readFileSync(new URL(`../../../db/migrations/${name}`, import.meta.url), 'utf8');

test('read models parse Goldsky ledger_closed_at values as timestamps, not epoch milliseconds', () => {
  for (const name of [
    '0001_manager_views.sql', '0002_governance_views.sql', '0003_token_views.sql',
    '0004_auction_views.sql', '0005_treasury_views.sql', '0006_metadata_views.sql',
    '0007_app_views.sql', '0011_metadata_contract_image.sql',
    '0012_manager_auction_reactivation.sql', '0013_deterministic_ordering_and_activity_indexes.sql'
  ]) {
    const source = sql(name);
    assert.doesNotMatch(source, /ledger_closed_at[^\n]*numeric/);
  }
});

test('proposal totals sum vote weights and auction config is selected per auction', () => {
  assert.match(sql('0007_app_views.sql'), /sum\(v\.weight\)/);
  const auctions = sql('0004_auction_views.sql');
  assert.match(auctions, /LEFT JOIN LATERAL/);
  assert.match(auctions, /x\.ledger_sequence.*e\.ledger_sequence/s);
  assert.doesNotMatch(auctions, /WITH config AS/);
});

test('metadata read models preserve initialization and reset fields', () => {
  const metadata = sql('0006_metadata_views.sql');
  assert.match(metadata, /e\.args::jsonb ->> 'version'/);
  assert.match(metadata, /e\.args::jsonb ->> 'owner'/);
  assert.match(metadata, /properties_reset/);
  assert.match(metadata, /COALESCE\(u\.project_uri, i\.project_uri\)/);
});

test('governance lifecycle accepts both cancellation spellings', () => {
  assert.match(sql('0002_governance_views.sql'), /proposal_canceled.*proposal_cancelled/s);
});
