import { Prose } from '@/components/ui/prose';

export default function PrivacyPage() {
  return (
    <Prose>
      <h1>Privacy Policy</h1>
      <p>Last Updated: September 28, 2026</p>

      <section>
        <h2>What we collect</h2>
        <ul>
          <li>Your wallet address (public on blockchain)</li>
          <li>Content you upload (images, descriptions)</li>
          <li>Usage data (pages visited, features used)</li>
          <li>Device info (browser, IP address)</li>
        </ul>
      </section>

      <section>
        <h2>Why we collect it</h2>
        <ul>
          <li>To operate the platform and process transactions</li>
          <li>To improve features and fix bugs</li>
          <li>To prevent fraud and security issues</li>
        </ul>
      </section>

      <section>
        <h2>Blockchain data</h2>
        <p>
          Anything you create or transact on the Stellar blockchain is permanent, public, and cannot be deleted. This
          includes your wallet address, DAO creations, and all activity.
        </p>
        <p>We have no ability to remove or modify blockchain data.</p>
      </section>

      <section>
        <h2>Third parties</h2>
        <p>
          We use Stellar RPC providers, storage services, and analytics tools. They have their own privacy policies.
          We're not responsible for their practices.
        </p>
      </section>

      <section>
        <h2>Your rights</h2>
        <ul>
          <li>Access data we store</li>
          <li>Request deletion (except blockchain data)</li>
          <li>Opt out of analytics</li>
        </ul>
      </section>

      <section>
        <h2>Kids</h2>
        <p>Must be 13+ to use. Under 18? Get parental consent.</p>
      </section>

      <section>
        <h2>Questions?</h2>
        <p>
          Contact us via <a href="https://nouns.build">Builder DAO</a>
        </p>
      </section>
    </Prose>
  );
}
