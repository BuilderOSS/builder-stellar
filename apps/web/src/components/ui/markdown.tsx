import { ArrowUpRight } from 'lucide-react';
import type { ComponentProps } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
import remarkGfm from 'remark-gfm';
import { css, cx } from 'styled-system/css';

import { FallbackImage } from './FallbackImage';

export type MarkdownVariant = 'rich' | 'comment';

/** Raw HTML is never parsed (no rehype-raw); the sanitizer also allows `ipfs:` images and links. */
const schema = {
  ...defaultSchema,
  protocols: {
    ...defaultSchema.protocols,
    href: ['https', 'http', 'mailto', 'ipfs'],
    src: ['https', 'http', 'ipfs']
  }
};

const SAFE_URL = /^(https?:|mailto:|ipfs:)/i;

/** Only absolute web, mail and IPFS addresses survive; anything else (javascript:, data:, relative) is dropped. */
export function safeMarkdownUrl(url: string) {
  const trimmed = url.trim();
  return SAFE_URL.test(trimmed) ? trimmed : null;
}

/** What a comment may use: inline formatting, links, lists, quotes and images. No headings or tables. */
const COMMENT_ELEMENTS = ['p', 'br', 'strong', 'em', 'del', 'a', 'ul', 'ol', 'li', 'code', 'pre', 'blockquote', 'img'];

const root = css({
  color: 'ink',
  textStyle: 'body',
  fontSize: '1rem',
  lineHeight: '1.7',
  overflowWrap: 'anywhere',
  '& > :first-child': { mt: '0' },
  '& > :last-child': { mb: '0' },
  '& p': { m: '0', mb: '3' },
  '& h2': { textStyle: 'heading', fontSize: '1.25rem', mt: '6', mb: '2' },
  '& h3': { textStyle: 'subheading', fontSize: '1.0625rem', mt: '5', mb: '2' },
  '& h4, & h5, & h6': { textStyle: 'label', fontSize: '0.9375rem', mt: '4', mb: '1.5' },
  '& ul, & ol': { m: '0', mb: '3', pl: '5' },
  // Preflight removes list markers; markdown lists need them back.
  '& ul': { listStyleType: 'disc' },
  '& ol': { listStyleType: 'decimal' },
  '& li::marker': { color: 'ink.muted' },
  '& li': { mb: '1' },
  '& li > p': { mb: '1' },
  '& strong': { fontWeight: '600' },
  '& a': {
    color: 'signal',
    textDecoration: 'underline',
    textUnderlineOffset: '3px',
    '& svg': { display: 'inline', width: '3.5', height: '3.5', ml: '0.5', verticalAlign: 'middle' }
  },
  '& blockquote': { m: '0', mb: '3', px: '3.5', py: '2.5', borderRadius: 'control', bg: 'hover', color: 'ink.muted' },
  '& blockquote > p:last-child': { mb: '0' },
  '& code': {
    textStyle: 'mono',
    fontSize: '0.875em',
    px: '1',
    py: '0.5',
    borderRadius: 'sm',
    bg: 'hover'
  },
  '& pre': {
    m: '0',
    mb: '3',
    p: '3',
    borderRadius: 'control',
    bg: 'hover',
    overflowX: 'auto',
    '& code': { p: '0', bg: 'transparent' }
  },
  '& hr': { border: '0', borderTopWidth: '1px', borderColor: 'rule', my: '5' },
  '& table': { width: '100%', borderCollapse: 'collapse', mb: '3', textStyle: 'caption', fontSize: '0.875rem' },
  '& th, & td': { py: '2', px: '2.5', textAlign: 'left', borderBottomWidth: '1px', borderColor: 'rule' },
  '& th': { color: 'ink.muted', fontWeight: '600' },
  '& input[type=checkbox]': { mr: '1.5', accentColor: 'var(--colors-signal)' }
});
const comment = css({
  fontSize: '0.9375rem',
  lineHeight: '1.6',
  '& p': { mb: '2' },
  // A picture in a comment supports the words; it shouldn't take over the thread.
  '& img': { maxH: '80', width: 'auto', my: '2' }
});
const image = css({
  display: 'block',
  maxW: '100%',
  height: 'auto',
  my: '3',
  borderRadius: 'card',
  outline: '1px solid',
  outlineColor: 'imageEdge'
});

// A 1×1 transparent GIF: when every gateway fails, the image collapses instead of showing a broken icon.
const EMPTY_IMAGE = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

function Link({ href, children, node: _node, ...props }: ComponentProps<'a'> & { node?: unknown }) {
  const external = typeof href === 'string' && /^(https?:|ipfs:)/i.test(href);
  return (
    <a
      {...props}
      href={href}
      target={external ? '_blank' : undefined}
      rel={external ? 'noopener noreferrer nofollow' : undefined}
    >
      {children}
      {external ? <ArrowUpRight aria-hidden="true" /> : null}
    </a>
  );
}

function Image({ src, alt, node: _node, ...props }: ComponentProps<'img'> & { node?: unknown }) {
  return (
    <FallbackImage
      {...props}
      src={typeof src === 'string' ? src : null}
      alt={alt ?? ''}
      loading="lazy"
      className={image}
      errorFallbackSrc={EMPTY_IMAGE}
    />
  );
}

// Headings move down one level, so a description can never add a second page <h1>.
const shifted = (Tag: 'h2' | 'h3' | 'h4' | 'h5' | 'h6') =>
  function Heading({ node: _node, ...props }: ComponentProps<'h2'> & { node?: unknown }) {
    return <Tag {...props} />;
  };

const RICH_COMPONENTS: Components = {
  a: Link,
  img: Image,
  h1: shifted('h2'),
  h2: shifted('h3'),
  h3: shifted('h4'),
  h4: shifted('h5'),
  h5: shifted('h6'),
  h6: shifted('h6')
};
const COMMENT_COMPONENTS: Components = { a: Link, img: Image };

/**
 * Member-written markdown (proposal descriptions, proposal comments). `rich` allows headings,
 * images and tables; `comment` keeps inline formatting, links, lists, quotes and images and unwraps the rest.
 */
export function Markdown({
  source,
  variant = 'rich',
  className
}: {
  source: string;
  variant?: MarkdownVariant;
  className?: string;
}) {
  const isComment = variant === 'comment';
  return (
    <div className={cx(root, isComment && comment, className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[[rehypeSanitize, schema]]}
        urlTransform={(url) => safeMarkdownUrl(url)}
        components={isComment ? COMMENT_COMPONENTS : RICH_COMPONENTS}
        allowedElements={isComment ? COMMENT_ELEMENTS : undefined}
        unwrapDisallowed
        skipHtml
      >
        {source}
      </ReactMarkdown>
    </div>
  );
}
