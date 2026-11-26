# Artwork setup and layer order

Initial artwork is added from the **Setup → Launch** checklist, not the compact creation
form. [ArtworkSetup](../apps/web/src/components/create-dao/ArtworkSetup.tsx) supports
starter collections, directory upload, preview, and layer ordering before the signed
Metadata batches. `/admin/artwork` also inspects existing state and prepares
post-launch renderer and append proposals. AI artwork and image generation have been removed.

## Flow

1. Create the pending DAO. Open **Add artwork** in the launch checklist.
2. Choose a starter collection or upload a directory. The browser saves the exact artwork plan under network/Manager/wallet/DAO scope.
3. Review the layers and the preview. Property order is the bottom-to-top composition order; the preview uses the same property and item selection helpers as rendering.
4. Sign each `metadata.add_properties` batch. The [batch planner](../apps/web/src/components/create-dao/artwork-configuration.ts) enforces 30 items per call and valid property references.
5. Add the artwork before minting founders, so that their tokens get traits. Token minting invokes Metadata's hook, which seeds traits at mint time; a token minted while no properties exist gets none, and the contracts cannot block such a mint. The setup checklist lists artwork first, and the founder and token mint pages warn and require explicit confirmation while no artwork exists.

An image preview is not a successful IPFS upload or an on-chain configuration. Directory upload uses the existing upload service. Plans and confirmation receipts stay in browser storage; asset upload and signed chain writes are separate side effects.

## Recovery and limits

Each batch saves the signed hash before submission. An unknown confirmation must be checked before another batch is sent. Confirmed batches are not rolled back by a later failed transaction. Setup refuses to overwrite an existing artwork collection with a new plan, and checks resumed property and item counts against the saved plan. Cross-tab operations require Web Locks.

Metadata supports at most 16 properties and 30 items per addition. Paginated getters return at most 50 entries per call (`MAX_PAGE`). Mint selections are pseudo-random, not manipulation-resistant; see [Metadata reference](../contracts/metadata/README.md) and [security](SECURITY_MODEL.md).

## Existing artwork administration

The admin page verifies Metadata's wired Token and reads Metadata's own `admin()`
for the authority to change artwork settings. The setup (launch) admin can update
settings directly; after launch, the registered renderer and append actions enter a
governance draft. A 50-item inspector pages through property and IPFS references. Append
batches capture the current property count and must be reviewed for ordering changes
before execution. Destructive resets are not registered in the composer.

Tokens minted without traits (see step 5 of the flow) are listed on the artwork page
and can be seeded with `metadata.regenerate` (directly during setup, by a proposal after
launch). Metadata upgrades and `migrate` go through the same module-upgrade proposals as
other modules. See [admin artwork](../apps/web/src/app/dao/[daoId]/admin/artwork/page.tsx),
[registered actions](../apps/web/src/lib/proposal-actions/registry.ts), and
[web capability reference](../apps/web/README.md).

## Source and tests

- [ArtworkSetup](../apps/web/src/components/create-dao/ArtworkSetup.tsx), [directory upload](../apps/web/src/components/create-dao/ArtworkDirectoryUpload.tsx), [preview](../apps/web/src/components/create-dao/ArtworkPreviewCanvas.tsx)
- [Batch tests](../apps/web/src/components/create-dao/artwork-configuration.test.ts), [local artwork store tests](../apps/web/src/stores/local-artwork-store.test.ts)
- [TTL maintenance](TTL_ECONOMICS.md)
