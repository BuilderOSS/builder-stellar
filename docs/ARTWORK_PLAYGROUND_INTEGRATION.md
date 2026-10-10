# Artwork setup and layer order

Initial artwork lives in the **Setup → Launch** checklist, not the compact creation
form. [ArtworkSetup](../apps/web/src/components/create-dao/ArtworkSetup.tsx) supports
starter collections, directory upload, preview, and layer ordering before signed
Metadata batches. `/admin/artwork` also inspects existing state and prepares
post-launch configuration/append proposals. AI artwork/image generation is removed.

## Flow

1. Create the pending DAO. Open **Set up artwork** in the launch checklist.
2. Choose a starter collection or upload a directory. The browser saves the exact artwork plan under network/Manager/wallet/DAO scope.
3. Review layers and preview. Property order is bottom-to-top composition order; the current preview uses the same property/item selection helpers as rendering.
4. Sign each `metadata.add_properties` batch. The [batch planner](../apps/web/src/components/create-dao/artwork-configuration.ts) enforces 30 items per call and valid property references.
5. Configure artwork before minting founders if their initial attributes should include it. Token minting invokes Metadata's hook.

An image preview is not a successful IPFS upload or an on-chain configuration. Directory upload uses the existing upload service. Plans and confirmation receipts stay in browser storage; asset upload and signed chain writes are separate side effects.

## Recovery and limits

Each batch saves the signed hash before submission. Unknown confirmation must be checked before another batch is sent. Confirmed batches are not rolled back by a later failed transaction. Setup refuses to overwrite an existing artwork collection as a new plan and checks resumed property/item counts against the saved plan. Cross-tab operations require Web Locks.

Metadata supports at most 16 properties and 30 items per addition. Paginated getters and TTL bumps use windows of at most 50. Mint selections are pseudo-random, not manipulation-resistant; see [Metadata reference](../contracts/metadata/README.md) and [security](SECURITY_MODEL.md).

## Existing artwork administration

The admin page verifies Metadata's wired Token and reads Token ownership for
artwork-setting authority. Setup owners can update settings directly; after launch
registered renderer/project/image/description and append actions enter a governance
draft. A 50-item inspector pages through property/IPFS references. Append batches
capture the current property count and must be reviewed for ordering changes before
execution. Destructive resets are not registered in the composer.

Artwork authority is not proof of Metadata's separate upgrade-owner state. Its
upgrade proposal remains blocked without a public owner getter. See
[admin artwork](../apps/web/src/app/dao/[daoId]/admin/artwork/page.tsx),
[registered actions](../apps/web/src/lib/proposal-actions/registry.ts), and
[web capability reference](../apps/web/README.md).

## Source and tests

- [ArtworkSetup](../apps/web/src/components/create-dao/ArtworkSetup.tsx), [directory upload](../apps/web/src/components/create-dao/ArtworkDirectoryUpload.tsx), [preview](../apps/web/src/components/create-dao/ArtworkPreviewCanvas.tsx)
- [Batch tests](../apps/web/src/components/create-dao/artwork-configuration.test.ts), [local artwork store tests](../apps/web/src/stores/local-artwork-store.test.ts), [artwork order tests](../apps/web/src/lib/artwork-order.test.ts)
- [TTL maintenance](TTL_ECONOMICS.md)

The [old playground integration](archive/ARTWORK_PLAYGROUND_INTEGRATION.md) names removed components and a removed automatic deployment sequence. It is historical, not a current tutorial.
