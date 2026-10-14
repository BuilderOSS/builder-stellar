import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { getTreasuryAssets } from '@/lib/assets-config';

import { MarketPaymentAssetForm, type OpenPoolDraft, OpenPoolForm, ResaleFeeForm } from './admin-action-forms';

vi.stubGlobal('React', React);

const draft: OpenPoolDraft = {
  price: '',
  asset: '',
  size: '',
  maxPerBuyer: '1',
  maxSoldPerPeriod: '',
  periodHours: '24',
  expiresAt: ''
};
const contractId = (code: string) => getTreasuryAssets('testnet').find((asset) => asset.code === code)!.contractId!;
const options = (html: string) => [...html.matchAll(/<option value="([^"]*)"[^>]*>([^<]*)</g)].map((m) => [m[1], m[2]]);
/** The opening tag of the element with this id. */
const tag = (html: string, id: string) => html.match(new RegExp(`<[a-z]+[^>]*\\bid="${id}"[^>]*>`))?.[0] ?? '';

describe('OpenPoolForm', () => {
  it('offers only XLM and USDC, and says why', () => {
    const html = renderToStaticMarkup(
      <OpenPoolForm value={draft} onChange={() => {}} disabled={false} network="testnet" />
    );
    expect(options(html)).toEqual([
      ['', 'Choose XLM or USDC'],
      [contractId('XLM'), 'XLM · Lumens'],
      [contractId('USDC'), 'USDC · USD Coin']
    ]);
    expect(html).not.toContain('EURC');
    expect(html).not.toContain('contract address');
    expect(html).toContain('the only assets the market takes, so a pool priced in anything else could never sell');
  });

  it('points the asset picker at its hint, or at its error once invalid', () => {
    const fine = renderToStaticMarkup(
      <OpenPoolForm value={draft} onChange={() => {}} disabled={false} network="testnet" />
    );
    expect(tag(fine, 'pool-asset')).toContain('aria-describedby="pool-asset-hint"');
    expect(tag(fine, 'pool-asset')).not.toContain('aria-invalid');
    expect(tag(fine, 'pool-asset-hint')).toMatch(/^<p /);

    const message = 'Choose the asset buyers pay in: XLM or USDC.';
    const invalid = renderToStaticMarkup(
      <OpenPoolForm
        value={draft}
        onChange={() => {}}
        disabled={false}
        network="testnet"
        validationErrors={{ valid: false, message, fields: { asset: message } }}
      />
    );
    expect(tag(invalid, 'pool-asset')).toContain('aria-invalid="true"');
    expect(tag(invalid, 'pool-asset')).toContain('aria-describedby="pool-asset-error"');
    expect(tag(invalid, 'pool-asset-error')).toContain('role="alert"');
    expect(invalid).toContain(`${tag(invalid, 'pool-asset-error')}${message}</p>`);
    expect(invalid).not.toContain('id="pool-asset-hint"');
  });

  it('shows an unsupported asset from an older draft as unchosen', () => {
    const html = renderToStaticMarkup(
      <OpenPoolForm
        value={{ ...draft, asset: contractId('EURC') }}
        onChange={() => {}}
        disabled={false}
        network="testnet"
      />
    );
    expect(html).toContain('<option value="" selected="">Choose XLM or USDC</option>');
    const usdc = renderToStaticMarkup(
      <OpenPoolForm
        value={{ ...draft, asset: contractId('USDC') }}
        onChange={() => {}}
        disabled={false}
        network="testnet"
      />
    );
    expect(usdc).toContain(`<option value="${contractId('USDC')}" selected="">USDC · USD Coin</option>`);
  });
});

describe('MarketPaymentAssetForm', () => {
  it('offers only XLM and USDC for the market, never a custom contract', () => {
    const html = renderToStaticMarkup(
      <MarketPaymentAssetForm
        value={{ paymentToken: contractId('XLM') }}
        onChange={() => {}}
        disabled={false}
        network="testnet"
      />
    );
    expect(options(html)).toEqual([
      ['', 'Choose XLM or USDC'],
      [contractId('XLM'), 'XLM · Lumens'],
      [contractId('USDC'), 'USDC · USD Coin']
    ]);
    expect(html).toContain(`<option value="${contractId('XLM')}" selected="">`);
    expect(html).toContain('Open listings keep the asset they were listed in.');
    expect(html).not.toContain('contract address');
  });
});

describe('ResaleFeeForm', () => {
  it('asks for a percent, like the rest of the market', () => {
    const html = renderToStaticMarkup(<ResaleFeeForm value={{ value: '2.5' }} onChange={() => {}} disabled={false} />);
    expect(html).toContain('Resale fee (%)');
    expect(html).toContain('value="2.5"');
    expect(html).toContain('up to 25%');
    expect(html).not.toMatch(/bps|basis points/i);
  });

  it('points the input at its hint, or at its error once invalid', () => {
    const fine = renderToStaticMarkup(<ResaleFeeForm value={{ value: '2.5' }} onChange={() => {}} disabled={false} />);
    expect(tag(fine, 'resale-fee')).toContain('aria-describedby="resale-fee-hint"');
    expect(tag(fine, 'resale-fee')).not.toContain('aria-invalid');

    const message = 'Enter a fee from 0% to 25%, with at most two decimals.';
    const invalid = renderToStaticMarkup(
      <ResaleFeeForm
        value={{ value: '30' }}
        onChange={() => {}}
        disabled={false}
        validationErrors={{ valid: false, message, fields: { value: message } }}
      />
    );
    expect(tag(invalid, 'resale-fee')).toContain('aria-invalid="true"');
    expect(tag(invalid, 'resale-fee')).toContain('aria-describedby="resale-fee-error"');
    expect(tag(invalid, 'resale-fee-error')).toContain('role="alert"');
    expect(invalid).toContain(`${tag(invalid, 'resale-fee-error')}${message}</p>`);
  });
});
