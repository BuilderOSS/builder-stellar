'use client';

import { Download, FileText, Plus, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { css } from 'styled-system/css';

import {
  Address,
  Button,
  Callout,
  Chip,
  ChoiceGroup,
  FieldHelperText,
  FieldLabel,
  IconButton,
  Input,
  ListRow,
  Markdown,
  ProgressSteps,
  Section,
  Skeleton,
  Textarea
} from '@/components/ui';
import type { DaoNetworkConfig } from '@/lib/dao-config';
import { getExplorerAccountUrl } from '@/lib/explorer-links';
import {
  BENEFICIAL_OWNER_BPS,
  buildBundle,
  bundleFileStem,
  bundleToMarkdown,
  type ChainFacts,
  type DraftErrors,
  emptyDraft,
  type EntityDraft,
  type EntityType,
  hasErrors,
  KYC_CATEGORY_TEXT,
  kycAssessment,
  MAX_MANAGERS,
  MAX_PURPOSE_LENGTH,
  validateDraft
} from '@/lib/legal-export/bundle';
import { useLegalFacts } from '@/lib/legal-export/facts';

const stack = css({ display: 'grid', gap: '5' });
const field = css({ display: 'grid', gap: '1.5' });
const twoCol = css({ display: 'grid', gap: '4', gridTemplateColumns: { base: '1fr', md: '1fr 1fr' } });
const rows = css({ display: 'grid' });
const error = css({ textStyle: 'caption', color: 'danger', m: '0', fontWeight: '600' });
const muted = css({ textStyle: 'caption', color: 'ink.muted', m: '0' });
const managerRow = css({
  display: 'grid',
  gap: '2',
  gridTemplateColumns: { base: '1fr auto', md: '1fr 1fr 1.4fr auto' },
  alignItems: 'start'
});
const nav = css({ display: 'flex', gap: '3', justifyContent: 'space-between', flexWrap: 'wrap' });
const actions = css({ display: 'flex', gap: '3', flexWrap: 'wrap' });
const preview = css({
  border: '1px solid',
  borderColor: 'line',
  borderRadius: 'card',
  p: { base: '4', md: '6' },
  maxH: '120',
  overflowY: 'auto'
});

const STEPS = [
  { id: 'entity', label: 'Entity' },
  { id: 'people', label: 'People' },
  { id: 'review', label: 'Review' },
  { id: 'export', label: 'Export' }
];

const ENTITY_OPTIONS = [
  {
    value: 'non-profit',
    label: 'Non-profit',
    description: 'No profits distributed to members. Tax-exempt in the Marshall Islands.'
  },
  {
    value: 'for-profit',
    label: 'For-profit',
    description: 'May distribute profits. Pays the Marshall Islands gross revenue tax.'
  },
  { value: 'undecided', label: 'Not decided yet', description: 'Talk it through with the registrar first.' }
];

function download(name: string, type: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  // Give the browser a moment to start the download before freeing the blob.
  setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

const pct = (bps: number) => `${(bps / 100).toLocaleString('en-GB', { maximumFractionDigits: 2 })}%`;

/** Which steps a set of errors belongs to, so Continue stops on the step that needs fixing. */
function stepErrors(errors: DraftErrors, step: number) {
  if (step === 0) return Boolean(errors.legalName || errors.purpose);
  if (step === 1) return Boolean(errors.contactName || errors.contactEmail || errors.managers);
  return false;
}

export function LegalExport({ config, daoId, routeId }: { config: DaoNetworkConfig; daoId: string; routeId: string }) {
  const tribeName = config.label || config.tokenName;
  const [draft, setDraft] = useState<EntityDraft>(() => emptyDraft(tribeName, config.profile.description));
  const [step, setStep] = useState(0);
  const [showErrors, setShowErrors] = useState(false);
  const [exported, setExported] = useState<string | null>(null);
  // The facts as of opening Export, so both files and the preview carry the same moment.
  const [frozen, setFrozen] = useState<ChainFacts | null>(null);
  const facts = useLegalFacts(config, daoId, routeId);

  const errors = validateDraft(draft);
  const shown = showErrors ? errors : {};
  const set = (patch: Partial<EntityDraft>) => {
    setExported(null);
    setDraft((current) => ({ ...current, ...patch }));
  };
  const setContact = (patch: Partial<EntityDraft['contact']>) => set({ contact: { ...draft.contact, ...patch } });

  const kyc = useMemo(
    () =>
      kycAssessment(
        facts.holders.map((h) => ({ address: h.address, votingPower: BigInt(h.voting_power) })),
        facts.votingSupply ? BigInt(facts.votingSupply) : 0n,
        draft.managers
      ),
    [facts.holders, facts.votingSupply, draft.managers]
  );

  const bundle = step === 3 && frozen && !hasErrors(errors) ? buildBundle(draft, frozen) : null;
  const markdown = bundle ? bundleToMarkdown(bundle) : '';

  function next() {
    if (stepErrors(errors, step)) {
      setShowErrors(true);
      return;
    }
    setShowErrors(false);
    goTo(Math.min(step + 1, STEPS.length - 1));
  }

  function goTo(index: number) {
    if (index === STEPS.length - 1) setFrozen(facts.snapshot());
    setStep(index);
  }

  function exportFiles(kind: 'json' | 'md') {
    if (!bundle) return;
    const stem = bundleFileStem(bundle);
    if (kind === 'json') download(`${stem}.json`, 'application/json', `${JSON.stringify(bundle, null, 2)}\n`);
    else download(`${stem}.md`, 'text/markdown', markdown);
    setExported(kind === 'json' ? 'The JSON bundle downloaded.' : 'The summary downloaded.');
  }

  return (
    <div className={stack}>
      <Callout
        variant="info"
        title="This helps a registrar's intake. It isn't legal advice."
        description="The export collects what a DAO registrar such as MIDAO asks for first: your tribe's contracts, voting rules, treasury and who holds voting power, plus a few answers only you can give. Nothing is sent anywhere: the files download to this device, and you decide who gets them. Talk to a qualified lawyer before you form an entity."
      />
      <ProgressSteps steps={STEPS} current={step} onSelect={goTo} />

      {step === 0 ? (
        <Section title="The entity" description="How the legal entity would be named and what it is for.">
          <div className={stack}>
            <div className={twoCol}>
              <div className={field}>
                <FieldLabel htmlFor="legal-name">Proposed legal name</FieldLabel>
                <Input
                  id="legal-name"
                  value={draft.legalName}
                  aria-invalid={Boolean(shown.legalName) || undefined}
                  aria-describedby="legal-name-help"
                  onChange={(e) => set({ legalName: e.target.value })}
                />
                {shown.legalName ? (
                  <p className={error} role="alert">
                    {shown.legalName}
                  </p>
                ) : (
                  <FieldHelperText id="legal-name-help">
                    Ends with “DAO LLC”, for example Lantern DAO LLC.
                  </FieldHelperText>
                )}
              </div>
              <div className={field}>
                <FieldLabel htmlFor="trade-name">Trading name</FieldLabel>
                <Input id="trade-name" value={draft.tradeName} onChange={(e) => set({ tradeName: e.target.value })} />
                <FieldHelperText>The name people know you by, if it differs.</FieldHelperText>
              </div>
            </div>
            <ChoiceGroup
              label="Entity type"
              variant="card"
              options={ENTITY_OPTIONS}
              value={draft.entityType}
              onValueChange={(value) => set({ entityType: value as EntityType })}
            />
            <div className={field}>
              <FieldLabel htmlFor="legal-purpose">Purpose</FieldLabel>
              <Textarea
                id="legal-purpose"
                rows={5}
                value={draft.purpose}
                maxLength={MAX_PURPOSE_LENGTH}
                aria-invalid={Boolean(shown.purpose) || undefined}
                onChange={(e) => set({ purpose: e.target.value })}
              />
              {shown.purpose ? (
                <p className={error} role="alert">
                  {shown.purpose}
                </p>
              ) : (
                <FieldHelperText>What the tribe does and why. Starts from your tribe description.</FieldHelperText>
              )}
            </div>
          </div>
        </Section>
      ) : null}

      {step === 1 ? (
        <Section
          title="People"
          description="Who the registrar talks to, and anyone who manages the tribe on its behalf."
        >
          <div className={stack}>
            <div className={twoCol}>
              <div className={field}>
                <FieldLabel htmlFor="contact-name">Contact name</FieldLabel>
                <Input
                  id="contact-name"
                  autoComplete="name"
                  value={draft.contact.name}
                  aria-invalid={Boolean(shown.contactName) || undefined}
                  onChange={(e) => setContact({ name: e.target.value })}
                />
                {shown.contactName ? (
                  <p className={error} role="alert">
                    {shown.contactName}
                  </p>
                ) : null}
              </div>
              <div className={field}>
                <FieldLabel htmlFor="contact-email">Contact email (optional)</FieldLabel>
                <Input
                  id="contact-email"
                  type="email"
                  autoComplete="email"
                  value={draft.contact.email}
                  aria-invalid={Boolean(shown.contactEmail) || undefined}
                  onChange={(e) => setContact({ email: e.target.value })}
                />
                {shown.contactEmail ? (
                  <p className={error} role="alert">
                    {shown.contactEmail}
                  </p>
                ) : null}
              </div>
              <div className={field}>
                <FieldLabel htmlFor="contact-role">Contact role (optional)</FieldLabel>
                <Input
                  id="contact-role"
                  placeholder="Founder"
                  value={draft.contact.role}
                  onChange={(e) => setContact({ role: e.target.value })}
                />
              </div>
            </div>

            <div className={field}>
              <FieldLabel htmlFor="manager-0-name">Managers (optional)</FieldLabel>
              <p className={muted}>
                A DAO LLC can be run entirely by its contracts. List anyone who acts for the tribe off chain, such as
                signing agreements. With no holder at 25%, managers are the ones a registrar verifies.
              </p>
              {draft.managers.map((manager, i) => (
                <div key={i} className={managerRow}>
                  <Input
                    id={`manager-${i}-name`}
                    aria-label={`Manager ${i + 1} name`}
                    placeholder="Name"
                    value={manager.name}
                    aria-invalid={Boolean(shown.managers?.[i]) || undefined}
                    onChange={(e) =>
                      set({ managers: draft.managers.map((m, j) => (j === i ? { ...m, name: e.target.value } : m)) })
                    }
                  />
                  <Input
                    aria-label={`Manager ${i + 1} role`}
                    placeholder="Role"
                    value={manager.role}
                    onChange={(e) =>
                      set({ managers: draft.managers.map((m, j) => (j === i ? { ...m, role: e.target.value } : m)) })
                    }
                  />
                  <Input
                    aria-label={`Manager ${i + 1} Stellar address`}
                    placeholder="Stellar address (optional)"
                    spellCheck={false}
                    autoCapitalize="none"
                    value={manager.wallet}
                    aria-invalid={Boolean(shown.managers?.[i]) || undefined}
                    onChange={(e) =>
                      set({ managers: draft.managers.map((m, j) => (j === i ? { ...m, wallet: e.target.value } : m)) })
                    }
                  />
                  <IconButton
                    label={`Remove manager ${i + 1}`}
                    onClick={() => set({ managers: draft.managers.filter((_, j) => j !== i) })}
                  >
                    <Trash2 aria-hidden="true" />
                  </IconButton>
                  {shown.managers?.[i] ? (
                    <p className={error} role="alert">
                      {shown.managers[i]}
                    </p>
                  ) : null}
                </div>
              ))}
              <div>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={draft.managers.length >= MAX_MANAGERS}
                  onClick={() => set({ managers: [...draft.managers, { name: '', role: '', wallet: '' }] })}
                >
                  <Plus aria-hidden="true" />
                  Add a manager
                </Button>
              </div>
            </div>

            <div className={field}>
              <FieldLabel htmlFor="legal-notes">Notes for the registrar (optional)</FieldLabel>
              <Textarea
                id="legal-notes"
                rows={3}
                value={draft.notes}
                onChange={(e) => set({ notes: e.target.value })}
              />
            </div>
          </div>
        </Section>
      ) : null}

      {step === 2 ? (
        <>
          {facts.problems.length ? (
            <Callout
              variant="warning"
              title={`Some details didn't load: ${facts.problems.join(', ')}`}
              description="The export still works and marks those parts unknown. Refresh to try again."
            />
          ) : null}
          <Section
            title="Who a registrar would verify"
            description={`MIDAO asks anyone with ${pct(BENEFICIAL_OWNER_BPS)} or more of the governance rights to complete KYC. Voting power changes as tokens move, so this is as of now.`}
          >
            {facts.loading ? (
              <Skeleton className={css({ height: '14', borderRadius: 'control' })} />
            ) : (
              <div className={rows}>
                <ListRow
                  title={`Category ${kyc.category}`}
                  meta={KYC_CATEGORY_TEXT[kyc.category]}
                  wrap
                  trailing={
                    <Chip tone={kyc.category === 'A' ? 'warning' : 'neutral'}>{kyc.owners.length} at 25%+</Chip>
                  }
                />
                {kyc.owners.map((owner) => (
                  <ListRow
                    key={owner.address}
                    title={
                      <Address
                        value={owner.address}
                        compact
                        explorerUrl={getExplorerAccountUrl(config.name, owner.address)}
                      />
                    }
                    meta={`${owner.votingPower.toString()} votes`}
                    trailing={<Chip tone="warning">{pct(owner.bps)}</Chip>}
                  />
                ))}
              </div>
            )}
          </Section>
          <Section title="From the chain" description="Included as they are now. Nothing here needs filling in.">
            <div className={rows}>
              <ListRow
                title="Membership"
                meta={`${config.tokenName} (${config.tokenSymbol}) · one token, one vote${config.tokenSettings.transfersLocked ? ' · transfers locked' : ''}`}
                wrap
              />
              <ListRow
                title="Voting rules, treasury and balances"
                meta="Voting delay and period, quorum, the safety delay, and what the Treasury holds."
                wrap
              />
              <ListRow
                title="Smart contracts"
                meta={`${facts.snapshot().contracts.length} contracts, with explorer links`}
              />
            </div>
          </Section>
        </>
      ) : null}

      {step === 3 ? (
        <Section
          title="Export"
          description="Two files with the same content: JSON for the registrar's intake, Markdown for people to read."
        >
          {bundle ? (
            <div className={stack}>
              <div className={actions}>
                <Button onClick={() => exportFiles('json')}>
                  <Download aria-hidden="true" />
                  Download bundle (JSON)
                </Button>
                <Button variant="secondary" onClick={() => exportFiles('md')}>
                  <FileText aria-hidden="true" />
                  Download summary (Markdown)
                </Button>
              </div>
              <p className={muted} aria-live="polite">
                {exported ?? 'Check the summary below before you send it.'}
              </p>
              <div className={preview}>
                <Markdown source={markdown} />
              </div>
            </div>
          ) : (
            <Callout
              variant="warning"
              title="Some answers need fixing first"
              description="Go back to Entity and People: the highlighted fields explain what's missing."
            />
          )}
        </Section>
      ) : null}

      <div className={nav}>
        <Button variant="ghost" disabled={step === 0} onClick={() => setStep((s) => Math.max(s - 1, 0))}>
          Back
        </Button>
        {step < STEPS.length - 1 ? <Button onClick={next}>Continue</Button> : null}
      </div>
    </div>
  );
}
