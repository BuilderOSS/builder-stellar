'use client';

import { Stack } from 'styled-system/jsx';

import { Badge, Button, Callout, Card, FieldHelperText, FieldLabel, Input, Select, Text } from '@/components/ui';
import { getProposalActionLabel, type ProposalActionType } from '@/lib/proposal-call';
import type { AssetBalance } from '@/lib/treasury-queries';

type ProposalActionEditorProps = {
  actionType: ProposalActionType;
  recipient: string;
  amount: string;
  assetCode?: string;
  editingActionId: string | null;
  busy: boolean;
  canSave: boolean;
  disabledReason?: string;
  recipientError?: string;
  amountError?: string;
  treasuryBalances?: AssetBalance[];
  balancesLoading?: boolean;
  onActionTypeChange: (value: ProposalActionType) => void;
  onRecipientChange: (value: string) => void;
  onAmountChange: (value: string) => void;
  onAssetCodeChange?: (value: string) => void;
  onMaxClick?: () => void;
  onSave: () => void;
  onClear: () => void;
  onCancelEdit: () => void;
};

export function ProposalActionEditor({
  actionType,
  recipient,
  amount,
  assetCode,
  editingActionId,
  busy,
  canSave,
  disabledReason,
  recipientError,
  amountError,
  treasuryBalances,
  balancesLoading,
  onActionTypeChange,
  onRecipientChange,
  onAmountChange,
  onAssetCodeChange,
  onMaxClick,
  onSave,
  onClear,
  onCancelEdit
}: ProposalActionEditorProps) {
  const batchMint = actionType === 'batch-mint-governance-token';
  const sacTransfer = actionType === 'transfer-sac-token';
  const needsAmount = batchMint || sacTransfer;
  const title = editingActionId ? 'Edit queued action' : 'Add action';
  const formDisabled = busy || Boolean(disabledReason);

  // Find the balance for the selected asset
  const selectedAssetBalance =
    sacTransfer && assetCode && treasuryBalances ? treasuryBalances.find((b) => b.assetCode === assetCode) : undefined;

  const balanceDisplay =
    sacTransfer && assetCode
      ? balancesLoading
        ? 'Loading balance...'
        : selectedAssetBalance
          ? `${parseFloat(selectedAssetBalance.balance).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 7 })} ${assetCode}`
          : '0 ' + assetCode
      : undefined;

  return (
    <Card p="5">
      <Stack gap="3">
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            gap: '12px',
            flexWrap: 'wrap',
            alignItems: 'flex-start'
          }}
        >
          <Stack gap="1">
            <Badge>{editingActionId ? 'Editing' : 'Action builder'}</Badge>
            <Text className="lede" style={{ margin: 0, fontSize: '1rem' }}>
              {title}
            </Text>
          </Stack>
          {editingActionId ? (
            <Button type="button" variant="outline" onClick={onCancelEdit} disabled={busy}>
              Cancel edit
            </Button>
          ) : null}
        </div>

        <Stack gap="2">
          <FieldLabel htmlFor="proposal-action-type">Action type</FieldLabel>
          <Select
            id="proposal-action-type"
            value={actionType}
            onChange={(event) => onActionTypeChange(event.target.value as ProposalActionType)}
            disabled={busy}
          >
            <option value="mint-governance-token">{getProposalActionLabel('mint-governance-token')}</option>
            <option value="batch-mint-governance-token">{getProposalActionLabel('batch-mint-governance-token')}</option>
            <option value="transfer-sac-token">{getProposalActionLabel('transfer-sac-token')}</option>
          </Select>
          <FieldHelperText>Each queued action becomes a separate governor call in the final proposal.</FieldHelperText>
        </Stack>

        {disabledReason ? (
          <Callout variant="error" title="Treasury mint authority required" description={disabledReason} />
        ) : null}

        <div style={disabledReason ? { opacity: 0.62 } : undefined}>
          <Stack gap="3">
            {sacTransfer ? (
              <Stack gap="2">
                <FieldLabel htmlFor="proposal-action-asset">Asset</FieldLabel>
                <Select
                  id="proposal-action-asset"
                  value={assetCode || ''}
                  onChange={(event) => onAssetCodeChange?.(event.target.value)}
                  disabled={formDisabled}
                >
                  <option value="">Select asset...</option>
                  <option value="XLM">XLM (Native)</option>
                  <option value="USDC">USDC</option>
                  <option value="EURC">EURC</option>
                </Select>
                <FieldHelperText>Choose which SAC token to transfer from the treasury.</FieldHelperText>
                {balanceDisplay ? (
                  <FieldHelperText>
                    <strong>Treasury balance:</strong> {balanceDisplay}
                  </FieldHelperText>
                ) : null}
              </Stack>
            ) : null}

            <Stack gap="2">
              <FieldLabel htmlFor="proposal-action-recipient">Recipient</FieldLabel>
              <Input
                id="proposal-action-recipient"
                value={recipient}
                onChange={(event) => onRecipientChange(event.target.value)}
                placeholder="Recipient address (G... or C...)"
                disabled={formDisabled}
              />
              {recipientError ? (
                <FieldHelperText style={{ color: 'var(--error-9)' }}>{recipientError}</FieldHelperText>
              ) : (
                <FieldHelperText>Enter a valid Stellar address (account or contract).</FieldHelperText>
              )}
            </Stack>

            {needsAmount ? (
              <Stack gap="2">
                <FieldLabel htmlFor="proposal-action-amount">Amount</FieldLabel>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                  <div style={{ flex: 1 }}>
                    <Input
                      id="proposal-action-amount"
                      value={amount}
                      onChange={(event) => onAmountChange(event.target.value)}
                      placeholder={sacTransfer ? 'Amount to transfer (e.g., 100.5)' : 'Amount to mint'}
                      type="number"
                      min="0.0000001"
                      max={batchMint ? '20' : undefined}
                      step={sacTransfer ? '0.0000001' : '1'}
                      disabled={formDisabled}
                    />
                  </div>
                  {sacTransfer && assetCode && onMaxClick ? (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={onMaxClick}
                      disabled={formDisabled || balancesLoading}
                      style={{ whiteSpace: 'nowrap' }}
                    >
                      Max
                    </Button>
                  ) : null}
                </div>
                {amountError ? (
                  <FieldHelperText style={{ color: 'var(--error-9)' }}>{amountError}</FieldHelperText>
                ) : (
                  <FieldHelperText>
                    {sacTransfer
                      ? 'Use a positive decimal number (supports up to 7 decimal places).'
                      : batchMint
                        ? 'Use a positive whole number up to 20 tokens.'
                        : 'Use a positive whole number of tokens.'}
                  </FieldHelperText>
                )}
              </Stack>
            ) : null}

            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap' }}>
              <Button type="button" variant="outline" onClick={onClear} disabled={formDisabled}>
                Clear draft
              </Button>
              <Button type="button" onClick={onSave} disabled={formDisabled || !canSave}>
                {editingActionId ? 'Save action' : 'Add action'}
              </Button>
            </div>
          </Stack>
        </div>
      </Stack>
    </Card>
  );
}
