'use client';

import { Portal } from '@ark-ui/react/portal';
import { Toast, Toaster } from '@ark-ui/react/toast';
import { ArrowUpRight, CircleAlert, CircleCheck, Info, LoaderCircle, X } from 'lucide-react';

import { toaster } from '@/lib/toaster';

function getToastIcon(type: string | undefined) {
  switch (type) {
    case 'success':
      return <CircleCheck aria-hidden="true" size={18} color="#86efac" />;
    case 'error':
      return <CircleAlert aria-hidden="true" size={18} color="#fca5a5" />;
    case 'loading':
      return (
        <LoaderCircle aria-hidden="true" size={18} color="#93c5fd" style={{ animation: 'spin 1s linear infinite' }} />
      );
    default:
      return <Info aria-hidden="true" size={18} color="#93c5fd" />;
  }
}

export function AppToaster() {
  return (
    <Portal>
      <Toaster toaster={toaster}>
        {(toast) => (
          <Toast.Root
            key={toast.id}
            style={{
              background: 'rgba(8, 18, 32, 0.96)',
              border: '1px solid rgba(160, 194, 225, 0.24)',
              borderRadius: '16px',
              boxShadow: '0 24px 70px rgba(0, 0, 0, 0.38)',
              color: '#e5edf7',
              display: 'grid',
              gap: '8px',
              maxWidth: 'min(420px, calc(100vw - 32px))',
              minWidth: 'min(360px, calc(100vw - 32px))',
              padding: '14px 16px',
              position: 'relative',
              translate: 'var(--x) var(--y)',
              scale: 'var(--scale)',
              zIndex: 'var(--z-index)',
              height: 'var(--height)',
              opacity: 'var(--opacity)',
              willChange: 'translate, opacity, scale',
              transition: 'translate 400ms, scale 400ms, opacity 400ms, height 400ms, box-shadow 200ms',
              transitionTimingFunction: 'cubic-bezier(0.21, 1.02, 0.73, 1)'
            }}
          >
            <Toast.Title
              style={{
                alignItems: 'center',
                display: 'flex',
                fontSize: '0.95rem',
                fontWeight: 700,
                gap: '8px',
                paddingRight: '28px'
              }}
            >
              {getToastIcon(toast.type)}
              {toast.title}
            </Toast.Title>
            {toast.description ? (
              <Toast.Description style={{ color: 'rgba(176,201,229,0.88)', fontSize: '0.88rem', lineHeight: 1.45 }}>
                {toast.description}
              </Toast.Description>
            ) : null}
            {toast.action ? (
              <Toast.ActionTrigger
                style={{
                  alignItems: 'center',
                  background: 'rgba(37, 99, 235, 0.92)',
                  border: '1px solid rgba(147, 197, 253, 0.6)',
                  borderRadius: '10px',
                  color: '#eff6ff',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  fontSize: '0.85rem',
                  fontWeight: 700,
                  gap: '6px',
                  justifyContent: 'center',
                  justifySelf: 'start',
                  padding: '0.45rem 0.65rem'
                }}
              >
                {toast.action.label}
                <ArrowUpRight aria-hidden="true" size={15} strokeWidth={2.4} />
              </Toast.ActionTrigger>
            ) : null}
            <Toast.CloseTrigger
              aria-label="Dismiss notification"
              style={{
                alignItems: 'center',
                background: 'transparent',
                border: 0,
                color: 'rgba(176,201,229,0.88)',
                cursor: 'pointer',
                display: 'inline-flex',
                padding: '4px',
                position: 'absolute',
                right: '10px',
                top: '10px'
              }}
            >
              <X aria-hidden="true" size={16} />
            </Toast.CloseTrigger>
          </Toast.Root>
        )}
      </Toaster>
    </Portal>
  );
}
