import type { ReactNode } from 'react';
import { css, cx } from 'styled-system/css';

const section = css({ display: 'grid', gap: '3', minW: '0' });
const head = css({ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '3', minH: '9' });
const titleClass = css({ textStyle: 'heading', margin: '0', color: 'ink' });
const descriptionClass = css({ textStyle: 'caption', color: 'ink.muted', margin: '0', mt: '0.5' });

/** A titled region of a page. The title is an h2 unless `level` says otherwise. */
export function Section({
  title,
  description,
  action,
  children,
  level = 2,
  id,
  className
}: {
  title?: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  level?: 2 | 3;
  id?: string;
  className?: string;
}) {
  const HeadingTag = level === 3 ? 'h3' : 'h2';
  return (
    <section className={cx(section, className)} aria-labelledby={title && id ? `${id}-title` : undefined} id={id}>
      {title || action ? (
        <div className={head}>
          <div>
            {title ? (
              <HeadingTag className={titleClass} id={id ? `${id}-title` : undefined}>
                {title}
              </HeadingTag>
            ) : null}
            {description ? <p className={descriptionClass}>{description}</p> : null}
          </div>
          {action}
        </div>
      ) : null}
      {children}
    </section>
  );
}
