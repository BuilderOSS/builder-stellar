# Legal entity export

**Manage → Legal entity export** (`/dao/<tribe>/admin/legal`) collects what a DAO registrar asks for at intake. The first registrar it is designed for is MIDAO, for a Marshall Islands DAO LLC. The page exports it as two files:

- `<legal-name>-<date>.json`: the machine-readable bundle (`$schema: https://tribes.build/schemas/legal-export/v2`).
- `<legal-name>-<date>.md`: the same content as a readable summary.

This is the SCF Tranche 2 "Legal Wrapper Wizard (export-only)".

## What it is not

The export **assists** legal set-up. It does **not** replace independent legal advice, and it doesn't form an entity, file anything, or talk to a registrar. Tribe Builder isn't a law firm, a registered agent, or a party to any registration. Formation, KYC, the operating agreement, and tax treatment are between the tribe, its lawyers, and the registrar. The page says this before the first step, and both files repeat it at the top.

Nothing is sent anywhere. The bundle is built in the browser from public data and the founders' answers, and downloaded to the device. The founders decide who receives it.

## The flow

1. **Entity:**
   - the proposed legal name, prefilled from the tribe name. It must end with "DAO LLC" ([MIDAO's naming rule](https://docs.midao.org/rmi-dao-llc-registration-and-compliance/naming-your-dao-llc-and-dba-doing-business-as)). The optional space is the one *before* "DAO LLC": "MIDAO LLC" and "MI DAO LLC" are both valid, and "DAOLLC" is not;
   - a trading name;
   - non-profit, for-profit, or not decided yet. MIDAO can't convert this later ([non-profit vs for-profit](https://docs.midao.org/dao-llc-structuring/non-profit-vs.-for-profit)), and the page says so;
     - a non-profit picks its kind of good works (charitable, educational, scientific, religious, or other good works);
     - a for-profit can describe how profits are shared and say whether any members are US persons (the IRS Form 8832 election MIDAO mentions);
   - the purpose, prefilled from the tribe description;
   - optionally, under "More for the registrar": an estimate of treasury plus funding in US dollars (MIDAO tiers its fees by it) and other initial contributions, one per line.
2. **People:**
   - a contact (name required; email and role optional);
   - optional managers (name, role and Stellar address);
   - an optional Representative Agent (MIDAO files their consent, Form 1, with the formation documents);
   - notes for the registrar.
3. **Review:** who a registrar would ask to verify, and what is taken from the chain.
4. **Export:** a preview of the summary and the two downloads.

The answers live only in the page's memory and are gone on reload. This is deliberate, because they include contact details.

## Where each part comes from

| Bundle section | Source |
|---|---|
| `entity`, `contact`, `fees`, `notes` | The founders' answers |
| `operatingAgreementProfile` | MIDAO's four template choices, as they apply to every tribe: blockchain membership, one token one vote (or vote-source weighted), smart-contract governance, and no treasury committee |
| `initialContributions` | The Treasury address, plus the founders' other contributions |
| `sources` | The MIDAO page behind each rule |
| `tribe` | The tribe config: name, public URL, status (setup or live), and links from the verified profile |
| `membership` | The token's name and symbol; minted and voting supply and member count from the index (`token_inventory`, `token_supply` and `token_members`); the token settings in force (transfers locked, members-only delegation, recovery); and which issuance modules exist |
| `governance` | `useGovernorSettings`: voting delay, voting period, proposal threshold, quorum, and the safety (queue) delay |
| `smartContracts` | Every module address in the tribe config, with stellar.expert links, marked `live` or `deployed, not yet live` while the tribe is in setup |
| `treasury` | The Treasury address and its SAC balances, read live from RPC |
| `beneficialOwnership` | The top 25 holders by tokens owned and the top 25 by voting power (`/api/dao/<id>/members?by=tokens` and `by=votes`), merged |

When a part fails to load, the Review step says so, and the bundle marks it `null` or "could not be read" rather than leaving it out.

## Beneficial ownership

MIDAO's published guidance ([KYC/KYB and beneficial ownership reporting](https://docs.midao.org/rmi-dao-llc-registration-and-compliance/kyc-kyb-and-beneficial-ownership-reporting)) sorts the people who must verify into three categories:

- **A:** anyone who *owns* 25% or more of the governance rights. These are beneficial owners.
- **B:** if no one is in A, every manager. These are also beneficial owners.
- **C:** if no one is in A or B, any member. MIDAO does not treat a category C member as a beneficial owner, but they are still reported and complete KYC.

The export measures ownership as **membership tokens owned, of all tokens minted** (`BENEFICIAL_OWNER_BPS = 2500`; shares are rounded down), because MIDAO's test is ownership and a delegate doesn't own the votes it casts. Voting power, which includes delegation, is reported beside it:

- `owners`: accounts or contracts owning 25% or more. These decide the category.
- `votingPowerAtOrAboveThreshold`: delegates with 25% or more of the votes who don't own that much, for the registrar to weigh.
- `heldByTribeContracts`: tokens in the tribe's own Treasury, Auction or Marketplace. These are listed, never treated as an owner.

If either ranking or the minted supply can't be read, the category is `unknown` ("Category not known") rather than a guess, since "no one owns 25%" can't be known without them.

Each holder is marked as a Stellar account (G…) or a contract (C…). A contract owner is flagged "confirm KYB and who controls it", because MIDAO looks through a company or multisig to the people behind it. Anyone at 25% or more of either measure is among the top four of that ranking, so one page of 25 from each ranking covers them. Ownership moves with transfers, so the bundle stamps `measuredAt`. The basis is written into the bundle so a registrar can correct it.

## Schema (v2)

The top-level keys are `$schema`, `generatedAt`, `generatedBy`, `disclaimer`, `entity`, `contact`, `operatingAgreementProfile`, `tribe`, `blockchain`, `membership`, `governance`, `smartContracts`, `treasury`, `initialContributions`, `fees`, `beneficialOwnership`, `sources`, and `notes`.

v2 (2026-11-18) changed:

- the naming rule;
- ownership as the 25% basis, with voting power beside it;
- holder kinds;
- category C wording;
- the entity type's permanence;
- management wording, from "Algorithmic" to "governance delegated to the smart contracts";
- the operating agreement profile, Representative Agent, initial contributions, fee estimate, for-profit and non-profit details, contract live status, and sources.

Amounts and voting power are strings (exact integers, or seven-decimal SAC balances). Durations are seconds. Quorum and shares are basis points. The source of truth is `buildBundle` in `apps/web/src/lib/legal-export/bundle.ts`, and its tests are in `bundle.test.ts`. Any change to a field's meaning bumps the schema version.

## Open with MIDAO

The award's sign-off asks MIDAO to confirm that the bundle is useful for their intake. Open questions for them:

1. What fields does the onboarding portal ask for? Can a JSON or Markdown bundle be attached?
2. For category A, is "owns 25% or more" measured by token balance or by voting power? Against minted or circulating supply? At what date?
3. Does a contract or treasury holding 25% or more trigger KYB, or is it disregarded?
4. For category C, does one member complete KYC, or all of them?
5. Does the operating agreement need code hashes, versions and the network beside the addresses? Is a contract upgrade an amendment?
6. Is Stellar and Soroban acceptable for token-tracked membership and smart-contract governance? Can fees be paid in USDC on Stellar?
7. Who can act as the Representative Agent?
8. How should Stellar assets be valued for fee tiers?
9. Would a signed or hashed bundle help, and is there a partner intake path?
10. Is an initial contributions exhibit useful, and in what format?
