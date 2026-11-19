import { ListRow } from '@builder-stellar/web/ui/list-row';
import { ChevronRight } from 'lucide-react';
import { css } from 'styled-system/css';

import { NotFoundSearch } from '@/components/not-found-search';
import { pageHref, PATHS } from '@/lib/nav';

const main = css({ maxW: '760px', mx: 'auto', px: { base: '4', md: '6' }, pt: '16', pb: '20', outline: 'none' });
const title = css({ textStyle: 'display', color: 'ink', m: '0' });
const lead = css({ textStyle: 'body', fontSize: '1.0625rem', color: 'ink.muted', m: '0', mt: '3' });
const list = css({ listStyle: 'none', m: '0', p: '0', my: '8', display: 'grid' });

export default function NotFound() {
  return (
    <main id="content" tabIndex={-1} className={main} data-pagefind-ignore="all">
      <h1 className={title}>Page not found</h1>
      <p className={lead}>
        This page may have moved, or it does not exist. Choose a starting point or search the docs.
      </p>
      <ul className={list} aria-label="Where to begin">
        {PATHS.map((path) => (
          <ListRow
            key={path.slug}
            as="li"
            href={pageHref(path.slug)}
            title={path.title}
            meta={path.meta}
            trailing={<ChevronRight aria-hidden="true" />}
          />
        ))}
      </ul>
      <NotFoundSearch />
    </main>
  );
}
