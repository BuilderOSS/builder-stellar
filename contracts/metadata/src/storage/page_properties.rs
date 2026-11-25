//! Property tests for the attributes-page codec (`parse_page`, `write_page`,
//! `to_record`, `from_record`) and the paged store built on it
//! (`set_attributes_range`, `get_attributes`).
//!
//! Inputs come from a fixed-seed LCG, as in the e2e voting invariant, so a
//! failure replays exactly: each case prints its seed. The properties:
//!
//! 1. Any page this code can hold encodes to its exact size and decodes to
//!    the same records.
//! 2. Encoding is canonical: decoding then encoding returns the same bytes.
//! 3. Any byte string decodes or is refused (`TooLarge`, `Corrupt`) without
//!    reading out of range; what decodes survives a round trip.
//! 4. Random range writes across page boundaries read back as a plain map of
//!    token id to selections, with unwritten tokens empty.

extern crate std;

use super::*;
use soroban_sdk::{contract, contractimpl, Env, Vec};
use std::collections::BTreeMap;
use std::vec::Vec as StdVec;

/// Cases per property. Each case is a whole page, so this covers tens of
/// thousands of records.
const CASES: u64 = 2_000;

/// Minimal deterministic generator (Numerical Recipes LCG).
struct Lcg(u64);

impl Lcg {
    fn next(&mut self) -> u64 {
        self.0 = self
            .0
            .wrapping_mul(6_364_136_223_846_793_005)
            .wrapping_add(1_442_695_040_888_963_407);
        self.0 >> 33
    }

    fn below(&mut self, n: usize) -> usize {
        (self.next() % n as u64) as usize
    }
}

/// A record with up to `MAX_PROPERTIES` indexes. Half the records stay
/// below 256 (narrow); the rest may use any index the store accepts.
fn record(rng: &mut Lcg) -> Record {
    let mut r = EMPTY_RECORD;
    r.len = rng.below(MAX_PROPERTIES as usize + 1) as u8;
    let bound = if rng.below(2) == 0 {
        256
    } else {
        MAX_ITEMS_PER_PROPERTY as usize
    };
    for k in 0..r.len as usize {
        r.items[k] = rng.below(bound) as u16;
    }
    r
}

fn page(rng: &mut Lcg) -> AttributesPage {
    let mut p = AttributesPage {
        count: rng.below(TOKENS_PER_ATTRIBUTE_PAGE as usize + 1),
        records: [EMPTY_RECORD; TOKENS_PER_ATTRIBUTE_PAGE as usize],
    };
    for slot in 0..p.count {
        p.records[slot] = record(rng);
    }
    p
}

/// A record as the indexes it holds (what a reader can observe).
fn items(r: &Record) -> StdVec<u16> {
    r.items[..r.len as usize].to_vec()
}

fn records(p: &AttributesPage) -> StdVec<StdVec<u16>> {
    p.records[..p.count].iter().map(items).collect()
}

fn encoded_len(p: &AttributesPage) -> usize {
    p.records[..p.count]
        .iter()
        .map(|r| {
            let n = r.len as usize;
            let wide = r.items[..n].iter().any(|&i| i > u8::MAX as u16);
            1 + if wide { 2 * n } else { n }
        })
        .sum()
}

fn encode(p: &AttributesPage) -> StdVec<u8> {
    let mut buf = [0u8; MAX_ATTRIBUTE_PAGE_BYTES];
    let at = write_page(p, &mut buf);
    buf[..at].to_vec()
}

#[test]
fn every_page_round_trips_at_its_exact_size() {
    for seed in 0..CASES {
        let mut rng = Lcg(seed);
        let p = page(&mut rng);
        let bytes = encode(&p);
        assert_eq!(bytes.len(), encoded_len(&p), "seed {seed}");
        assert!(bytes.len() <= MAX_ATTRIBUTE_PAGE_BYTES, "seed {seed}");
        let back = parse_page(&bytes).unwrap_or_else(|e| panic!("seed {seed}: {e:?}"));
        assert_eq!(back.count, p.count, "seed {seed}");
        assert_eq!(records(&back), records(&p), "seed {seed}");
    }
}

#[test]
fn encoding_is_canonical() {
    for seed in 0..CASES {
        let mut rng = Lcg(seed);
        let bytes = encode(&page(&mut rng));
        let again = encode(&parse_page(&bytes).unwrap());
        assert_eq!(again, bytes, "seed {seed}");
    }
}

