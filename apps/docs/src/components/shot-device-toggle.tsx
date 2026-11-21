'use client';

import { Monitor, Smartphone } from 'lucide-react';
import { useEffect, useSyncExternalStore } from 'react';
import { css } from 'styled-system/css';

import type { Device } from '@/lib/shots';

const STORAGE_KEY = 'docs.shot-device';
const EVENT = 'docs:shot-device';
const MOBILE_QUERY = '(max-width: 767.98px)';

function chosen(): Device | null {
  const value = document.documentElement.dataset.shotDevice;
  return value === 'desktop' || value === 'mobile' ? value : null;
}

function subscribe(listener: () => void) {
  const media = window.matchMedia(MOBILE_QUERY);
  media.addEventListener('change', listener);
  window.addEventListener(EVENT, listener);
  return () => {
    media.removeEventListener('change', listener);
    window.removeEventListener(EVENT, listener);
  };
}

function current(): Device {
  return chosen() ?? (window.matchMedia(MOBILE_QUERY).matches ? 'mobile' : 'desktop');
}

function choose(device: Device) {
  document.documentElement.dataset.shotDevice = device;
  try {
    sessionStorage.setItem(STORAGE_KEY, device);
  } catch {
    /* The choice still holds for this page. */
  }
  window.dispatchEvent(new Event(EVENT));
}

// Quiet on purpose: most readers never need it. A small muted text button under the figure's right
// edge, the size of a caption, with a 44px target on touch screens.
const toggle = css({
  justifySelf: 'end',
  display: 'inline-flex',
  alignItems: 'center',
  gap: '1',
  minH: '8',
  mt: '-1',
  px: '1.5',
  border: '0',
  borderRadius: 'sm',
  bg: 'transparent',
  color: 'ink.muted',
  textStyle: 'caption',
  cursor: 'pointer',
  transitionProperty: 'color',
  transitionDuration: 'fast',
  '& svg': { width: '3.5', height: '3.5', flexShrink: '0' },
  '@media (hover: hover) and (pointer: fine)': { _hover: { color: 'ink' } },
  '@media (pointer: coarse)': { minH: 'touch' },
  _focusVisible: { outline: '2px solid', outlineColor: 'signal', outlineOffset: '1px' }
});

/** "Show mobile" or "Show desktop": one choice for every figure, remembered for the session. */
export function ShotDeviceToggle() {
  const device = useSyncExternalStore(subscribe, current, () => 'desktop' as Device);

  useEffect(() => {
    if (chosen()) return;
    try {
      const saved = sessionStorage.getItem(STORAGE_KEY);
      if (saved === 'desktop' || saved === 'mobile') choose(saved);
    } catch {
      /* Storage denied: follow the screen size. */
    }
  }, []);

  const other: Device = device === 'desktop' ? 'mobile' : 'desktop';
  const Icon = other === 'mobile' ? Smartphone : Monitor;
  return (
    <button type="button" className={toggle} onClick={() => choose(other)}>
      <Icon aria-hidden="true" />
      {other === 'mobile' ? 'Show mobile' : 'Show desktop'}
    </button>
  );
}
