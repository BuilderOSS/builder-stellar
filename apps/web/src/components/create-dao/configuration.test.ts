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
  it('maps disabled modules to valid initialization rather than omitting their parameters', () => {
    const config = valid();
    config.auction.enabled = false;
    config.marketplace.enabled = false;
    const params = formDataToCreationParams(config, wallet, 12n, 'testnet');
    expect(params.initial_config.auction.reserve_price).toBe(10_000_000n);
    expect(params.initial_config.auction.duration).toBe(86400n);
    expect(params.initial_config.marketplace.payment_asset).toBe(config.marketplace.paymentAsset);
  });
  it('uses exact decimal integers beyond floating-point precision', () => {
    const config = valid();
    config.auction.reservePrice = '9007199254740993.1234567';
    expect(formDataToCreationParams(config, wallet, 1n).initial_config.auction.reserve_price).toBe(
      90071992547409931234567n
    );
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
    config.marketplace.paymentAsset = creationAssets('testnet')[1].contractId!;
    const params = formDataToCreationParams(config, wallet, 1n);
    expect(params.initial_config.auction.payment_asset).not.toBe(params.initial_config.marketplace.payment_asset);
    expect(() => formDataToCreationParams(config, Keypair.random().publicKey(), 1n)).toThrow('deployer');
  });
  it('generates u64 nonces and rejects out-of-range nonces', () => {
    expect(generateNonce()).toBeGreaterThanOrEqual(0n);
    expect(generateNonce()).toBeLessThan(1n << 64n);
    expect(() => formDataToCreationParams(valid(), wallet, 1n << 64n)).toThrow('u64');
  });
  it('checks Manager UTF-8 string bounds including resolved DAO placeholders before preparing a nonce', () => {
    const config = valid();
    config.basicInfo.description = '界'.repeat(100);
    expect(createDaoSchema.safeParse(config).success).toBe(false);
    config.basicInfo.description = 'A community of builders.';
    config.basicInfo.tokenUri = `https://example.com/${'a'.repeat(190)}/{daoId}`;
    expect(createDaoSchema.safeParse(config).success).toBe(false);
  });
});
