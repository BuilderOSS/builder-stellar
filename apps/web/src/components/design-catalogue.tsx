'use client';

import { Gavel, Plus, Settings, Trash2, Wallet } from 'lucide-react';
import { useState } from 'react';
import { css } from 'styled-system/css';

import {
  ActionBar,
  Address,
  Amount,
  Avatar,
  AvatarStack,
  Button,
  ButtonLink,
  Callout,
  Card,
  Checkbox,
  Chip,
  ChoiceGroup,
  ConfirmAction,
  Countdown,
  Crest,
  CrestStripe,
  Dialog,
  Disclosure,
  EmptyState,
  ErrorState,
  Field,
  FieldHelperText,
  FieldLabel,
  IconButton,
  Input,
  ListRow,
  Menu,
  PageHeader,
  Pagination,
  Popover,
  ProgressSteps,
  SearchInput,
  Section,
  SegmentedControl,
  Select,
  Sheet,
  Skeleton,
  Spinner,
  Switch,
  Text,
  Tooltip,
  VoteTally
} from '@/components/ui';
import { toaster } from '@/lib/toaster';

const page = css({ maxW: 'content', mx: 'auto', px: 'clamp(16px, 4vw, 40px)', py: '10', pb: '40' });
const grid = css({ display: 'grid', gap: '8' });
const row = css({ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '3' });
const two = css({ display: 'grid', gap: '4', gridTemplateColumns: { base: '1fr', md: '1fr 1fr' } });
const swatch = css({ display: 'grid', gap: '1.5', textStyle: 'caption', color: 'ink.muted' });
const chip = css({
  width: '16',
  height: '12',
  borderRadius: 'control',
  boxShadow: 'inset 0 0 0 1px token(colors.rule)'
});

const SWATCHES = [
  ['canvas', css({ bg: 'canvas' })],
  ['surface', css({ bg: 'surface' })],
  ['raised', css({ bg: 'raised' })],
  ['hover', css({ bg: 'hover' })],
  ['ink', css({ bg: 'ink' })],
  ['ink.muted', css({ bg: 'ink.muted' })],
  ['signal', css({ bg: 'signal' })],
  ['primary', css({ bg: 'primary' })],
  ['brass', css({ bg: 'brass' })],
  ['success', css({ bg: 'success' })],
  ['warning', css({ bg: 'warning' })],
  ['danger', css({ bg: 'danger' })]
] as const;

const ADDRESS = 'GDQNY3PBOJOKYZSRMK2S7LHHGWZIUISD4QORETLMXEWXBI7KFZZMKTL3';
const CONTRACT = 'CDK3TSVQGFJ7UQYDWBXLD3W3A7QNHFXDZK6PLHYQZEGOH7FSM6R7CZTR';

