'use client';

import { Stack } from 'styled-system/jsx';

import { Badge, Button, Card, Text } from '@/components/ui';
import { getProposalActionLabel, getProposalActionSummary, type ProposalQueuedAction } from '@/lib/proposal-call';

type ProposalActionQueueProps = {
  actions: ProposalQueuedAction[];
  busy: boolean;
  onRequestEdit?: (actionId: string) => void;
  onRequestRemove?: (actionId: string) => void;
};

export function ProposalActionQueue({ actions, busy, onRequestEdit, onRequestRemove }: ProposalActionQueueProps) {
  const editable = typeof onRequestEdit === 'function' && typeof onRequestRemove === 'function';

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
            <Badge>Queued actions</Badge>
            <Text className="lede" style={{ margin: 0, fontSize: '1rem' }}>
              {actions.length} action{actions.length === 1 ? '' : 's'} queued
            </Text>
          </Stack>
        </div>

        {!actions.length ? (
          <Text className="lede" style={{ margin: 0, fontSize: '0.9rem' }}>
            Add actions from the builder to assemble the proposal.
          </Text>
        ) : (
          <Stack gap="2">
            {actions.map((action, index) => (
              <Card
                key={action.id}
                p="3"
                style={{
                  border: '1px solid rgba(160, 194, 225, 0.18)',
                  background: 'rgba(157, 179, 203, 0.06)'
                }}
              >
                <Stack gap="2">
                  <button
                    type="button"
                    onClick={editable ? () => onRequestEdit(action.id) : undefined}
                    disabled={!editable || busy}
                    style={{
                      all: 'unset',
                      display: 'block',
                      width: '100%',
                      cursor: editable && !busy ? 'pointer' : 'default',
                      borderRadius: '10px',
                      padding: '2px'
                    }}
                  >
                    <Stack gap="1" style={{ textAlign: 'left' }}>
                      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                        <Badge>{index + 1}</Badge>
                        <Badge>{getProposalActionLabel(action.type)}</Badge>
                      </div>
                      <Text className="lede" style={{ margin: 0, fontSize: '0.9rem' }}>
                        {getProposalActionSummary(action)}
                      </Text>
                    </Stack>
                  </button>

                  {editable ? (
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                      <Button type="button" variant="outline" onClick={() => onRequestEdit(action.id)} disabled={busy}>
                        Edit
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => onRequestRemove(action.id)}
                        disabled={busy}
                      >
                        Remove
                      </Button>
                    </div>
                  ) : null}

                  <Text className="lede" style={{ margin: 0, fontSize: '0.82rem' }}>
                    Recipient: {action.recipient}
                    {action.type === 'batch-mint-governance-token' ? ` · Amount: ${action.amount}` : ''}
                  </Text>
                </Stack>
              </Card>
            ))}
          </Stack>
        )}
      </Stack>
    </Card>
  );
}
