'use client';

import { ArrowUpRight, LoaderCircle } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Callout } from '@/components/ui/callout';
import { Card } from '@/components/ui/card';
import { Field, FieldHelperText, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { WarmInkThemeControl } from '@/components/warm-ink-theme';
import { toaster } from '@/lib/toaster';

export function WarmInkPreview() {
  const [invalid, setInvalid] = useState(false);
  return (
    <div className="page-shell">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <div className="app-frame">
        <header className="app-header warm-ink-preview-header">
          <Link className="brand-lockup" href="/">
            Builder <span className="brand-kicker">Design foundation</span>
          </Link>
          <WarmInkThemeControl />
        </header>
        <main id="main-content" tabIndex={-1} className="content-shell stack warm-ink-preview-content">
          <div className="page-intro">
            <p className="eyebrow">Warm Ink / development only</p>
            <h1 className="page-title">
              Quiet structure.
              <br />
              Clear decisions.
            </h1>
            <p className="lede">
              A shared foundation for independent DAO worlds. These are design examples, not live transactions.
            </p>
            <Link
              className="dashboard-section-link"
              href="/warm-ink-preview?shell=dao"
              style={{ justifySelf: 'start' }}
            >
              Preview the DAO shell <ArrowUpRight size={16} aria-hidden="true" />
            </Link>
          </div>
          <section className="warm-ink-preview-grid" aria-label="Theme surfaces">
            {['canvas', 'surface', 'surface-raised', 'surface-hover'].map((surface) => (
              <div key={surface} className="warm-ink-swatch" style={{ background: `var(--${surface})` }}>
                <span className="label">{surface}</span>
                <strong>Warm Ink</strong>
              </div>
            ))}
          </section>
          <Card>
            <div className="stack">
              <h2>Actions</h2>
              <div className="warm-ink-preview-actions">
                <Button
                  onClick={() =>
                    toaster.create({
                      title: 'Preview confirmed',
                      description: 'This notification is a design sample. No transaction was submitted.',
                      type: 'success'
                    })
                  }
                >
                  Preview feedback <ArrowUpRight size={16} />
                </Button>
                <Button variant="surface">Secondary</Button>
                <Button variant="outline">Outline</Button>
                <Button variant="plain">Quiet action</Button>
                <Button disabled>Unavailable</Button>
                <Button aria-busy="true" disabled>
                  <LoaderCircle size={16} className="is-spinning" /> Awaiting approval
                </Button>
              </div>
            </div>
          </Card>
          <div className="warm-ink-preview-columns">
            <Card className="stack">
              <h2>Inputs</h2>
              <Field>
                <FieldLabel htmlFor="warm-ink-name">Community name</FieldLabel>
                <Input
                  id="warm-ink-name"
                  placeholder="Your community"
                  aria-invalid={invalid || undefined}
                  aria-describedby="warm-ink-name-help"
                />
                <FieldHelperText id="warm-ink-name-help" style={invalid ? { color: 'var(--danger)' } : undefined}>
                  {invalid
                    ? 'Enter a community name before continuing.'
                    : 'Names and purpose stay clear in both themes.'}
                </FieldHelperText>
              </Field>
              <Field>
                <FieldLabel htmlFor="warm-ink-purpose">Purpose</FieldLabel>
                <Textarea id="warm-ink-purpose" rows={3} placeholder="What will you build together?" />
              </Field>
              <Field>
                <FieldLabel htmlFor="warm-ink-status">Display state</FieldLabel>
                <Select id="warm-ink-status">
                  <option>Operational</option>
                  <option>Pending launch</option>
                </Select>
              </Field>
              <Button variant="outline" onClick={() => setInvalid((value) => !value)}>
                Toggle validation example
              </Button>
            </Card>
            <div className="stack">
              <Callout
                title="Awaiting confirmation"
                description="Keep the current input while the wallet request is open."
              />
              <Callout
                variant="warning"
                title="Awaiting index"
                description="Confirmation and indexed data are separate states."
              />
              <Callout
                variant="error"
                title="Request rejected"
                description="Nothing was submitted. You can review and retry."
              />
              <Callout
                variant="success"
                title="Confirmed"
                description="A receipt should retain its transaction evidence."
              />
            </div>
          </div>
          <Card className="stack">
            <h2>Lists and states</h2>
            <div className="warm-ink-preview-table-wrap">
              <table className="warm-ink-preview-table">
                <caption className="sr-only">Example proposal states, not live DAO data</caption>
                <thead>
                  <tr>
                    <th scope="col">Proposal</th>
                    <th scope="col">State</th>
                    <th scope="col">Votes</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>Community fund</td>
                    <td>
                      <Badge>Active</Badge>
                    </td>
                    <td>1,240</td>
                  </tr>
                  <tr>
                    <td>Working group mandate</td>
                    <td>
                      <Badge>Queued</Badge>
                    </td>
                    <td>986</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div aria-label="Loading example">
              <Skeleton style={{ width: '65%', height: 16 }} />
              <Skeleton style={{ width: '40%', height: 16, marginTop: 8 }} />
            </div>
            <div className="empty-state">
              <h3>No items yet</h3>
              <p className="lede" style={{ margin: '8px auto 0' }}>
                An empty state explains what belongs here without implying a failure.
              </p>
            </div>
          </Card>
        </main>
      </div>
    </div>
  );
}
