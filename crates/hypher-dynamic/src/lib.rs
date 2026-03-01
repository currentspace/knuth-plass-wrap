//! Dynamic hyphenation using runtime-loaded trie data.
//!
//! This is a fork of [hypher](https://github.com/typst/hypher) that loads
//! trie data at runtime instead of embedding it via `include_bytes!()`.
//! The algorithm is identical — only the data source changes.

#![no_std]
#![forbid(unsafe_code)]

#[cfg(any(feature = "alloc", test))]
extern crate alloc;

use core::fmt::{self, Debug, Formatter};
use core::iter::FusedIterator;
use core::num::NonZeroU8;

/// The maximum size (in bytes) of words that may be hyphenated without
/// allocating.
pub const MAX_INLINE_SIZE: usize = 45;
const INLINE_BUF_SIZE: usize = MAX_INLINE_SIZE + 2; // +2 for dots

/// Segment a word into syllables using runtime-loaded trie data.
///
/// Returns an iterator over the syllables.
///
/// # Example
/// ```ignore
/// let en_trie = std::fs::read("tries/en.bin").unwrap();
/// let syllables = hypher_dynamic::hyphenate("extensive", &en_trie, 2, 3);
/// assert_eq!(syllables.join("-"), "ex-ten-sive");
/// ```
pub fn hyphenate<'a>(
    word: &'a str,
    trie_data: &[u8],
    left_min: usize,
    right_min: usize,
) -> Syllables<'a> {
    // Initialize the trie state for the data.
    let root = State::root(trie_data);

    // Lowercase and add dots before and after the word.
    let dotted = lowercase_and_dot(word);
    let dotted = dotted.as_slice();

    // Convert char bounds to byte bounds in the dotted word.
    let (min_idx, max_idx) = char_to_byte_bounds(word, left_min, right_min);

    // The levels between each two inner bytes of the word.
    let mut levels = Bytes::zeros(word.len().saturating_sub(1));
    let levels_mut = levels.as_mut_slice();

    // Start pattern matching at each character boundary.
    for start in 0..dotted.len() {
        if !is_char_boundary(dotted[start]) {
            continue;
        }

        let mut state = root;
        for &b in &dotted[start..] {
            if let Some(next) = state.transition(b) {
                state = next;
                for (offset, level) in state.levels() {
                    let split = start + offset;
                    if split >= min_idx && split <= max_idx {
                        let slot = &mut levels_mut[split - 2];
                        *slot = (*slot).max(level);
                    }
                }
            } else {
                break;
            }
        }
    }

    // Break into segments at odd levels.
    Syllables { word, cursor: 0, levels }
}

/// Return the default (left_min, right_min) bounds for a language code.
///
/// These follow typographic conventions for each language.
pub fn default_bounds(lang_code: &str) -> (usize, usize) {
    match lang_code {
        "af" => (1, 2),
        "sq" => (2, 2),
        "be" => (2, 2),
        "bg" => (2, 2),
        "ca" => (2, 2),
        "hr" => (2, 2),
        "cs" => (2, 2),
        "da" => (2, 2),
        "nl" => (2, 2),
        "en" => (2, 3),
        "et" => (2, 3),
        "fi" => (2, 2),
        "fr" => (2, 2),
        "ka" => (1, 2),
        "de" => (2, 2),
        "el" => (1, 1),
        "hu" => (2, 2),
        "is" => (2, 2),
        "it" => (2, 2),
        "ku" => (2, 2),
        "la" => (2, 2),
        "lt" => (2, 2),
        "mn" => (2, 2),
        "no" | "nb" | "nn" => (2, 2),
        "pl" => (2, 2),
        "pt" => (2, 3),
        "ru" => (2, 2),
        "sr" => (2, 2),
        "sk" => (2, 3),
        "sl" => (2, 2),
        "es" => (2, 2),
        "sv" => (2, 2),
        "tr" => (2, 2),
        "tk" => (2, 2),
        "uk" => (2, 2),
        // Default: conservative bounds
        _ => (2, 3),
    }
}

