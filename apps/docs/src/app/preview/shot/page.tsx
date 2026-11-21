import type { Metadata } from 'next';
import { css } from 'styled-system/css';

import { prose } from '@/components/prose';
import { Shot } from '@/components/shot';

// A component preview for <Shot>, kept out of the nav, search and search engines. The
// fixture is the app's /design catalogue, captured once by hand (docs/DOCS_SITE.md).
export const metadata: Metadata = { title: 'Screenshot preview', robots: { index: false, follow: false } };

const main = css({ maxW: '900px', mx: 'auto', px: { base: '4', md: '6' }, py: '10', outline: 'none' });
const title = css({ textStyle: 'title', m: '0', mb: '4' });

export default function ShotPreview() {
  return (
    <main id="content" tabIndex={-1} className={main} data-pagefind-ignore="all">
      <h1 className={title}>Screenshot preview</h1>
      <div className={prose}>
        <p>A captured shot with one marker, then one that hasn’t been captured yet.</p>
        <Shot
          id="_preview/design-catalogue"
          alt="The design catalogue in the app, with the Open dialog button at the top right"
          caption="The design catalogue, in your theme and device."
        />
        <Shot id="_preview/not-captured" alt="A step whose screenshot hasn’t been captured yet" />
      </div>
    </main>
  );
}
