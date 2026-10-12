# Metadata contract

Per-DAO artwork properties/items/IPFS groups, per-token selections, the on-chain token JSON, and the hash of the DAO profile. Files stay on IPFS; the contract stores references and attribute selections used by the renderer.

## Configuration and mint hook

`add_properties(names: Vec<String>, items: Vec<ItemParam>, ipfs_group: IpfsGroup)` appends at most 30 items per call and supports at most 16 properties. Each new property needs an item. `ItemParam` contains `property_id`, `name`, and `is_new_property`; new-property ids are local to that call's names vector, existing ids are absolute. Each call appends an IPFS group.

Admin-only `delete_and_recreate_properties` resets counts/headers and recreates properties; it can break existing attribute interpretation. Admin-only `update_renderer_base` sets the image compositor URL (at most 256 characters, `StringTooLong`).

The DAO profile (`{ description, links, image }` JSON, at most 4,096 bytes) lives in events only. Admin-only `update_profile(expected_seq, profile)` emits `ProfileUpdated { seq, hash, profile }` and stores just `profile_hash()` (sha256) and `profile_seq()`. `expected_seq` must equal the current seq (`ProfileSeqMismatch` otherwise), so a proposal written against an older profile cannot overwrite a newer edit. Readers show an indexed profile only if its hash matches. The admin is the launch admin in setup and the Treasury after launch (the metadata module's own admin; no cross-contract owner lookup). Wiring is constructor-only.

Token calls `on_minted(token_id)` (emits `SeedGenerated`) / `on_minted_batch(first_token_id, count)` (emits one `SeedsGenerated { first_token_id, count, num_properties, selections }` for the range, `selections[i]` belonging to token `first_token_id + i`, so large batches stay under the event size limit); `regenerate` emits `SeedGenerated`. No artwork yields no selection; admin `regenerate(token_id)` seeds a token that has no attributes yet (`AlreadySeeded` otherwise). Seed inputs include token id, ledger data, and host PRNG, so outcomes are pseudo-random and grindable.

## Reads and maintenance

- `properties_count`, `items_count(property_id)`, `ipfs_data_count`.
- `get_property`, `get_items(property_id, start, limit)` (≤50), `get_ipfs_group(index)`.
- `get_properties` and `get_ipfs_data` assemble entire collections; prefer bounded reads.
- `property_headers()` returns every property name with its item count, so a client can list every artwork key from chain.
- `get_attributes(token_id)`, `get_settings`, `token`, `renderer_base`, `profile_hash`, `profile_seq`.
- `token_uri(token_id, token_name)`: SEP-50 JSON built on-chain as a `data:application/json;base64` URI with `name`, `image` (`<renderer_base>?contract=<token>&token=<id>`) and `attributes`. The Token's `token_uri` calls it with the collection name. `InvalidName` if the name has a quote, backslash or control character.
- Storage: items are paged 32 per key, attributes 64 tokens per key, all IPFS groups in one key. There is no bump entrypoint: the DAO's storage sweep renews these keys (see [TTL_ECONOMICS](../../docs/TTL_ECONOMICS.md)).
- Manager-only `launch(treasury)` (`AdminChanged`, `MetadataLaunched`); `admin()`; admin `upgrade(from_hash, to_hash)` / `migrate()`; `version()` (read from the Manager registry), `wasm_hash()`, `storage_version()`.

Errors: block 7300. See [TTL policy](../../docs/TTL_ECONOMICS.md) and [web artwork setup](../../docs/ARTWORK_PLAYGROUND_INTEGRATION.md). `cargo test -p metadata`. [Implementation](src/contract.rs), [storage](src/storage.rs), [types](../../packages/metadata-bindings/src/types.ts).