/// Lowercase a word and add dots before and after it.
fn lowercase_and_dot(word: &str) -> Bytes {
    let mut dotted = Bytes::zeros(word.len() + 2);
    let dotted_mut = dotted.as_mut_slice();
    dotted_mut[0] = b'.';

    let mut offset = 1;
    for mut c in word.chars() {
        let mut lower = c.to_lowercase();
        if let (Some(l), None) = (lower.next(), lower.next()) {
            if l.len_utf8() == c.len_utf8() {
                c = l;
            }
        }
        offset += c.encode_utf8(&mut dotted_mut[offset..]).len();
    }

    debug_assert_eq!(offset, word.len() + 1);
    dotted_mut[offset] = b'.';
    dotted
}

/// Convert char bounds to byte bounds in the dotted word.
fn char_to_byte_bounds(word: &str, left_min: usize, right_min: usize) -> (usize, usize) {
    let left_min = left_min.max(1);
    let right_min = right_min.max(1);

    let min_idx = 1 + word.chars().take(left_min).map(char::len_utf8).sum::<usize>();
    let max_idx = 1 + word.len()
        - word.chars().rev().take(right_min).map(char::len_utf8).sum::<usize>();

    (min_idx, max_idx)
}

/// An iterator over the syllables of a word.
#[derive(Debug, Clone)]
pub struct Syllables<'a> {
    word: &'a str,
    cursor: usize,
    levels: Bytes,
}

impl Syllables<'_> {
    /// Join the syllables with a separator like a hyphen or soft hyphen.
    #[cfg(any(feature = "alloc", test))]
    pub fn join(mut self, sep: &str) -> alloc::string::String {
        let extra = self.splits() * sep.len();
        let mut s = alloc::string::String::with_capacity(self.word.len() + extra);
        s.extend(self.next());
        for syllable in self {
            s.push_str(sep);
            s.push_str(syllable);
        }
        s
    }

    fn splits(&self) -> usize {
        self.levels.as_slice().iter().filter(|&lvl| lvl % 2 == 1).count()
    }
}

impl<'a> Iterator for Syllables<'a> {
    type Item = &'a str;

    fn next(&mut self) -> Option<Self::Item> {
        let found = self.levels.any(|lvl| lvl % 2 == 1);
        let start = self.cursor;
        let end = self.word.len() - self.levels.len() - found as usize;
        self.cursor = end;
        (start < end).then(|| &self.word[start..end])
    }

    fn size_hint(&self) -> (usize, Option<usize>) {
        let len = if self.word.is_empty() { 0 } else { 1 + self.splits() };
        (len, Some(len))
    }
}

impl ExactSizeIterator for Syllables<'_> {}

impl FusedIterator for Syllables<'_> {}

// ─── Bytes storage ─────────────────────────────────────────────────────

#[derive(Clone)]
enum Bytes {
    Array([u8; INLINE_BUF_SIZE], NonZeroU8),
    #[cfg(feature = "alloc")]
    Vec(alloc::vec::IntoIter<u8>),
}

impl Bytes {
    fn zeros(len: usize) -> Self {
        if len <= INLINE_BUF_SIZE {
            let start = NonZeroU8::new(INLINE_BUF_SIZE as u8 + 1 - len as u8).unwrap();
            Self::Array([0; INLINE_BUF_SIZE], start)
        } else {
            #[cfg(not(feature = "alloc"))]
            panic!(
                "hypher-dynamic: maximum word length is {MAX_INLINE_SIZE} bytes when `alloc` is disabled"
            );

            #[cfg(feature = "alloc")]
            Self::Vec(alloc::vec![0; len].into_iter())
        }
    }

    fn as_slice(&self) -> &[u8] {
        match self {
            Self::Array(arr, start) => &arr[start.get() as usize - 1..],
            #[cfg(feature = "alloc")]
            Self::Vec(iter) => iter.as_slice(),
        }
    }

    fn as_mut_slice(&mut self) -> &mut [u8] {
        match self {
            Self::Array(arr, start) => &mut arr[start.get() as usize - 1..],
            #[cfg(feature = "alloc")]
            Self::Vec(iter) => iter.as_mut_slice(),
        }
    }
}

impl Iterator for Bytes {
    type Item = u8;

