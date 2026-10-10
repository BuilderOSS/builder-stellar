'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useRef } from 'react';

/** Close an overlay when the route changes (sheets that hold links). */
export function useCloseOnNavigate(close: () => void) {
  const pathname = usePathname();
  const previous = useRef(pathname);
  const closeRef = useRef(close);

  useEffect(() => {
    closeRef.current = close;
  });

  useEffect(() => {
    if (previous.current === pathname) return;
    previous.current = pathname;
    closeRef.current();
  }, [pathname]);
}
