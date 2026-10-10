import { Asset } from '@stellar/stellar-sdk';
import { TriangleAlert } from 'lucide-react';
import { css, sva } from 'styled-system/css';

import { Address, Chip, Section } from '@/components/ui';
import { useDaoContext } from '@/contexts/dao-context';
import { getTreasuryAssets } from '@/lib/assets-config';
import { formatStroops } from '@/lib/auction-values';
import { inspectProposalAdminCall, type ProposalCallInspection } from '@/lib/proposal-action-inspection';
import { normalizeProposalCallArgs, type ProposalCallArg, type ProposalCallArgs } from '@/lib/proposal-call';
import { encodeSupportedCall } from '@/lib/proposal-supported-calls';

type ProposalActionPreviewProps = {
  targets: string[];
  functions: string[];
  args: ProposalCallArgs;
  tokenContractId?: string;
};

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

function getActionTitle(
  target: string,
  functionName: string,
  args: ProposalCallArg[],
  tokenContractId: string | undefined,
  network: 'testnet' | 'local' | 'public',
  passphrase: string
) {
  if (target === tokenContractId && functionName === 'mint') {
    return `Mint a membership token to ${formatArg(args[1] ?? '')}`;
  }
  if (target === tokenContractId && functionName === 'batch_mint') {
    return `Mint ${formatArg(args[2] ?? '')} membership tokens to ${formatArg(args[1] ?? '')}`;
  }
  if (isSacTransfer(target, functionName, args, tokenContractId, network, passphrase)) {
    const amount = formatStroopsAmount(args[2] ?? '0');
    const recipient = formatArg(args[1] ?? '');
    const assetCode = getAssetCodeFromContractId(target, network, passphrase);
    return `Send ${amount} ${assetCode} to ${recipient}`;
  }
  return functionName;
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
export function ProposalActionPreview({ targets, functions, args, tokenContractId }: ProposalActionPreviewProps) {
  const { daoConfig } = useDaoContext();
  const classes = action();
  let normalizedArgs: ProposalCallArgs = [];
  try {
    normalizedArgs = normalizeProposalCallArgs(args);
  } catch {
    /* Display original values, never submit lossy arguments. */
  }

  return (
    <Section
      title="If it passes"
      description={`${functions.length} action${functions.length === 1 ? '' : 's'}, run in this order`}
    >
      {!functions.length ? (
        <p className={css({ textStyle: 'body', color: 'ink.muted', m: '0' })}>This proposal makes no changes.</p>
      ) : (
        <ol className={css({ listStyle: 'none', m: '0', p: '0' })}>
          {functions.map((functionName, index) => {
            const actionArgs = normalizedArgs[index] ?? [];
            const target = targets[index] ?? '';
            let title = functionName;
            let supported = true;
            let inspection: ProposalCallInspection | null = null;
            try {
              // Indexed authorize trees lose their Val types, so they are
              // rendered for review rather than re-encoded.
              if (!(target === daoConfig.treasuryContractId && functionName === 'authorize'))
                encodeSupportedCall(target, functionName, actionArgs, daoConfig);
              inspection = inspectProposalAdminCall(target, functionName, actionArgs, daoConfig);
              title =
                inspection?.title ??
                getActionTitle(target, functionName, actionArgs, tokenContractId, daoConfig.name, daoConfig.passphrase);
            } catch {
              supported = false;
            }
            return (
              <li key={`${functionName}:${index}`} className={classes.root}>
                <div className={classes.head}>
                  <span className={classes.index} aria-hidden="true">
                    {index + 1}
                  </span>
                  <p className={classes.title}>{title}</p>
                </div>
                {inspection ? (
                  <>
                    <div className={classes.risk}>
                      <TriangleAlert aria-hidden="true" />
                      <div>
                        <Chip tone="warning">High risk</Chip>
                        <p className={css({ m: '0', mt: '1.5' })}>{inspection.risk}</p>
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
                <Address value={target} label="Contract" compact />
                <p className={classes.raw}>
                  {functionName}({actionArgs.map(formatArg).join(', ') || JSON.stringify(args[index] ?? [])})
                </p>
                {!supported ? (
                  <p className={classes.note}>
                    Unknown or unsupported ABI. Raw indexed call shown; automatic submission is disabled.
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
