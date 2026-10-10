import { Callout } from '@/components/ui';
import { Prose } from '@/components/ui/prose';

export default function DisclaimerPage() {
  return (
    <Prose>
      <h1>Disclaimer</h1>
      <p>Last Updated: September 28, 2026</p>

      <Callout
        variant="warning"
        title="Use at your own risk."
        description="This platform involves blockchain, smart contracts, and DAOs. All carry serious risks. See below."
      />

      <section>
        <h2>Not financial advice</h2>
        <p>
          We're not financial advisors. Don't rely on us for investment, financial, legal, or tax decisions. Talk to
          real professionals first.
        </p>
      </section>

      <section>
        <h2>Blockchain is permanent</h2>
        <p>
          Once you send funds or create something, it can't be undone. Wrong address? Bad DAO config? Tough luck. We
          can't reverse it.
        </p>
      </section>

      <section>
        <h2>Smart contracts have bugs</h2>
        <p>Code can fail. Contracts might have vulnerabilities. We don't guarantee they work correctly or safely.</p>
      </section>

      <section>
        <h2>Network risks</h2>
        <p>
          Stellar network can go down. Third-party RPC providers can fail. Our platform might be unavailable. Not our
          fault if these happen.
        </p>
      </section>

      <section>
        <h2>Wallets & third parties</h2>
        <p>
          Your wallet can be hacked. Wallet software can have bugs. Storage services can lose data. We don't control
          these.
        </p>
      </section>

      <section>
        <h2>DAO risks</h2>
        <p>
          DAOs can be scams. Members can steal funds. Governance can be manipulated. We can't guarantee fair or safe
          DAOs.
        </p>
      </section>

      <section>
        <h2>Regulation unclear</h2>
        <p>
          Laws about DAOs and crypto change fast. Your jurisdiction might classify tokens as securities. Talk to a
          lawyer.
        </p>
      </section>

      <section>
        <h2>TL;DR</h2>
        <p>
          Only use money you can afford to lose. Get expert advice. Check everything twice. We're not responsible for
          any losses.
        </p>
      </section>
    </Prose>
  );
}
