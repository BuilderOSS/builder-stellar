import { Asset } from '@stellar/stellar-sdk';
import { TriangleAlert } from 'lucide-react';
import { css, sva } from 'styled-system/css';

import { Address, Chip, Section, shortenId } from '@/components/ui';
import { useDaoContext } from '@/contexts/dao-context';
import { getTreasuryAssets } from '@/lib/assets-config';
import { formatStroops } from '@/lib/auction-values';
import { contractCallLabel, contractRole, mintGrants, mintTitle } from '@/lib/contract-call-labels';
import { getDeploymentConfig } from '@/lib/deployment-config';
import { usePendingModules } from '@/lib/modules/pending';
import { inspectProposalAdminCall, type ProposalCallInspection } from '@/lib/proposal-action-inspection';
import { normalizeProposalCallArgs, type ProposalCallArg, type ProposalCallArgs } from '@/lib/proposal-call';
import { ProposalState } from '@/lib/proposal-state';
import { encodeSupportedCall } from '@/lib/proposal-supported-calls';

import { UpgradeActionDetail } from './upgrade-action-detail';

type ProposalActionPreviewProps = {
  targets: string[];
  functions: string[];
  args: ProposalCallArgs;
  tokenContractId?: string;
  /** Chain state, so the heading can say whether these actions will run, ran, or never will. */
  state?: ProposalState;
};

/** Heading and count line for the action list, worded for where the proposal is. */
export function actionListCopy(count: number, state: ProposalState | undefined) {
  const one = count === 1;
  const noun = one ? 'This action' : `These ${count} actions`;
  switch (state) {
    case ProposalState.Executed:
      return { title: 'Executed actions', description: undefined };
    case ProposalState.Succeeded:
    case ProposalState.Queued:
      return { title: 'When it runs', description: one ? undefined : `${noun} run together, in this order.` };
    case ProposalState.Defeated:
    case ProposalState.Canceled:
    case ProposalState.Expired:
      return {
        title: 'What it proposed',
        description: one ? 'Nothing ran.' : `${noun} were proposed. Nothing ran.`
      };
    default:
      return {
        title: 'If it passes',
        description: one ? undefined : `${noun} run together, in this order.`
      };
  }
}