/// Bytes that are sometimes a valid page with a few bytes changed, cut or
/// extended, and sometimes noise, up to a little past the size limit.
fn arbitrary_bytes(rng: &mut Lcg) -> StdVec<u8> {
    let mut bytes = if rng.below(2) == 0 {
        encode(&page(rng))
    } else {
        let len = rng.below(MAX_ATTRIBUTE_PAGE_BYTES + 9);
        (0..len).map(|_| rng.next() as u8).collect()
    };
    for _ in 0..rng.below(4) {
        if bytes.is_empty() {
            break;
        }
        let at = rng.below(bytes.len());
        match rng.below(3) {
            0 => bytes[at] = rng.next() as u8,
            1 => bytes.truncate(at),
            _ => bytes.extend((0..rng.below(40)).map(|_| rng.next() as u8)),
        }
    }
    bytes
}

#[test]
fn any_bytes_decode_or_are_refused_without_reading_out_of_range() {
    let (mut decoded, mut refused) = (0, 0);
    for seed in 0..CASES * 5 {
        let mut rng = Lcg(seed);
        let bytes = arbitrary_bytes(&mut rng);
        // A panic here (an index out of range) fails the test.
        match parse_page(&bytes) {
            Ok(p) => {
                decoded += 1;
                assert!(p.count <= TOKENS_PER_ATTRIBUTE_PAGE as usize, "seed {seed}");
                for r in &p.records[..p.count] {
                    assert!(r.len as u32 <= MAX_PROPERTIES, "seed {seed}");
                }
                // A non-canonical input (wide indexes all below 256) may
                // re-encode shorter, but the records survive.
                let back = parse_page(&encode(&p)).unwrap();
                assert_eq!(records(&back), records(&p), "seed {seed}");
            }
            Err(PageError::TooLarge) => {
                refused += 1;
                assert!(bytes.len() > MAX_ATTRIBUTE_PAGE_BYTES, "seed {seed}");
            }
            Err(PageError::Corrupt) => {
                refused += 1;
                assert!(bytes.len() <= MAX_ATTRIBUTE_PAGE_BYTES, "seed {seed}");
            }
        }
    }
    // Both outcomes are exercised, not just one.
    assert!(decoded > CASES as usize / 2 && refused > CASES as usize / 2);
}

#[test]
fn records_convert_to_and_from_the_public_form() {
    let env = Env::default();
    for seed in 0..CASES {
        let mut rng = Lcg(seed);
        let r = record(&mut rng);
        let public = from_record(&env, &r);
        if r.len == 0 {
            assert!(public.is_empty(), "seed {seed}");
        } else {
            assert_eq!(public.len(), r.len as u32 + 1, "seed {seed}");
            assert_eq!(public.get(0), Some(r.len as u32), "seed {seed}");
        }
        assert_eq!(items(&to_record(&public)), items(&r), "seed {seed}");
    }
}

#[contract]
struct StorageHost;

#[contractimpl]
impl StorageHost {
    pub fn noop() {}
}

#[test]
fn range_writes_read_back_like_a_map() {
    for seed in 0..40u64 {
        let env = Env::default();
        env.cost_estimate().budget().reset_unlimited();
        let host = env.register(StorageHost, ());
        let mut rng = Lcg(seed);
        let mut model: BTreeMap<u32, StdVec<u16>> = BTreeMap::new();
        // Token ids span five pages so writes cross page boundaries.
        let span = 5 * TOKENS_PER_ATTRIBUTE_PAGE as usize;
        env.as_contract(&host, || {
            for _ in 0..30 {
                let first = rng.below(span) as u32;
                let n = 1 + rng.below(150.min(span - first as usize));
                let mut batch = Vec::new(&env);
                for i in 0..n as u32 {
                    let r = record(&mut rng);
                    model.insert(first + i, items(&r));
                    batch.push_back(from_record(&env, &r));
                }
                set_attributes_range(&env, first, &batch);
            }
            for token_id in 0..span as u32 + TOKENS_PER_ATTRIBUTE_PAGE {
                let got = get_attributes(&env, token_id);
                let want = model.get(&token_id).cloned().unwrap_or_default();
                let got_items: StdVec<u16> = got.iter().skip(1).map(|i| i as u16).collect();
                assert_eq!(got_items, want, "seed {seed}, token {token_id}");
                assert_eq!(
                    got.is_empty(),
                    want.is_empty(),
                    "seed {seed}, token {token_id}"
                );
            }
        });
    }
}
