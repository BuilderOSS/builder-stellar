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
              background: 'var(--surface-1)',
              border: '1px solid var(--border-strong)',
              borderRadius: '14px',
              boxShadow: '0 24px 70px rgba(0, 0, 0, 0.48)',
              color: 'var(--text-primary)',
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
              transition: 'translate 180ms, scale 180ms, opacity 180ms, height 180ms, box-shadow 180ms',
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
              <Toast.Description style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', lineHeight: 1.45 }}>
                {toast.description}
              </Toast.Description>
            ) : null}
            {toast.action ? (
              <Toast.ActionTrigger
                style={{
                  alignItems: 'center',
                  background: 'var(--action)',
                  border: '1px solid var(--action)',
                  borderRadius: '8px',
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
                color: 'var(--text-secondary)',
                cursor: 'pointer',
                display: 'inline-flex',
                minWidth: '44px',
                minHeight: '44px',
                justifyContent: 'center',
                padding: '4px',
                position: 'absolute',
                right: '2px',
                top: '2px'
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
