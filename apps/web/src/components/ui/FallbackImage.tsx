'use client';

import { useMemo, useState } from 'react';

import { getFetchableUrls } from '@/lib/ipfs-client';

type FallbackImageProps = Omit<React.ImgHTMLAttributes<HTMLImageElement>, 'src' | 'onError'> & {
  src?: string | null;
  errorFallbackSrc: string;
};

export function FallbackImage({ src, errorFallbackSrc, ...props }: FallbackImageProps) {
  return <FallbackImageContent key={src ?? 'fallback'} src={src} errorFallbackSrc={errorFallbackSrc} {...props} />;
}

function FallbackImageContent({ src, errorFallbackSrc, ...props }: FallbackImageProps) {
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
      className={[props.className, isLoading ? 'skeleton' : ''].filter(Boolean).join(' ')}
      src={imageSrc}
      style={{ ...props.style, opacity: isLoading ? 0 : props.style?.opacity }}
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
