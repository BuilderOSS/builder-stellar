import {MarketplaceConfig, Listing, ContractEvent} from './types.js';
import {Spec, AssembledTransaction, Client as ContractClient, ClientOptions as ContractClientOptions, MethodOptions, ExternalExecutableRef} from '@stellar/stellar-sdk/contract';
import {Address, xdr} from '@stellar/stellar-sdk';

export interface Client {
  buy({ token_id, buyer }: { token_id: number; buyer: string | Address }, options?: MethodOptions): Promise<AssembledTransaction<void>>;
  list({ token_id, seller, price, expires_at }: { token_id: number; seller: string | Address; price: bigint; expires_at: bigint }, options?: MethodOptions): Promise<AssembledTransaction<void>>;
  pause(options?: MethodOptions): Promise<AssembledTransaction<void>>;
  cancel({ token_id, seller }: { token_id: number; seller: string | Address }, options?: MethodOptions): Promise<AssembledTransaction<void>>;
  expire({ token_id }: { token_id: number }, options?: MethodOptions): Promise<AssembledTransaction<void>>;
  unpause(options?: MethodOptions): Promise<AssembledTransaction<void>>;
  upgrade({ from_hash, to_hash }: { from_hash: Uint8Array; to_hash: Uint8Array }, options?: MethodOptions): Promise<AssembledTransaction<void>>;
  get_config(options?: MethodOptions): Promise<AssembledTransaction<MarketplaceConfig>>;
  get_listing({ token_id }: { token_id: number }, options?: MethodOptions): Promise<AssembledTransaction<Listing | null>>;
  mint_and_list({ price, expires_at }: { price: bigint; expires_at: bigint }, options?: MethodOptions): Promise<AssembledTransaction<number>>;
  set_payment_asset({ payment_asset }: { payment_asset: string | Address }, options?: MethodOptions): Promise<AssembledTransaction<void>>;
  finalize_ownership({ new_treasury }: { new_treasury: string | Address }, options?: MethodOptions): Promise<AssembledTransaction<void>>;
  set_secondary_fee_bps({ fee_bps }: { fee_bps: number }, options?: MethodOptions): Promise<AssembledTransaction<void>>;
}