export function DesignCatalogue() {
  const [vote, setVote] = useState<string | null>('for');
  const [appearance, setAppearance] = useState('dark');
  const [sheetOpen, setSheetOpen] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [switchOn, setSwitchOn] = useState(true);
  const [checked, setChecked] = useState(false);
  const [query, setQuery] = useState('');
  const [step, setStep] = useState(1);
  const [auctionEndsAt] = useState(() => Math.floor(Date.now() / 1000) + 7_800);

  return (
    <main className={page} id="main-content">
      <PageHeader
        title="Design system"
        meta="Warm Ink · Dusk. Every primitive in one place. Toggle the theme to check both."
        actions={
          <>
            <Button variant="secondary" onClick={() => setSheetOpen(true)}>
              Open sheet
            </Button>
            <Button onClick={() => setDialogOpen(true)}>Open dialog</Button>
          </>
        }
      />

      <div className={grid}>
        <Section title="Colour">
          <div className={row}>
            {SWATCHES.map(([name, className]) => (
              <span key={name} className={swatch}>
                <span className={`${chip} ${className}`} />
                {name}
              </span>
            ))}
          </div>
        </Section>

        <Section title="Type">
          <div className={css({ display: 'grid', gap: '3' })}>
            <p className={css({ textStyle: 'display', m: '0' })}>Lantern Club treasury</p>
            <p className={css({ textStyle: 'title', m: '0' })}>Fund the winter tool library</p>
            <p className={css({ textStyle: 'heading', m: '0' })}>This week in Lantern Club</p>
            <Text>
              Members vote with their tokens. If a proposal passes, the treasury pays out after a short safety delay.
            </Text>
            <span className={css({ textStyle: 'label' })}>Voting power</span>
            <span className={css({ textStyle: 'mono' })}>CCX7…Q4MZ · 2,400.00 XLM</span>
          </div>
        </Section>

        <Section title="Buttons">
          <div className={row}>
            <Button>Place bid</Button>
            <Button variant="secondary">Delegate</Button>
            <Button variant="ghost">View history</Button>
            <Button variant="danger">Cancel proposal</Button>
            <Button variant="link">Show technical details</Button>
            <Button loading>Signing</Button>
            <Button disabled>Disabled</Button>
            <IconButton label="Settings">
              <Settings aria-hidden="true" />
            </IconButton>
            <ButtonLink href="/" variant="secondary">
              Link button
            </ButtonLink>
          </div>
        </Section>

        <Section title="Chips">
          <div className={row}>
            <Chip>Pending setup</Chip>
            <Chip tone="live">
              <Gavel aria-hidden="true" />
              Auction live
            </Chip>
            <Chip tone="yours">You own #7</Chip>
            <Chip tone="success">Passed</Chip>
            <Chip tone="warning">Queued</Chip>
            <Chip tone="danger">Defeated</Chip>
            <Chip tone="outline">Testnet</Chip>
          </div>
        </Section>

        <div className={two}>
          <Section title="Identity">
            <div className={row}>
              <Avatar address={ADDRESS} size="lg" label="Account avatar" />
              <Avatar address={CONTRACT} yours />
              <AvatarStack addresses={[ADDRESS, CONTRACT, `${ADDRESS}x`, `${CONTRACT}y`]} />
              <Crest name="Lantern Club" seed={CONTRACT} size="lg" />
              <Crest name="Harbor Commons" seed={ADDRESS} />
              <CrestStripe seed={CONTRACT} />
            </div>
            <Address value={CONTRACT} label="Token contract" />
            <div className={row}>
              <Amount value="2,400.00" unit="XLM" />
              <span>
                Ends in <Countdown endsAt={auctionEndsAt} />
              </span>
            </div>
          </Section>

          <Section title="Vote tally">
            <VoteTally forVotes={31} againstVotes={11} abstainVotes={8} quorum={20} note="Quorum met" />
            <VoteTally forVotes={2} againstVotes={0} abstainVotes={0} quorum={20} compact />
          </Section>
        </div>

        <Section title="Choices">
          <ChoiceGroup
            label="Your vote"
            value={vote}
            onValueChange={setVote}
            options={[
              { value: 'for', label: 'For', tone: 'success' },
              { value: 'against', label: 'Against', tone: 'danger' },
              { value: 'abstain', label: 'Abstain', tone: 'neutral' }
            ]}
          />
          <SegmentedControl
            label="Appearance"
            value={appearance}
            onValueChange={setAppearance}
            options={[
              { value: 'system', label: 'System' },
              { value: 'light', label: 'Light' },
              { value: 'dark', label: 'Dark' }
            ]}
          />
          <Switch
            label="Run auctions"
            description="New tokens are auctioned one at a time."
            checked={switchOn}
            onCheckedChange={setSwitchOn}
          />
          <Checkbox label="I reviewed the launch settings" checked={checked} onCheckedChange={setChecked} />
        </Section>

        <Section title="Fields">
          <div className={two}>
            <Field>
              <FieldLabel htmlFor="demo-name">Community name</FieldLabel>
              <Input id="demo-name" placeholder="Lantern Club" />
              <FieldHelperText>Shown on your crest and everywhere people find you.</FieldHelperText>
            </Field>
            <Field>
              <FieldLabel htmlFor="demo-select">Voting period</FieldLabel>
              <Select id="demo-select" defaultValue="3">
                <option value="1">1 day</option>
                <option value="3">3 days</option>
                <option value="7">7 days</option>
              </Select>
            </Field>
          </div>
          <SearchInput label="Search communities" value={query} onValueChange={setQuery} placeholder="Search" />
        </Section>

        <Section title="Lists">
          <Card>
            <ListRow
              href="/"
              media={<Crest name="Lantern Club" seed={CONTRACT} />}
              title="Lantern #42 is up for auction"
              meta="Top bid 180 XLM by mira.xlm"
              trailing={<Chip tone="live">2h</Chip>}
            />
            <ListRow
              media={<Avatar address={ADDRESS} />}
              title="Theo joined as a member"
              meta="Won Lantern #41"
              trailing={<Chip tone="yours">You voted For</Chip>}
            />
          </Card>
          <Pagination
            label="Demo pages"
            page={2}
            hasPrevious
            hasNext
            onPrevious={() => undefined}
            onNext={() => undefined}
          />
        </Section>

        <Section title="Feedback">
          <Callout title="What happens if this passes" description="2,400 XLM moves to mira.xlm after a 2-day delay." />
          <Callout
            variant="warning"
            title="Your wallet is on Mainnet"
            description="Switch it to Testnet to vote. You can still read everything."
          />
          <Callout variant="success" title="Vote cast" />
          <ErrorState
            title="Members didn't load"
            cause="The indexer didn't respond."
            actions={<Button variant="secondary">Try again</Button>}
          />
          <EmptyState title="No proposals yet" action={<Button>New proposal</Button>}>
            Proposals show up here once a member with enough votes creates one.
          </EmptyState>
          <div className={row}>
            <Spinner />
            <Skeleton className={css({ width: '40', height: '4' })} />
            <Button
              variant="secondary"
              onClick={() => toaster.success({ title: 'Vote cast', description: 'Transaction confirmed on-chain.' })}
            >
              Toast
            </Button>
          </div>
        </Section>

        <Section title="Overlays">
          <div className={row}>
            <Popover trigger={<Button variant="secondary">Popover</Button>} label="Indexer status">
              <Text>Indexed through ledger 1,234,567.</Text>
            </Popover>
            <Tooltip content="Create proposals once you hold a token">
              <Button variant="secondary">Tooltip</Button>
            </Tooltip>
            <Menu
              trigger={<Button variant="secondary">Menu</Button>}
              items={[
                { value: 'copy', label: 'Copy address', icon: <Wallet aria-hidden="true" /> },
                { value: 'new', label: 'New draft', icon: <Plus aria-hidden="true" /> },
                { value: 'sep', separator: true },
                { value: 'delete', label: 'Delete draft', icon: <Trash2 aria-hidden="true" />, tone: 'danger' }
              ]}
            />
            <ConfirmAction
              trigger={<Button variant="danger">Cancel proposal</Button>}
              title="Cancel this proposal?"
              description="Votes stop and it can't be reopened."
              confirmLabel="Cancel proposal"
              onConfirm={() => undefined}
            />
          </div>
          <Disclosure>
            <Address value={CONTRACT} label="Governor contract" />
          </Disclosure>
        </Section>

        <Section title="Progress">
          <ProgressSteps
            current={step}
            onSelect={setStep}
            canSelect={() => true}
            steps={[
              { id: 'identity', label: 'Identity' },
              { id: 'membership', label: 'Membership' },
              { id: 'governance', label: 'Governance' },
              { id: 'review', label: 'Review' }
            ]}
          />
        </Section>
      </div>

      <ActionBar mobileOnly>
        <Button onClick={() => setDialogOpen(true)}>Primary action</Button>
      </ActionBar>

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen} title="Lantern Club" description="Your membership">
        <Text>Sheets slide up on phones and in from the side on wider screens.</Text>
      </Sheet>
      <Dialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        title="Place 200 XLM bid?"
        description="Your wallet will ask you to sign. If you're outbid, the XLM comes back to you."
        footer={
          <>
            <Button variant="ghost" onClick={() => setDialogOpen(false)}>
              Not yet
            </Button>
            <Button onClick={() => setDialogOpen(false)}>Place bid</Button>
          </>
        }
      />
    </main>
  );
}