function formatArg(value: ProposalCallArg) {
  if (value === null) return 'null';
  if (Array.isArray(value) || typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function formatStroopsAmount(stroops: ProposalCallArg): string {
  return formatStroops(BigInt(String(stroops)));
}

function getAssetCodeFromContractId(contractId: string, network: string, passphrase: string): string {
  const assets = getTreasuryAssets(network === 'public' ? 'public' : network === 'local' ? 'local' : 'testnet');
  const asset = assets.find((a) => (a.isNative ? Asset.native().contractId(passphrase) : a.contractId) === contractId);
  return asset?.code || 'tokens';
}

function isSacTransfer(
  target: string,
  functionName: string,
  args: ProposalCallArg[],
  tokenContractId: string | undefined,
  network: 'testnet' | 'local' | 'public',
  passphrase: string
): boolean {
  return (
    target !== tokenContractId &&
    getTreasuryAssets(network).some(
      (asset) => (asset.isNative ? Asset.native().contractId(passphrase) : asset.contractId) === target
    ) &&
    functionName === 'transfer' &&
    args.length === 3
  );
}

type ActionDescription = {
  title: string;
  /** Wallets the action mints or pays to; the title names them short, these rows in full. */
  recipients: { address: string; label: string }[];
  /** Why the contract will reject this call when it runs. */
  failure?: string;
};

function describeAction(
  target: string,
  functionName: string,
  args: ProposalCallArg[],
  tokenContractId: string | undefined,
  network: 'testnet' | 'local' | 'public',
  passphrase: string,
  role?: ReturnType<typeof contractRole>
): ActionDescription {
  if (target === tokenContractId && (functionName === 'mint' || functionName === 'batch_mint')) {
    const grants = mintGrants(functionName, args);
    if (!grants) {
      return {
        title: contractCallLabel(functionName, role),
        recipients: [],
        failure:
          functionName === 'batch_mint'
            ? 'The token rejects this call when it runs: each wallet needs a matching amount above zero.'
            : undefined
      };
    }
    const several = grants.length > 1;
    return {
      title: mintTitle(grants, shortenId),
      recipients: grants.map((grant) => ({
        address: grant.recipient,
        label: several
          ? `Gets ${grant.amount.toLocaleString('en-US')} token${grant.amount === 1n ? '' : 's'}`
          : 'Recipient'
      }))
    };
  }
  if (isSacTransfer(target, functionName, args, tokenContractId, network, passphrase)) {
    const amount = formatStroopsAmount(args[2] ?? '0');
    const recipient = formatArg(args[1] ?? '');
    const assetCode = getAssetCodeFromContractId(target, network, passphrase);
    return {
      title: `Send ${amount} ${assetCode} to ${shortenId(recipient)}`,
      recipients: [{ address: recipient, label: 'Recipient' }]
    };
  }
  return { title: contractCallLabel(functionName, role), recipients: [] };
}

function pauseTitle(
  target: string,
  functionName: string,
  config: { auctionContractId: string; marketplaceContractId: string }
) {
  if (functionName !== 'pause' && functionName !== 'unpause') return null;
  const paused = functionName === 'pause';
  if (target === config.auctionContractId) return paused ? 'Pause auctions' : 'Resume auctions';
  if (target === config.marketplaceContractId) return paused ? 'Pause the market' : 'Reopen the market';
  return null;
}

const action = sva({
  slots: ['root', 'head', 'index', 'title', 'risk', 'fields', 'field', 'term', 'value', 'raw', 'note'],
  base: {
    root: {
      display: 'grid',
      gap: '3',
      py: '4',
      borderTopWidth: '1px',
      borderColor: 'rule',
      _first: { borderTopWidth: '0', pt: '1' }
    },
    head: { display: 'flex', alignItems: 'flex-start', gap: '3' },
    index: {
      display: 'grid',
      placeItems: 'center',
      flexShrink: '0',
      width: '7',
      height: '7',
      borderRadius: 'full',
      bg: 'hover',
      textStyle: 'micro',
      color: 'ink.muted'
    },
    title: { textStyle: 'subheading', m: '0', overflowWrap: 'anywhere', pt: '0.5' },
    risk: {
      display: 'grid',
      gridTemplateColumns: 'auto minmax(0, 1fr)',
      gap: '2.5',
      p: '3',
      borderRadius: 'control',
      bg: 'warning.wash',
      textStyle: 'caption',
      fontSize: '0.875rem',
      color: 'ink',
      '& svg': { width: '4.5', height: '4.5', color: 'warning', mt: '0.5' }
    },
    fields: { display: 'grid', gap: '2', m: '0' },
    field: { display: 'grid', gap: '0.5' },
    term: { textStyle: 'caption', color: 'ink.muted' },
    value: { m: '0', '& pre': { m: '0', textStyle: 'mono', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' } },
    raw: {
      m: '0',
      p: '2.5',
      borderRadius: 'sm',
      bg: 'hover',
      textStyle: 'mono',
      fontSize: '0.75rem',
      color: 'ink.muted',
      overflowWrap: 'anywhere'
    },
    note: { textStyle: 'caption', color: 'warning', m: '0' }
  }
});

/**
 * What a proposal does if it passes, in order. Plain titles first, then the
 * exact target and arguments so anyone can verify them.
 */
export function ProposalActionPreview({
  targets,
  functions,
  args,
  tokenContractId,
  state
}: ProposalActionPreviewProps) {
  const { daoConfig: indexedConfig } = useDaoContext();
  const pending = usePendingModules(indexedConfig, targets, functions, args);
  // A module the proposal adds is called before it exists: its address is the Manager's prediction.
  const daoConfig = { ...indexedConfig, pendingModules: pending.pendingModules };
  const classes = action();
  const copy = actionListCopy(functions.length, state);
  const numbered = functions.length > 1;
  let normalizedArgs: ProposalCallArgs = [];
  try {
    normalizedArgs = normalizeProposalCallArgs(args);
  } catch {
    /* Display original values, never submit lossy arguments. */
  }

  return (
    <Section title={copy.title} description={functions.length ? copy.description : undefined}>
      {!functions.length ? (
        <p className={css({ textStyle: 'body', color: 'ink.muted', m: '0' })}>This proposal makes no changes.</p>
      ) : (
        <ol className={css({ listStyle: 'none', m: '0', p: '0' })}>
          {functions.map((functionName, index) => {
            const actionArgs = normalizedArgs[index] ?? [];
            const target = targets[index] ?? '';
            let title = functionName;
            let description: ActionDescription | null = null;
            let supported = true;
            let inspection: ProposalCallInspection | null = null;
            try {
              // Indexed authorize trees lose their Val types, so they are
              // rendered for review rather than re-encoded.
              if (!(target === daoConfig.treasuryContractId && functionName === 'authorize') && !pending.loading)
                encodeSupportedCall(target, functionName, actionArgs, daoConfig);
              inspection = inspectProposalAdminCall(target, functionName, actionArgs, daoConfig);
              description = inspection
                ? null
                : describeAction(
                    target,
                    functionName,
                    actionArgs,
                    tokenContractId,
                    daoConfig.name,
                    daoConfig.passphrase,
                    contractRole(target, daoConfig, getDeploymentConfig().managerAddress)
                  );
              title = inspection?.title ?? pauseTitle(target, functionName, daoConfig) ?? description?.title ?? title;
            } catch {
              supported = false;
            }
            return (
              <li key={`${functionName}:${index}`} className={classes.root}>
                <div className={classes.head}>
                  {numbered ? (
                    <span className={classes.index} aria-hidden="true">
                      {index + 1}
                    </span>
                  ) : null}
                  <p className={classes.title}>{title}</p>
                </div>
                {inspection?.upgrade ? (
                  <UpgradeActionDetail {...inspection.upgrade} contract={target} />
                ) : inspection ? (
                  <>
                    <div className={classes.risk}>
                      <TriangleAlert aria-hidden="true" />
                      <div>
                        {inspection.risk.startsWith('High risk') ? <Chip tone="warning">High risk</Chip> : null}
                        <p className={css({ m: '0', mt: '1.5' })}>{inspection.risk.replace(/^High risk:\s*/, '')}</p>
                      </div>
                    </div>
                    <dl className={classes.fields}>
                      {inspection.fields.map((field) => (
                        <div key={field.label} className={classes.field}>
                          <dt className={classes.term}>{field.label}</dt>
                          <dd className={classes.value}>
                            <pre>{field.value}</pre>
                          </dd>
                        </div>
                      ))}
                    </dl>
                  </>
                ) : null}
                {description?.recipients.map((recipient) => (
                  <Address key={recipient.address} value={recipient.address} label={recipient.label} compact />
                ))}
                {description?.failure ? <p className={classes.note}>{description.failure}</p> : null}
                {inspection?.upgrade ? null : (
                  <>
                    <Address value={target} label="Contract" compact />
                    <p className={classes.raw}>
                      {functionName}({actionArgs.map(formatArg).join(', ') || JSON.stringify(args[index] ?? [])})
                    </p>
                  </>
                )}
                {!supported ? (
                  <p className={classes.note}>
                    This app can't read this call, so it's shown exactly as indexed. Queueing and running it from here
                    are turned off.
                  </p>
                ) : null}
              </li>
            );
          })}
        </ol>
      )}
    </Section>
  );
}
