# Removed artwork playground: historical extract

Full earlier integration notes remain in Git at `cbe5ce7:docs/ARTWORK_PLAYGROUND_INTEGRATION.md`. They described directory upload, layer reordering, preview, and an automatic creation/setup/finalization sequence using components that have since been removed.

The useful invariant remains: property order determines layer stacking and absolute references must agree across preview, Metadata additions, and rendering. The old seven-step deployment, required ownership acceptance, and per-step rollback claims are not current behavior. Separate confirmed setup transactions are not rolled back by a later failure.

Current replacements: [artwork setup/admin](../ARTWORK_PLAYGROUND_INTEGRATION.md), [web creation](../../apps/web/README.md), [Metadata contract](../../contracts/metadata/README.md).
