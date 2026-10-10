# Metadata contract

Per-DAO settings, artwork properties/items/IPFS groups, and per-token selections. Files stay on IPFS; the contract stores references and attribute selections used by the renderer.

## Configuration and mint hook

`add_properties(names: Vec<String>, items: Vec<ItemParam>, ipfs_group: IpfsGroup)` appends at most 30 items per call and supports at most 16 properties. Each new property needs an item. `ItemParam` contains `property_id`, `name`, and `is_new_property`; new-property IDs are local to that call's names vector, existing IDs are absolute. Each call appends an IPFS group.

Owner-only `delete_and_recreate_properties` resets counts/headers and recreates properties; it can break existing attribute interpretation. Owner-only descriptive setters update image, renderer base, description, and project URI. Owner is launch admin in Setup, Treasury after launch. Wiring is constructor-only.

Token calls `on_minted(token_id)` / `on_minted_batch(first_token_id, count)`. No artwork yields no selection; owner `regenerate(token_id)` can reroll. Seed inputs include token ID, ledger data, and host PRNG, so outcomes are pseudo-random and grindable, not manipulation-resistant rarity.

## Reads and maintenance

- `properties_count`, `items_count(property_id)`, `ipfs_data_count`.
- `get_property`, `get_items(property_id, start, limit)` (≤50), `get_ipfs_group(index)`.
- `get_properties` and `get_ipfs_data` assemble entire collections; prefer bounded reads.
- `get_attributes(token_id)`, `get_settings`, `token`, `renderer_base`, `description`, `contract_image`, `project_uri`.
- Permissionless `bump_artwork_ttl(start, limit)` (≤50) walks items in property order, then IPFS groups, also touching headers/instance, and returns next start. Repeat to cover the range.
- Manager-only `launch(treasury)`; owner `upgrade(from_hash, to_hash)` / `sync_version`; `version` / `wasm_hash`.

See [TTL policy](../../docs/TTL_ECONOMICS.md) and [web artwork setup](../../docs/ARTWORK_PLAYGROUND_INTEGRATION.md). `cargo test -p metadata`. [Implementation](src/contract.rs), [storage](src/storage.rs), [types](../../packages/metadata-bindings/src/types.ts).
