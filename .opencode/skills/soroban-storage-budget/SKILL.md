---
name: soroban-storage-budget
description: Reviews Soroban storage, TTL, event payload, and resource-budget impacts. Use when changing contract storage, events, cross-contract calls, or persistent state.
---

# Soroban Storage And Budget

Before implementation, identify every changed storage key, value type, TTL behavior,
event topic/payload field, and cross-contract invocation. State whether the value is
instance, persistent, or temporary storage and why.

Require the implementation to preserve bounded collection growth, authorization before
writes, recoverable failure behavior, and an explicit TTL extension strategy.

Validate with focused Rust tests that cover first write, repeat write, authorization
failure, expiry or TTL behavior where applicable, and event shape. Flag any event that
adds unbounded, sensitive, or indexer-incompatible data.

Finish with a concise budget note: changed storage, TTL effect, event effect, and test
evidence. Send event effects to `indexer-events`.
