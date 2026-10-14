import { DEPLOYMENT_ID } from '@/config/deployments.generated';
import { paymentAssetCode } from '@/lib/assets-config';
import { getDaoNetworkConfigById } from '@/lib/dao-config';
import { resolveDaoId } from '@/lib/dao-db';
import { plainSummary } from '@/lib/dao-profile';
import { getGoldskyProposalDetail } from '@/lib/goldsky';
import { directoryMember, directoryMembers, directoryTokens } from '@/lib/member-directory/query';
import { prisma } from '@/lib/prisma';
import { readProposalChainState } from '@/lib/proposal-chain-state';
import { parseProposalMetadata } from '@/lib/proposal-metadata';
import { proposalStateFromLabel, proposalStateLabel } from '@/lib/proposal-state';
import { parseTokenId } from '@/lib/token-id';

import { remoteArt, tokenArt } from './art';
import { formatCardAmount, formatTimeLeft, proposalChip, shortAddress } from './format';
import type { ShareCardProps } from './share-card';

async function tribe(routeId: string) {
  const config = await getDaoNetworkConfigById(await resolveDaoId(routeId));
  const name = config.tokenName || config.tokenSymbol || 'A tribe';
  return { config, name, crest: { name, seed: config.tokenContractId } };
}

/** The tribe card: art or crest, name, member count; with `section` for its sub-pages. */
export async function tribeCard(routeId: string, section?: string): Promise<ShareCardProps> {
  const { config, name, crest } = await tribe(routeId);
  const [members, art] = await Promise.all([
    directoryMembers(config.tokenContractId, { limit: 1, offset: 0 }).catch(() => null),
    remoteArt(config.image)
  ]);
  const chips: ShareCardProps['chips'] = [];
  if (section) chips.push({ label: section });
  if (config.status === 'pending') chips.push({ label: 'In setup', tone: 'warning' });
  return {
    title: name,
    subtitle: plainSummary(config.profile.description, 120) || 'A tribe on Tribes Builder.',
    chips,
    stats: members ? [{ label: members.total === 1 ? 'member' : 'members', value: String(members.total) }] : [],
    art,
    crest
  };
}

export async function proposalCard(routeId: string, proposalId: string): Promise<ShareCardProps> {
  const { config, name, crest } = await tribe(routeId);
  const [{ proposal }, art] = await Promise.all([
    getGoldskyProposalDetail(config.tokenContractId, proposalId),
    remoteArt(config.image, 96)
  ]);
  const live = await readProposalChainState(config, proposal.proposal_id).catch(() => null);
  const label = proposalStateLabel(live?.state ?? proposalStateFromLabel(proposal.state));
  const title = parseProposalMetadata(proposal.description ?? '').title || `Proposal ${proposal.proposal_number}`;
  const votes = (value: unknown) => Number(BigInt(String(value ?? 0)));
  const voting = label === 'Pending' || label === 'Active';
  return {
    // Votes move while a proposal is open; five minutes keeps the tally close.
    maxAge: voting ? 300 : 3600,
    title,
    subtitle: `${name} · Proposal ${proposal.proposal_number}`,
    badge: { ...crest, art },
    chips: [proposalChip(label)],
    tally: {
      for: votes(proposal.vote_summary?.for),
      against: votes(proposal.vote_summary?.against),
      abstain: votes(proposal.vote_summary?.abstain)
    }
  };
}

export async function auctionCard(routeId: string): Promise<ShareCardProps> {
  const { config, name, crest } = await tribe(routeId);
  if (!config.auctionContractId) return tribeCard(routeId, 'Auction');
  const row = await prisma.auctionAuction.findFirst({
    where: { deploymentId: DEPLOYMENT_ID, daoId: config.tokenContractId, contractId: config.auctionContractId },
    orderBy: { createdLedger: 'desc' }
  });
  if (!row) return tribeCard(routeId, 'Auction');
  const tokenId = Number(row.tokenId);
  const code = paymentAssetCode(config.name, row.paymentToken);
  const end = Number(row.currentEndSeconds);
  const open = !row.settled && !row.cancelled && end > Math.floor(Date.now() / 1000);
  const paused = Boolean(config.auctionPaused);
  const bid = row.highestBid ? row.highestBid.toFixed(0) : '0';
  return {
    // A live auction's bid and clock change by the minute.
    maxAge: open ? 60 : 3600,
    title: `${name} #${tokenId}`,
    subtitle: open ? 'Bid to join the tribe. The winning bid goes to its treasury.' : `An auction in ${name}`,
    chips: [
      open && !paused
        ? { label: 'Live auction', tone: 'live' }
        : paused
          ? { label: 'Auctions paused', tone: 'warning' }
          : { label: 'Auction ended', tone: 'neutral' }
    ],
    stats: [
      bid !== '0'
        ? { label: open ? 'top bid' : 'winning bid', value: formatCardAmount(bid, code) }
        : { label: 'reserve', value: formatCardAmount(row.reservePrice.toFixed(0), code) },
      ...(open ? [{ label: 'left', value: formatTimeLeft(end) }] : [])
    ],
    art: await tokenArt(config.tokenContractId, tokenId),
    crest
  };
}

export async function tokenCard(routeId: string, tokenIdInput: string): Promise<ShareCardProps> {
  const { config, name, crest } = await tribe(routeId);
  const tokenId = parseTokenId(tokenIdInput);
  const [owned, art] = await Promise.all([
    prisma.tokenInventory.findFirst({
      where: {
        deploymentId: DEPLOYMENT_ID,
        daoId: config.tokenContractId,
        contractId: config.tokenContractId,
        tokenId: BigInt(tokenId)
      }
    }),
    tokenArt(config.tokenContractId, tokenId)
  ]);
  return {
    title: `${name} #${tokenId}`,
    subtitle: 'One membership, one vote.',
    stats: owned?.owner ? [{ label: 'holder', value: shortAddress(owned.owner) }] : [],
    art,
    crest: { name, seed: `${crest.seed}:${tokenId}` }
  };
}

export async function memberCard(routeId: string, address: string): Promise<ShareCardProps> {
  const { config, name, crest } = await tribe(routeId);
  const [profile, tokens] = await Promise.all([
    directoryMember(config.tokenContractId, address),
    directoryTokens(config.tokenContractId, { limit: 4, offset: 0 }, address)
  ]);
  const ids = tokens.items.map((item) => item.tokenId);
  const arts = await Promise.all(ids.map((id) => tokenArt(config.tokenContractId, id, ids.length === 1 ? 380 : 180)));
  const votes = Number(profile.item?.voting_power ?? 0);
  return {
    title: shortAddress(profile.item?.address ?? address),
    subtitle: `A member of ${name}`,
    stats: [
      { label: tokens.total === 1 ? 'token' : 'tokens', value: String(tokens.total) },
      { label: votes === 1 ? 'vote' : 'votes', value: String(votes) }
    ],
    tokens: arts.length ? arts : undefined,
    crest
  };
}
