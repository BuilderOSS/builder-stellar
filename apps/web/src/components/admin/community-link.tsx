'use client';

import { Client as ManagerClient } from '@builder-stellar/manager-bindings';
import { useEffect, useState } from 'react';
import { css } from 'styled-system/css';
import useSWR from 'swr';

import { Button, FieldHelperText, FieldLabel, Input } from '@/components/ui';
import { isValidSlug } from '@/lib/create-dao-schema';
import type { DaoNetworkConfig } from '@/lib/dao-config';
import { getDeploymentConfig } from '@/lib/deployment-config';
import { SLUG_CHANGE_WARNING } from '@/lib/proposal-actions/slug-actions';

const field = css({ display: 'grid', gap: '1.5', minW: '0', alignContent: 'start' });
const row = css({ display: 'flex', gap: '2', alignItems: 'center', flexWrap: 'wrap' });
const prefix = css({ textStyle: 'mono', fontSize: '0.8125rem', color: 'ink.muted' });
const input = css({ flex: '1', minW: '40' });
const hint = css({ textStyle: 'caption', color: 'ink.muted', m: '0' });
const error = css({ textStyle: 'caption', color: 'danger', fontWeight: '600', m: '0' });

/** `change_slug` arrived in Manager 0.2.0. */
export function managerSupportsSlugChange(version: string | undefined) {
  if (!version) return false;
  const [major, minor] = version.split('.').map((part) => Number.parseInt(part, 10));
  return major > 0 || (major === 0 && minor >= 2);
}

function useManagerVersion(config: DaoNetworkConfig, readSource?: string) {
  return useSWR(['manager-version', config.rpcUrl], async () => {
    const client = new ManagerClient({
      contractId: getDeploymentConfig().managerAddress,
      rpcUrl: config.rpcUrl,
      networkPassphrase: config.passphrase,
      publicKey: readSource,
      allowHttp: config.rpcUrl.startsWith('http://')
    });
    return (await client.version()).result;
  });
}

type Availability = { valid: boolean; claimedBy?: string | null; message?: string };

function useAvailability(slug: string) {
  const [debounced, setDebounced] = useState(slug);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(slug), 400);
    return () => clearTimeout(timer);
  }, [slug]);
  const { data } = useSWR<Availability>(isValidSlug(debounced) ? `/api/slugs/${debounced}` : null, (url: string) =>
    fetch(url, { cache: 'no-store' }).then((response) => response.json())
  );
  return debounced === slug ? data : undefined;
}

/**
 * The community's /dao/ link. A launched community can move to a new one by vote; it is proposed
 * on its own, since a link someone takes first would fail every other action in the proposal.
 */
export function CommunityLinkField({
  config,
  routeId,
  live,
  canPropose,
  readSource,
  onPropose
}: {
  config: DaoNetworkConfig;
  routeId: string;
  live: boolean;
  canPropose: boolean;
  readSource?: string;
  onPropose: (slug: string) => void;
}) {
  const manager = useManagerVersion(config, readSource);
  const [slug, setSlug] = useState('');
  const availability = useAvailability(slug);
  const supported = managerSupportsSlugChange(manager.data);
  const editable = live && canPropose && Boolean(config.slug) && supported;

  if (!editable)
    return (
      <div className={field}>
        <span className={css({ textStyle: 'label', color: 'ink' })}>Link</span>
        <p className={hint}>/dao/{routeId}</p>
        <FieldHelperText>
          {!live
            ? 'Your link is claimed at launch.'
            : supported
              ? 'Members can change it by vote.'
              : 'Changing it needs a newer platform release.'}
        </FieldHelperText>
      </div>
    );

  const trimmed = slug.trim();
  const problem = !trimmed
    ? ''
    : !isValidSlug(trimmed)
      ? 'Use 4-63 lowercase letters, numbers or single hyphens'
      : trimmed === config.slug
        ? 'This is already your link'
        : availability?.claimedBy
          ? 'Another community has this link'
          : '';
  const ready = Boolean(trimmed) && !problem && availability?.valid === true && !availability.message;

  return (
    <div className={field}>
      <FieldLabel htmlFor="profile-link">Link</FieldLabel>
      <div className={row}>
        <span className={prefix}>/dao/</span>
        <Input
          id="profile-link"
          className={input}
          value={slug}
          placeholder={config.slug ?? ''}
          maxLength={63}
          spellCheck={false}
          aria-invalid={Boolean(problem) || undefined}
          aria-describedby="profile-link-hint"
          onChange={(event) => setSlug(event.target.value.toLowerCase())}
        />
        <Button
          variant="secondary"
          disabled={!ready}
          onClick={() => {
            onPropose(trimmed);
            setSlug('');
          }}
        >
          Propose the link change
        </Button>
      </div>
      {problem ? (
        <p className={error} role="alert">
          {problem}
        </p>
      ) : null}
      <FieldHelperText id="profile-link-hint">
        Now /dao/{config.slug}. {SLUG_CHANGE_WARNING} It goes in its own proposal.
      </FieldHelperText>
    </div>
  );
}
