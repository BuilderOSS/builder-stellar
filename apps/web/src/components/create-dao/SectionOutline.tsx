'use client';
import { Check, Lock } from 'lucide-react';
import { useEffect, useState } from 'react';
import { css } from 'styled-system/css';

export type OutlineSection = { id: string; title: string; complete: boolean; locked?: boolean };

/** Distance from the viewport top where a section counts as "being read" (top bar + breathing room). */
const READING_LINE = 140;

const nav = css({ position: 'sticky', top: '84px', display: 'grid', gap: '3' });
const caption = css({ textStyle: 'caption', color: 'ink.muted', m: '0' });
const list = css({ listStyle: 'none', p: '0', m: '0', display: 'grid', gap: '0.5' });
const link = css({
  display: 'flex',
  alignItems: 'center',
  gap: '2.5',
  minH: '36px',
  px: '2.5',
  borderRadius: 'control',
  color: 'ink.muted',
  textStyle: 'label',
  textDecoration: 'none',
  transitionProperty: 'color, background-color',
  transitionDuration: 'fast',
  transitionTimingFunction: 'ease',
  '@media (hover: hover) and (pointer: fine)': { _hover: { bg: 'hover', color: 'ink' } },
  '&[aria-current]': { color: 'ink', bg: 'hover' },
  _focusVisible: { outline: '2px solid', outlineColor: 'signal', outlineOffset: '2px' },
  '&[aria-disabled=true]': { color: 'ink.faint', cursor: 'default', _hover: { bg: 'transparent', color: 'ink.faint' } }
});
// Number and check share one slot; the check cross-fades in when a section is complete.
const marker = css({
  position: 'relative',
  display: 'grid',
  placeItems: 'center',
  width: '5',
  height: '5',
  flexShrink: '0',
  textStyle: 'mono',
  fontSize: '0.75rem',
  '& > *': {
    gridArea: '1 / 1',
    transitionProperty: 'opacity, transform, filter',
    transitionDuration: '200ms',
    transitionTimingFunction: 'cubic-bezier(0.2, 0, 0, 1)'
  },
  '& [data-part=check]': { color: 'signal', opacity: '0', transform: 'scale(0.25)', filter: 'blur(4px)' },
  '&[data-complete] [data-part=check]': { opacity: '1', transform: 'scale(1)', filter: 'blur(0px)' },
  '&[data-complete] [data-part=number]': { opacity: '0', transform: 'scale(0.25)', filter: 'blur(4px)' },
  _motionReduce: { '& > *': { transitionProperty: 'opacity' } }
});

/** Sticky "On this page" list for the long create form: jump to a section, see which are done. */
export function SectionOutline({ sections }: { sections: OutlineSection[] }) {
  const [active, setActive] = useState(sections[0]?.id ?? '');
  const ids = sections.map((section) => section.id).join(',');

  useEffect(() => {
    const targets = ids.split(',');
    let frame = 0;
    const measure = () => {
      frame = 0;
      let current = targets[0];
      for (const id of targets) {
        const top = document.getElementById(id)?.getBoundingClientRect().top;
        if (top !== undefined && top <= READING_LINE) current = id;
      }
      // At the very bottom the last section can't scroll up to the line; it is still the one being read.
      if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4) {
        current = targets[targets.length - 1];
      }
      setActive(current);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };
    measure();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, [ids]);

  return (
    <nav aria-label="Sections" className={nav}>
      <p className={caption}>On this page</p>
      <ol className={list}>
        {sections.map((section, index) => (
          <li key={section.id}>
            {section.locked ? (
              <span className={link} aria-disabled="true">
                <span className={marker}>
                  <Lock aria-hidden="true" size={14} strokeWidth={1.75} />
                </span>
                {section.title}
                <span className="sr-only"> (finish the section before it first)</span>
              </span>
            ) : (
              <a
                href={`#${section.id}`}
                className={link}
                aria-current={active === section.id ? 'location' : undefined}
                onClick={(event) => {
                  const target = document.getElementById(section.id);
                  if (!target) return;
                  event.preventDefault();
                  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
                  target.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
                  // Move focus with the reader so keyboard and screen-reader users land in the section too.
                  target.focus({ preventScroll: true });
                  history.replaceState(null, '', `#${section.id}`);
                }}
              >
                <span className={marker} data-complete={section.complete ? '' : undefined}>
                  <span data-part="number" aria-hidden="true">
                    {index + 1}
                  </span>
                  <Check data-part="check" size={16} strokeWidth={2} aria-hidden="true" />
                </span>
                {section.title}
                {section.complete ? <span className="sr-only"> (done)</span> : null}
              </a>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
