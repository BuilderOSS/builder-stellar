import { css } from 'styled-system/css';

import { BrandMark } from '@/components/shell/brand-mark';
import { ButtonLink } from '@/components/ui';

const wrap = css({ display: 'grid', justifyItems: 'start', gap: '4', py: { base: '8', md: '16' }, maxW: '52ch' });
const title = css({ textStyle: 'title', fontSize: { base: '1.75rem', md: '2.25rem' }, m: '0' });
const body = css({ textStyle: 'body', color: 'ink.muted', m: '0' });
const actions = css({ display: 'flex', flexWrap: 'wrap', gap: '2' });

export default function NotFound() {
  return (
    <section className={wrap}>
      <BrandMark size={48} />
      <h1 className={title}>Lost your noggles?</h1>
      <p className={body}>
        This page doesn&apos;t exist, or the link is out of date. Your communities are right where you left them.
      </p>
      <div className={actions}>
        <ButtonLink href="/">Go home</ButtonLink>
        <ButtonLink href="/discover" variant="secondary">
          Find a community
        </ButtonLink>
      </div>
    </section>
  );
}
