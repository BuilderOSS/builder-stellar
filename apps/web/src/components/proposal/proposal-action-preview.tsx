import { Stack } from 'styled-system/jsx';

import { Badge, Card, ShortId, Text } from '@/components/ui';
import { getTreasuryAssets } from '@/lib/assets-config';
import { getDefaultDaoNetwork } from '@/lib/dao-config';
import { normalizeProposalCallArgs, type ProposalCallArg, type ProposalCallArgs } from '@/lib/proposal-call';

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
  const stroopsNum = BigInt(stroopsStr);
  const decimal = Number(stroopsNum) / 10_000_000;
  return decimal.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 7 });
}

/**
 * Lookup asset code from contract ID using the treasury assets config
 */
function getAssetCodeFromContractId(contractId: string): string {
  const network = getDefaultDaoNetwork();
  const assets = getTreasuryAssets(network);
  const asset = assets.find((a) => a.contractId === contractId);
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
  tokenContractId?: string
): boolean {
  return target !== tokenContractId && functionName === 'transfer' && args.length === 3;
}

function getActionTitle(target: string, functionName: string, args: ProposalCallArg[], tokenContractId?: string) {
  if (target === tokenContractId && functionName === 'mint') {
    return `Mint Governance Token to ${formatArg(args[1] ?? '')}`;
  }

  if (target === tokenContractId && functionName === 'batch_mint') {
    return `Batch Mint Governance Token to ${formatArg(args[1] ?? '')} for ${formatArg(args[2] ?? '')} tokens`;
  }

  if (isSacTransfer(target, functionName, args, tokenContractId)) {
    const amount = formatStroopsAmount(args[2] ?? '0');
    const recipient = formatArg(args[1] ?? '');
    const assetCode = getAssetCodeFromContractId(target);
    return `Transfer ${amount} ${assetCode} to ${recipient}`;
  }

  return functionName;
}

export function ProposalActionPreview({ targets, functions, args, tokenContractId }: ProposalActionPreviewProps) {
  const normalizedArgs = normalizeProposalCallArgs(args);

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
                    <Text style={{ margin: 0, fontWeight: 700 }}>
                      {getActionTitle(target, functionName, actionArgs, tokenContractId)}
                    </Text>
                    <ShortId value={target} label="Target" />
                    <Text className="lede" style={{ margin: 0, fontSize: '0.84rem' }}>
                      Args: {actionArgs.map(formatArg).join(' | ') || '—'}
                    </Text>
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
