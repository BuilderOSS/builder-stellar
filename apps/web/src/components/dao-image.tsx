'use client';

import type { ImgHTMLAttributes } from 'react';

import { FallbackImage } from '@/components/ui';
import { LOCAL_DEFAULT_DAO_IMAGE_URL } from '@/stores/create-dao-store';

type DaoImageProps = Omit<ImgHTMLAttributes<HTMLImageElement>, 'src' | 'onError'> & {
  src?: string | null;
};

export function DaoImage({ src, alt, ...props }: DaoImageProps) {
  return <FallbackImage {...props} src={src} alt={alt} errorFallbackSrc={LOCAL_DEFAULT_DAO_IMAGE_URL} />;
}
