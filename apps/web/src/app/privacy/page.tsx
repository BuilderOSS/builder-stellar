'use client';

import { DashboardFooter } from '@/components/dashboard/dashboard-footer';
import { DashboardHeader } from '@/components/dashboard/dashboard-header';

export default function PrivacyPage() {
  return (
    <div className="page-shell dashboard-page-shell">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <div className="app-frame dashboard-frame">
        <DashboardHeader />

        <main id="main-content" className="dashboard-main" tabIndex={-1}>
          <div style={{ maxWidth: '700px', margin: '0 auto', padding: '40px 20px' }}>
            <h1 style={{ fontSize: '28px', fontWeight: '700', marginBottom: '12px' }}>Privacy Policy</h1>
            <p style={{ fontSize: '13px', color: '#999', marginBottom: '32px' }}>Last Updated: September 28, 2026</p>

            <section style={{ marginBottom: '32px' }}>
              <h2 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '12px' }}>What we collect</h2>
              <ul style={{ lineHeight: '1.6', paddingLeft: '20px', fontSize: '14px' }}>
                <li style={{ marginBottom: '6px' }}>Your wallet address (public on blockchain)</li>
                <li style={{ marginBottom: '6px' }}>Content you upload (images, descriptions)</li>
                <li style={{ marginBottom: '6px' }}>Usage data (pages visited, features used)</li>
                <li style={{ marginBottom: '6px' }}>Device info (browser, IP address)</li>
              </ul>
            </section>

            <section style={{ marginBottom: '32px' }}>
              <h2 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '12px' }}>Why we collect it</h2>
              <ul style={{ lineHeight: '1.6', paddingLeft: '20px', fontSize: '14px' }}>
                <li style={{ marginBottom: '6px' }}>To operate the platform and process transactions</li>
                <li style={{ marginBottom: '6px' }}>To improve features and fix bugs</li>
                <li style={{ marginBottom: '6px' }}>To prevent fraud and security issues</li>
              </ul>
            </section>

            <section style={{ marginBottom: '32px' }}>
              <h2 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '12px' }}>Blockchain data</h2>
              <p style={{ lineHeight: '1.6', fontSize: '14px', marginBottom: '12px' }}>
                Anything you create or transact on the Stellar blockchain is permanent, public, and cannot be deleted.
                This includes your wallet address, DAO creations, and all activity.
              </p>
              <p style={{ lineHeight: '1.6', fontSize: '14px' }}>
                We have no ability to remove or modify blockchain data.
              </p>
            </section>

            <section style={{ marginBottom: '32px' }}>
              <h2 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '12px' }}>Third parties</h2>
              <p style={{ lineHeight: '1.6', fontSize: '14px' }}>
                We use Stellar RPC providers, storage services, and analytics tools. They have their own privacy
                policies. We're not responsible for their practices.
              </p>
            </section>

            <section style={{ marginBottom: '32px' }}>
              <h2 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '12px' }}>Your rights</h2>
              <ul style={{ lineHeight: '1.6', paddingLeft: '20px', fontSize: '14px' }}>
                <li style={{ marginBottom: '6px' }}>Access data we store</li>
                <li style={{ marginBottom: '6px' }}>Request deletion (except blockchain data)</li>
                <li style={{ marginBottom: '6px' }}>Opt out of analytics</li>
              </ul>
            </section>

            <section style={{ marginBottom: '32px' }}>
              <h2 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '12px' }}>Kids</h2>
              <p style={{ lineHeight: '1.6', fontSize: '14px' }}>Must be 13+ to use. Under 18? Get parental consent.</p>
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
