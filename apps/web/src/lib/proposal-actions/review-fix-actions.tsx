import { Text } from '@/components/ui';
import type { ActionFormProps, ActionHandler } from '@/lib/proposal-actions/types';
import { type AuthNodeDraft, describeAuthNodes, validateAuthNodes } from '@/lib/treasury-authorize';

const invalid = (message: string) => ({ valid: false as const, message });
const valid = () => ({ valid: true as const });

function Readonly({ lines }: { lines: string[] }) {
  return (
    <pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{lines.join('\n') || 'Nothing configured.'}</pre>
  );
}

export type TreasuryAuthorizeDraft = { nodes: AuthNodeDraft[] };
/**
 * Treasury.authorize(nodes): attaches nested authorization to the NEXT action of
 * the same proposal. Prepared by a guided flow (e.g. Treasury purchase), never
 * typed by hand; validated by simulating Treasury.check_authorization first.
 */
export const treasuryAuthorizeHandler: ActionHandler<TreasuryAuthorizeDraft> = {
  type: 'treasury-authorize',
  label: 'Authorize the next action (Treasury)',
  description: 'Attach a nested Treasury authorization tree to the following action',
  group: 'Treasury',
  FormComponent: ({ value }: ActionFormProps<TreasuryAuthorizeDraft>) => (
    <>
      <Text>Prepared by a guided flow. The tree applies only to the next action in this proposal.</Text>
      <Readonly lines={describeAuthNodes(value.nodes ?? [])} />
    </>
  ),
  getDefaultValues: () => ({ nodes: [] }),
  validate: (data) => {
    const error = validateAuthNodes(data.nodes);
    return error ? invalid(error) : valid();
  },
  serialize: (data) => ({
    id: crypto.randomUUID(),
    type: 'treasury-authorize',
    recipient: '',
    amount: '',
    nodes: data.nodes
  }),
  deserialize: (action) => ({ nodes: Array.isArray(action.nodes) ? action.nodes : [] }),
  buildCallVector: (data, context) => ({
    target: context.config.treasuryContractId,
    function: 'authorize',
    args: [data.nodes]
  })
};

export type TreasuryBuyListingDraft = { tokenId: string; maxPrice: string };
/** marketplace.buy(token_id, treasury, max_price): must follow its treasury-authorize action. */
export const treasuryBuyListingHandler: ActionHandler<TreasuryBuyListingDraft> = {
  type: 'treasury-buy-listing',
  label: 'Buy a secondary listing (Treasury)',
  description: 'The Treasury buys an escrowed listing at no more than the reviewed price',
  group: 'Treasury',
  FormComponent: ({ value }: ActionFormProps<TreasuryBuyListingDraft>) => (
    <Readonly lines={[`Token #${value.tokenId}`, `Max price (base units): ${value.maxPrice}`]} />
  ),
  getDefaultValues: () => ({ tokenId: '', maxPrice: '' }),
  validate: (data) =>
    /^\d+$/.test(data.tokenId) && /^\d+$/.test(data.maxPrice) && BigInt(data.maxPrice) > 0n
      ? valid()
      : invalid('Enter the token id and a positive maximum price.'),
  serialize: (data) => ({
    id: crypto.randomUUID(),
    type: 'treasury-buy-listing',
    recipient: '',
    amount: data.maxPrice,
    tokenId: data.tokenId,
    maxPrice: data.maxPrice
  }),
  deserialize: (action) => ({ tokenId: action.tokenId || '', maxPrice: action.maxPrice || action.amount || '' }),
  buildCallVector: (data, context) => ({
    target: context.config.marketplaceContractId,
    function: 'buy',
    args: [data.tokenId, context.config.treasuryContractId, data.maxPrice]
  })
};

export type RegenerateTokenDraft = { tokenId: string };
/** metadata.regenerate(token_id): seeds a token that was minted without traits. */
export const regenerateTokenHandler: ActionHandler<RegenerateTokenDraft> = {
  type: 'regenerate-token-traits',
  label: 'Seed traits for a token',
  description: 'Assign traits to a token minted before the artwork existed (Metadata regenerate)',
  group: 'Artwork',
  FormComponent: ({ value }: ActionFormProps<RegenerateTokenDraft>) => <Readonly lines={[`Token #${value.tokenId}`]} />,
  getDefaultValues: () => ({ tokenId: '' }),
  validate: (data) => (/^\d+$/.test(data.tokenId) ? valid() : invalid('Enter a token id.')),
  serialize: (data) => ({
    id: crypto.randomUUID(),
    type: 'regenerate-token-traits',
    recipient: '',
    amount: '',
    tokenId: data.tokenId
  }),
  deserialize: (action) => ({ tokenId: action.tokenId || '' }),
  buildCallVector: (data, context) => ({
    target: context.config.metadataContractId,
    function: 'regenerate',
    args: [data.tokenId]
  })
};

const moduleKeys = {
  token: 'tokenContractId',
  governor: 'governorContractId',
  auction: 'auctionContractId',
  treasury: 'treasuryContractId',
  marketplace: 'marketplaceContractId',
  metadata: 'metadataContractId'
} as const;
export type MigrateModuleDraft = { module: keyof typeof moduleKeys | '' };
/** module.migrate(): advances the storage version after an upgrade that changed storage. */
export const migrateModuleHandler: ActionHandler<MigrateModuleDraft> = {
  type: 'migrate-dao-module',
  label: 'Migrate module storage',
  description: 'Run a module’s storage migration (right after an upgrade that changes storage)',
  group: 'Administration',
  FormComponent: ({ value }: ActionFormProps<MigrateModuleDraft>) => (
    <Readonly lines={[`Module: ${value.module || 'none'}`]} />
  ),
  getDefaultValues: () => ({ module: '' }),
  validate: (data) => (data.module && data.module in moduleKeys ? valid() : invalid('Choose a DAO module.')),
  serialize: (data) => ({
    id: crypto.randomUUID(),
    type: 'migrate-dao-module',
    recipient: '',
    amount: '',
    module: data.module
  }),
  deserialize: (action) => ({ module: action.module || '' }),
  buildCallVector: (data, context) => {
    if (!data.module) throw new Error('Choose a DAO module.');
    return { target: context.config[moduleKeys[data.module]], function: 'migrate', args: [] };
  }
};

export const reviewFixHandlers = [
  treasuryAuthorizeHandler,
  treasuryBuyListingHandler,
  regenerateTokenHandler,
  migrateModuleHandler
] as ActionHandler[];
