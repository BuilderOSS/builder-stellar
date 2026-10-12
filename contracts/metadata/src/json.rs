//! On-chain token JSON for SEP-50 `token_uri`.
//!
//! The document is assembled in a fixed stack buffer and returned as a
//! `data:application/json;base64,` URI. Every string copied in is capped and
//! free of `"`, `\` and control characters (checked where it is stored), so
//! no escaping is needed. Worst case: a 40-byte token name (OpenZeppelin's
//! cap), a 256-byte renderer base and 16 traits with 64-byte names; measured
//! by `token_uri_worst_case_fits_the_limits`. The buffer also covers a
//! 256-byte name.

use soroban_sdk::String;

/// Raw JSON capacity in bytes (worst case above, with headroom).
pub const JSON_CAPACITY: usize = 3_584;
const PREFIX: &[u8] = b"data:application/json;base64,";
/// Encoded URI capacity: prefix plus base64 of a full buffer.
pub const URI_CAPACITY: usize = PREFIX.len() + JSON_CAPACITY.div_ceil(3) * 4;

/// A bounded byte writer; any write past the capacity marks it overflowed.
pub struct Writer<const N: usize> {
    buf: [u8; N],
    len: usize,
    overflow: bool,
}

impl<const N: usize> Writer<N> {
    pub fn new() -> Self {
        Self {
            buf: [0u8; N],
            len: 0,
            overflow: false,
        }
    }

    pub fn push(&mut self, bytes: &[u8]) {
        if self.overflow || self.len + bytes.len() > N {
            self.overflow = true;
            return;
        }
        self.buf[self.len..self.len + bytes.len()].copy_from_slice(bytes);
        self.len += bytes.len();
    }

    pub fn push_string(&mut self, value: &String) {
        let n = value.len() as usize;
        if self.overflow || self.len + n > N {
            self.overflow = true;
            return;
        }
        value.copy_into_slice(&mut self.buf[self.len..self.len + n]);
        self.len += n;
    }

    pub fn push_u32(&mut self, mut value: u32) {
        let mut digits = [0u8; 10];
        let mut i = digits.len();
        loop {
            i -= 1;
            digits[i] = b'0' + (value % 10) as u8;
            value /= 10;
            if value == 0 {
                break;
            }
        }
        self.push(&digits[i..]);
    }

    pub fn bytes(&self) -> Option<&[u8]> {
        if self.overflow {
            None
        } else {
            Some(&self.buf[..self.len])
        }
    }
}

const ALPHABET: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/// `data:application/json;base64,` + standard base64 (with padding) of `json`.
pub fn data_uri(json: &[u8], out: &mut Writer<URI_CAPACITY>) {
    out.push(PREFIX);
    for chunk in json.chunks(3) {
        let b0 = chunk[0] as u32;
        let b1 = chunk.get(1).copied().unwrap_or(0) as u32;
        let b2 = chunk.get(2).copied().unwrap_or(0) as u32;
        let n = (b0 << 16) | (b1 << 8) | b2;
        let quad = [
            ALPHABET[(n >> 18) as usize & 63],
            ALPHABET[(n >> 12) as usize & 63],
            if chunk.len() > 1 {
                ALPHABET[(n >> 6) as usize & 63]
            } else {
                b'='
            },
            if chunk.len() > 2 {
                ALPHABET[n as usize & 63]
            } else {
                b'='
            },
        ];
        out.push(&quad);
    }
}
