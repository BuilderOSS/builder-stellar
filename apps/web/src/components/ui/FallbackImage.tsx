'use client';

import { useMemo, useState } from 'react';
import { css, cx } from 'styled-system/css';

import { getFetchableUrls } from '@/lib/ipfs-client';

type FallbackImageProps = Omit<React.ImgHTMLAttributes<HTMLImageElement>, 'src' | 'onError'> & {
  src?: string | null;
  errorFallbackSrc: string;
};

const image = css({
  transitionProperty: 'opacity',
  transitionDuration: 'fast',
  '&[aria-busy=true]': { opacity: '0', bg: 'skeleton' }
});

/** Image that walks IPFS gateway fallbacks before using `errorFallbackSrc`. */
export function FallbackImage({ src, errorFallbackSrc, ...props }: FallbackImageProps) {
  return <FallbackImageContent key={src ?? 'fallback'} src={src} errorFallbackSrc={errorFallbackSrc} {...props} />;
}

function FallbackImageContent({ src, errorFallbackSrc, className, ...props }: FallbackImageProps) {
  const urls = useMemo(() => getFetchableUrls(src) ?? [], [src]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [hasExhaustedSources, setHasExhaustedSources] = useState(urls.length === 0);
  const [isLoading, setIsLoading] = useState(urls.length > 0);

  const imageSrc = hasExhaustedSources ? errorFallbackSrc : urls[currentIndex] || errorFallbackSrc;

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      {...props}
      alt={props.alt ?? ''}
      aria-busy={isLoading}
      className={cx(image, className)}
      src={imageSrc}
      onLoad={() => setIsLoading(false)}
      onError={() => {
        if (currentIndex < urls.length - 1) {
          setIsLoading(true);
          setCurrentIndex((index) => index + 1);
        } else {
          setIsLoading(false);
          setHasExhaustedSources(true);
        }
      }}
    />
  );
}
