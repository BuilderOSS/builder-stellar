import { Callout } from '@builder-stellar/web/ui/callout';
import { Disclosure } from '@builder-stellar/web/ui/disclosure';
import type { MDXComponents } from 'mdx/types';
import type { Route } from 'next';
import NextLink from 'next/link';
import type { ComponentProps } from 'react';

import { GlossaryList } from '@/components/glossary-list';
import { proseCode, proseH2, proseH3, proseLink, proseList, proseP, prosePre } from '@/components/prose';
import { Shot } from '@/components/shot';

function Link({ href = '', children, ...props }: ComponentProps<'a'>) {
  if (href.startsWith('/')) {
    return (
      <NextLink href={href as Route} className={proseLink}>
        {children}
      </NextLink>
    );
  }
  if (href.startsWith('#')) {
    return (
      <a href={href} className={proseLink} {...props}>
        {children}
      </a>
    );
  }
  return (
    <a href={href} className={proseLink} target="_blank" rel="noopener noreferrer" {...props}>
      {children}
    </a>
  );
}

/** Marks a page from the information architecture that has no content yet. */
function Placeholder() {
  return (
    <Callout
      title="This page is not written yet"
      description="It is planned. Each guide will follow the app screen by screen, with screenshots in your theme."
    />
  );
}

const components: MDXComponents = {
  h2: (props) => <h2 className={proseH2} {...props} />,
  h3: (props) => <h3 className={proseH3} {...props} />,
  p: (props) => <p className={proseP} {...props} />,
  ul: (props) => <ul className={proseList} {...props} />,
  ol: (props) => <ol className={proseList} {...props} />,
  a: Link,
  code: (props) => <code className={proseCode} {...props} />,
  pre: (props) => <pre className={prosePre} {...props} />,
  Callout,
  Disclosure,
  GlossaryList,
  Placeholder,
  Shot
};

export function useMDXComponents(): MDXComponents {
  return components;
}
