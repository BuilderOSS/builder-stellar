import { Asset } from '@stellar/stellar-sdk';
import { Stack } from 'styled-system/jsx';

import { Badge, Card, ShortId, Text } from '@/components/ui';
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

/**
 * Format stroops amount back to decimal for display
 */
function formatStroopsAmount(stroops: ProposalCallArg): string {
  const stroopsStr = String(stroops);
  return formatStroops(BigInt(stroopsStr));
}

/**
 * Lookup asset code from contract ID using the treasury assets config
 */
function getAssetCodeFromContractId(contractId: string, network: string, passphrase: string): string {
  const assets = getTreasuryAssets(network === 'public' ? 'public' : network === 'local' ? 'local' : 'testnet');
  const asset = assets.find((a) => (a.isNative ? Asset.native().contractId(passphrase) : a.contractId) === contractId);
  return asset?.code || 'tokens';
}

/**
 * Detect if this is a SAC transfer by checking if it's NOT the token contract
 * and the function is 'transfer' with 3 args
 */
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
    return `Mint Governance Token to ${formatArg(args[1] ?? '')}`;
  }

  if (target === tokenContractId && functionName === 'batch_mint') {
    return `Batch Mint Governance Token to ${formatArg(args[1] ?? '')} for ${formatArg(args[2] ?? '')} tokens`;
  }

  if (isSacTransfer(target, functionName, args, tokenContractId, network, passphrase)) {
    const amount = formatStroopsAmount(args[2] ?? '0');
    const recipient = formatArg(args[1] ?? '');
    const assetCode = getAssetCodeFromContractId(target, network, passphrase);
    return `Transfer ${amount} ${assetCode} to ${recipient}`;
  }

  return functionName;
}

export function ProposalActionPreview({ targets, functions, args, tokenContractId }: ProposalActionPreviewProps) {
  const { daoConfig } = useDaoContext();
  let normalizedArgs: ProposalCallArgs = [];
  try {
    normalizedArgs = normalizeProposalCallArgs(args);
  } catch {
    /* Display original values, never submit lossy arguments. */
  }

  return (
    <Card p="5">
      <Stack gap="3">
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            gap: '12px',
            flexWrap: 'wrap',
            alignItems: 'center'
          }}
        >
          <Text className="label">Proposal actions</Text>
          <Text className="lede" style={{ margin: 0, fontSize: '0.9rem' }}>
            {functions.length} action{functions.length === 1 ? '' : 's'}
          </Text>
        </div>

        {!functions.length ? (
          <Text className="lede" style={{ margin: 0, fontSize: '0.9rem' }}>
            No actions are available for this proposal.
          </Text>
        ) : (
          <Stack gap="2">
            {functions.map((functionName, index) => {
              const actionArgs = normalizedArgs[index] ?? [];
              const target = targets[index] ?? '';
              let title = functionName;
              let supported = true;
              let inspection: ProposalCallInspection | null = null;
              try {
                encodeSupportedCall(target, functionName, actionArgs, daoConfig);
                inspection = inspectProposalAdminCall(target, functionName, actionArgs, daoConfig);
                title =
                  inspection?.title ??
                  getActionTitle(
                    target,
                    functionName,
                    actionArgs,
                    tokenContractId,
                    daoConfig.name,
                    daoConfig.passphrase
                  );
              } catch {
                supported = false;
              }
              return (
                <Card
                  key={`${functionName}:${index}`}
                  p="4"
                  style={{ border: '1px solid rgba(160, 194, 225, 0.18)', background: 'rgba(157, 179, 203, 0.06)' }}
                >
                  <Stack gap="2">
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                      <Badge>{index + 1}</Badge>
                      <Badge>{functionName}</Badge>
                    </div>
                    <Text style={{ margin: 0, fontWeight: 700 }}>{title}</Text>
                    {inspection ? (
                      <>
                        <Badge>High risk</Badge>
                        <Text>{inspection.risk}</Text>
                        <dl>
                          {inspection.fields.map((field) => (
                            <div key={field.label}>
                              <dt>{field.label}</dt>
                              <dd style={{ margin: 0 }}>
                                <pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', margin: 0 }}>
                                  {field.value}
                                </pre>
                              </dd>
                            </div>
                          ))}
                        </dl>
                      </>
                    ) : null}
                    <ShortId value={target} label="Target" />
                    <Text className="lede" style={{ margin: 0, fontSize: '0.84rem' }}>
                      Args: {actionArgs.map(formatArg).join(' | ') || JSON.stringify(args[index] ?? [])}
                    </Text>
                    {!supported ? (
                      <Text>Unknown or unsupported ABI. Raw indexed call shown; automatic submission is disabled.</Text>
                    ) : null}
                  </Stack>
                </Card>
              );
            })}
          </Stack>
        )}
      </Stack>
    </Card>
  );
}
