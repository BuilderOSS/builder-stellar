import { Asset, Keypair } from '@stellar/stellar-sdk';
import { describe, expect, it } from 'vitest';

import { getNetworkConfig } from '@/config/networks';
import { createDaoSchema, creationAssets, draftConfigurationSchema, sectionSchemas } from '@/lib/create-dao-schema';
import { formDataToCreationParams, generateNonce } from '@/lib/dao-creation-params';
import { defaultConfiguration } from '@/stores/create-dao-store';

const wallet = Keypair.random().publicKey();
const valid = () => {
  const config = defaultConfiguration('testnet');
  config.basicInfo.tokenName = 'Builders';
  config.basicInfo.tokenSymbol = 'BUILD';
  config.basicInfo.slug = 'builders';
  config.basicInfo.description = 'A community of builders.';
  return { ...config, launchAdmin: wallet };
};
describe('one current creation configuration', () => {
  it('identity needs only name, symbol, and a durable image, not description or a wallet', () => {
    const config = defaultConfiguration();
    config.basicInfo.tokenName = 'Builders';
    config.basicInfo.tokenSymbol = 'BUILD';
    config.basicInfo.slug = 'builders';
    expect(sectionSchemas.basicInfo.safeParse(config.basicInfo).success).toBe(true);
    expect(draftConfigurationSchema.safeParse(config).success).toBe(false);
    expect(createDaoSchema.safeParse(config).success).toBe(false);
    expect('purpose' in createDaoSchema.shape).toBe(false);
  });
  it('guest drafts validate without an administrator', () =>
    expect(draftConfigurationSchema.safeParse(valid()).success).toBe(true));
  it('never accepts a local preview as deployed metadata', () => {
    const config = valid();
    config.basicInfo.contractImage = 'data:image/png;base64,AAAA';
    expect(createDaoSchema.safeParse(config).success).toBe(false);
  });
  it('creates only the modules the membership type needs, with the membership rules', () => {
    const config = valid();
    config.auction.enabled = true;
    config.marketplace.enabled = false;
    const auctionOnly = formDataToCreationParams(config, wallet, 12n, 'testnet').initial_config;
    expect(auctionOnly.modules.map((spec) => spec.tag)).toEqual(['Auction']);
    const auction = auctionOnly.modules[0]!;
    expect(auction.tag === 'Auction' && auction.values[0].reserve_price).toBe(10_000_000n);
    expect(auction.tag === 'Auction' && auction.values[0].duration).toBe(86400n);
    expect(auctionOnly.token_settings).toEqual({
      transfers_locked: false,
      members_only_delegation: false,
      dao_recovery: false
    });
    expect(auctionOnly.transfer_agents).toEqual([]);

    config.auction.enabled = false;
    config.claims.enabled = true;
    config.tokenSettings = { transfersLocked: true, membersOnlyDelegation: true, daoRecovery: true };
    const invite = formDataToCreationParams(config, wallet, 12n, 'testnet').initial_config;
    // Claims are priced in the auction's asset even without an auction.
    expect(invite.modules).toEqual([{ tag: 'Claims', values: [{ payment_asset: config.auction.paymentAsset }] }]);
    expect(invite.token_settings).toEqual({
      transfers_locked: true,
      members_only_delegation: true,
      dao_recovery: true
    });
  });
  it('opens an older draft without claims or membership rules as an open community', () => {
    const config = valid() as Record<string, unknown>;
    delete config.claims;
    delete config.tokenSettings;
    const parsed = draftConfigurationSchema.parse(config);
    expect(parsed.claims).toEqual({ enabled: false });
    expect(parsed.tokenSettings).toEqual({ transfersLocked: false, membersOnlyDelegation: false, daoRecovery: false });
  });
  it('uses exact decimal integers beyond floating-point precision', () => {
    const config = valid();
    config.auction.reservePrice = '9007199254740993.1234567';
    const [auction] = formDataToCreationParams(config, wallet, 1n).initial_config.modules;
    expect(auction?.tag === 'Auction' && auction.values[0].reserve_price).toBe(90071992547409931234567n);
  });
  it.each(['0', '0.0000001', '1e2', '1.00000001', '-1', '170141183460469231731687303715884.105728'])(
    'rejects invalid reserve %s even if auctions are disabled',
    (price) => {
      const config = valid();
      config.auction.enabled = false;
      config.auction.reservePrice = price;
      expect(createDaoSchema.safeParse(config).success).toBe(false);
    }
  );
  it.each([299, 2_592_001, 1.5, NaN])('enforces queueDelay bounds (%s)', (queueDelay) => {
    const config = valid();
    config.governance.queueDelay = queueDelay;
    expect(createDaoSchema.safeParse(config).success).toBe(false);
  });
  it('passes absolute threshold and exact queue delay to the Manager', () => {
    const config = valid();
    config.governance.proposalThreshold = 7;
    config.governance.queueDelay = 300;
    expect(formDataToCreationParams(config, wallet, 1n).initial_config.governance).toMatchObject({
      proposal_threshold: 7n,
      queue_delay: 300
    });
  });
  it('rejects unsafe numeric vote counts and non-registry payment assets', () => {
    const config = valid();
    config.governance.proposalThreshold = Number.MAX_SAFE_INTEGER + 1;
    expect(createDaoSchema.safeParse(config).success).toBe(false);
    config.governance.proposalThreshold = 1;
    config.auction.paymentAsset = creationAssets('public')[0].contractId!;
    expect(() => formDataToCreationParams(config, wallet, 1n, 'testnet')).toThrow('registry');
  });
  it('uses only XLM/USDC and derives local XLM for the actual local passphrase', () => {
    expect(creationAssets('testnet').map((a) => a.code)).toEqual(['XLM', 'USDC']);
    expect(creationAssets('local')[0].contractId).toBe(
      Asset.native().contractId(getNetworkConfig('local').networkPassphrase)
    );
  });
  it('pins both independently selected assets and rejects another launch admin', () => {
    const config = valid();
    config.auction.enabled = true;
    config.marketplace.enabled = true;
    config.marketplace.paymentAsset = creationAssets('testnet')[1].contractId!;
    const [auction, market] = formDataToCreationParams(config, wallet, 1n).initial_config.modules;
    expect(auction?.tag === 'Auction' && auction.values[0].payment_asset).not.toBe(
      market?.tag === 'Marketplace' && market.values[0].payment_asset
    );
    expect(() => formDataToCreationParams(config, Keypair.random().publicKey(), 1n)).toThrow('deployer');
  });
  it('generates u64 nonces and rejects out-of-range nonces', () => {
    expect(generateNonce()).toBeGreaterThanOrEqual(0n);
    expect(generateNonce()).toBeLessThan(1n << 64n);
    expect(() => formDataToCreationParams(valid(), wallet, 1n << 64n)).toThrow('u64');
  });
  it('checks the profile byte budget and token-name characters before preparing a nonce', () => {
    const config = valid();
    // 300 UTF-8 bytes used to be the cap; the whole profile now has 4 KB.
    config.basicInfo.description = '界'.repeat(100);
    expect(createDaoSchema.safeParse(config).success).toBe(true);
    config.basicInfo.description = '界'.repeat(1400);
    expect(createDaoSchema.safeParse(config).success).toBe(false);
    config.basicInfo.description = 'A community of builders.';
    config.basicInfo.tokenName = 'The "Quoted" Club';
    expect(createDaoSchema.safeParse(config).success).toBe(false);
  });
});
