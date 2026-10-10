# Manager redesign: historical extract

Archived design context, not an API or deployment runbook. The complete earlier document is retained in Git at `cbe5ce7:docs/MANAGER_REDESIGN.md`; this page preserves the decision summary rather than obsolete commands.

The redesign separated the implementation registry/factory from durable indexed discovery, deployed six independent modules, introduced temporary Setup recovery, and moved final ownership to Treasury. DAO upgrades require both governance/owner authority and exact Manager-approved hash transitions; Manager approval cannot force them. The plan called for a clean testnet baseline, not a storage-compatible migration or proof of production rollout.

Later source adds permanent slug mappings; the earlier bounded-pending-only state description is no longer complete. Current replacements: [architecture](../ARCHITECTURE.md), [Manager reference](../../contracts/manager/README.md), [deployment](../MANAGER_DEPLOYMENT.md), [security](../SECURITY_MODEL.md).
