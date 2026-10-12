import { ExternalLink } from 'lucide-react';
import { css } from 'styled-system/css';
import { button } from 'styled-system/recipes';

import { Markdown } from '@/components/ui';
import type { DaoProfile } from '@/lib/dao-profile';
import { ipfsGatewayUrls } from '@/lib/ipfs-client';

const root = css({ display: 'grid', gap: '3', maxW: '68ch' });
const links = css({ display: 'flex', flexWrap: 'wrap', gap: '2' });
const unavailable = css({ textStyle: 'body', color: 'ink.muted', m: '0' });

/** A browser cannot open ipfs:// directly; use the first gateway. */
function openableUrl(url: string) {
  return url.startsWith('ipfs://') ? (ipfsGatewayUrls(url)?.[0] ?? url) : url;
}

/**
 * The community's description (markdown) and links. Shows nothing for an
 * empty profile, and a quiet notice when the indexed profile could not be
 * verified against the chain.
 */
export function CommunityProfileView({ profile, status }: { profile: DaoProfile; status: 'verified' | 'unavailable' }) {
  if (status === 'unavailable') return <p className={unavailable}>Profile unavailable right now.</p>;
  if (!profile.description.trim() && profile.links.length === 0) return null;
  return (
    <div className={root}>
      {profile.description.trim() ? <Markdown source={profile.description} /> : null}
      {profile.links.length > 0 ? (
        <div className={links}>
          {profile.links.map((link) => (
            <a
              key={`${link.label}:${link.url}`}
              href={openableUrl(link.url)}
              target="_blank"
              rel="noreferrer"
              className={button({ variant: 'secondary', size: 'sm' })}
            >
              {link.label}
              <ExternalLink size={14} aria-hidden />
            </a>
          ))}
        </div>
      ) : null}
    </div>
  );
}
