import type { CSSProperties } from 'react';
import { css, cx } from 'styled-system/css';

import { ShotDeviceToggle } from '@/components/shot-device-toggle';
import { loadShot, type ShotVariant } from '@/lib/shots';

// The frame is device-agnostic: a 1px image outline and concentric radii (frame radius 16
// = image radius 8 + padding 8). No drop shadows. Images load lazily into fixed aspect
// ratios, so there is no layout shift. Docs plan §5.4 and §5.6.

const figure = css({ display: 'grid', gap: '2', m: '0', my: '6' });
const frame = css({
  p: '2',
  borderRadius: 'card',
  bg: 'surface',
  boxShadow: 'inset 0 0 0 1px token(colors.imageEdge)'
});
// Which device shows: the reader's (under 768px, mobile) unless they picked one with the
// toggle, which sets data-shot-device on <html> for every figure, for the session.
const pane = css({
  position: 'relative',
  mx: 'auto',
  '&[data-device=mobile]': { maxW: '360px', display: { base: 'block', md: 'none' } },
  '&[data-device=desktop]': { display: { base: 'none', md: 'block' } },
  '[data-shot-device=mobile] &': {
    '&[data-device=mobile]': { display: 'block' },
    '&[data-device=desktop]': { display: 'none' }
  },
  '[data-shot-device=desktop] &': {
    '&[data-device=desktop]': { display: 'block' },
    '&[data-device=mobile]': { display: 'none' }
  },
  // One device captured: always show it.
  '&[data-only]': { display: 'block' }
});
const image = css({
  display: 'block',
  width: '100%',
  height: 'auto',
  borderRadius: 'lg',
  bg: 'raised',
  outline: '1px solid token(colors.imageEdge)',
  outlineOffset: '-1px'
});
// The picture follows the docs theme ([data-theme], set before paint from the reader's choice
// or the system). Hidden lazy images are never fetched.
const lightOnly = css({ _dark: { display: 'none' } });
const darkOnly = css({ _light: { display: 'none' } });
const overlay = css({ position: 'absolute', inset: '0', pointerEvents: 'none' });
const ring = css({
  position: 'absolute',
  left: 'var(--marker-x)',
  top: 'var(--marker-y)',
  width: 'var(--marker-w)',
  height: 'var(--marker-h)',
  // Outside the target by 4px, at the control radius plus 4px.
  m: '-1',
  borderWidth: '2px',
  borderColor: 'signal',
  borderRadius: 'calc(token(radii.control) + 4px)'
});
const disc = css({
  position: 'absolute',
  top: '-2.5',
  left: '-2.5',
  display: 'grid',
  placeItems: 'center',
  width: '5',
  height: '5',
  borderRadius: 'full',
  // `primary`, not `signal`: white digits on the dark-theme signal blue miss AA (3.6:1).
  bg: 'primary',
  color: 'primary.fg',
  fontFamily: 'body',
  fontWeight: '700',
  fontSize: '0.75rem',
  lineHeight: '1',
  fontVariantNumeric: 'tabular-nums'
});
const missing = css({
  display: 'grid',
  placeItems: 'center',
  aspectRatio: '16 / 10',
  borderRadius: 'lg',
  bg: 'raised',
  color: 'ink.muted',
  textStyle: 'body'
});
const caption = css({ textStyle: 'caption', color: 'ink.muted', textAlign: 'center' });

function Pane({ variant, alt, only }: { variant: ShotVariant; alt: string; only: boolean }) {
  return (
    <div className={pane} data-device={variant.device} data-only={only ? '' : undefined}>
      {/* eslint-disable-next-line @next/next/no-img-element -- static export: images are pre-sized webp */}
      <img
        className={cx(image, lightOnly)}
        src={variant.src.light}
        width={variant.width}
        height={variant.height}
        alt={alt}
        loading="lazy"
        decoding="async"
      />
      {/* eslint-disable-next-line @next/next/no-img-element -- as above */}
      <img
        className={cx(image, darkOnly)}
        src={variant.src.dark}
        width={variant.width}
        height={variant.height}
        alt={alt}
        loading="lazy"
        decoding="async"
      />
      {variant.markers.length > 0 ? (
        <div className={overlay} aria-hidden="true">
          {variant.markers.map((marker) => (
            <span
              key={marker.n}
              className={ring}
              // The one inline style in the docs: each marker's geometry is data from the capture
              // manifest, passed as variables the ring's Panda styles read (as Ark does for the
              // SegmentedControl thumb).
              style={
                {
                  '--marker-x': `${marker.box.x * 100}%`,
                  '--marker-y': `${marker.box.y * 100}%`,
                  '--marker-w': `${marker.box.w * 100}%`,
                  '--marker-h': `${marker.box.h * 100}%`
                } as CSSProperties
              }
            >
              <span className={disc}>{marker.n}</span>
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/**
 * A real screenshot of the app, in the reader's theme and device (decision 7A), with
 * numbered markers drawn from the capture manifest (decision 3A). Every step must read
 * correctly without it: a shot that hasn't been captured shows "Screenshot coming".
 *
 * `alt` says what the state shows ("The proposal composer with two actions added"),
 * never "screenshot".
 */
export function Shot({ id, alt, caption: text }: { id: string; alt: string; caption?: string }) {
  const shot = loadShot(id);
  if (!shot) {
    return (
      <figure className={figure} data-shot={id}>
        <div className={frame}>
          <div className={missing}>Screenshot coming</div>
        </div>
        {text ? <figcaption className={caption}>{text}</figcaption> : null}
      </figure>
    );
  }
  const only = shot.variants.length === 1;
  const markers = shot.variants[0].markers;
  return (
    <figure className={figure} data-shot={id}>
      <div className={frame}>
        {shot.variants.map((variant) => (
          <Pane key={variant.device} variant={variant} alt={alt} only={only} />
        ))}
      </div>
      {text || markers.length > 0 ? (
        <figcaption className={caption}>
          {text}
          {markers.length > 0 ? (
            <span className="sr-only">{markers.map((marker) => ` Step ${marker.n}: ${marker.label}.`).join('')}</span>
          ) : null}
        </figcaption>
      ) : null}
      {only ? null : <ShotDeviceToggle />}
    </figure>
  );
}
