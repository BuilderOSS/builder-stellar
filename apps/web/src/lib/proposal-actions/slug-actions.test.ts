import { Client as ManagerClient } from '@builder-stellar/manager-bindings';
import { Networks, StrKey } from '@stellar/stellar-sdk';
import { describe, expect, it } from 'vitest';

import type { DaoNetworkConfig } from '@/lib/dao-config';
import { getDeploymentConfig } from '@/lib/deployment-config';
import { analyzeProposalAction, isHighRiskProposalAction } from '@/lib/proposal-action-identity';
import { getProposalActionLabel, getProposalActionSummary } from '@/lib/proposal-call';
import { encodeSupportedCall } from '@/lib/proposal-supported-calls';

import { getActionHandler } from './registry';
import type { BuildContext, FormContext } from './types';

const contract = (byte: number) => StrKey.encodeContract(new Uint8Array(32).fill(byte));
const config = {
  name: 'testnet',
  slug: 'lantern-club',
  rpcUrl: 'https://rpc.test',
  passphrase: Networks.TESTNET,
  tokenContractId: contract(1),
  governorContractId: contract(2),
  treasuryContractId: contract(3),
  auctionContractId: contract(4),
  marketplaceContractId: contract(5),
  metadataContractId: contract(6)
} as DaoNetworkConfig;
const build: BuildContext = {
  config,
  tokenContractId: config.tokenContractId,
  governorContractId: config.governorContractId,
  treasuryAddress: config.treasuryContractId
};
const form = { config, session: { address: null, kit: null } } as FormContext;
const manager = getDeploymentConfig().managerAddress;
const handler = getActionHandler('change-dao-slug');

describe('change-dao-slug', () => {
  it('encodes manager.change_slug(token, slug) against the real Manager spec', () => {
    const call = handler.buildCallVector({ slug: 'night-walkers' }, build);
    expect(call).toEqual({ target: manager, function: 'change_slug', args: [config.tokenContractId, 'night-walkers'] });
    const spec = new ManagerClient({
      contractId: manager,
      rpcUrl: config.rpcUrl,
      networkPassphrase: config.passphrase
    }).spec;
    expect(encodeSupportedCall(call.target, call.function, call.args, config).map((a) => a.toXDR('base64'))).toEqual(
      spec
        .funcArgsToScVals('change_slug', { token_address: config.tokenContractId, new_slug: 'night-walkers' })
        .map((a) => a.toXDR('base64'))
    );
  });

  it('fails closed on any other Manager call, or a slug change naming another DAO', () => {
    expect(() => encodeSupportedCall(manager, 'pause_factory', [], config)).toThrow(/Unsupported Manager call/);
    expect(() => encodeSupportedCall(manager, 'change_slug', [contract(9), 'night-walkers'], config)).toThrow(
      /must name this DAO/
    );
  });

  it('validates the slug format and rejects the current link', () => {
    expect(handler.validate({ slug: 'night-walkers' }, form).valid).toBe(true);
    for (const bad of ['abc', 'Bad_Slug', 'a--b', '-abc', 'x'.repeat(64)])
      expect(handler.validate({ slug: bad }, form).valid, bad).toBe(false);
    expect(handler.validate({ slug: 'lantern-club' }, form)).toMatchObject({
      valid: false,
      message: 'This is already your link'
    });
  });

  it('is high risk and tells voters what happens to the old link', () => {
    const action = handler.serialize({ slug: 'night-walkers' }, form);
    expect(action).toMatchObject({ type: 'change-dao-slug', slug: 'night-walkers', previousSlug: 'lantern-club' });
    expect(isHighRiskProposalAction(action)).toBe(true);
    expect(getProposalActionLabel(action.type)).toBe('Change the tribe link');
    expect(getProposalActionSummary(action)).toBe(
      'Change link from /dao/lantern-club to /dao/night-walkers. The old link is freed right away and keeps leading here only until another tribe takes it. If /dao/night-walkers is taken before this runs, the proposal fails.'
    );
  });

  it('warns when a link change shares a proposal with anything else', () => {
    const slug = handler.serialize({ slug: 'night-walkers' }, form);
    const rename = getActionHandler('set-token-metadata').serialize(
      { name: 'Night Walkers', symbol: 'NIGHT', uri: 'https://example.com/token/' },
      form
    );
    const bundled = (findings: ReturnType<typeof analyzeProposalAction>) =>
      findings.some((f) => f.message.startsWith('Propose a link change on its own'));
    expect(bundled(analyzeProposalAction(slug, []))).toBe(false);
    expect(bundled(analyzeProposalAction(slug, [rename]))).toBe(true);
    expect(bundled(analyzeProposalAction(rename, [slug]))).toBe(true);
  });
});
