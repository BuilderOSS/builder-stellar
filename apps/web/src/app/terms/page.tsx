import { Prose } from '@/components/ui/prose';

export default function TermsPage() {
  return (
    <Prose>
      <h1>Terms & Conditions</h1>
      <p>Last Updated: September 28, 2026</p>

      <section>
        <h2>Your account</h2>
        <ul>
          <li>You own your wallet security</li>
          <li>Don't do illegal stuff</li>
          <li>We can block you anytime</li>
        </ul>
      </section>

      <section>
        <h2>Your content</h2>
        <p>You keep rights to what you upload. We can display and share it to run the platform.</p>
        <p>Don't upload stuff that infringes copyrights.</p>
      </section>

      <section>
        <h2>Your DAOs</h2>
        <p>
          When you create a DAO, you're responsible for it. We don't control your DAO once it's live. Don't expect us to
          reverse anything.
        </p>
        <p>Creating a DAO doesn't make it a legal entity. Get a lawyer if needed.</p>
      </section>

      <section>
        <h2>No warranties</h2>
        <p>
          Platform is provided "as-is". Blockchain transactions are permanent and can't be undone. We're not liable for
          your losses.
        </p>
      </section>

      <section>
        <h2>Governing law</h2>
        <p>These terms are under US law. If you have a dispute, contact the Builder DAO community.</p>
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
