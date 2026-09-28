'use client';

import { DashboardFooter } from '@/components/dashboard/dashboard-footer';
import { DashboardHeader } from '@/components/dashboard/dashboard-header';

export default function TermsPage() {
  return (
    <div className="page-shell dashboard-page-shell">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <div className="app-frame dashboard-frame">
        <DashboardHeader />

        <main id="main-content" className="dashboard-main" tabIndex={-1}>
          <div style={{ maxWidth: '700px', margin: '0 auto', padding: '40px 20px' }}>
            <h1 style={{ fontSize: '28px', fontWeight: '700', marginBottom: '12px' }}>Terms & Conditions</h1>
            <p style={{ fontSize: '13px', color: '#999', marginBottom: '32px' }}>Last Updated: September 28, 2026</p>

            <section style={{ marginBottom: '32px' }}>
              <h2 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '12px' }}>Your account</h2>
              <ul style={{ lineHeight: '1.6', paddingLeft: '20px', fontSize: '14px' }}>
                <li style={{ marginBottom: '6px' }}>You own your wallet security</li>
                <li style={{ marginBottom: '6px' }}>Don't do illegal stuff</li>
                <li style={{ marginBottom: '6px' }}>We can block you anytime</li>
              </ul>
            </section>

            <section style={{ marginBottom: '32px' }}>
              <h2 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '12px' }}>Your content</h2>
              <p style={{ lineHeight: '1.6', fontSize: '14px', marginBottom: '12px' }}>
                You keep rights to what you upload. We can display and share it to run the platform.
              </p>
              <p style={{ lineHeight: '1.6', fontSize: '14px' }}>Don't upload stuff that infringes copyrights.</p>
            </section>

            <section style={{ marginBottom: '32px' }}>
              <h2 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '12px' }}>Your DAOs</h2>
              <p style={{ lineHeight: '1.6', fontSize: '14px', marginBottom: '12px' }}>
                When you create a DAO, you're responsible for it. We don't control your DAO once it's live. Don't expect
                us to reverse anything.
              </p>
              <p style={{ lineHeight: '1.6', fontSize: '14px' }}>
                Creating a DAO doesn't make it a legal entity. Get a lawyer if needed.
              </p>
            </section>

            <section style={{ marginBottom: '32px' }}>
              <h2 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '12px' }}>No warranties</h2>
              <p style={{ lineHeight: '1.6', fontSize: '14px' }}>
                Platform is provided "as-is". Blockchain transactions are permanent and can't be undone. We're not
                liable for your losses.
              </p>
            </section>

            <section style={{ marginBottom: '32px' }}>
              <h2 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '12px' }}>Governing law</h2>
              <p style={{ lineHeight: '1.6', fontSize: '14px' }}>
                These terms are under US law. If you have a dispute, contact the Builder DAO community.
              </p>
            </section>

            <section style={{ marginBottom: '40px' }}>
              <h2 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '12px' }}>Questions?</h2>
              <p style={{ lineHeight: '1.6', fontSize: '14px' }}>
                Contact us via{' '}
                <a href="https://nouns.build" style={{ color: '#0066cc', textDecoration: 'underline' }}>
                  Builder DAO
                </a>
              </p>
            </section>
          </div>
        </main>
        <DashboardFooter />
      </div>
    </div>
  );
}
