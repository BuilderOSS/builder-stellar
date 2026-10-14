import type { Metadata } from 'next';

import { DiscordLink, LegalPage } from '@/components/legal/legal-page';

export const metadata: Metadata = {
  title: 'Privacy policy',
  description: 'What Tribe Builder collects, why, and what stays public onchain.'
};

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy policy"
      summary={[
        'We don’t ask for your name or email, and there are no ads or third-party analytics.',
        'Signing in keeps your public wallet address in an encrypted cookie for up to 7 days.',
        'What you do onchain, and what you put on IPFS, is public and permanent. We can’t delete it.',
        'Drafts and preferences stay in your browser.',
        <>
          Ask us anything on <DiscordLink>Discord</DiscordLink>.
        </>
      ]}
    >
      <section>
        <h2>1. Who we are</h2>
        <p>
          Builder DAO (&quot;we&quot;, &quot;us&quot;) builds Tribe Builder. This policy covers the interface at
          tribes.build and the servers behind it. It doesn&apos;t cover the Stellar network, IPFS, your wallet or other
          services, which have their own policies.
        </p>
      </section>

      <section>
        <h2>2. What we collect</h2>
        <ul>
          <li>
            <strong>Your wallet address and sign-in.</strong> To sign in, your wallet signs a message that proves the
            address is yours. We keep your public address, the network, how you signed in and when, in an encrypted,
            httpOnly session cookie named &quot;stellar-auth&quot;. There&apos;s no account on our servers.
          </li>
          <li>
            <strong>Technical data.</strong> Our servers see your IP address and request details, such as your browser
            and the page you asked for. Sign-in uses your IP address to limit repeated attempts. Our hosting provider
            keeps standard request and error logs.
          </li>
          <li>
            <strong>What you publish.</strong> Tribe names, profiles, proposals, votes, bids, listings and comments are
            sent to the Stellar network as transactions. Images you upload go to IPFS through our pinning provider.
          </li>
          <li>
            <strong>Public onchain data.</strong> We index public events from the Tribe Builder contracts into our
            database to show tribes, members and history. This includes wallet addresses and amounts that are already
            public on Stellar.
          </li>
          <li>
            <strong>On your device.</strong> Drafts, your appearance setting, market favourites and whether you&apos;ve
            seen the wallet intro are saved in your browser&apos;s local storage. The wallet library remembers which
            wallet you picked. None of this reaches us unless you submit it.
          </li>
        </ul>
      </section>

      <section>
        <h2>3. What we don&apos;t collect</h2>
        <p>
          We don&apos;t ask for names, email addresses, phone numbers, government IDs or card details, and we never ask
          for your private keys or seed phrase. There are no third-party analytics, advertising trackers or tracking
          pixels, and fonts are served from our own servers.
        </p>
      </section>

      <section>
        <h2>4. Why we use it</h2>
        <ul>
          <li>to run the interface and keep you signed in;</li>
          <li>to show tribes, proposals, auctions and their history;</li>
          <li>to prevent abuse, such as repeated sign-in attempts;</li>
          <li>to find and fix bugs and security problems; and</li>
          <li>to meet legal obligations.</li>
        </ul>
      </section>

      <section>
        <h2>5. Who else sees it</h2>
        <p>
          Service providers run parts of the interface for us: hosting (Vercel), the database behind the index, indexing
          of onchain events (Goldsky) and IPFS pinning (Pinata). Your browser also connects directly to Stellar RPC
          servers, IPFS gateways and, if you use it, WalletConnect, which see your IP address under their own policies.
          We may share data when the law requires it. We never sell your data.
        </p>
      </section>

      <section>
        <h2>6. How long we keep it</h2>
        <ul>
          <li>The session cookie lasts up to 7 days, or until you disconnect your wallet.</li>
          <li>Sign-in attempt counts are kept in memory for about a minute.</li>
          <li>Request and error logs are kept for a limited time, as our hosting provider sets.</li>
          <li>The index of onchain events is kept while the service runs.</li>
          <li>Transactions on Stellar and files on IPFS are permanent, and we can&apos;t delete them.</li>
        </ul>
      </section>

      <section>
        <h2>7. Your choices and rights</h2>
        <p>
          Disconnect your wallet to end your session, and clear this site&apos;s data in your browser to remove drafts
          and preferences. You can ask on <DiscordLink>Discord</DiscordLink> to see, correct or delete the off-chain
          data we hold about you. Depending on where you live, you may have more rights under local privacy law, and
          we&apos;ll help you use them. We can&apos;t change or remove data on the chain or on IPFS.
        </p>
      </section>

      <section>
        <h2>8. Age</h2>
        <p>
          Tribe Builder is for people 18 and older. If you think someone younger has given us data, tell us and
          we&apos;ll delete what we can.
        </p>
      </section>

      <section>
        <h2>9. International processing</h2>
        <p>
          Tribe Builder is used around the world, and our providers run servers in several countries. Your data may be
          processed outside the country you live in.
        </p>
      </section>

      <section>
        <h2>10. Security</h2>
        <p>
          The session cookie is encrypted and can&apos;t be read by scripts on the page, the site is served over HTTPS,
          and sign-in is rate limited. No system is perfectly secure, so keep your wallet and devices safe too.
        </p>
      </section>

      <section>
        <h2>11. Changes</h2>
        <p>
          We may update this policy. The date at the top shows the latest version, and we&apos;ll mention big changes in
          the app or on Discord.
        </p>
      </section>

      <section>
        <h2>12. Contact</h2>
        <p>
          Privacy questions and requests go to <DiscordLink />.
        </p>
      </section>
    </LegalPage>
  );
}
