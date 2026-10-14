import type { Metadata } from 'next';

import { DiscordLink, LegalPage } from '@/components/legal/legal-page';

export const metadata: Metadata = {
  title: 'Disclaimer',
  description: 'The risks of using Tribes Builder, experimental software for tribes (DAOs) on Stellar.'
};

export default function DisclaimerPage() {
  return (
    <LegalPage
      title="Disclaimer"
      summary={[
        'Nothing here is financial, legal or tax advice.',
        'Tribes Builder is experimental, non-custodial software, and transactions can’t be undone.',
        'Tribes run themselves. We don’t vet or endorse them.',
        'A membership token is for belonging and voting, not an investment.',
        'Look before you sign, and only put in what you can afford to lose.'
      ]}
    >
      <section>
        <h2>1. Not advice</h2>
        <p>
          Nothing in Tribes Builder, on tribes.build or from Builder DAO is financial, investment, legal or tax advice.
          Decisions about tokens, treasuries and tribes are yours to make. Talk to a professional when you need one.
        </p>
      </section>

      <section>
        <h2>2. Non-custodial, experimental software</h2>
        <p>
          Tribes Builder is an interface to open-source contracts on Stellar. It never holds your funds or keys, so we
          can&apos;t recover them for you. It&apos;s new and still changing: today it runs on the Stellar testnet, and
          features may change or break.
        </p>
      </section>

      <section>
        <h2>3. Smart contract and network risk</h2>
        <p>
          Contracts can have bugs or be used in ways nobody expected, and we don&apos;t claim they&apos;re audited. The
          Stellar network, RPC servers, the indexer and wallets can be slow, down or wrong, and the interface may show
          out-of-date data. The contracts are the source of truth.
        </p>
      </section>

      <section>
        <h2>4. Transactions are final</h2>
        <p>
          Once a transaction is on Stellar, nobody can reverse it, including us. A wrong address, amount or setting
          stays wrong. Read what your wallet shows before you sign.
        </p>
      </section>

      <section>
        <h2>5. Tribes are independent</h2>
        <p>
          Anyone can build a tribe, and each one is governed by its own members. We don&apos;t vet, audit or endorse
          tribes, and showing one in the interface isn&apos;t a recommendation. Members can propose and pass anything
          the contracts allow, including spending the treasury.
        </p>
      </section>

      <section>
        <h2>6. Tokens are memberships</h2>
        <p>
          A tribe&apos;s token is a membership with one vote in its DAO. It isn&apos;t a share, a deposit or a promise
          of value, income or return, and it may be worth nothing to anyone else.
        </p>
      </section>

      <section>
        <h2>7. Regulation is unsettled</h2>
        <p>
          Laws on crypto assets and DAOs differ from place to place and keep changing. Depending on where you live, a
          token or a tribe could be treated in ways that affect you. Check the rules that apply to you.
        </p>
      </section>

      <section>
        <h2>8. Other people&apos;s content</h2>
        <p>
          Tribe names, art, descriptions, proposals and comments come from the people who publish them. We don&apos;t
          check them, and they don&apos;t reflect our views. Links may lead to sites we don&apos;t control.
        </p>
      </section>

      <section>
        <h2>9. Storage rent and expiry</h2>
        <p>
          Stellar keeps contract data for a paid stretch of time. If a tribe&apos;s storage isn&apos;t renewed, parts of
          it stop working until they&apos;re restored. Anyone can pay to renew it, but nobody is obliged to.
        </p>
      </section>

      <section>
        <h2>10. No uptime promise</h2>
        <p>
          The interface may be slow, unavailable or changed at any time. Your tribes and tokens live on Stellar, not
          here, and stay there whether or not the interface is up.
        </p>
      </section>

      <section>
        <h2>11. Look before you sign</h2>
        <p>
          Take your time. Read the proposal, check the tribe, and make sure you understand what your wallet asks you to
          approve. Only put in what you can afford to lose. If something looks off, ask on{' '}
          <DiscordLink>Discord</DiscordLink> before you sign.
        </p>
      </section>
    </LegalPage>
  );
}
