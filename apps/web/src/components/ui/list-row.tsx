import { ArrowUpRight } from 'lucide-react';
import type { Route } from 'next';
import NextLink from 'next/link';
import type { ReactNode } from 'react';
import { css, sva } from 'styled-system/css';

const row = sva({
  slots: ['root', 'media', 'body', 'title', 'meta', 'trailing'],
  base: {
    root: {
      display: 'flex',
      alignItems: 'center',
      gap: '3',
      minH: '14',
      py: '3',
      px: '1',
      color: 'ink',
      textDecoration: 'none',
      borderBottomWidth: '1px',
      borderColor: 'rule',
      _last: { borderBottomWidth: '0' }
    },
    media: { flexShrink: '0', display: 'inline-flex' },
    body: { flex: '1', minW: '0', display: 'grid', gap: '0.5' },
    title: {
      textStyle: 'body',
      fontWeight: '600',
      color: 'ink',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap'
    },
    meta: { textStyle: 'caption', color: 'ink.muted', overflowWrap: 'anywhere' },
    trailing: { flexShrink: '0', display: 'flex', alignItems: 'center', gap: '2', color: 'ink.muted' }
  },
  variants: {
    interactive: {
      true: {
        root: {
          mx: '-2',
          px: '3',
          borderRadius: 'control',
          borderBottomWidth: '0',
          transitionProperty: 'background-color',
          transitionDuration: 'fast',
          '@media (hover: hover) and (pointer: fine)': { _hover: { bg: 'hover' } },
          _focusVisible: { outline: '2px solid', outlineColor: 'signal', outlineOffset: '-2px' }
        }
      }
    },
    wrap: {
      true: { title: { whiteSpace: 'normal' } }
    }
  }
});

const externalIcon = css({ width: '4', height: '4', color: 'ink.muted' });

/**
 * The default way to show a thing in a list: media, title, meta, trailing.
 * Pass `href` to make the whole row a link.
 */
export function ListRow({
  media,
  title,
  meta,
  trailing,
  href,
  wrap,
  external = false,
  as: As = 'div'
}: {
  media?: ReactNode;
  title: ReactNode;
  meta?: ReactNode;
  trailing?: ReactNode;
  href?: string;
  wrap?: boolean;
  /** `href` is another site (the guides): a plain link that opens in a new tab. */
  external?: boolean;
  as?: 'div' | 'li';
}) {
  const classes = row({ interactive: Boolean(href), wrap });
  const content = (
    <>
      {media ? <span className={classes.media}>{media}</span> : null}
      <span className={classes.body}>
        <span className={classes.title}>{title}</span>
        {meta ? <span className={classes.meta}>{meta}</span> : null}
      </span>
      {trailing || external ? (
        <span className={classes.trailing}>
          {trailing ?? <ArrowUpRight aria-hidden="true" className={externalIcon} />}
        </span>
      ) : null}
    </>
  );

  if (href) {
    const link = external ? (
      <a href={href} className={classes.root} target="_blank" rel="noopener noreferrer">
        {content}
        <span className="sr-only"> (opens in a new tab)</span>
      </a>
    ) : (
      <NextLink href={href as Route} className={classes.root}>
        {content}
      </NextLink>
    );
    return As === 'li' ? <li>{link}</li> : link;
  }
  return <As className={classes.root}>{content}</As>;
}
