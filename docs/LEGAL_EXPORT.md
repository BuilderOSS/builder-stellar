# Legal entity export

**Manage → Legal entity export** (`/dao/<tribe>/admin/legal`) collects what a DAO registrar asks for at intake. The first registrar in mind is MIDAO, for a Marshall Islands DAO LLC. The page exports it as two files:

- `<legal-name>-<date>.json`: the machine-readable bundle (`$schema: https://tribes.build/schemas/legal-export/v1`).
- `<legal-name>-<date>.md`: the same content as a readable summary.

This is the SCF Tranche 2 "Legal Wrapper Wizard (export-only)".

## What it is not

The export **assists** legal set-up. It does **not** replace independent legal advice, and it doesn't form an entity, file anything, or talk to a registrar. Tribe Builder isn't a law firm, a registered agent, or a party to any registration. Formation, KYC, the operating agreement, and tax treatment are between the tribe, its lawyers, and the registrar. The page says this before the first step, and both files repeat it at the top.

Nothing is sent anywhere. The bundle is built in the browser from public data and the founders' answers, and downloaded to the device. The founders decide who receives it.

## The flow

1. **Entity:**
   - the proposed legal name, which must end with "DAO LLC" (MIDAO's naming rule; the space is optional) and is prefilled from the tribe name;
   - a trading name;
   - non-profit, for-profit, or not decided yet;
   - the purpose, prefilled from the tribe description.
2. **People:**
   - a contact (name required; email and role optional);
   - optional managers (name, role and Stellar address);
   - notes for the registrar.
3. **Review:** who a registrar would ask to verify, and what is taken from the chain.
4. **Export:** a preview of the summary and the two downloads.

The answers live only in the page's memory and are gone on reload. That's deliberate for contact details.

## Where each part comes from

| Bundle section | Source |
|---|---|
| `entity`, `contact`, `notes` | The founders' answers |
| `tribe` | The tribe config: name, public URL, status (setup or live), and links from the verified profile |
| `membership` | The token's name and symbol; minted and voting supply and member count from the index (`token_inventory`, `token_supply` and `token_members`); the token settings in force (transfers locked, members-only delegation, recovery); and which issuance modules exist |
| `governance` | `useGovernorSettings`: voting delay, voting period, proposal threshold, quorum, and the safety (queue) delay |
| `smartContracts` | Every module address in the tribe config, with stellar.expert links |
| `treasury` | The Treasury address and its SAC balances, read live from RPC |
| `beneficialOwnership` | The top 25 holders by voting power from the index, against the voting supply |

When a part fails to load, the Review step says so, and the bundle marks it `null` or "could not be read" rather than leaving it out.

## Beneficial ownership

MIDAO's published guidance ([KYC/KYB and beneficial ownership reporting](https://docs.midao.org/rmi-dao-llc-registration-and-compliance/kyc-kyb-and-beneficial-ownership-reporting)) sorts the people who must verify into three categories:

- **A:** anyone holding 25% or more of the governance rights;
- **B:** if no one is in A, every manager;
- **C:** if no one is in A or B, any member.

The export applies this to current voting power (`BENEFICIAL_OWNER_BPS = 2500`; shares are rounded down). It records the category and lists the holders at or above the threshold. Anyone at 25% or more is among the top four holders, so the first 25 always cover them. Voting power moves with tokens and delegation, so the bundle stamps `measuredAt`. The basis is written into the bundle so a registrar can correct it.

## Schema (v1)

The top-level keys are `$schema`, `generatedAt`, `generatedBy`, `disclaimer`, `entity`, `contact`, `tribe`, `blockchain`, `membership`, `governance`, `smartContracts`, `treasury`, `beneficialOwnership`, and `notes`. Amounts and voting power are strings (exact integers, or seven-decimal SAC balances). Durations are seconds. Quorum and shares are basis points. The source of truth is `buildBundle` in `apps/web/src/lib/legal-export/bundle.ts`, and its tests are in `bundle.test.ts`. Any change to a field's meaning bumps the schema version.

## Open with MIDAO

The award's sign-off asks MIDAO to confirm that the bundle is useful for their intake. Open questions for them:

- Are the fields right for their onboarding portal, and is anything missing? Candidates: a name reservation, a series DAO LLC, initial contributions such as IP or accounts, or a preferred format.
- Does the operating agreement template reference contract addresses as listed here, or would they want code hashes and versions too?
- Is the 25% test applied to voting power including delegation, or to token ownership?
- Would a signed or hashed bundle help their review?