export class Client extends ContractClient {
  constructor(public readonly options: ContractClientOptions) {
    super(
      new Spec(["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", "AAAAAgAAAAAAAAAAAAAAB0RhdGFLZXkAAAAAAgAAAAAAAAAAAAAABkNvbmZpZwAAAAAAAQAAAAAAAAAHTGlzdGluZwAAAAABAAAABA==", "AAAAAQAAAAAAAAAAAAAAB0xpc3RpbmcAAAAABQAAAAAAAAAKZXhwaXJlc19hdAAAAAAABgAAAAAAAAAHZmVlX2JwcwAAAAAEAAAAAAAAAARraW5kAAAH0AAAAAtMaXN0aW5nS2luZAAAAAAAAAAABXByaWNlAAAAAAAACwAAAAAAAAAGc2VsbGVyAAAAAAAT", "AAAAAgAAAAAAAAAAAAAAC0xpc3RpbmdLaW5kAAAAAAIAAAAAAAAAAAAAAAdQcmltYXJ5AAAAAAAAAAAAAAAACVNlY29uZGFyeQAAAA==", "AAAAAQAAAAAAAAAAAAAAEU1hcmtldHBsYWNlQ29uZmlnAAAAAAAACAAAAAAAAAAMY3VycmVudF9oYXNoAAAD7gAAACAAAAAAAAAAGWRlZmF1bHRfc2Vjb25kYXJ5X2ZlZV9icHMAAAAAAAAEAAAAAAAAAAdtYW5hZ2VyAAAAABMAAAAAAAAABnBhdXNlZAAAAAAAAQAAAAAAAAANcGF5bWVudF9hc3NldAAAAAAAABMAAAAAAAAABXRva2VuAAAAAAAAEwAAAAAAAAAIdHJlYXN1cnkAAAATAAAAAAAAAAd2ZXJzaW9uAAAAABA=", "AAAAAAAAAAAAAAADYnV5AAAAAAIAAAAAAAAACHRva2VuX2lkAAAABAAAAAAAAAAFYnV5ZXIAAAAAAAATAAAAAA==", "AAAAAAAAAAAAAAAEbGlzdAAAAAQAAAAAAAAACHRva2VuX2lkAAAABAAAAAAAAAAGc2VsbGVyAAAAAAATAAAAAAAAAAVwcmljZQAAAAAAAAsAAAAAAAAACmV4cGlyZXNfYXQAAAAAAAYAAAAA", "AAAAAAAAAAAAAAAFcGF1c2UAAAAAAAAAAAAAAA==", "AAAAAAAAAAAAAAAGY2FuY2VsAAAAAAACAAAAAAAAAAh0b2tlbl9pZAAAAAQAAAAAAAAABnNlbGxlcgAAAAAAEwAAAAA=", "AAAAAAAAAAAAAAAGZXhwaXJlAAAAAAABAAAAAAAAAAh0b2tlbl9pZAAAAAQAAAAA", "AAAAAAAAAAAAAAAHdW5wYXVzZQAAAAAAAAAAAA==", "AAAAAAAAAAAAAAAHdXBncmFkZQAAAAACAAAAAAAAAAlmcm9tX2hhc2gAAAAAAAPuAAAAIAAAAAAAAAAHdG9faGFzaAAAAAPuAAAAIAAAAAA=", "AAAAAAAAAAAAAAAKZ2V0X2NvbmZpZwAAAAAAAAAAAAEAAAfQAAAAEU1hcmtldHBsYWNlQ29uZmlnAAAA", "AAAAAAAAAAAAAAALZ2V0X2xpc3RpbmcAAAAAAQAAAAAAAAAIdG9rZW5faWQAAAAEAAAAAQAAA+gAAAfQAAAAB0xpc3RpbmcA", "AAAAAAAAAAAAAAANX19jb25zdHJ1Y3RvcgAAAAAAAAcAAAAAAAAABXRva2VuAAAAAAAAEwAAAAAAAAAIdHJlYXN1cnkAAAATAAAAAAAAAA1wYXltZW50X2Fzc2V0AAAAAAAAEwAAAAAAAAAHbWFuYWdlcgAAAAATAAAAAAAAAAxjdXJyZW50X2hhc2gAAAPuAAAAIAAAAAAAAAAHdmVyc2lvbgAAAAAQAAAAAAAAABlkZWZhdWx0X3NlY29uZGFyeV9mZWVfYnBzAAAAAAAABAAAAAA=", "AAAAAAAAAAAAAAANbWludF9hbmRfbGlzdAAAAAAAAAIAAAAAAAAABXByaWNlAAAAAAAACwAAAAAAAAAKZXhwaXJlc19hdAAAAAAABgAAAAEAAAAE", "AAAAAAAAAAAAAAARc2V0X3BheW1lbnRfYXNzZXQAAAAAAAABAAAAAAAAAA1wYXltZW50X2Fzc2V0AAAAAAAAEwAAAAA=", "AAAAAAAAAAAAAAASZmluYWxpemVfb3duZXJzaGlwAAAAAAABAAAAAAAAAAxuZXdfdHJlYXN1cnkAAAATAAAAAA==", "AAAAAAAAAAAAAAAVc2V0X3NlY29uZGFyeV9mZWVfYnBzAAAAAAAAAQAAAAAAAAAHZmVlX2JwcwAAAAAEAAAAAA==", "AAAAAgAAAONDb250ZXh0IG9mIGEgc2luZ2xlIGF1dGhvcml6ZWQgY2FsbCBwZXJmb3JtZWQgYnkgYW4gYWRkcmVzcy4KCkN1c3RvbSBhY2NvdW50IGNvbnRyYWN0cyB0aGF0IGltcGxlbWVudCBgX19jaGVja19hdXRoYCBzcGVjaWFsIGZ1bmN0aW9uCnJlY2VpdmUgYSBsaXN0IG9mIGBDb250ZXh0YCB2YWx1ZXMgY29ycmVzcG9uZGluZyB0byBhbGwgdGhlIGNhbGxzIHRoYXQKbmVlZCB0byBiZSBhdXRob3JpemVkLgAAAAAAAAAAB0NvbnRleHQAAAAAAwAAAAEAAAAUQ29udHJhY3QgaW52b2NhdGlvbi4AAAAIQ29udHJhY3QAAAABAAAH0AAAAA9Db250cmFjdENvbnRleHQAAAAAAQAAAD1Db250cmFjdCB0aGF0IGhhcyBhIGNvbnN0cnVjdG9yIHdpdGggbm8gYXJndW1lbnRzIGlzIGNyZWF0ZWQuAAAAAAAAFENyZWF0ZUNvbnRyYWN0SG9zdEZuAAAAAQAAB9AAAAAbQ3JlYXRlQ29udHJhY3RIb3N0Rm5Db250ZXh0AAAAAAEAAABEQ29udHJhY3QgdGhhdCBoYXMgYSBjb25zdHJ1Y3RvciB3aXRoIDEgb3IgbW9yZSBhcmd1bWVudHMgaXMgY3JlYXRlZC4AAAAcQ3JlYXRlQ29udHJhY3RXaXRoQ3Rvckhvc3RGbgAAAAEAAAfQAAAAKkNyZWF0ZUNvbnRyYWN0V2l0aENvbnN0cnVjdG9ySG9zdEZuQ29udGV4dAAA", "AAAAAQAAAL1BdXRob3JpemF0aW9uIGNvbnRleHQgb2YgYSBzaW5nbGUgY29udHJhY3QgY2FsbC4KClRoaXMgc3RydWN0IGNvcnJlc3BvbmRzIHRvIGEgYHJlcXVpcmVfYXV0aF9mb3JfYXJnc2AgY2FsbCBmb3IgYW4gYWRkcmVzcwpmcm9tIGBjb250cmFjdGAgZnVuY3Rpb24gd2l0aCBgZm5fbmFtZWAgbmFtZSBhbmQgYGFyZ3NgIGFyZ3VtZW50cy4AAAAAAAAAAAAAD0NvbnRyYWN0Q29udGV4dAAAAAADAAAAAAAAAARhcmdzAAAD6gAAAAAAAAAAAAAACGNvbnRyYWN0AAAAEwAAAAAAAAAHZm5fbmFtZQAAAAAR", "AAAAAgAAAF9Db250cmFjdCBleGVjdXRhYmxlIHVzZWQgZm9yIGNyZWF0aW5nIGEgbmV3IGNvbnRyYWN0IGFuZCB1c2VkIGluCmBDcmVhdGVDb250cmFjdEhvc3RGbkNvbnRleHRgLgAAAAAAAAAAEkNvbnRyYWN0RXhlY3V0YWJsZQAAAAAAAQAAAAEAAAAAAAAABFdhc20AAAABAAAD7gAAACA=", "AAAAAQAAADhWYWx1ZSBvZiBjb250cmFjdCBub2RlIGluIEludm9rZXJDb250cmFjdEF1dGhFbnRyeSB0cmVlLgAAAAAAAAAVU3ViQ29udHJhY3RJbnZvY2F0aW9uAAAAAAAAAgAAAAAAAAAHY29udGV4dAAAAAfQAAAAD0NvbnRyYWN0Q29udGV4dAAAAAAAAAAAD3N1Yl9pbnZvY2F0aW9ucwAAAAPqAAAH0AAAABhJbnZva2VyQ29udHJhY3RBdXRoRW50cnk=", "AAAAAgAAAS9BIG5vZGUgaW4gdGhlIHRyZWUgb2YgYXV0aG9yaXphdGlvbnMgcGVyZm9ybWVkIG9uIGJlaGFsZiBvZiB0aGUgY3VycmVudApjb250cmFjdCBhcyBpbnZva2VyIG9mIHRoZSBjb250cmFjdHMgZGVlcGVyIGluIHRoZSBjYWxsIHN0YWNrLgoKVGhpcyBpcyB1c2VkIGFzIGFuIGFyZ3VtZW50IG9mIGBhdXRob3JpemVfYXNfY3VycmVudF9jb250cmFjdGAgaG9zdCBmdW5jdGlvbi4KClRoaXMgdHJlZSBjb3JyZXNwb25kcyBgcmVxdWlyZV9hdXRoW19mb3JfYXJnc11gIGNhbGxzIG9uIGJlaGFsZiBvZiB0aGUKY3VycmVudCBjb250cmFjdC4AAAAAAAAAABhJbnZva2VyQ29udHJhY3RBdXRoRW50cnkAAAADAAAAAQAAABJJbnZva2UgYSBjb250cmFjdC4AAAAAAAhDb250cmFjdAAAAAEAAAfQAAAAFVN1YkNvbnRyYWN0SW52b2NhdGlvbgAAAAAAAAEAAAA1Q3JlYXRlIGEgY29udHJhY3QgcGFzc2luZyAwIGFyZ3VtZW50cyB0byBjb25zdHJ1Y3Rvci4AAAAAAAAUQ3JlYXRlQ29udHJhY3RIb3N0Rm4AAAABAAAH0AAAABtDcmVhdGVDb250cmFjdEhvc3RGbkNvbnRleHQAAAAAAQAAAD1DcmVhdGUgYSBjb250cmFjdCBwYXNzaW5nIDAgb3IgbW9yZSBhcmd1bWVudHMgdG8gY29uc3RydWN0b3IuAAAAAAAAHENyZWF0ZUNvbnRyYWN0V2l0aEN0b3JIb3N0Rm4AAAABAAAH0AAAACpDcmVhdGVDb250cmFjdFdpdGhDb25zdHJ1Y3Rvckhvc3RGbkNvbnRleHQAAA==", "AAAAAQAAAHZBdXRob3JpemF0aW9uIGNvbnRleHQgZm9yIGBjcmVhdGVfY29udHJhY3RgIGhvc3QgZnVuY3Rpb24gdGhhdCBjcmVhdGVzIGEKbmV3IGNvbnRyYWN0IG9uIGJlaGFsZiBvZiBhdXRob3JpemVyIGFkZHJlc3MuAAAAAAAAAAAAG0NyZWF0ZUNvbnRyYWN0SG9zdEZuQ29udGV4dAAAAAACAAAAAAAAAApleGVjdXRhYmxlAAAAAAfQAAAAEkNvbnRyYWN0RXhlY3V0YWJsZQAAAAAAAAAAAARzYWx0AAAD7gAAACA=", "AAAAAQAAANZBdXRob3JpemF0aW9uIGNvbnRleHQgZm9yIGBjcmVhdGVfY29udHJhY3RgIGhvc3QgZnVuY3Rpb24gdGhhdCBjcmVhdGVzIGEKbmV3IGNvbnRyYWN0IG9uIGJlaGFsZiBvZiBhdXRob3JpemVyIGFkZHJlc3MuClRoaXMgaXMgdGhlIHNhbWUgYXMgYENyZWF0ZUNvbnRyYWN0SG9zdEZuQ29udGV4dGAsIGJ1dCBhbHNvIGhhcwpjb250cmFjdCBjb25zdHJ1Y3RvciBhcmd1bWVudHMuAAAAAAAAAAAAKkNyZWF0ZUNvbnRyYWN0V2l0aENvbnN0cnVjdG9ySG9zdEZuQ29udGV4dAAAAAAAAwAAAAAAAAAQY29uc3RydWN0b3JfYXJncwAAA+oAAAAAAAAAAAAAAApleGVjdXRhYmxlAAAAAAfQAAAAEkNvbnRyYWN0RXhlY3V0YWJsZQAAAAAAAAAAAARzYWx0AAAD7gAAACA=", "AAAAAgAAAAAAAAAAAAAACkV4ZWN1dGFibGUAAAAAAAMAAAABAAAAAAAAAARXYXNtAAAAAQAAA+4AAAAgAAAAAAAAAAAAAAAMU3RlbGxhckFzc2V0AAAAAAAAAAAAAAAHQWNjb3VudAA="]),
      options
    );
  }

