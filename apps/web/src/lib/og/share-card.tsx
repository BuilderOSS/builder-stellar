/* eslint-disable no-restricted-syntax -- next/og draws with Satori, which reads inline styles only and
   can't see Panda tokens; every colour comes from lib/brand-colors.ts. */
import { ImageResponse } from 'next/og';
import sharp from 'sharp';

import { BRASS, DUSK, PAPER, PAPER_MUTED, STATUS, type StatusTone } from '@/lib/brand-colors';
import { identityHue, initials } from '@/lib/identity-hue';

import { shareCardFonts } from './fonts';

export const SHARE_CARD_SIZE = { width: 1200, height: 630 };
export const SHARE_CARD_CONTENT_TYPE = 'image/png';
// WhatsApp skips large previews; past this, the PNG is re-encoded with a palette.
const MAX_BYTES = 280_000;

export type ShareCardProps = {
  /** How long a CDN may keep this card, in seconds; overrides the route's default. */
  maxAge?: number;
  title: string;
  /** One line under the title. */
  subtitle?: string;
  /** Section or status, always a word plus a colour. */
  chips?: Array<{ label: string; tone?: StatusTone }>;
  /** Figures under the title, e.g. members or the top bid. */
  stats?: Array<{ label: string; value: string }>;
  /** The tribe's or token's art as a data URL; the crest stands in when it's missing. */
  art?: string | null;
  crest?: { name: string; seed: string };
  /** Up to four of the member's tokens, ringed in brass ("yours"). */
  tokens?: Array<string | null>;
  /** For, Against and Abstain votes, drawn as a bar. */
  tally?: { for: number; against: number; abstain: number };
  /** A small crest or art beside the subtitle, e.g. the tribe on a proposal card. */
  badge?: { name: string; seed: string; art?: string | null };
  /** The brand card: the big mark instead of art. */
  brand?: boolean;
};

const BACKGROUND = `linear-gradient(180deg, ${DUSK[0]} 0%, ${DUSK[1]} 60%, ${DUSK[2]} 100%)`;

function Mark({ size, joined = false, color = PAPER }: { size: number; joined?: boolean; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32">
      <path fill={color} fillRule="evenodd" d="M9 9h14v14H9zM11 11v10h5V11z" />
      <circle fill={color} cx="16" cy="3.75" r="3.25" />
      <circle fill={color} cx="28.25" cy="16" r="3.25" />
      <circle fill={color} cx="3.75" cy="16" r="3.25" />
      {joined ? (
        <circle fill={BRASS} cx="16" cy="28.25" r="3.75" />
      ) : (
        <circle fill="none" stroke={color} strokeWidth="1.5" cx="16" cy="28.25" r="3" />
      )}
    </svg>
  );
}

function Crest({ name, seed, size }: { name: string; seed: string; size: number }) {
  const hue = identityHue(seed);
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: size,
        height: size,
        borderRadius: size * 0.08,
        background: `hsl(${hue}, 34%, 24%)`,
        color: `hsl(${hue}, 70%, 82%)`,
        fontFamily: 'Bricolage Grotesque',
        fontSize: size * 0.36,
        letterSpacing: '-0.02em'
      }}
    >
      {initials(name)}
    </div>
  );
}

function Art({ src, size, glow = false }: { src: string; size: number; glow?: boolean }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      width={size}
      height={size}
      alt=""
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.08,
        objectFit: 'cover',
        border: glow ? `4px solid ${BRASS}` : '1px solid rgba(255, 255, 255, 0.12)',
        boxShadow: glow ? `0 0 48px rgba(217, 163, 90, 0.55)` : 'none'
      }}
    />
  );
}

function clamp(text: string, max: number) {
  const clean = text.replace(/\s+/g, ' ').trim();
  return clean.length > max ? `${clean.slice(0, max - 1).trimEnd()}…` : clean;
}

function titleSize(title: string, wide: boolean) {
  const length = title.length;
  if (length <= (wide ? 28 : 18)) return 76;
  if (length <= (wide ? 48 : 34)) return 62;
  return 50;
}

