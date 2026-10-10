# Metadata contract

Per-DAO settings, artwork properties/items/IPFS groups, and per-token selections. Files stay on IPFS; the contract stores references and attribute selections used by the renderer.

## Configuration and mint hook

`add_properties(names: Vec<String>, items: Vec<ItemParam>, ipfs_group: IpfsGroup)` appends at most 30 items per call and supports at most 16 properties. Each new property needs an item. `ItemParam` contains `property_id`, `name`, and `is_new_property`; new-property ids are local to that call's names vector, existing ids are absolute. Each call appends an IPFS group.

Admin-only `delete_and_recreate_properties` resets counts/headers and recreates properties; it can break existing attribute interpretation. Admin-only setters update image, renderer base, description, and project URI; every settings string is at most 256 characters (`StringTooLong`), so the instance entry the mint hook loads stays small. The admin is the launch admin in setup and the Treasury after launch (the metadata module's own admin; no cross-contract owner lookup). Wiring is constructor-only.

Token calls `on_minted(token_id)` / `on_minted_batch(first_token_id, count)`. No artwork yields no selection; admin `regenerate(token_id)` seeds a token that has no attributes yet (`AlreadySeeded` otherwise). Seed inputs include token id, ledger data, and host PRNG, so outcomes are pseudo-random and grindable.

## Reads and maintenance

- `properties_count`, `items_count(property_id)`, `ipfs_data_count`.
- `get_property`, `get_items(property_id, start, limit)` (≤50), `get_ipfs_group(index)`.
- `get_properties` and `get_ipfs_data` assemble entire collections; prefer bounded reads.
- `get_attributes(token_id)`, `get_settings`, `token`, `renderer_base`, `description`, `contract_image`, `project_uri`.
- Permissionless `bump_artwork_ttl(start, limit)` (≤50) walks items in property order, then IPFS groups, and returns the next start. Repeat to cover the range.
- Manager-only `launch(treasury)` (`AdminChanged`, `MetadataLaunched`); `admin()`; admin `upgrade(from_hash, to_hash)` / `migrate()` / `sync_version()`; `version()`, `wasm_hash()`, `storage_version()`.

Errors: block 7300. See [TTL policy](../../docs/TTL_ECONOMICS.md) and [web artwork setup](../../docs/ARTWORK_PLAYGROUND_INTEGRATION.md). `cargo test -p metadata`. [Implementation](src/contract.rs), [storage](src/storage.rs), [types](../../packages/metadata-bindings/src/types.ts).
