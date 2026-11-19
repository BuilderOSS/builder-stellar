import { ListRow } from '@builder-stellar/web/ui/list-row';
import { ChevronRight, Hammer, UsersRound } from 'lucide-react';
import NextLink from 'next/link';
import { Fragment } from 'react';
import { css } from 'styled-system/css';

import { proseLink } from '@/components/prose';
import { Shot } from '@/components/shot';
import { CORE_IDEAS, pageHref, PATHS } from '@/lib/nav';

// A Read-mode index, not a marketing page (decision 1A): a headline, two paths, the core
// ideas, and one tribe's story. No hero art, no card grid, no call-to-action buttons.

const main = css({
  maxW: '760px',
  mx: 'auto',
  px: { base: '4', md: '6' },
  pt: { base: '10', md: '16' },
  pb: '20',
  outline: 'none'
});
const title = css({ textStyle: 'display', color: 'ink', m: '0' });
const lead = css({ fontSize: '1.0625rem', lineHeight: '1.6', color: 'ink', m: '0', mt: '4', maxW: '60ch' });
const daoLine = css({ textStyle: 'body', color: 'ink.muted', m: '0', mt: '1', maxW: '60ch' });
const sectionTitle = css({ textStyle: 'heading', color: 'ink', m: '0', mb: '3' });
const paths = css({ listStyle: 'none', m: '0', p: '0', mt: '10', mb: '12', display: 'grid' });
const pathIcon = css({
  display: 'grid',
  placeItems: 'center',
  width: '10',
  height: '10',
  borderRadius: 'control',
  bg: 'signal.wash',
  color: 'signal',
  '& svg': { width: '5', height: '5' }
});
const ideas = css({
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  gap: '2',
  m: '0',
  mb: '12',
  fontSize: '1.0625rem'
});
const dot = css({ color: 'ink.muted' });
const ideaLink = css({ display: 'inline-flex', alignItems: 'center', minH: 'touch' });
const strip = css({ borderTopWidth: '1px', borderColor: 'rule', pt: '8' });
const stripText = css({ textStyle: 'body', color: 'ink.muted', m: '0' });

export default function HomePage() {
  return (
    <main id="content" tabIndex={-1} className={main} data-pagefind-body>
      <h1 className={title}>Pull up a chair</h1>
      <p className={lead}>
        Everything you need to start a tribe or join one, in plain words, with the app’s own screens.
      </p>
      <p className={daoLine}>A tribe is a DAO on Stellar: a shared treasury, onchain votes and NFT membership.</p>

      <ul className={paths} aria-label="Where to begin">
        {PATHS.map((path, index) => (
          <ListRow
            key={path.slug}
            as="li"
            href={pageHref(path.slug)}
            wrap
            media={
              <span className={pathIcon}>
                {index === 0 ? <UsersRound aria-hidden="true" /> : <Hammer aria-hidden="true" />}
              </span>
            }
            title={path.title}
            meta={path.meta}
            trailing={<ChevronRight aria-hidden="true" />}
          />
        ))}
      </ul>

      <section aria-labelledby="core-ideas">
        <h2 id="core-ideas" className={sectionTitle}>
          Core ideas
        </h2>
        <p className={ideas}>
          {CORE_IDEAS.map((idea, index) => (
            <Fragment key={idea.slug}>
              {index > 0 ? (
                <span className={dot} aria-hidden="true">
                  ·
                </span>
              ) : null}
              <NextLink href={pageHref(idea.slug)} className={`${proseLink} ${ideaLink}`}>
                {idea.label}
              </NextLink>
            </Fragment>
          ))}
        </p>
      </section>

      <section aria-labelledby="one-tribe" className={strip}>
        <h2 id="one-tribe" className={sectionTitle}>
          Follow one tribe from first meeting to first decision
        </h2>
        <p className={stripText}>
          Every guide follows the same tribe, so each screen picks up where the last one left off.
        </p>
        <Shot id="home/showcase" alt="The showcase tribe’s home page, with its first proposal open for votes" />
      </section>
    </main>
  );
}