function Tally({ tally }: { tally: NonNullable<ShareCardProps['tally']> }) {
  const total = tally.for + tally.against + tally.abstain;
  const parts = [
    { label: 'For', value: tally.for, color: STATUS.success },
    { label: 'Against', value: tally.against, color: STATUS.danger },
    { label: 'Abstain', value: tally.abstain, color: STATUS.neutral }
  ];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, width: '100%' }}>
      <div
        style={{
          display: 'flex',
          width: '100%',
          height: 18,
          borderRadius: 9,
          overflow: 'hidden',
          background: 'rgba(243, 237, 229, 0.18)'
        }}
      >
        {total > 0
          ? parts
              .filter((part) => part.value > 0)
              .map((part) => (
                <div
                  key={part.label}
                  style={{ display: 'flex', width: `${(part.value / total) * 100}%`, background: part.color }}
                />
              ))
          : null}
      </div>
      <div style={{ display: 'flex', gap: 32, fontSize: 26, color: PAPER }}>
        {parts.map((part) => (
          <div key={part.label} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ display: 'flex', width: 14, height: 14, borderRadius: 7, background: part.color }} />
            <span style={{ color: PAPER_MUTED }}>{part.label}</span>
            <span style={{ fontWeight: 700 }}>{new Intl.NumberFormat('en-US').format(part.value)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Card(props: ShareCardProps) {
  const { title, subtitle, chips = [], stats = [], art, crest, tokens, tally, brand, badge } = props;
  const hasSide = Boolean(brand || art || crest || tokens?.length);
  const wide = !hasSide;
  const heading = clamp(title, 90);
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        height: '100%',
        padding: '56px 64px',
        backgroundImage: BACKGROUND,
        color: PAPER,
        fontFamily: 'Figtree',
        fontWeight: 500
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <Mark size={48} joined={Boolean(tokens?.length)} />
          <div style={{ display: 'flex', gap: 10, fontFamily: 'Bricolage Grotesque', fontSize: 32 }}>
            <span>Tribe</span>
            <span style={{ color: PAPER_MUTED }}>Builder</span>
          </div>
        </div>
        <span style={{ fontSize: 24, color: PAPER_MUTED }}>tribes.build</span>
      </div>

      <div style={{ display: 'flex', flex: 1, alignItems: 'center', gap: 56, marginTop: 24 }}>
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, gap: 22, minWidth: 0 }}>
          {chips.length ? (
            <div style={{ display: 'flex', gap: 12 }}>
              {chips.map((chip) => (
                <div
                  key={chip.label}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '8px 18px',
                    borderRadius: 999,
                    background: 'rgba(16, 33, 63, 0.55)',
                    border: '1px solid rgba(243, 237, 229, 0.22)',
                    fontSize: 24,
                    fontWeight: 700
                  }}
                >
                  {chip.tone ? (
                    <div
                      style={{ display: 'flex', width: 14, height: 14, borderRadius: 7, background: STATUS[chip.tone] }}
                    />
                  ) : null}
                  {chip.label}
                </div>
              ))}
            </div>
          ) : null}
          <div
            style={{
              display: 'flex',
              fontFamily: 'Bricolage Grotesque',
              fontSize: titleSize(heading, wide),
              lineHeight: 1.04,
              letterSpacing: '-0.02em'
            }}
          >
            {heading}
          </div>
          {subtitle ? (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 16,
                fontSize: 30,
                lineHeight: 1.3,
                color: PAPER_MUTED
              }}
            >
              {badge ? (
                badge.art ? (
                  <Art src={badge.art} size={48} />
                ) : (
                  <Crest name={badge.name} seed={badge.seed} size={48} />
                )
              ) : null}
              <span>{clamp(subtitle, wide ? 110 : 80)}</span>
            </div>
          ) : null}
          {stats.length ? (
            <div style={{ display: 'flex', gap: 44, marginTop: 6 }}>
              {stats.map((stat) => (
                <div key={stat.label} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <span style={{ fontFamily: 'Bricolage Grotesque', fontSize: 44 }}>{stat.value}</span>
                  <span style={{ fontSize: 22, color: PAPER_MUTED }}>{stat.label}</span>
                </div>
              ))}
            </div>
          ) : null}
          {tally ? <Tally tally={tally} /> : null}
        </div>

        {brand ? (
          <div style={{ display: 'flex', paddingRight: 24 }}>
            <Mark size={300} />
          </div>
        ) : tokens?.length ? (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20, width: 400 }}>
            {tokens
              .slice(0, 4)
              .map((token, index) =>
                token ? (
                  <Art key={index} src={token} size={tokens.length === 1 ? 380 : 180} glow />
                ) : (
                  <Crest key={index} name={crest?.name ?? '?'} seed={`${crest?.seed}:${index}`} size={180} />
                )
              )}
          </div>
        ) : art ? (
          <Art src={art} size={380} />
        ) : crest ? (
          <Crest name={crest.name} seed={crest.seed} size={380} />
        ) : null}
      </div>
    </div>
  );
}

/** Keeps a card under the size WhatsApp will show; most cards never need it. */
async function compact(response: Response): Promise<Response> {
  const png = Buffer.from(await response.arrayBuffer());
  const body =
    png.byteLength <= MAX_BYTES ? png : await sharp(png).png({ palette: true, quality: 90, effort: 8 }).toBuffer();
  return new Response(new Uint8Array(body), {
    headers: { 'Content-Type': SHARE_CARD_CONTENT_TYPE, 'Content-Length': String(body.byteLength) }
  });
}

export async function shareCard(props: ShareCardProps): Promise<Response> {
  const fonts = await shareCardFonts();
  return compact(new ImageResponse(<Card {...props} />, { ...SHARE_CARD_SIZE, fonts }));
}

function cacheFor(response: Response, seconds: number, extra?: Record<string, string>): Response {
  const headers = new Headers(response.headers);
  headers.set('Cache-Control', `public, max-age=0, s-maxage=${seconds}, stale-while-revalidate=${seconds}`);
  for (const [key, value] of Object.entries(extra ?? {})) headers.set(key, value);
  return new Response(response.body, { headers });
}

export const BRAND_SUBTITLE = 'A DAO on Stellar: shared treasury, onchain votes, NFT membership.';

/** The brand card, also the fallback when a page's data can't be loaded. */
export function brandCard(section?: string): Promise<Response> {
  return shareCard({
    title: 'Build a tribe.',
    subtitle: BRAND_SUBTITLE,
    chips: section ? [{ label: section }] : [],
    brand: true
  });
}

/**
 * Loads a page's card, or falls back to the brand card when its data can't be read in time.
 * `maxAge` is how often the card refreshes at the CDN (a card can shorten it with its own
 * `maxAge`); a fallback is kept one minute and marked `X-Share-Card: fallback`.
 */
export async function shareCardOr(
  load: () => Promise<ShareCardProps>,
  { section, maxAge = 3600, timeoutMs = 9000 }: { section?: string; maxAge?: number; timeoutMs?: number } = {}
): Promise<Response> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const props = await Promise.race([
      load(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('Share card data timed out')), timeoutMs);
      })
    ]);
    return cacheFor(await shareCard(props), props.maxAge ?? maxAge);
  } catch (error) {
    console.warn('Share card fell back to the brand card', error instanceof Error ? error.message : error);
    return cacheFor(await brandCard(section), 60, { 'X-Share-Card': 'fallback' });
  } finally {
    clearTimeout(timer);
  }
}
