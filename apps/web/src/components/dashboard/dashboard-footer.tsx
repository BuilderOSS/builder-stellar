import Link from 'next/link';

export function DashboardFooter() {
  return (
    <footer className="app-footer dashboard-footer">
      <span>Built for transparent, community-owned coordination.</span>
      <div style={{ display: 'flex', gap: '16px', fontSize: '14px' }}>
        <Link href="/privacy" style={{ color: 'inherit', opacity: 0.7 }}>
          Privacy
        </Link>
        <Link href="/terms" style={{ color: 'inherit', opacity: 0.7 }}>
          Terms
        </Link>
        <Link href="/disclaimer" style={{ color: 'inherit', opacity: 0.7 }}>
          Disclaimer
        </Link>
      </div>
    </footer>
  );
}
