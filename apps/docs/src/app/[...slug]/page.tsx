import { ArrowLeft, ArrowRight } from 'lucide-react';
import type { Metadata } from 'next';
import NextLink from 'next/link';
import { notFound } from 'next/navigation';
import { css } from 'styled-system/css';

import { DocLayout } from '@/components/doc-layout';
import { prose } from '@/components/prose';
import { findPage, neighbours, pageHref, PAGES } from '@/lib/nav';
import { tocForSlug } from '@/lib/toc';

type Params = { slug: string[] };

export const dynamicParams = false;

export function generateStaticParams(): Params[] {
  return PAGES.map((page) => ({ slug: page.slug.split('/') }));
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const page = findPage((await params).slug.join('/'));
  if (!page) return {};
  return { title: page.title, description: page.summary, alternates: { canonical: pageHref(page.slug) } };
}

const crumb = css({ textStyle: 'label', color: 'ink.muted', m: '0', mb: '2' });
const title = css({ textStyle: 'display', color: 'ink', m: '0', textWrap: 'balance' });
const summary = css({ textStyle: 'subheading', fontWeight: '400', color: 'ink.muted', m: '0', mt: '3', mb: '8' });
const pager = css({
  display: 'grid',
  gridTemplateColumns: { base: '1fr', sm: '1fr 1fr' },
  gap: '3',
  mt: '16',
  pt: '6',
  borderTopWidth: '1px',
  borderColor: 'rule',
  maxW: '68ch'
});
const pagerLink = css({
  display: 'grid',
  gap: '1',
  p: '4',
  minH: 'touch',
  borderRadius: 'card',
  bg: 'surface',
  color: 'ink',
  textDecoration: 'none',
  transitionProperty: 'background-color, scale',
  transitionDuration: 'press',
  transitionTimingFunction: 'out',
  _active: { scale: '0.96' },
  '@media (hover: hover) and (pointer: fine)': { _hover: { bg: 'hover' } },
  '@media (prefers-reduced-motion: reduce)': { _active: { scale: '1' } },
  '&[data-next]': { textAlign: 'right', justifyItems: 'end', gridColumn: { sm: '2' } }
});
const pagerLabel = css({
  display: 'inline-flex',
  alignItems: 'center',
  gap: '1.5',
  textStyle: 'caption',
  color: 'ink.muted',
  '& svg': { width: '4', height: '4' }
});
const pagerTitle = css({ textStyle: 'label', fontSize: '0.9375rem' });

export default async function DocPage({ params }: { params: Promise<Params> }) {
  const slug = (await params).slug.join('/');
  const page = findPage(slug);
  if (!page) notFound();
  const { default: Content } = await import(`../../../content/${slug}.mdx`);
  const { previous, next } = neighbours(slug);

  return (
    <DocLayout toc={tocForSlug(slug)}>
      <article data-pagefind-body>
        <p className={crumb} data-pagefind-ignore>
          {page.section.title}
        </p>
        <h1 className={title}>{page.title}</h1>
        <p className={summary}>{page.summary}</p>
        <div className={prose}>
          <Content />
        </div>
      </article>
      <nav aria-label="Previous and next" className={pager}>
        {previous ? (
          <NextLink href={pageHref(previous.slug)} className={pagerLink} rel="prev">
            <span className={pagerLabel}>
              <ArrowLeft aria-hidden="true" />
              Previous
            </span>
            <span className={pagerTitle}>{previous.title}</span>
          </NextLink>
        ) : null}
        {next ? (
          <NextLink href={pageHref(next.slug)} className={pagerLink} rel="next" data-next="">
            <span className={pagerLabel}>
              Next
              <ArrowRight aria-hidden="true" />
            </span>
            <span className={pagerTitle}>{next.title}</span>
          </NextLink>
        ) : null}
      </nav>
    </DocLayout>
  );
}
