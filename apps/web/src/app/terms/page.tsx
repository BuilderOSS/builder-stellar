import type { Metadata } from 'next';

import { DiscordLink, LegalPage } from '@/components/legal/legal-page';

export const metadata: Metadata = {
  title: 'Terms of use',
  description: 'The terms for using Tribes Builder, a non-custodial interface for tribes (DAOs) on Stellar.'
};

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of use"
      summary={[
        'Tribes Builder is an open-source app for running tribes, which are DAOs on Stellar. It never holds your funds or your keys.',
        'What happens onchain is public and permanent. Nobody, including us, can undo it.',
        'Each tribe is run by its own members. We don’t vet, endorse or control any tribe.',
        'It’s experimental software, offered as is. Use it only if you’re 18 or older and it’s legal where you live.',
        <>
          Questions or problems? Find us on <DiscordLink>Discord</DiscordLink>.
        </>
      ]}
    >
      <section>
        <h2>1. Accepting these terms</h2>
        <p>
          These terms are an agreement between you and Builder DAO (&quot;we&quot;, &quot;us&quot;), which builds Tribes
          Builder. They apply when you use the app at tribes.build or any other copy of it we run (the
          &quot;interface&quot;). By using the interface you agree to them. If you don&apos;t agree, please don&apos;t
          use it.
        </p>
      </section>

      <section>
        <h2>2. What Tribes Builder is</h2>
        <p>
          Tribes Builder is a non-custodial web interface to open-source smart contracts on the Stellar network. It
          helps people build and join tribes: groups with a shared treasury that decide together by vote. Under the
          hood, each tribe is a DAO with its own token, governor and treasury contracts.
        </p>
        <p>
          The interface prepares transactions. Your wallet signs them and the network runs them. We never take custody
          of your assets or your keys, and we can&apos;t move anything without your signature.
        </p>
        <p>
          Today Tribes Builder runs on the Stellar testnet, where tokens have no value and the network can be reset.
          Mainnet isn&apos;t live yet. When it is, these terms apply there too.
        </p>
      </section>

      <section>
        <h2>3. Who can use it</h2>
        <p>To use the interface you must:</p>
        <ul>
          <li>be at least 18 years old;</li>
          <li>
            not be a sanctioned person, or located in or acting for a country or region under comprehensive sanctions;
            and
          </li>
          <li>follow the laws that apply to you, including on crypto assets, taxes and DAOs.</li>
        </ul>
        <p>
          If you use the interface for an organization, you confirm you&apos;re allowed to accept these terms for it.
        </p>
      </section>

      <section>
        <h2>4. Your wallet and keys</h2>
        <p>
          Your wallet and its keys are yours to keep safe. We can&apos;t recover a lost key, see your seed phrase or
          reverse anything your wallet signs. Check every transaction your wallet shows you before you approve it.
        </p>
      </section>

      <section>
        <h2>5. Tribes are independent</h2>
        <p>
          A tribe is set up by its launch admin and then governed by its members through onchain votes. We don&apos;t
          control, vet, audit or endorse any tribe, its art, its treasury or its proposals. Showing a tribe in the
          interface isn&apos;t a recommendation.
        </p>
        <p>
          After launch, changes to a tribe require DAO governance. We can&apos;t change a tribe&apos;s contracts or
          settings, freeze its treasury or reverse its transactions. A tribe isn&apos;t a legal entity just because it
          exists onchain; if your tribe needs one, get your own legal advice.
        </p>
      </section>

      <section>
        <h2>6. Auctions, the market and claims</h2>
        <p>
          Bids, purchases, listings and claims are transactions between you, other people and a tribe&apos;s contracts.
          We aren&apos;t a party to them, a broker or an escrow agent. Prices and rules, such as reserve prices, sale
          prices, claim lists and safety delays, are set by sellers and tribes and enforced by the contracts as written.
        </p>
      </section>

      <section>
        <h2>7. Fees</h2>
        <p>
          We don&apos;t charge a platform fee. Every transaction pays a Stellar network fee in XLM, usually a fraction
          of a cent. A tribe can set its own prices and fees, such as auction reserve prices, sale and claim prices, and
          a resale fee on its market of up to 25% that goes to the tribe&apos;s treasury. Your wallet shows what
          you&apos;ll pay before you sign.
        </p>
      </section>

      <section>
        <h2>8. What you post</h2>
        <p>
          You&apos;re responsible for what you publish, such as tribe names, images, descriptions, links, proposals and
          comments, and you confirm you have the right to publish it. You give us a worldwide, non-exclusive,
          royalty-free licence to display, copy and format it in the interface and in share images.
        </p>
        <p>
          Much of this content is stored onchain or on IPFS, which are public and permanent. We may hide content from
          the interface, but we can&apos;t remove it from the chain or from IPFS.
        </p>
      </section>

      <section>
        <h2>9. What you must not do</h2>
        <ul>
          <li>break the law, including sanctions, anti-money-laundering and securities rules that apply to you;</li>
          <li>defraud or mislead people, or present a tribe as endorsed by us;</li>
          <li>infringe anyone&apos;s rights, or post unlawful, abusive or harmful content or malware;</li>
          <li>attack, overload or probe the interface, the contracts or other people&apos;s wallets; or</li>
          <li>get around rate limits, security measures or a block on your access.</li>
        </ul>
      </section>

      <section>
        <h2>10. Open source, no warranty</h2>
        <p>
          The contracts and the interface are open source under the MIT License. They&apos;re provided &quot;as is&quot;
          and &quot;as available&quot;, without warranties of any kind, express or implied, including merchantability,
          fitness for a particular purpose and non-infringement. We don&apos;t claim the contracts are audited.
        </p>
      </section>

      <section>
        <h2>11. Risks you accept</h2>
        <ul>
          <li>Smart contracts can have bugs, and a bug can lose funds.</li>
          <li>Onchain transactions are irreversible.</li>
          <li>Crypto asset prices can swing widely, or fall to nothing.</li>
          <li>Laws and regulations on crypto and DAOs can change and affect what you can do.</li>
          <li>
            Data on Stellar is kept for a paid stretch of time. If a tribe&apos;s storage isn&apos;t renewed, parts of
            it stop working until they&apos;re restored. Anyone can pay to renew it.
          </li>
          <li>The network, RPC servers, wallets and the interface can be slow, down or wrong.</li>
        </ul>
      </section>

      <section>
        <h2>12. No advice</h2>
        <p>
          Nothing in the interface is financial, investment, legal or tax advice. Make your own decisions, and talk to a
          professional when you need one.
        </p>
      </section>

      <section>
        <h2>13. Other services</h2>
        <p>
          The interface relies on services we don&apos;t control: your wallet, the Stellar network and its RPC servers,
          the Goldsky indexer, IPFS and our pinning provider, WalletConnect and our hosting provider. Their own terms
          apply, and we aren&apos;t responsible for them.
        </p>
      </section>

      <section>
        <h2>14. Limitation of liability</h2>
        <p>
          To the fullest extent the law allows, Builder DAO and the people who contribute to Tribes Builder aren&apos;t
          liable for any indirect, incidental, special, consequential or punitive damages, or for any loss of funds,
          tokens, data or profits, that come from using or being unable to use the interface or the contracts. Where the
          law doesn&apos;t allow a limit, our liability is limited to the minimum the law permits.
        </p>
      </section>

      <section>
        <h2>15. Indemnity</h2>
        <p>
          To the extent the law allows, you&apos;ll cover Builder DAO and its contributors for claims, losses and costs
          that come from your breach of these terms, your misuse of the interface or the content you publish.
        </p>
      </section>

      <section>
        <h2>16. Changes and access</h2>
        <p>
          We may update these terms; the date at the top shows the latest version, and we&apos;ll mention big changes in
          the app or on Discord. Using the interface after a change means you accept it.
        </p>
        <p>
          We may change, pause or stop the interface, or block access to it, at any time. That doesn&apos;t touch
          onchain state: your tokens, tribes and treasuries stay on Stellar and keep working through the contracts.
        </p>
      </section>

      <section>
        <h2>17. Governing law and disputes</h2>
        <p>
          Tribes Builder is a global online service and hasn&apos;t chosen a governing law yet. Until it does, these
          terms are governed by the laws that apply to you and to us. If something goes wrong, tell us on{' '}
          <DiscordLink>Discord</DiscordLink> first and we&apos;ll try to sort it out informally.
        </p>
      </section>

      <section>
        <h2>18. The rest</h2>
        <p>
          If part of these terms can&apos;t be enforced, the rest still applies. These terms, with the privacy policy
          and the disclaimer, are the whole agreement between you and us about the interface. Not enforcing a term
          isn&apos;t a waiver of it.
        </p>
      </section>

      <section>
        <h2>19. Contact</h2>
        <p>
          Questions, problems and requests go to <DiscordLink />.
        </p>
      </section>
    </LegalPage>
  );
}
