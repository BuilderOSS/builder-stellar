'use client';

import { type ReactNode, useState } from 'react';
import { css } from 'styled-system/css';

import { ButtonLink, Sheet } from '@/components/ui';

const list = css({ display: 'grid', gap: '4', listStyle: 'none', m: '0', p: '0' });
const item = css({ display: 'grid', gap: '1' });
const heading = css({ textStyle: 'subheading', m: '0' });
const plain = css({ textStyle: 'body', m: '0' });
const dao = css({ textStyle: 'caption', color: 'ink.muted', m: '0' });
const lede = css({ textStyle: 'body', color: 'ink.muted', m: '0', mb: '5' });

const PARTS: Array<{ title: string; plain: string; dao: string }> = [
  {
    title: 'Members',
    plain: 'Each member holds a token. Hold one and you’re in, with a say in what the tribe does next.',
    dao: 'Each membership is an NFT with one vote.'
  },
  {
    title: 'Treasury',
    plain: 'The money the tribe holds together. It only moves when a vote passes, and everyone can see where it went.',
    dao: 'An onchain treasury contract that no single person controls.'
  },
  {
    title: 'Proposals',
    plain: 'An idea put to a vote: pay someone, open a sale, change a setting. If it passes, it runs as written.',
    dao: 'Governance proposals with onchain actions. Any wallet can execute one that’s ready.'
  },
  {
    title: 'Votes',
    plain: 'Members vote For, Against or Abstain. You can also let someone you trust vote for you.',
    dao: 'Token-weighted voting with delegation, a quorum and a safety delay.'
  },
  {
    title: 'Joining',
    plain:
      'Win a token in an auction, buy one on the market, or claim one if you’re on a list. You’ll need a Stellar wallet.',
    dao: 'Fees on Stellar cost a fraction of a cent.'
  }
];

/** "What's a tribe?" in plain words, with the DAO term beneath each part. Opens from `trigger`. */
export function WhatsATribe({ trigger }: { trigger: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <Sheet
      open={open}
      onOpenChange={setOpen}
      trigger={trigger}
      title="What’s a tribe?"
      footer={
        <>
          <ButtonLink href="/discover" variant="secondary" onClick={() => setOpen(false)}>
            Find a tribe
          </ButtonLink>
          <ButtonLink href="/create" onClick={() => setOpen(false)}>
            Build a tribe
          </ButtonLink>
        </>
      }
    >
      <p className={lede}>
        A tribe is a group of people with a shared treasury who decide together. Under the hood, it’s a DAO on Stellar.
      </p>
      <ul className={list}>
        {PARTS.map((part) => (
          <li key={part.title} className={item}>
            <p className={heading}>{part.title}</p>
            <p className={plain}>{part.plain}</p>
            <p className={dao}>{part.dao}</p>
          </li>
        ))}
      </ul>
    </Sheet>
  );
}
