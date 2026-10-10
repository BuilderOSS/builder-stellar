'use client';

import { useState } from 'react';
import { Stack } from 'styled-system/jsx';

import { Button, Callout, Card, Text } from '@/components/ui';
import { type DaoNetworkConfig, isDaoAdmin } from '@/lib/dao-config';
import { useTransactionFeedback } from '@/lib/transaction-feedback';
import { describeMissing, planArtworkBumpWindows, pluralDays, type TtlStatus } from '@/lib/ttl-expiry';
import { sendArtworkBumpWindow, useDaoTtlReport } from '@/lib/ttl-expiry-queries';
import type { ArtworkTtlSection, TtlSection } from '@/lib/ttl-expiry-rpc';
import { useAuthSessionStore } from '@/stores/auth-session-store';

const RENEWAL_DOC = 'docs/TTL_ECONOMICS.md';
const RENEWAL_SCRIPT = 'scripts/renew-code-ttl.mjs';

function formatDate(date: Date | null): string | null {
  if (!date) return null;
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function sectionDaysText(section: TtlSection): string {
  const days = section.assessment.remainingDays ?? 0;
  const date = formatDate(section.expiresAt);
  return `expires in ${pluralDays(days)}${date ? ` (about ${date})` : ''}`;
}

function missingNote(section: TtlSection): string | null {
  const labels = section.assessment.missingLabels;
  return labels.length > 0 ? `Missing or archived: ${describeMissing(labels)}.` : null;
}

const STATUS_BADGE: Record<Exclude<TtlStatus, 'healthy'>, string> = {
  soon: 'Expiring soon',
  critical: 'Critical',
  expired: 'Expired'
};

function calloutVariant(status: Exclude<TtlStatus, 'healthy'>): 'warning' | 'error' {
  return status === 'soon' ? 'warning' : 'error';
}

function CodeBanner({ section }: { section: TtlSection }) {
  const status = section.assessment.status as Exclude<TtlStatus, 'healthy'>;
  const days = section.assessment.remainingDays ?? 0;
  const date = formatDate(section.expiresAt);
  const missing = missingNote(section);

  const title =
    status === 'expired' ? 'Shared contract code has expired' : `Shared contract code expires in ${pluralDays(days)}`;
  const description =
    status === 'expired'
      ? `The platform operator must restore and renew it with ${RENEWAL_SCRIPT} (see ${RENEWAL_DOC}). Expired code must be restored before any DAO call works.`
      : `The platform operator renews it with ${RENEWAL_SCRIPT} (see ${RENEWAL_DOC}). Until renewed, the first DAO creator pays the rent, and expired code must be restored before any DAO call works.`;

  return (
    <Callout
      variant={calloutVariant(status)}
      badge={STATUS_BADGE[status]}
      title={title}
      description={[description, date && status !== 'expired' ? `Estimated expiry: ${date}.` : null, missing]
        .filter(Boolean)
        .join(' ')}
    />
  );
}

function ArtworkBanner({
  artwork,
  canRenew,
  busy,
  progress,
  onRenew
}: {
  artwork: ArtworkTtlSection;
  canRenew: boolean;
  busy: boolean;
  progress: { done: number; total: number } | null;
  onRenew: () => void;
}) {
  const status = artwork.assessment.status as Exclude<TtlStatus, 'healthy'>;
  const expired = status === 'expired';
  const windows = planArtworkBumpWindows(artwork.totalEntries).length;
  const date = formatDate(artwork.expiresAt);
  const missing = missingNote(artwork);

  const title = expired
    ? 'Artwork has expired'
    : `Artwork expires in ${pluralDays(artwork.assessment.remainingDays ?? 0)}`;
  const costNote = `Renewal runs in ${windows} ${windows === 1 ? 'window' : 'windows'} of up to 50 entries; each window is one transaction and costs a small fee.`;
  const restoreNote = expired
    ? ' Expired entries are restored first, which is paid and may ask for an extra signature.'
    : '';
  const description = [costNote + restoreNote, date && !expired ? `Estimated expiry: ${date}.` : null, missing]
    .filter(Boolean)
    .join(' ');

  const label = busy
    ? `Renewing artwork${progress ? ` (${progress.done} of ${progress.total})` : ''}...`
    : expired
      ? 'Artwork expired: restore and renew'
      : 'Artwork expiring: renew';

  return (
    <Callout variant={calloutVariant(status)} badge={STATUS_BADGE[status]} title={title} description={description}>
      {canRenew ? (
        <div>
          <Button type="button" onClick={onRenew} disabled={busy}>
            {label}
          </Button>
        </div>
      ) : null}
    </Callout>
  );
}

export function TtlExpiryPanel({ config }: { config: DaoNetworkConfig }) {
  const session = useAuthSessionStore();
  const { data: report, error, isLoading, mutate } = useDaoTtlReport(config);
  const tx = useTransactionFeedback(config.name);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [renewError, setRenewError] = useState('');

  const canRenew = isDaoAdmin(config, session.address);

  async function renewArtwork() {
    const artwork = report?.artwork;
    if (!session.address || !artwork) return;

    const windows = planArtworkBumpWindows(artwork.totalEntries);
    setBusy(true);
    setRenewError('');
    setProgress({ done: 0, total: windows.length });

    try {
      for (const [index, window] of windows.entries()) {
        const step = `${index + 1} of ${windows.length}`;
        tx.start(`Renewing artwork (${step})...`);
        const hash = await sendArtworkBumpWindow(config, session.address, window, artwork.totalEntries, (submitted) =>
          tx.submitted(`Artwork renewal ${step} submitted`, submitted)
        );
        tx.success(`Artwork renewal ${step} confirmed`, hash);
        setProgress({ done: index + 1, total: windows.length });
      }
      await mutate();
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Artwork renewal failed');
      setRenewError(error.message);
      tx.fail(error, 'Artwork renewal failed', 'metadata');
      // Re-read so the banner reflects the windows that did confirm.
      await mutate();
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  if (!report) {
    if (error) {
      return (
        <Callout
          variant="warning"
          badge="Unavailable"
          title="Could not read contract expiry"
          description={`The TTLs of this DAO's contracts could not be checked, so they are not shown as healthy. ${error instanceof Error ? error.message : ''}`.trim()}
        />
      );
    }
    return isLoading ? <Text size="sm">Checking contract expiry...</Text> : null;
  }

  const code = report.code;
  const codeStatus = code.assessment.status;
  const artwork = report.artwork;
  const artworkStatus = artwork?.assessment.status ?? 'healthy';

  const healthyLines: string[] = [];
  if (codeStatus === 'healthy') healthyLines.push(`Shared contract code: healthy, ${sectionDaysText(code)}.`);
  if (artwork && artworkStatus === 'healthy') {
    healthyLines.push(`Artwork: healthy, ${sectionDaysText(artwork)}.`);
  }
  const unchecked =
    code.unconfigured.length > 0 ? `Not checked (no address configured): ${code.unconfigured.join(', ')}.` : null;

  return (
    <Stack gap="3">
      {codeStatus !== 'healthy' ? <CodeBanner section={code} /> : null}
      {artwork && artworkStatus !== 'healthy' ? (
        <ArtworkBanner
          artwork={artwork}
          canRenew={canRenew}
          busy={busy}
          progress={progress}
          onRenew={() => void renewArtwork()}
        />
      ) : null}
      {error ? <Text size="sm">Could not refresh contract expiry; the figures below may be out of date.</Text> : null}
      {renewError ? <Callout variant="error" title="Artwork renewal did not finish" description={renewError} /> : null}
      {healthyLines.length > 0 || unchecked ? (
        <Card p="4">
          <Stack gap="1">
            {healthyLines.map((line) => (
              <Text key={line} size="sm">
                {line}
              </Text>
            ))}
            {unchecked ? <Text size="sm">{unchecked}</Text> : null}
          </Stack>
        </Card>
      ) : null}
    </Stack>
  );
}
