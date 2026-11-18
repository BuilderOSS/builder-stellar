import { defineKeyframes } from '@pandacss/dev';

export const keyframes = defineKeyframes({
  fadeIn: { from: { opacity: '0' }, to: { opacity: '1' } },
  fadeOut: { from: { opacity: '1' }, to: { opacity: '0' } },
  sheetUpIn: { from: { transform: 'translateY(100%)' }, to: { transform: 'translateY(0)' } },
  sheetUpOut: { from: { transform: 'translateY(0)' }, to: { transform: 'translateY(100%)' } },
  sheetLeftIn: { from: { transform: 'translateX(100%)' }, to: { transform: 'translateX(0)' } },
  sheetLeftOut: { from: { transform: 'translateX(0)' }, to: { transform: 'translateX(100%)' } },
  popIn: {
    from: { opacity: '0', transform: 'scale(0.96)' },
    to: { opacity: '1', transform: 'scale(1)' }
  },
  popOut: {
    from: { opacity: '1', transform: 'scale(1)' },
    to: { opacity: '0', transform: 'scale(0.98)' }
  },
  voteLand: {
    from: { opacity: '0', transform: 'translateY(-10px) scale(0.9)' },
    to: { opacity: '1', transform: 'translateY(0) scale(1)' }
  }
});