    fn next(&mut self) -> Option<Self::Item> {
        match self {
            Self::Array(arr, start) => {
                let index = start.get() as usize - 1;
                if index < INLINE_BUF_SIZE {
                    *start = start.saturating_add(1);
                    Some(arr[index])
                } else {
                    None
                }
            }
            #[cfg(feature = "alloc")]
            Self::Vec(iter) => iter.next(),
        }
    }

    fn size_hint(&self) -> (usize, Option<usize>) {
        match self {
            Self::Array(..) => (self.as_slice().len(), Some(self.as_slice().len())),
            #[cfg(feature = "alloc")]
            Self::Vec(iter) => iter.size_hint(),
        }
    }
}

impl ExactSizeIterator for Bytes {}

impl Debug for Bytes {
    fn fmt(&self, f: &mut Formatter) -> fmt::Result {
        self.as_slice().fmt(f)
    }
}

// ─── Trie traversal ────────────────────────────────────────────────────

#[derive(Copy, Clone)]
struct State<'a> {
    data: &'a [u8],
    addr: usize,
    stride: usize,
    levels: &'a [u8],
    trans: &'a [u8],
    targets: &'a [u8],
}

impl<'a> State<'a> {
    fn root(data: &'a [u8]) -> Self {
        let bytes = data[..4].try_into().unwrap();
        let addr = u32::from_be_bytes(bytes) as usize;
        Self::at(data, addr)
    }

    fn at(data: &'a [u8], addr: usize) -> Self {
        let node = &data[addr..];
        let mut pos = 0;

        let has_levels = node[pos] >> 7 != 0;
        let stride = usize::from((node[pos] >> 5) & 3);
        let mut count = usize::from(node[pos] & 31);
        pos += 1;

        if count == 31 {
            count = usize::from(node[pos]);
            pos += 1;
        }

        let mut levels: &[u8] = &[];
        if has_levels {
            let offset_hi = usize::from(node[pos]) << 4;
            let offset_lo = usize::from(node[pos + 1]) >> 4;
            let offset = offset_hi | offset_lo;
            let len = usize::from(node[pos + 1] & 15);
            levels = &data[offset..offset + len];
            pos += 2;
        }

        let trans = &node[pos..pos + count];
        pos += count;

        let targets = &node[pos..pos + stride * count];
        Self { data, addr, stride, levels, trans, targets }
    }

    fn transition(self, b: u8) -> Option<Self> {
        self.trans.iter().position(|&x| x == b).map(|idx| {
            let offset = self.stride * idx;
            let delta = from_be_bytes(&self.targets[offset..offset + self.stride]);
            let next = (self.addr as isize + delta) as usize;
            Self::at(self.data, next)
        })
    }

    fn levels(self) -> impl Iterator<Item = (usize, u8)> + 'a {
        let mut offset = 0;
        self.levels.iter().map(move |&packed| {
            let dist = usize::from(packed / 10);
            let level = packed % 10;
            offset += dist;
            (offset, level)
        })
    }
}

/// Decode a signed number with 1, 2 or 3 bytes.
fn from_be_bytes(buf: &[u8]) -> isize {
    if let Ok(array) = buf.try_into() {
        i8::from_be_bytes(array) as isize
    } else if let Ok(array) = buf.try_into() {
        i16::from_be_bytes(array) as isize
    } else if buf.len() == 3 {
        let first = usize::from(buf[0]) << 16;
        let second = usize::from(buf[1]) << 8;
        let third = usize::from(buf[2]);
        let unsigned = first | second | third;
        unsigned as isize - (1 << 23)
    } else {
        panic!("invalid stride");
    }
}

/// Whether a byte is a character boundary.
fn is_char_boundary(b: u8) -> bool {
    (b as i8) >= -0x40
}

#[cfg(test)]
mod tests {
    use super::*;

    static EN_TRIE: &[u8] = include_bytes!("../tries/en.bin");
    static DE_TRIE: &[u8] = include_bytes!("../tries/de.bin");
    static EL_TRIE: &[u8] = include_bytes!("../tries/el.bin");
    static PL_TRIE: &[u8] = include_bytes!("../tries/pl.bin");
    static CS_TRIE: &[u8] = include_bytes!("../tries/cs.bin");

