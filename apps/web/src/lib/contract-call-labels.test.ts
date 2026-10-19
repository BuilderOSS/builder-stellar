import { describe, expect, it } from 'vitest';

import { artworkAdditionTitle, mintGrants, mintTitle } from './contract-call-labels';

const minter = 'CTREASURY';

describe('token mint wording', () => {
  it('reads a batch mint to one wallet as a sentence, never as JSON', () => {
    const grants = mintGrants('batch_mint', [minter, ['GALICE'], ['5']]);
    expect(grants).toEqual([{ recipient: 'GALICE', amount: 5n }]);
    expect(mintTitle(grants!)).toBe('Mint 5 membership tokens to GALICE');
    expect(mintTitle(grants!, (address) => `${address.slice(0, 3)}…`)).toBe('Mint 5 membership tokens to GAL…');
  });
  it('says "a membership token" for one, and totals several wallets', () => {
    expect(mintTitle(mintGrants('mint', [minter, 'GALICE'])!)).toBe('Mint a membership token to GALICE');
    expect(mintTitle(mintGrants('batch_mint', [minter, ['GALICE'], [1]])!)).toBe('Mint a membership token to GALICE');
    const several = mintGrants('batch_mint', [minter, ['GALICE', 'GBOB'], ['5', '1200']]);
    expect(mintTitle(several!)).toBe('Mint 1,205 membership tokens to 2 wallets');
  });
  it('folds repeat wallets into one grant, in first-seen order', () => {
    expect(mintGrants('batch_mint', [minter, ['GBOB', 'GALICE', 'GBOB'], ['1', '2', '3']])).toEqual([
      { recipient: 'GBOB', amount: 4n },
      { recipient: 'GALICE', amount: 2n }
    ]);
    expect(mintTitle(mintGrants('batch_mint', [minter, ['GBOB', 'GBOB'], ['1', '2']])!)).toBe(
      'Mint 3 membership tokens to GBOB'
    );
  });
  it('returns null for calls the Token rejects or that are not mints', () => {
    for (const args of [
      [minter, ['GALICE', 'GBOB'], ['5']],
      [minter, [], []],
      [minter, ['GALICE'], ['0']],
      [minter, ['GALICE'], ['-1']],
      [minter, ['GALICE'], ['five']],
      [minter, 'GALICE', '5'],
      [minter, [7], ['5']]
    ]) {
      expect(mintGrants('batch_mint', args)).toBeNull();
    }
    expect(mintGrants('mint', [minter, ['GALICE']])).toBeNull();
    expect(mintGrants('transfer', [minter, 'GALICE', 1])).toBeNull();
  });
});

describe('artwork wording', () => {
  it('counts new layers and images, and leaves out new layers when there are none', () => {
    expect(artworkAdditionTitle(2, 5)).toBe('Add 2 new layers and 5 images to the artwork');
    expect(artworkAdditionTitle(1, 1)).toBe('Add 1 new layer and 1 image to the artwork');
    expect(artworkAdditionTitle(0, 3)).toBe('Add 3 images to the artwork');
  });
});

describe('composer and proposal page labels', () => {
  it('names every proposal action’s call with its handler’s own label', async () => {
    const { getAllActionHandlers } = await import('@/lib/proposal-actions/registry');
    const { config } = await import('@/lib/proposal-changes/test-fixtures');
    const { getDeploymentConfig } = await import('@/lib/deployment-config');
    const { contractCallLabel, contractRole } = await import('./contract-call-labels');
    const context = {
      config,
      governorContractId: config.governorContractId,
      tokenContractId: config.tokenContractId,
      treasuryAddress: config.treasuryContractId
    };
    // Reads with its own, more specific title on the proposal page: the payment, the amount and the asset;
    // the module and its release; or a module the same proposal creates.
    const ownTitle = new Set([
      'transfer-sac-token',
      'upgrade-dao-module',
      'migrate-dao-module',
      'open-module',
      'open-claim-list'
    ]);
    const checked: string[] = [];
    for (const handler of getAllActionHandlers()) {
      if (ownTitle.has(handler.type)) continue;
      const call = handler.buildCallVector(handler.getDefaultValues(), context as never);
      const role = contractRole(call.target, config, getDeploymentConfig().managerAddress);
      expect(role, handler.type).toBeDefined();
      expect(contractCallLabel(call.function, role), handler.type).toBe(handler.label);
      checked.push(handler.type);
    }
    expect(checked.length).toBeGreaterThan(35);
  });

  it('calls the Token’s set_metadata a rename, not a profile update', async () => {
    const { contractCallLabel } = await import('./contract-call-labels');
    expect(contractCallLabel('set_metadata')).toBe('Rename the tribe');
    expect(contractCallLabel('pause', 'marketplace')).toBe('Pause the market');
    expect(contractCallLabel('pause')).toBe('Pause');
    expect(contractCallLabel('transfer')).toBe('Send funds');
    expect(contractCallLabel('transfer', 'token')).toBe('Give a treasury token');
    expect(contractCallLabel('some_new_call')).toBe('Some new call');
  });
});
