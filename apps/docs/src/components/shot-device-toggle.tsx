'use client';

import { SegmentedControl } from '@builder-stellar/web/ui/segmented-control';
import { useEffect, useId, useSyncExternalStore } from 'react';
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

const wrap = css({ display: 'flex', justifyContent: 'center' });

/** "Show desktop / Show mobile". One choice for every figure, remembered for the session. */
export function ShotDeviceToggle() {
  const id = useId();
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

  return (
    <div className={wrap}>
      <SegmentedControl
        id={`shot-device-${id}`}
        label="Screenshot size"
        value={device}
        onValueChange={(next) => {
          if (next === 'desktop' || next === 'mobile') choose(next);
        }}
        options={[
          { value: 'desktop', label: 'Show desktop' },
          { value: 'mobile', label: 'Show mobile' }
        ]}
      />
    </div>
  );
}