   static deploy<T = Client>({ token, treasury, payment_asset, manager, current_hash, version, default_secondary_fee_bps }: { token: string | Address; treasury: string | Address; payment_asset: string | Address; manager: string | Address; current_hash: Uint8Array; version: string; default_secondary_fee_bps: number }, options: MethodOptions & Omit<ContractClientOptions, 'contractId'> & { salt?: Uint8Array; address?: string; } & ({ wasmHash: Uint8Array | string; format?: "hex" | "base64"; externalRef?: never; } | { externalRef: ExternalExecutableRef; wasmHash?: never; format?: never; })): Promise<AssembledTransaction<T>> {
    return ContractClient.deploy({ token, treasury, payment_asset, manager, current_hash, version, default_secondary_fee_bps }, options);
  }
  public readonly fromJson = {
    buy : this.txFromJson<void>,  list : this.txFromJson<void>,  pause : this.txFromJson<void>,  cancel : this.txFromJson<void>,  expire : this.txFromJson<void>,  unpause : this.txFromJson<void>,  upgrade : this.txFromJson<void>,  get_config : this.txFromJson<MarketplaceConfig>,  get_listing : this.txFromJson<Listing | null>,  mint_and_list : this.txFromJson<number>,  set_payment_asset : this.txFromJson<void>,  finalize_ownership : this.txFromJson<void>,  set_secondary_fee_bps : this.txFromJson<void>
  };