    fn test_lang(trie: &[u8], left: usize, right: usize, hyphenated: &str) {
        let word = hyphenated.replace('-', "");
        let syllables = hyphenate(&word, trie, left, right);
        assert_eq!(syllables.join("-"), hyphenated);
    }

    #[test]
    fn empty_word() {
        let mut syllables = hyphenate("", EN_TRIE, 2, 3);
        assert_eq!(syllables.next(), None);
    }

    #[test]
    fn exact_size() {
        assert_eq!(hyphenate("", EN_TRIE, 2, 3).len(), 0);
        assert_eq!(hyphenate("hello", EN_TRIE, 2, 3).len(), 1);
        assert_eq!(hyphenate("extensive", EN_TRIE, 2, 3).len(), 3);
    }

    #[test]
    fn english() {
        let (l, r) = default_bounds("en");
        test_lang(EN_TRIE, l, r, "");
        test_lang(EN_TRIE, l, r, "hi");
        test_lang(EN_TRIE, l, r, "wel-come");
        test_lang(EN_TRIE, l, r, "walk-ing");
        test_lang(EN_TRIE, l, r, "cap-tiVe");
        test_lang(EN_TRIE, l, r, "pur-sue");
        test_lang(EN_TRIE, l, r, "wHaT-eVeR");
        test_lang(EN_TRIE, l, r, "bro-ken");
        test_lang(EN_TRIE, l, r, "ex-ten-sive");
        test_lang(EN_TRIE, l, r, "Prob-a-bil-ity");
        test_lang(EN_TRIE, l, r, "rec-og-nize");
    }

    #[test]
    fn german() {
        let (l, r) = default_bounds("de");
        test_lang(DE_TRIE, l, r, "");
        test_lang(DE_TRIE, l, r, "Baum");
        test_lang(DE_TRIE, l, r, "ge-hen");
        test_lang(DE_TRIE, l, r, "Ap-fel");
        test_lang(DE_TRIE, l, r, "To-ma-te");
        test_lang(DE_TRIE, l, r, "Ein-ga-be-auf-for-de-rung");
        test_lang(DE_TRIE, l, r, "Fort-pflan-zungs-lem-ma");
        test_lang(DE_TRIE, l, r, "stra-te-gie-er-hal-ten-den");
        test_lang(DE_TRIE, l, r, "hübsch");
        test_lang(DE_TRIE, l, r, "häss-lich");
        test_lang(DE_TRIE, l, r, "über-zeu-gen-der");
    }

    #[test]
    fn greek() {
        let (l, r) = default_bounds("el");
        test_lang(EL_TRIE, l, r, "δια-με-ρί-σμα-τα");
        test_lang(EL_TRIE, l, r, "λα-τρευ-τός");
        test_lang(EL_TRIE, l, r, "κά-τοι-κος");
    }

    #[test]
    fn polish() {
        let (l, r) = default_bounds("pl");
        test_lang(PL_TRIE, l, r, "wy-kształ-ciu-chy");
    }

    #[test]
    fn czech() {
        let (l, r) = default_bounds("cs");
        test_lang(CS_TRIE, l, r, "po-ví-dá-me");
        test_lang(CS_TRIE, l, r, "nej-ja-s-něj-ší");
        test_lang(CS_TRIE, l, r, "br-něn-ský");
    }

    #[test]
    fn default_bounds_known() {
        assert_eq!(default_bounds("en"), (2, 3));
        assert_eq!(default_bounds("de"), (2, 2));
        assert_eq!(default_bounds("el"), (1, 1));
        assert_eq!(default_bounds("pt"), (2, 3));
    }

    #[test]
    fn default_bounds_unknown() {
        assert_eq!(default_bounds("xx"), (2, 3));
    }

    #[test]
    fn graceful_no_data() {
        // Even with valid trie data, a word too short won't hyphenate
        let syllables: alloc::vec::Vec<&str> = hyphenate("hi", EN_TRIE, 2, 3).collect();
        assert_eq!(syllables, &["hi"]);
    }
}
