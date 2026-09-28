'use client';

import { DashboardFooter } from '@/components/dashboard/dashboard-footer';
import { DashboardHeader } from '@/components/dashboard/dashboard-header';

export default function DisclaimerPage() {
  return (
    <div className="page-shell dashboard-page-shell">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <div className="app-frame dashboard-frame">
        <DashboardHeader />

        <main id="main-content" className="dashboard-main" tabIndex={-1}>
          <div style={{ maxWidth: '700px', margin: '0 auto', padding: '40px 20px' }}>
            <h1 style={{ fontSize: '28px', fontWeight: '700', marginBottom: '12px' }}>Disclaimer</h1>
            <p style={{ fontSize: '13px', color: '#999', marginBottom: '32px' }}>Last Updated: September 28, 2026</p>

            <div
              style={{
                backgroundColor: '#fff3cd',
                border: '1px solid #ffc107',
                borderRadius: '4px',
                padding: '12px 16px',
                marginBottom: '32px',
                fontSize: '14px',
                lineHeight: '1.6',
                color: '#333'
              }}
            >
              <strong>⚠️ Use at your own risk.</strong> This platform involves blockchain, smart contracts, and DAOs.
              All carry serious risks. See below.
            </div>

            <section style={{ marginBottom: '32px' }}>
              <h2 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '12px' }}>Not financial advice</h2>
              <p style={{ lineHeight: '1.6', fontSize: '14px' }}>
                We're not financial advisors. Don't rely on us for investment, financial, legal, or tax decisions. Talk
                to real professionals first.
              </p>
            </section>

            <section style={{ marginBottom: '32px' }}>
              <h2 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '12px' }}>Blockchain is permanent</h2>
              <p style={{ lineHeight: '1.6', fontSize: '14px' }}>
                Once you send funds or create something, it can't be undone. Wrong address? Bad DAO config? Tough luck.
                We can't reverse it.
              </p>
            </section>

            <section style={{ marginBottom: '32px' }}>
              <h2 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '12px' }}>Smart contracts have bugs</h2>
              <p style={{ lineHeight: '1.6', fontSize: '14px' }}>
                Code can fail. Contracts might have vulnerabilities. We don't guarantee they work correctly or safely.
              </p>
            </section>

            <section style={{ marginBottom: '32px' }}>
              <h2 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '12px' }}>Network risks</h2>
              <p style={{ lineHeight: '1.6', fontSize: '14px' }}>
                Stellar network can go down. Third-party RPC providers can fail. Our platform might be unavailable. Not
                our fault if these happen.
              </p>
            </section>

            <section style={{ marginBottom: '32px' }}>
              <h2 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '12px' }}>Wallets & third parties</h2>
              <p style={{ lineHeight: '1.6', fontSize: '14px' }}>
                Your wallet can be hacked. Wallet software can have bugs. Storage services can lose data. We don't
                control these.
              </p>
            </section>

            <section style={{ marginBottom: '32px' }}>
              <h2 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '12px' }}>DAO risks</h2>
              <p style={{ lineHeight: '1.6', fontSize: '14px' }}>
                DAOs can be scams. Members can steal funds. Governance can be manipulated. We can't guarantee fair or
                safe DAOs.
              </p>
            </section>

            <section style={{ marginBottom: '32px' }}>
              <h2 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '12px' }}>Regulation unclear</h2>
              <p style={{ lineHeight: '1.6', fontSize: '14px' }}>
                Laws about DAOs and crypto change fast. Your jurisdiction might classify tokens as securities. Talk to a
                lawyer.
              </p>
            </section>

            <section style={{ marginBottom: '40px' }}>
              <h2 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '12px' }}>TL;DR</h2>
              <p style={{ lineHeight: '1.6', fontSize: '14px' }}>
                Only use money you can afford to lose. Get expert advice. Check everything twice. We're not responsible
                for any losses.
              </p>
            </section>
          </div>
        </main>
        <DashboardFooter />
      </div>
    </div>
  );
}
