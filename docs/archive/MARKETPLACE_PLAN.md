# Marketplace v0.1: historical extract

Historical design summary, not current feature-status evidence. The complete original is retained at `cbe5ce7:docs/MARKETPLACE_PLAN.md` in Git.

The design chose lazy primary mint-on-purchase and escrowed secondary sales, separate identifiers, per-listing payment/fee snapshots, no Builder protocol fee, and permissionless expired-listing cleanup. Governance controls primary inventory and post-launch configuration. Terminal listing history belongs to events/indexed views.

Its rollout phases and older upgrade-event names are superseded by implemented source. Current references: [Marketplace contract](../../contracts/marketplace/README.md), [web trading](../../apps/web/README.md), [database views](../DATABASE_SCHEMA.md).
