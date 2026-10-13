'use client';

import { Plus, Trash2 } from 'lucide-react';
import { css } from 'styled-system/css';

import { Button, FieldLabel, IconButton, Input } from '@/components/ui';
import { isProfileLinkUrl, MAX_LINK_LABEL, MAX_PROFILE_LINKS, type ProfileLink } from '@/lib/dao-profile';

const list = css({ display: 'grid', gap: '3', m: '0', p: '0', listStyle: 'none' });
const row = css({
  display: 'grid',
  gap: '2',
  alignItems: 'start',
  gridTemplateColumns: { base: 'minmax(0, 1fr) auto', sm: 'minmax(0, 10rem) minmax(0, 1fr) auto' }
});
const url = css({ gridColumn: { base: '1 / 2', sm: 'auto' } });
const remove = css({ gridRow: { base: '1 / 3', sm: 'auto' }, gridColumn: { base: '2', sm: 'auto' } });
const error = css({ textStyle: 'caption', color: 'danger', fontWeight: '600', m: '0', gridColumn: '1 / -1' });
const hint = css({ textStyle: 'caption', color: 'ink.muted', m: '0' });

function rowProblem(link: ProfileLink): string | null {
  if (!link.label.trim() && !link.url.trim()) return null;
  if (!link.label.trim()) return 'Give this link a label.';
  if ([...link.label.trim()].length > MAX_LINK_LABEL) return `Labels are at most ${MAX_LINK_LABEL} characters.`;
  if (!isProfileLinkUrl(link.url)) return 'Links start with https://, http://, mailto: or ipfs://.';
  return null;
}

/**
 * Up to eight labelled links for the community profile (website, chat,
 * socials). Labels are what people see; the address opens in a new tab.
 */
export function ProfileLinksEditor({
  id,
  links,
  onChange,
  disabled
}: {
  id: string;
  links: ProfileLink[];
  onChange: (links: ProfileLink[]) => void;
  disabled?: boolean;
}) {
  const update = (index: number, patch: Partial<ProfileLink>) =>
    onChange(links.map((link, i) => (i === index ? { ...link, ...patch } : link)));
  return (
    <div className={css({ display: 'grid', gap: '2' })}>
      <FieldLabel htmlFor={links.length ? `${id}-label-0` : `${id}-add`}>Links</FieldLabel>
      {links.length ? (
        <ul className={list}>
          {links.map((link, index) => {
            const problem = rowProblem(link);
            return (
              <li key={index} className={row}>
                <Input
                  id={`${id}-label-${index}`}
                  aria-label={`Link ${index + 1} label`}
                  placeholder="Website"
                  value={link.label}
                  maxLength={MAX_LINK_LABEL * 2}
                  disabled={disabled}
                  aria-invalid={Boolean(problem) || undefined}
                  onChange={(event) => update(index, { label: event.target.value })}
                />
                <Input
                  className={url}
                  aria-label={`Link ${index + 1} address`}
                  placeholder="https://"
                  type="url"
                  inputMode="url"
                  spellCheck={false}
                  autoCapitalize="none"
                  value={link.url}
                  disabled={disabled}
                  aria-invalid={Boolean(problem) || undefined}
                  onChange={(event) => update(index, { url: event.target.value })}
                />
                <IconButton
                  className={remove}
                  label={`Remove link ${index + 1}`}
                  disabled={disabled}
                  onClick={() => onChange(links.filter((_, i) => i !== index))}
                >
                  <Trash2 aria-hidden="true" />
                </IconButton>
                {problem ? <p className={error}>{problem}</p> : null}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className={hint}>Add a website, chat or social link so people can find you.</p>
      )}
      <div>
        <Button
          id={`${id}-add`}
          variant="ghost"
          size="sm"
          disabled={disabled || links.length >= MAX_PROFILE_LINKS}
          onClick={() => onChange([...links, { label: '', url: '' }])}
        >
          <Plus aria-hidden="true" />
          {links.length >= MAX_PROFILE_LINKS ? `${MAX_PROFILE_LINKS} links is the most` : 'Add a link'}
        </Button>
      </div>
    </div>
  );
}