  /** @deprecated Use fromJson instead. */
  public readonly fromJSON = this.fromJson;

  /**
   * Parse a raw contract event (topics + data) into a typed {@link ContractEvent}.
   */
  parseEvent(topics: xdr.ScVal[] | string[], data: xdr.ScVal | string): ContractEvent | undefined {
    return this.spec.parseEvent(topics, data) as ContractEvent | undefined;
  }
  /**
   * Build a topics filter row for the "ListingExpired" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  listingExpiredEventFilter(topicValues?: { token_id?: number }): string[] {
    return this.spec.eventTopicFilter("ListingExpired", topicValues);
  }
  /**
   * Build a topics filter row for the "ListingCancelled" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  listingCancelledEventFilter(topicValues?: { token_id?: number }): string[] {
    return this.spec.eventTopicFilter("ListingCancelled", topicValues);
  }
  /**
   * Build a topics filter row for the "ListingPurchased" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  listingPurchasedEventFilter(topicValues?: { token_id?: number; buyer?: string | Address }): string[] {
    return this.spec.eventTopicFilter("ListingPurchased", topicValues);
  }
  /**
   * Build a topics filter row for the "MarketplacePaused" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  marketplacePausedEventFilter(): string[] {
    return this.spec.eventTopicFilter("MarketplacePaused");
  }
  /**
   * Build a topics filter row for the "MarketplaceUnpaused" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  marketplaceUnpausedEventFilter(): string[] {
    return this.spec.eventTopicFilter("MarketplaceUnpaused");
  }
  /**
   * Build a topics filter row for the "MarketplaceUpgraded" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  marketplaceUpgradedEventFilter(): string[] {
    return this.spec.eventTopicFilter("MarketplaceUpgraded");
  }
  /**
   * Build a topics filter row for the "PaymentAssetUpdated" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  paymentAssetUpdatedEventFilter(): string[] {
    return this.spec.eventTopicFilter("PaymentAssetUpdated");
  }
  /**
   * Build a topics filter row for the "SecondaryFeeUpdated" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  secondaryFeeUpdatedEventFilter(): string[] {
    return this.spec.eventTopicFilter("SecondaryFeeUpdated");
  }
  /**
   * Build a topics filter row for the "PrimaryListingCreated" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  primaryListingCreatedEventFilter(topicValues?: { token_id?: number }): string[] {
    return this.spec.eventTopicFilter("PrimaryListingCreated", topicValues);
  }
  /**
   * Build a topics filter row for the "MarketplaceInitialized" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  marketplaceInitializedEventFilter(topicValues?: { token?: string | Address }): string[] {
    return this.spec.eventTopicFilter("MarketplaceInitialized", topicValues);
  }
  /**
   * Build a topics filter row for the "SecondaryListingCreated" event, for use in `Api.EventFilter.topics` when calling `server.getEvents`. Omitted fields match any value.
   */
  secondaryListingCreatedEventFilter(topicValues?: { token_id?: number }): string[] {
    return this.spec.eventTopicFilter("SecondaryListingCreated", topicValues);
  }
}