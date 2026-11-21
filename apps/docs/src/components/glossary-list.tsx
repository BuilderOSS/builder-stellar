import { glossaryEntries } from '@builder-stellar/glossary';
import { css } from 'styled-system/css';

const list = css({ m: '0', display: 'grid', gap: '6', mt: '6' });
const term = css({ textStyle: 'heading', color: 'ink', scrollMarginTop: '28' });
const plain = css({ m: '0', mt: '1' });
const dao = css({ m: '0', mt: '1', color: 'ink.muted', fontSize: '0.9375rem' });

/** The docs glossary, from packages/glossary: the same copy as the app's GlossaryTerm popovers. */
export function GlossaryList() {
  return (
    <dl className={list}>
      {glossaryEntries().map((entry) => (
        <div key={entry.key}>
          <dt id={entry.slug} className={term}>
            {entry.term}
          </dt>
          <dd className={css({ m: '0' })}>
            <p className={plain}>{entry.plain}</p>
            <p className={dao}>{entry.dao}</p>
          </dd>
        </div>
      ))}
    </dl>
  );
}
