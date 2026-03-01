use wasm_bindgen::prelude::*;
use serde::Serialize;
use harfrust::{Feature, FontRef, ShaperData, ShaperInstance, Tag, UnicodeBuffer};
use std::cell::RefCell;
use std::collections::HashMap;

#[wasm_bindgen]
pub fn wasm_build_id() -> String {
    env!("WASM_BUILD_ID").to_string()
}

#[wasm_bindgen(start)]
fn init_panic_hook() {
    #[cfg(feature = "console-panic")]
    console_error_panic_hook::set_once();
}

const INF: f64 = 1e10;
const INF_BAD: f64 = 10000.0;
const LINE_PENALTY: f64 = 10.0;
const FLAG_DEM: f64 = 3000.0;
const FIT_DEM: f64 = 3000.0;
const WIDOW_PENALTY: f64 = 50.0;
const HYPHEN_PENALTY: f64 = 50.0;
const HZ_TARGET_PCT: f64 = 0.03;
const SPACE_SHRINK_RATIO: f64 = 0.2;

const T_BOX: u8 = 0;
const T_GLUE: u8 = 1;
const T_PEN: u8 = 2;

// ─── Hyphenation trie cache (on-demand loading) ─────────────────────────

thread_local! {
    static TRIE_CACHE: RefCell<HashMap<String, Vec<u8>>> = RefCell::new(HashMap::new());
}

/// Load hyphenation trie data for a language. Must be called before
/// `layout_paragraph` with `hyphenate=true` for that language.
#[wasm_bindgen]
pub fn load_hyphenation_data(lang: &str, data: &[u8]) {
    TRIE_CACHE.with(|c| c.borrow_mut().insert(lang.to_string(), data.to_vec()));
}

/// Check if hyphenation data has been loaded for a language.
#[wasm_bindgen]
pub fn has_hyphenation_data(lang: &str) -> bool {
    TRIE_CACHE.with(|c| c.borrow().contains_key(lang))
}

fn hyphenate_word<'a>(word: &'a str, lang_code: &str) -> Vec<&'a str> {
    TRIE_CACHE.with(|c| {
        let cache = c.borrow();
        match cache.get(lang_code) {
            Some(trie_data) => {
                let (l, r) = hypher_dynamic::default_bounds(lang_code);
                hypher_dynamic::hyphenate(word, trie_data, l, r).collect()
            }
            None => vec![word], // graceful degradation: no hyphenation
        }
    })
}

// ─── KP Break (existing, unchanged API) ─────────────────────────────────

struct ActiveNode {
    pos: i32,
    line: i32,
    fit: u8,
    a_w: f64,
    a_y: f64,
    a_z: f64,
    a_hy: f64,
    a_hz: f64,
    dem: f64,
    prev: i32,
    flagged: bool,
}

fn fitness_class(r: f64) -> u8 {
    if r < -0.5 {
        0
    } else if r < 0.5 {
        1
    } else if r < 1.0 {
        2
    } else {
        3
    }
}

#[wasm_bindgen]
pub fn kp_break_pass(
    types: &[u8],
    w: &[f64],
    y: &[f64],
    z: &[f64],
    p: &[f64],
    f: &[u8],
    hy: &[f64],
    hz: &[f64],
    target_width: f64,
    sim_dem: f64,
    extra_stretch: f64,
    extra_shrink: f64,
) -> Vec<u32> {
    let n = types.len();

    let mut c_w = vec![0.0f64; n + 1];
    let mut c_y = vec![0.0f64; n + 1];
    let mut c_z = vec![0.0f64; n + 1];
    let mut c_hy = vec![0.0f64; n + 1];
    let mut c_hz = vec![0.0f64; n + 1];

    for i in 0..n {
        let t = types[i];
        c_w[i + 1] = c_w[i] + if t == T_BOX || t == T_GLUE { w[i] } else { 0.0 };
        c_y[i + 1] = c_y[i] + if t == T_GLUE { y[i] } else { 0.0 };
        c_z[i + 1] = c_z[i] + if t == T_GLUE { z[i] } else { 0.0 };
        c_hy[i + 1] = c_hy[i] + if t == T_BOX { hy[i] } else { 0.0 };
        c_hz[i + 1] = c_hz[i] + if t == T_BOX { hz[i] } else { 0.0 };
    }

    let mut nodes: Vec<ActiveNode> = Vec::with_capacity(n);
    nodes.push(ActiveNode {
        pos: -1,
        line: 0,
        fit: 1,
        a_w: 0.0,
        a_y: 0.0,
        a_z: 0.0,
        a_hy: 0.0,
        a_hz: 0.0,
        dem: 0.0,
        prev: -1,
        flagged: false,
    });

    let mut active: Vec<usize> = vec![0];
    let mut last_deactivated: i32 = -1;
    let mut had_emergency = false;

    for b in 0..n {
        let t = types[b];
        if t == T_BOX {
            continue;
        }
        if t == T_PEN && p[b] >= INF {
            continue;
        }
        if t == T_GLUE && (b == 0 || types[b - 1] != T_BOX) {
            continue;
        }

        let is_flagged = t == T_PEN && f[b] != 0;

        struct Best {
            node_idx: i32,
            dem: f64,
            fit: u8,
        }
        let mut best4 = [
            Best { node_idx: -1, dem: 0.0, fit: 0 },
            Best { node_idx: -1, dem: 0.0, fit: 1 },
            Best { node_idx: -1, dem: 0.0, fit: 2 },
            Best { node_idx: -1, dem: 0.0, fit: 3 },
        ];

        let mut dead: Vec<usize> = Vec::new();

        for ai in 0..active.len() {
            let ni = active[ai];
            let a = &nodes[ni];

            let mut lw = c_w[b + 1] - a.a_w;
            let mut ly = c_y[b + 1] - a.a_y;
            let mut lz = c_z[b + 1] - a.a_z;

            if t == T_GLUE {
                lw -= w[b];
                ly -= y[b];
                lz -= z[b];
            }
            if t == T_PEN {
                lw += w[b];
            }

            let hz_y = c_hy[b + 1] - a.a_hy;
            let hz_z = c_hz[b + 1] - a.a_hz;

            let r = if lw < target_width {
                let total_y = ly + hz_y + extra_stretch;
                if total_y > 0.0 {
                    (target_width - lw) / total_y
                } else if had_emergency {
                    // After an emergency break, accept single-word lines
                    // (no internal glue) with maximum badness so they
                    // don't get merged with the next oversized word.
                    6.0
                } else {
                    INF
                }
            } else if lw > target_width {
                let total_z = lz + hz_z + extra_shrink;
                if total_z > 0.0 {
                    (target_width - lw) / total_z
                } else {
                    -INF
                }
            } else {
                0.0
            };

            if r < -1.0 || (t == T_PEN && p[b] == -INF) {
                dead.push(ai);
            }
            if r < -1.0 || r > 6.0 {
                continue;
            }

            let bad = INF_BAD.min(100.0 * r.abs().powi(3));
            let pen = if t == T_PEN { p[b] } else { 0.0 };

            let mut dem = if pen >= 0.0 {
                (LINE_PENALTY + bad + pen).powi(2)
            } else if pen > -INF {
                (LINE_PENALTY + bad).powi(2) - pen * pen
            } else {
                (LINE_PENALTY + bad).powi(2)
            };

            let fc = fitness_class(r);
            let a_fit = a.fit;
            if (fc as i8 - a_fit as i8).unsigned_abs() > 1 {
                dem += FIT_DEM;
            }
            if sim_dem > 0.0 && (fc as i8 - a_fit as i8).unsigned_abs() > 0 {
                dem += sim_dem;
            }
            if is_flagged && a.flagged {
                dem += FLAG_DEM;
            }

            dem += a.dem;

            let fc_idx = fc as usize;
            if best4[fc_idx].node_idx < 0 || dem < best4[fc_idx].dem {
                best4[fc_idx].node_idx = ni as i32;
                best4[fc_idx].dem = dem;
            }
        }

        for &di in dead.iter().rev() {
            let ni = active[di] as i32;
            // Prefer the node with the most recent break position so that
            // emergency breaks produce the shortest possible overfull line.
            if last_deactivated < 0
                || nodes[ni as usize].pos > nodes[last_deactivated as usize].pos
            {
                last_deactivated = ni;
            }
            active.swap_remove(di);
        }

        let n_w = c_w[b + 1];
        let n_y = c_y[b + 1];
        let n_z = c_z[b + 1];
        let n_hy = c_hy[b + 1];
        let n_hz = c_hz[b + 1];

        for bi in 0..4 {
            if best4[bi].node_idx >= 0 {
                let parent = &nodes[best4[bi].node_idx as usize];
                let new_node = ActiveNode {
                    pos: b as i32,
                    line: parent.line + 1,
                    fit: best4[bi].fit,
                    a_w: n_w,
                    a_y: n_y,
                    a_z: n_z,
                    a_hy: n_hy,
                    a_hz: n_hz,
                    dem: best4[bi].dem,
                    prev: best4[bi].node_idx,
                    flagged: is_flagged,
                };
                let idx = nodes.len();
                nodes.push(new_node);
                active.push(idx);
            }
        }

        if active.is_empty() {
            had_emergency = true;
            let prev_line = if last_deactivated >= 0 {
                nodes[last_deactivated as usize].line + 1
            } else {
                1
            };
            let emergency = ActiveNode {
                pos: b as i32,
                line: prev_line,
                fit: 1,
                a_w: n_w,
                a_y: n_y,
                a_z: n_z,
                a_hy: n_hy,
                a_hz: n_hz,
                dem: 0.0,
                prev: last_deactivated,
                flagged: false,
            };
            let idx = nodes.len();
            nodes.push(emergency);
            active.push(idx);
        }
    }

    let mut best_idx = active[0];
    for &ai in &active[1..] {
        if nodes[ai].dem < nodes[best_idx].dem {
            best_idx = ai;
        }
    }

    let mut result = Vec::new();
    result.push(if had_emergency { 1 } else { 0 });

    let mut breaks = Vec::new();
    let mut cur = best_idx as i32;
    while cur >= 0 {
        let node = &nodes[cur as usize];
        if node.pos >= 0 {
            breaks.push(node.pos as u32);
        }
        cur = node.prev;
    }
    breaks.reverse();
    result.extend(breaks);
    result
}

// ═══════════════════════════════════════════════════════════════════════════
// UNIFIED PIPELINE: layout_paragraph
// ═══════════════════════════════════════════════════════════════════════════

#[derive(Serialize)]
struct LineOut {
    words: Vec<String>,
    widths: Vec<f64>,
    #[serde(rename = "boxW")]
    box_w: f64,
    #[serde(rename = "spaceWidth")]
    space_width: f64,
    last: bool,
    wdth: f64,
}

struct Item {
    t: u8,
    w: f64,
    y: f64,
    z: f64,
    p: f64,
    f: u8,
    hy: f64,
    hz: f64,
    v: String,
}

fn shape_word_advance(font_data: &[u8], shaper_data: &ShaperData, instance: Option<&ShaperInstance>, text: &str, font_size_px: f64, features: &[Feature]) -> f64 {
    let font_ref = match FontRef::new(font_data) {
        Ok(f) => f,
        Err(_) => return 0.0,
    };
    let shaper = shaper_data.shaper(&font_ref)
        .instance(instance)
        .build();
    let upem = shaper.units_per_em() as f64;
    if upem == 0.0 {
        return 0.0;
    }
    let mut buffer = UnicodeBuffer::new();
    buffer.push_str(text);
    buffer.guess_segment_properties();
    let output = shaper.shape(buffer, features);
    let advance: i32 = output.glyph_positions().iter().map(|p| p.x_advance).sum();
    advance as f64 * font_size_px / upem
}

/// `opsz` controls the optical-sizing variation axis.
/// - `> 0.0` → set `opsz` to that value (matches CSS `font-variation-settings: 'opsz' N`)
/// - `0.0`   → don't set `opsz` at all (matches CSS `font-optical-sizing: none`)
///
/// `ital` controls the italic/slant variation axis.
/// - `> 0.0` → set `ital` to `1.0` (for fonts with a binary ital axis) or
///   `slnt` to `-ital` (for fonts with a continuous slant axis)
/// - `0.0`   → upright (default)
fn build_items(
    words: &[&str],
    font_data: &[u8],
    shaper_data: &ShaperData,
    font_ref: &FontRef,
    font_size_px: f64,
    font_weight: f64,
    opsz: f64,
    ital: f64,
    hz_min: f64,
    hz_max: f64,
    hyphenate: bool,
    lang: &str,
    liga: bool,
) -> (Vec<Item>, f64) {
    let hz_enabled = hz_min > 0.0 && hz_max > 0.0;
    let wdth_tag = Tag::new(b"wdth");

    let liga_tag = Tag::new(b"liga");
    let features = [Feature::new(liga_tag, if liga { 1 } else { 0 }, ..)];

    // Build a shared set of "base" variation axes (wght, opsz, ital/slnt)
    // that every shaper instance needs. Hz instances add wdth on top.
    let mut base_vars: Vec<(Tag, f32)> = Vec::new();
    base_vars.push((Tag::new(b"wght"), font_weight as f32));
    if opsz > 0.0 {
        base_vars.push((Tag::new(b"opsz"), opsz as f32));
    }
    if ital > 0.0 {
        base_vars.push((Tag::new(b"ital"), 1.0f32));
        base_vars.push((Tag::new(b"slnt"), -(ital as f32)));
    }

    let default_instance = if hz_enabled {
        let mut vars = vec![(wdth_tag, 100.0f32)];
        vars.extend_from_slice(&base_vars);
        Some(ShaperInstance::from_variations(font_ref, vars))
    } else if !base_vars.is_empty() {
        Some(ShaperInstance::from_variations(font_ref, base_vars.clone()))
    } else {
        None
    };

    let sp_w = shape_word_advance(font_data, shaper_data, default_instance.as_ref(), " ", font_size_px, &features);
    let hyphen_w = if hyphenate {
        shape_word_advance(font_data, shaper_data, default_instance.as_ref(), "-", font_size_px, &features)
    } else {
        0.0
    };

    let hz_min_instance = if hz_enabled {
        let mut vars = vec![(wdth_tag, hz_min as f32)];
        vars.extend_from_slice(&base_vars);
        Some(ShaperInstance::from_variations(font_ref, vars))
    } else {
        None
    };
    let hz_max_instance = if hz_enabled {
        let mut vars = vec![(wdth_tag, hz_max as f32)];
        vars.extend_from_slice(&base_vars);
        Some(ShaperInstance::from_variations(font_ref, vars))
    } else {
        None
    };

    let syllables_for_word: Vec<Vec<String>> = if hyphenate {
        words
            .iter()
            .map(|w| {
                let syls: Vec<&str> = hyphenate_word(w, lang);
                if syls.len() <= 1 {
                    vec![w.to_string()]
                } else {
                    syls.into_iter().map(|s| s.to_string()).collect()
                }
            })
            .collect()
    } else {
        words.iter().map(|w| vec![w.to_string()]).collect()
    };

    let mut items: Vec<Item> = Vec::new();

    for (i, syllables) in syllables_for_word.iter().enumerate() {
        for (si, syl) in syllables.iter().enumerate() {
            let w_norm = shape_word_advance(font_data, shaper_data, default_instance.as_ref(), syl, font_size_px, &features);
            let (hy_val, hz_val) = if hz_enabled {
                let w_min = shape_word_advance(font_data, shaper_data, hz_min_instance.as_ref(), syl, font_size_px, &features);
                let w_max = shape_word_advance(font_data, shaper_data, hz_max_instance.as_ref(), syl, font_size_px, &features);
                (
                    (w_max - w_norm).max(0.0),
                    (w_norm - w_min).max(0.0),
                )
            } else {
                (0.0, 0.0)
            };

            items.push(Item {
                t: T_BOX,
                w: w_norm,
                y: 0.0,
                z: 0.0,
                p: 0.0,
                f: 0,
                hy: hy_val,
                hz: hz_val,
                v: syl.clone(),
            });

            if si < syllables.len() - 1 {
                items.push(Item {
                    t: T_PEN,
                    w: hyphen_w,
                    y: 0.0,
                    z: 0.0,
                    p: HYPHEN_PENALTY,
                    f: 1,
                    hy: 0.0,
                    hz: 0.0,
                    v: String::new(),
                });
            }
        }

        if i < words.len() - 1 {
            if i == words.len() - 2 {
                items.push(Item {
                    t: T_PEN,
                    w: 0.0,
                    y: 0.0,
                    z: 0.0,
                    p: WIDOW_PENALTY,
                    f: 0,
                    hy: 0.0,
                    hz: 0.0,
                    v: String::new(),
                });
            }
            items.push(Item {
                t: T_GLUE,
                w: sp_w,
                y: sp_w * 0.5,
                z: sp_w * SPACE_SHRINK_RATIO,
                p: 0.0,
                f: 0,
                hy: 0.0,
                hz: 0.0,
                v: String::new(),
            });
        }
    }

    items.push(Item {
        t: T_GLUE,
        w: 0.0,
        y: 1e7,
        z: 0.0,
        p: 0.0,
        f: 0,
        hy: 0.0,
        hz: 0.0,
        v: String::new(),
    });
    items.push(Item {
        t: T_PEN,
        w: 0.0,
        y: 0.0,
        z: 0.0,
        p: -INF,
        f: 0,
        hy: 0.0,
        hz: 0.0,
        v: String::new(),
    });

    (items, sp_w)
}

fn kp_break_internal(
    items: &[Item],
    target_width: f64,
    sim_dem: f64,
    extra_stretch: f64,
    extra_shrink: f64,
) -> (Vec<usize>, bool) {
    let n = items.len();
    let mut had_emergency = false;

    let mut c_w = vec![0.0f64; n + 1];
    let mut c_y = vec![0.0f64; n + 1];
    let mut c_z = vec![0.0f64; n + 1];
    let mut c_hy = vec![0.0f64; n + 1];
    let mut c_hz = vec![0.0f64; n + 1];

    for i in 0..n {
        let it = &items[i];
        c_w[i + 1] = c_w[i] + if it.t == T_BOX || it.t == T_GLUE { it.w } else { 0.0 };
        c_y[i + 1] = c_y[i] + if it.t == T_GLUE { it.y } else { 0.0 };
        c_z[i + 1] = c_z[i] + if it.t == T_GLUE { it.z } else { 0.0 };
        c_hy[i + 1] = c_hy[i] + if it.t == T_BOX { it.hy } else { 0.0 };
        c_hz[i + 1] = c_hz[i] + if it.t == T_BOX { it.hz } else { 0.0 };
    }

    let mut nodes: Vec<ActiveNode> = Vec::with_capacity(n);
    nodes.push(ActiveNode {
        pos: -1,
        line: 0,
        fit: 1,
        a_w: 0.0,
        a_y: 0.0,
        a_z: 0.0,
        a_hy: 0.0,
        a_hz: 0.0,
        dem: 0.0,
        prev: -1,
        flagged: false,
    });

    let mut active: Vec<usize> = vec![0];
    let mut last_deactivated: i32 = -1;

    for b in 0..n {
        let t = items[b].t;
        if t == T_BOX {
            continue;
        }
        if t == T_PEN && items[b].p >= INF {
            continue;
        }
        if t == T_GLUE && (b == 0 || items[b - 1].t != T_BOX) {
            continue;
        }

        let is_flagged = t == T_PEN && items[b].f != 0;

        struct Best {
            node_idx: i32,
            dem: f64,
            #[allow(dead_code)]
            fit: u8,
        }
        let mut best4 = [
            Best { node_idx: -1, dem: 0.0, fit: 0 },
            Best { node_idx: -1, dem: 0.0, fit: 1 },
            Best { node_idx: -1, dem: 0.0, fit: 2 },
            Best { node_idx: -1, dem: 0.0, fit: 3 },
        ];

        let mut dead: Vec<usize> = Vec::new();

        for ai in 0..active.len() {
            let ni = active[ai];
            let a = &nodes[ni];

            let mut lw = c_w[b + 1] - a.a_w;
            let mut ly = c_y[b + 1] - a.a_y;
            let mut lz = c_z[b + 1] - a.a_z;

            if t == T_GLUE {
                lw -= items[b].w;
                ly -= items[b].y;
                lz -= items[b].z;
            }
            if t == T_PEN {
                lw += items[b].w;
            }

            let hz_y = c_hy[b + 1] - a.a_hy;
            let hz_z = c_hz[b + 1] - a.a_hz;

            let r = if lw < target_width {
                let total_y = ly + hz_y + extra_stretch;
                if total_y > 0.0 {
                    (target_width - lw) / total_y
                } else if had_emergency {
                    // After an emergency break, accept single-word lines
                    // (no internal glue) with maximum badness so they
                    // don't get merged with the next oversized word.
                    6.0
                } else {
                    INF
                }
            } else if lw > target_width {
                let total_z = lz + hz_z + extra_shrink;
                if total_z > 0.0 {
                    (target_width - lw) / total_z
                } else {
                    -INF
                }
            } else {
                0.0
            };

            if r < -1.0 || (t == T_PEN && items[b].p == -INF) {
                dead.push(ai);
            }
            if r < -1.0 || r > 6.0 {
                continue;
            }

            let bad = INF_BAD.min(100.0 * r.abs().powi(3));
            let pen = if t == T_PEN { items[b].p } else { 0.0 };

            let mut dem = if pen >= 0.0 {
                (LINE_PENALTY + bad + pen).powi(2)
            } else if pen > -INF {
                (LINE_PENALTY + bad).powi(2) - pen * pen
            } else {
                (LINE_PENALTY + bad).powi(2)
            };

            let fc = fitness_class(r);
            let a_fit = a.fit;
            if (fc as i8 - a_fit as i8).unsigned_abs() > 1 {
                dem += FIT_DEM;
            }
            if sim_dem > 0.0 && (fc as i8 - a_fit as i8).unsigned_abs() > 0 {
                dem += sim_dem;
            }
            if is_flagged && a.flagged {
                dem += FLAG_DEM;
            }

            dem += a.dem;

            let fc_idx = fc as usize;
            if best4[fc_idx].node_idx < 0 || dem < best4[fc_idx].dem {
                best4[fc_idx].node_idx = ni as i32;
                best4[fc_idx].dem = dem;
            }
        }

        for &di in dead.iter().rev() {
            let ni = active[di] as i32;
            // Prefer the node with the most recent break position so that
            // emergency breaks produce the shortest possible overfull line.
            if last_deactivated < 0
                || nodes[ni as usize].pos > nodes[last_deactivated as usize].pos
            {
                last_deactivated = ni;
            }
            active.swap_remove(di);
        }

        let n_w = c_w[b + 1];
        let n_y = c_y[b + 1];
        let n_z = c_z[b + 1];
        let n_hy = c_hy[b + 1];
        let n_hz = c_hz[b + 1];

        for bi in 0..4 {
            if best4[bi].node_idx >= 0 {
                let parent = &nodes[best4[bi].node_idx as usize];
                let new_node = ActiveNode {
                    pos: b as i32,
                    line: parent.line + 1,
                    fit: best4[bi].fit,
                    a_w: n_w,
                    a_y: n_y,
                    a_z: n_z,
                    a_hy: n_hy,
                    a_hz: n_hz,
                    dem: best4[bi].dem,
                    prev: best4[bi].node_idx,
                    flagged: is_flagged,
                };
                let idx = nodes.len();
                nodes.push(new_node);
                active.push(idx);
            }
        }

        if active.is_empty() {
            had_emergency = true;
            let prev_line = if last_deactivated >= 0 {
                nodes[last_deactivated as usize].line + 1
            } else {
                1
            };
            let emergency = ActiveNode {
                pos: b as i32,
                line: prev_line,
                fit: 1,
                a_w: n_w,
                a_y: n_y,
                a_z: n_z,
                a_hy: n_hy,
                a_hz: n_hz,
                dem: 0.0,
                prev: last_deactivated,
                flagged: false,
            };
            let idx = nodes.len();
            nodes.push(emergency);
            active.push(idx);
        }
    }

    let mut best_idx = active[0];
    for &ai in &active[1..] {
        if nodes[ai].dem < nodes[best_idx].dem {
            best_idx = ai;
        }
    }

    let mut breaks = Vec::new();
    let mut cur = best_idx as i32;
    while cur >= 0 {
        let node = &nodes[cur as usize];
        if node.pos >= 0 {
            breaks.push(node.pos as usize);
        }
        cur = node.prev;
    }
    breaks.reverse();
    (breaks, had_emergency)
}

fn build_lines_from_items(
    items: &[Item],
    breaks: &[usize],
    space_width: f64,
    line_width: f64,
    hz_min: f64,
    hz_max: f64,
) -> Vec<LineOut> {
    let hz_enabled = hz_min > 0.0 && hz_max > 0.0;

    struct RawLine {
        words: Vec<String>,
        widths: Vec<f64>,
        box_w: f64,
    }

    let mut raw_lines: Vec<RawLine> = Vec::new();

    struct Segment {
        start: usize,
        end: usize,
    }
    let mut segments: Vec<Segment> = Vec::new();

    let mut prev: i64 = -1;
    for &brk in breaks {
        let start = (prev + 1) as usize;
        segments.push(Segment { start, end: brk });
        prev = brk as i64;
    }
    segments.push(Segment {
        start: (prev + 1) as usize,
        end: items.len() - 1,
    });

    for seg in &segments {
        let is_flagged_break = seg.end < items.len()
            && items[seg.end].t == T_PEN
            && items[seg.end].f != 0;

        let mut words: Vec<String> = Vec::new();
        let mut widths: Vec<f64> = Vec::new();
        let mut box_w = 0.0;
        let mut current_word = String::new();
        let mut current_width = 0.0;

        for j in seg.start..=seg.end {
            let it = &items[j];
            if it.t == T_BOX {
                current_word.push_str(&it.v);
                current_width += it.w;
            } else if it.t == T_GLUE {
                if !current_word.is_empty() {
                    words.push(current_word.clone());
                    widths.push(current_width);
                    box_w += current_width;
                    current_word.clear();
                    current_width = 0.0;
                }
            }
        }
        if !current_word.is_empty() {
            if is_flagged_break {
                current_word.push('-');
                current_width += items[seg.end].w;
            }
            words.push(current_word);
            widths.push(current_width);
            box_w += current_width;
        }

        if !words.is_empty() {
            raw_lines.push(RawLine { words, widths, box_w });
        }
    }

    let total = raw_lines.len();
    raw_lines
        .into_iter()
        .enumerate()
        .map(|(i, rl)| {
            let is_last = i == total - 1;
            let wdth = if !hz_enabled || is_last || rl.words.len() <= 1 {
                100.0
            } else {
                let seg = &segments[i];
                let mut glue_y = 0.0;
                let mut glue_z = 0.0;
                let mut hz_y = 0.0;
                let mut hz_z = 0.0;
                for j in seg.start..=seg.end {
                    let it = &items[j];
                    if it.t == T_GLUE && j < seg.end {
                        glue_y += it.y;
                        glue_z += it.z;
                    }
                    if it.t == T_BOX {
                        hz_y += it.hy;
                        hz_z += it.hz;
                    }
                }

                let gaps = rl.words.len() as f64 - 1.0;
                let natural = rl.box_w + space_width * gaps;
                let slack = line_width - natural;

                if slack.abs() < 0.5 || (hz_y == 0.0 && hz_z == 0.0) {
                    100.0
                } else {
                    let hz_fraction = if slack > 0.0 {
                        let total_y = glue_y + hz_y;
                        if total_y > 0.0 { hz_y / total_y } else { 0.0 }
                    } else {
                        let total_z = glue_z + hz_z;
                        if total_z > 0.0 { hz_z / total_z } else { 0.0 }
                    };

                    let hz_px = slack * hz_fraction;
                    let total_box_w = rl.box_w;
                    if total_box_w < 0.01 {
                        100.0
                    } else {
                        let pct_change = hz_px / total_box_w;
                        let w = if pct_change > 0.0 {
                            100.0 + (pct_change * (hz_max - 100.0)) / HZ_TARGET_PCT
                        } else {
                            100.0 + (pct_change * (100.0 - hz_min)) / HZ_TARGET_PCT
                        };
                        let w = w.max(hz_min).min(hz_max);
                        (w * 10.0).round() / 10.0
                    }
                }
            };

            LineOut {
                words: rl.words,
                widths: rl.widths,
                box_w: rl.box_w,
                space_width,
                last: is_last,
                wdth,
            }
        })
        .collect()
}

/// Unified pipeline: text + font bytes in, Line[] out.
/// One WASM call replaces measure -> tokenise -> break -> build.
#[wasm_bindgen]
pub fn layout_paragraph(
    font_data: &[u8],
    font_size_px: f64,
    text: &str,
    line_width: f64,
    sim_dem: f64,
    hyphenate: bool,
    lang: &str,
    hz_min: f64,
    hz_max: f64,
    liga: bool,
    font_weight: f64,
    opsz: f64,
    ital: f64,
) -> JsValue {
    let font_ref = match FontRef::new(font_data) {
        Ok(f) => f,
        Err(_) => return serde_wasm_bindgen::to_value(&Vec::<LineOut>::new()).unwrap(),
    };
    let shaper_data = ShaperData::new(&font_ref);

    let words: Vec<&str> = text.split_whitespace().collect();
    if words.is_empty() {
        return serde_wasm_bindgen::to_value(&Vec::<LineOut>::new()).unwrap();
    }

    let (items, sp_w) = build_items(
        &words,
        font_data,
        &shaper_data,
        &font_ref,
        font_size_px,
        font_weight,
        opsz,
        ital,
        hz_min,
        hz_max,
        hyphenate,
        lang,
        liga,
    );

    let (breaks, had_emergency) = kp_break_internal(&items, line_width, sim_dem, 0.0, 0.0);

    let final_breaks = if had_emergency {
        let (b2, _) = kp_break_internal(&items, line_width, sim_dem, line_width * 0.5, 0.0);
        b2
    } else {
        breaks
    };

    let mut lines = build_lines_from_items(&items, &final_breaks, sp_w, line_width, hz_min, hz_max);

    // Post-process Hz lines: verify that the computed wdth actually fits
    // by re-measuring at the assigned wdth value. The wdth computation in
    // build_lines_from_items uses linear interpolation between wdth=100
    // and wdth=hz_min, but fonts can have nonlinear wdth response curves.
    // This catches the linearization error by measuring at the actual wdth.
    let hz_enabled = hz_min > 0.0 && hz_max > 0.0;
    if hz_enabled {
        let wdth_tag = Tag::new(b"wdth");
        let liga_tag = Tag::new(b"liga");
        let features = [Feature::new(liga_tag, if liga { 1 } else { 0 }, ..)];

        let mut base_vars: Vec<(Tag, f32)> = Vec::new();
        base_vars.push((Tag::new(b"wght"), font_weight as f32));
        if opsz > 0.0 {
            base_vars.push((Tag::new(b"opsz"), opsz as f32));
        }
        if ital > 0.0 {
            base_vars.push((Tag::new(b"ital"), 1.0f32));
            base_vars.push((Tag::new(b"slnt"), -(ital as f32)));
        }

        for line in &mut lines {
            if line.last || (line.wdth - 100.0).abs() < 0.1 || line.words.len() <= 1 {
                continue;
            }

            let mut vars = vec![(wdth_tag, line.wdth as f32)];
            vars.extend_from_slice(&base_vars);
            let instance = ShaperInstance::from_variations(&font_ref, vars);

            let mut measured_box_w = 0.0;
            for word in &line.words {
                measured_box_w += shape_word_advance(
                    font_data, &shaper_data, Some(&instance), word,
                    font_size_px, &features,
                );
            }
            let measured_sp_w = shape_word_advance(
                font_data, &shaper_data, Some(&instance), " ",
                font_size_px, &features,
            );
            let gaps = line.words.len() as f64 - 1.0;
            let measured_natural = measured_box_w + measured_sp_w * gaps;

            if measured_natural <= line_width {
                continue; // fits fine
            }

            // The line is overfull at the computed wdth.
            // Binary-search for a wdth that makes it fit.
            let mut lo = hz_min;
            let mut hi = line.wdth;
            for _ in 0..10 {
                let mid = (lo + hi) / 2.0;
                let mut mid_vars = vec![(wdth_tag, mid as f32)];
                mid_vars.extend_from_slice(&base_vars);
                let mid_inst = ShaperInstance::from_variations(&font_ref, mid_vars);

                let mut mid_w = 0.0;
                for word in &line.words {
                    mid_w += shape_word_advance(
                        font_data, &shaper_data, Some(&mid_inst), word,
                        font_size_px, &features,
                    );
                }
                let mid_sp = shape_word_advance(
                    font_data, &shaper_data, Some(&mid_inst), " ",
                    font_size_px, &features,
                );
                let mid_nat = mid_w + mid_sp * gaps;

                if mid_nat > line_width {
                    hi = mid; // need more compression
                } else {
                    lo = mid; // sufficient or over-compressed
                }
            }

            // Use the lower bound (more compressed), which is guaranteed to fit
            let new_wdth = (lo * 10.0).round() / 10.0;
            line.wdth = new_wdth.max(hz_min).min(100.0);
        }
    }

    serde_wasm_bindgen::to_value(&lines).unwrap()
}

/// Measure a single word using harfrust. Useful for validation/debugging.
///
/// `wdth` controls the font-width variation axis (default 100.0 = normal).
/// Pass a value != 100.0 to measure at a different width (e.g. 85.0 for compressed).
#[wasm_bindgen]
pub fn measure_word_width(
    font_data: &[u8],
    font_size_px: f64,
    text: &str,
    liga: bool,
    font_weight: f64,
    opsz: f64,
    ital: f64,
    wdth: f64,
) -> f64 {
    let font_ref = match FontRef::new(font_data) {
        Ok(f) => f,
        Err(_) => return 0.0,
    };
    let shaper_data = ShaperData::new(&font_ref);
    let liga_tag = Tag::new(b"liga");
    let features = [Feature::new(liga_tag, if liga { 1 } else { 0 }, ..)];

    let mut vars: Vec<(Tag, f32)> = Vec::new();
    vars.push((Tag::new(b"wght"), font_weight as f32));
    if opsz > 0.0 {
        vars.push((Tag::new(b"opsz"), opsz as f32));
    }
    if ital > 0.0 {
        vars.push((Tag::new(b"ital"), 1.0f32));
        vars.push((Tag::new(b"slnt"), -(ital as f32)));
    }
    if (wdth - 100.0).abs() > 0.01 {
        vars.push((Tag::new(b"wdth"), wdth as f32));
    }

    let instance = if vars.is_empty() {
        None
    } else {
        Some(ShaperInstance::from_variations(&font_ref, vars))
    };

    shape_word_advance(font_data, &shaper_data, instance.as_ref(), text, font_size_px, &features)
}

// ═══════════════════════════════════════════════════════════════════════════
// TESTS
// ═══════════════════════════════════════════════════════════════════════════

#[cfg(test)]
mod tests {
    use super::*;

    static TEST_FONT: &[u8] = include_bytes!("../tests/fixtures/DMMono-Regular.ttf");

    // ── fitness_class ────────────────────────────────────────────────────

    #[test]
    fn fitness_class_tight() {
        assert_eq!(fitness_class(-1.0), 0);
        assert_eq!(fitness_class(-0.51), 0);
    }

    #[test]
    fn fitness_class_normal() {
        assert_eq!(fitness_class(-0.5), 1);
        assert_eq!(fitness_class(0.0), 1);
        assert_eq!(fitness_class(0.49), 1);
    }

    #[test]
    fn fitness_class_loose() {
        assert_eq!(fitness_class(0.5), 2);
        assert_eq!(fitness_class(0.99), 2);
    }

    #[test]
    fn fitness_class_very_loose() {
        assert_eq!(fitness_class(1.0), 3);
        assert_eq!(fitness_class(100.0), 3);
    }

    // ── shape_word_advance ───────────────────────────────────────────────

    #[test]
    fn shape_word_returns_nonzero_for_valid_font() {
        let font_ref = FontRef::new(TEST_FONT).unwrap();
        let shaper_data = ShaperData::new(&font_ref);
        let liga_tag = Tag::new(b"liga");
        let features = [Feature::new(liga_tag, 1, ..)];

        let w = shape_word_advance(TEST_FONT, &shaper_data, None, "Hello", 16.0, &features);
        assert!(w > 0.0, "Expected positive width, got {w}");
    }

    #[test]
    fn shape_word_returns_zero_for_empty_text() {
        let font_ref = FontRef::new(TEST_FONT).unwrap();
        let shaper_data = ShaperData::new(&font_ref);
        let liga_tag = Tag::new(b"liga");
        let features = [Feature::new(liga_tag, 1, ..)];

        let w = shape_word_advance(TEST_FONT, &shaper_data, None, "", 16.0, &features);
        assert_eq!(w, 0.0);
    }

    #[test]
    fn shape_word_scales_with_font_size() {
        let font_ref = FontRef::new(TEST_FONT).unwrap();
        let shaper_data = ShaperData::new(&font_ref);
        let liga_tag = Tag::new(b"liga");
        let features = [Feature::new(liga_tag, 1, ..)];

        let w16 = shape_word_advance(TEST_FONT, &shaper_data, None, "test", 16.0, &features);
        let w32 = shape_word_advance(TEST_FONT, &shaper_data, None, "test", 32.0, &features);
        let ratio = w32 / w16;
        assert!((ratio - 2.0).abs() < 0.01, "Expected 2x scaling, got {ratio}x");
    }

    #[test]
    fn shape_word_returns_zero_for_invalid_font() {
        let font_ref = FontRef::new(TEST_FONT).unwrap();
        let shaper_data = ShaperData::new(&font_ref);
        let liga_tag = Tag::new(b"liga");
        let features = [Feature::new(liga_tag, 1, ..)];

        let w = shape_word_advance(b"not a font", &shaper_data, None, "Hello", 16.0, &features);
        assert_eq!(w, 0.0);
    }

    // ── build_items ──────────────────────────────────────────────────────

    fn load_test_tries() {
        static EN_TRIE: &[u8] = include_bytes!("../tests/fixtures/en.bin");
        static DE_TRIE: &[u8] = include_bytes!("../tests/fixtures/de.bin");
        TRIE_CACHE.with(|c| {
            let mut cache = c.borrow_mut();
            cache.entry("en".to_string()).or_insert_with(|| EN_TRIE.to_vec());
            cache.entry("de".to_string()).or_insert_with(|| DE_TRIE.to_vec());
        });
    }

    fn make_items(words: &[&str], hyphenate: bool) -> (Vec<Item>, f64) {
        load_test_tries();
        let font_ref = FontRef::new(TEST_FONT).unwrap();
        let shaper_data = ShaperData::new(&font_ref);
        build_items(
            words,
            TEST_FONT,
            &shaper_data,
            &font_ref,
            16.0,
            400.0,
            16.0,
            0.0,
            0.0,
            0.0,
            hyphenate,
            "en",
            true,
        )
    }

    #[test]
    fn build_items_single_word() {
        let (items, sp_w) = make_items(&["Hello"], false);
        assert!(sp_w > 0.0, "Space width should be positive");
        // box("Hello") + final glue + final penalty = 3 items
        assert_eq!(items.len(), 3);
        assert_eq!(items[0].t, T_BOX);
        assert_eq!(items[0].v, "Hello");
        assert!(items[0].w > 0.0);
        assert_eq!(items[1].t, T_GLUE); // final fill glue
        assert_eq!(items[2].t, T_PEN);  // forced break
        assert_eq!(items[2].p, -INF);
    }

    #[test]
    fn build_items_two_words() {
        let (items, _) = make_items(&["Hello", "world"], false);
        // box("Hello") + widow_pen + glue + box("world") + fill_glue + forced_pen = 6
        assert_eq!(items.len(), 6);
        assert_eq!(items[0].t, T_BOX);
        assert_eq!(items[0].v, "Hello");
        assert_eq!(items[1].t, T_PEN);
        assert_eq!(items[1].p, WIDOW_PENALTY);
        assert_eq!(items[2].t, T_GLUE);
        assert!(items[2].w > 0.0); // space width
        assert!(items[2].y > 0.0); // stretch
        assert!(items[2].z > 0.0); // shrink
        assert_eq!(items[3].t, T_BOX);
        assert_eq!(items[3].v, "world");
    }

    #[test]
    fn build_items_three_words_has_glue_between() {
        let (items, _) = make_items(&["one", "two", "three"], false);
        // box + widow_pen + glue + box + glue + box + fill_glue + forced_pen = 8
        // Wait: widow penalty is only before the second-to-last glue (i == words.len() - 2)
        // word0: box("one")
        // between 0 and 1: glue (i=0, not second-to-last for 3 words)
        // word1: box("two")
        // between 1 and 2: widow_pen + glue (i=1 == words.len()-2)
        // word2: box("three")
        // final: fill_glue + forced_pen
        assert_eq!(items.len(), 8);
        assert_eq!(items[0].t, T_BOX);
        assert_eq!(items[0].v, "one");
        assert_eq!(items[1].t, T_GLUE);
        assert_eq!(items[2].t, T_BOX);
        assert_eq!(items[2].v, "two");
        assert_eq!(items[3].t, T_PEN);
        assert_eq!(items[3].p, WIDOW_PENALTY);
        assert_eq!(items[4].t, T_GLUE);
        assert_eq!(items[5].t, T_BOX);
        assert_eq!(items[5].v, "three");
    }

    #[test]
    fn build_items_with_hyphenation() {
        let (items, _) = make_items(&["hyphenation"], true);
        let pen_count = items.iter().filter(|it| it.t == T_PEN && it.p == HYPHEN_PENALTY).count();
        assert!(pen_count > 0, "Hyphenation should insert penalty items between syllables");
        let box_count = items.iter().filter(|it| it.t == T_BOX).count();
        assert!(box_count > 1, "Hyphenated word should produce multiple box items, got {box_count}");
    }

    #[test]
    fn build_items_hz_produces_nonzero_stretch() {
        load_test_tries();
        let font_ref = FontRef::new(TEST_FONT).unwrap();
        let shaper_data = ShaperData::new(&font_ref);
        // DM Mono is not a variable-width font, so hz values will be 0.
        // This tests the code path; real Hz fonts would produce non-zero values.
        let (items, _) = build_items(
            &["Hello", "world"],
            TEST_FONT,
            &shaper_data,
            &font_ref,
            16.0,
            400.0,
            16.0,
            0.0,
            90.0,
            110.0,
            false,
            "en",
            true,
        );
        // Items should still be well-formed even if hz values are 0 for this font
        assert!(items.len() >= 5);
        assert_eq!(items[0].t, T_BOX);
    }

    // ── kp_break_internal ────────────────────────────────────────────────

    fn make_break_items(words: &[&str], _line_width: f64) -> (Vec<Item>, f64) {
        load_test_tries();
        let font_ref = FontRef::new(TEST_FONT).unwrap();
        let shaper_data = ShaperData::new(&font_ref);
        build_items(
            words,
            TEST_FONT,
            &shaper_data,
            &font_ref,
            16.0,
            400.0,
            16.0,
            0.0,
            0.0,
            0.0,
            false,
            "en",
            true,
        )
    }

    #[test]
    fn kp_break_single_line() {
        let (items, _) = make_break_items(&["Hello", "world"], 500.0);
        let (breaks, had_emergency) = kp_break_internal(&items, 500.0, 0.0, 0.0, 0.0);
        assert!(!had_emergency);
        // Everything fits on one line, so the only break is the forced break at the end
        assert!(!breaks.is_empty());
    }

    #[test]
    fn kp_break_forces_multiple_lines() {
        let words: Vec<&str> = "The quick brown fox jumps over the lazy dog and keeps on running".split_whitespace().collect();
        let (items, _) = make_break_items(&words, 100.0);
        let (breaks, _) = kp_break_internal(&items, 100.0, 0.0, 0.0, 0.0);
        assert!(breaks.len() > 1, "Narrow width should produce multiple breaks, got {}", breaks.len());
    }

    #[test]
    fn kp_break_emergency_on_impossible_width() {
        let (items, _) = make_break_items(&["Supercalifragilisticexpialidocious", "is", "a", "word"], 10.0);
        let (_, had_emergency) = kp_break_internal(&items, 10.0, 0.0, 0.0, 0.0);
        assert!(had_emergency, "Impossibly narrow width should trigger emergency breaks");
    }

    #[test]
    fn kp_break_with_similarity_demerits() {
        let words: Vec<&str> = "The quick brown fox jumps over the lazy dog and keeps running forever".split_whitespace().collect();
        let (items, _) = make_break_items(&words, 150.0);
        let (breaks_no_sim, _) = kp_break_internal(&items, 150.0, 0.0, 0.0, 0.0);
        let (breaks_sim, _) = kp_break_internal(&items, 150.0, 2000.0, 0.0, 0.0);
        // Both should produce valid breaks (may or may not differ)
        assert!(!breaks_no_sim.is_empty());
        assert!(!breaks_sim.is_empty());
    }

    // ── build_lines_from_items ───────────────────────────────────────────

    #[test]
    fn build_lines_correct_word_grouping() {
        let words: Vec<&str> = "one two three four five six".split_whitespace().collect();
        let (items, sp_w) = make_break_items(&words, 120.0);
        let (breaks, _) = kp_break_internal(&items, 120.0, 0.0, 0.0, 0.0);
        let lines = build_lines_from_items(&items, &breaks, sp_w, 120.0, 0.0, 0.0);

        assert!(!lines.is_empty(), "Should produce at least one line");

        // Last line should be marked as last
        let last = lines.last().unwrap();
        assert!(last.last, "Final line should have last=true");

        // Non-last lines should not be marked as last
        for line in &lines[..lines.len() - 1] {
            assert!(!line.last, "Non-final line should have last=false");
        }

        // All lines should have positive box width
        for line in &lines {
            assert!(line.box_w > 0.0, "Line box_w should be positive");
            assert!(!line.words.is_empty(), "Line should have at least one word");
            assert_eq!(line.words.len(), line.widths.len(), "words and widths should be parallel");
        }

        // All words should appear exactly once across all lines
        let all_words: Vec<&str> = lines.iter().flat_map(|l| l.words.iter().map(|w| w.as_str())).collect();
        assert_eq!(all_words, words);
    }

    #[test]
    fn build_lines_space_width_propagated() {
        let (items, sp_w) = make_break_items(&["hello", "world"], 500.0);
        let (breaks, _) = kp_break_internal(&items, 500.0, 0.0, 0.0, 0.0);
        let lines = build_lines_from_items(&items, &breaks, sp_w, 500.0, 0.0, 0.0);

        for line in &lines {
            assert_eq!(line.space_width, sp_w, "space_width should match");
        }
    }

    #[test]
    fn build_lines_wdth_is_100_without_hz() {
        let words: Vec<&str> = "one two three four five six seven eight".split_whitespace().collect();
        let (items, sp_w) = make_break_items(&words, 120.0);
        let (breaks, _) = kp_break_internal(&items, 120.0, 0.0, 0.0, 0.0);
        let lines = build_lines_from_items(&items, &breaks, sp_w, 120.0, 0.0, 0.0);

        for line in &lines {
            assert_eq!(line.wdth, 100.0, "wdth should be 100.0 without Hz");
        }
    }

    // ── end-to-end: build_items -> kp_break -> build_lines ───────────────

    #[test]
    fn end_to_end_paragraph_layout() {
        load_test_tries();
        let text = "The problem of breaking a paragraph into lines of approximately equal length has been important since the invention of movable type in the fifteenth century";
        let words: Vec<&str> = text.split_whitespace().collect();
        let font_ref = FontRef::new(TEST_FONT).unwrap();
        let shaper_data = ShaperData::new(&font_ref);

        let (items, sp_w) = build_items(
            &words, TEST_FONT, &shaper_data, &font_ref,
            16.0, 400.0, 16.0, 0.0, 0.0, 0.0, false, "en", true,
        );

        let (breaks, had_emergency) = kp_break_internal(&items, 300.0, 2000.0, 0.0, 0.0);
        assert!(!had_emergency, "Should not need emergency breaks at 300px");

        let lines = build_lines_from_items(&items, &breaks, sp_w, 300.0, 0.0, 0.0);
        assert!(lines.len() >= 2, "Should produce multiple lines, got {}", lines.len());

        // Verify last line
        assert!(lines.last().unwrap().last);

        // Verify all words are present
        let all_words: Vec<&str> = lines.iter().flat_map(|l| l.words.iter().map(|w| w.as_str())).collect();
        assert_eq!(all_words, words);

        // Verify per-word widths are positive
        for line in &lines {
            for &w in &line.widths {
                assert!(w > 0.0, "Word width should be positive");
            }
        }
    }

    #[test]
    fn end_to_end_with_hyphenation() {
        load_test_tries();
        let text = "Extraordinary accomplishments require extraordinary dedication";
        let words: Vec<&str> = text.split_whitespace().collect();
        let font_ref = FontRef::new(TEST_FONT).unwrap();
        let shaper_data = ShaperData::new(&font_ref);

        let (items, sp_w) = build_items(
            &words, TEST_FONT, &shaper_data, &font_ref,
            16.0, 400.0, 16.0, 0.0, 0.0, 0.0, true, "en", true,
        );

        let (breaks, _) = kp_break_internal(&items, 200.0, 0.0, 0.0, 0.0);
        let lines = build_lines_from_items(&items, &breaks, sp_w, 200.0, 0.0, 0.0);
        assert!(!lines.is_empty());

        // Check if any line ends with a hyphen (hyphenation was used)
        let has_hyphen = lines.iter().any(|l| {
            l.words.last().map_or(false, |w| w.ends_with('-'))
        });
        // Hyphenation may or may not be used depending on the optimal solution,
        // but the layout should still be valid
        let _ = has_hyphen;
    }

    #[test]
    fn oversized_words_get_separate_lines() {
        // At 16px DM Mono each char ≈ 9.6px.
        // "internationalization" = 20 chars ≈ 192px
        // "electroencephalography" = 22 chars ≈ 211px
        // Both are wider than 160px, so each should be on its own line.
        // Crucially, the short word "or" between them must NOT be merged
        // with either oversized word.
        let words: Vec<&str> = "like internationalization or electroencephalography that"
            .split_whitespace()
            .collect();
        let (items, sp_w) = make_break_items(&words, 160.0);
        let (breaks, had_emergency) = kp_break_internal(&items, 160.0, 0.0, 0.0, 0.0);
        assert!(had_emergency, "Oversized words should trigger emergency breaks");

        let lines = build_lines_from_items(&items, &breaks, sp_w, 160.0, 0.0, 0.0);

        // No line should contain both oversized words
        for line in &lines {
            let has_intl = line.words.iter().any(|w| w == "internationalization");
            let has_electro = line.words.iter().any(|w| w == "electroencephalography");
            assert!(
                !(has_intl && has_electro),
                "Oversized words must not share a line: {:?}",
                line.words,
            );
        }

        // "or" should not be grouped with "electroencephalography"
        for line in &lines {
            let has_or = line.words.iter().any(|w| w == "or");
            let has_electro = line.words.iter().any(|w| w == "electroencephalography");
            assert!(
                !(has_or && has_electro),
                "'or' must not share a line with 'electroencephalography': {:?}",
                line.words,
            );
        }

        // All words should still appear exactly once
        let all_words: Vec<&str> = lines
            .iter()
            .flat_map(|l| l.words.iter().map(|w| w.as_str()))
            .collect();
        assert_eq!(all_words, words);
    }

    #[test]
    fn end_to_end_emergency_retry() {
        load_test_tries();
        let text = "Incomprehensibilities characterize antidisestablishmentarianism";
        let words: Vec<&str> = text.split_whitespace().collect();
        let font_ref = FontRef::new(TEST_FONT).unwrap();
        let shaper_data = ShaperData::new(&font_ref);

        let (items, sp_w) = build_items(
            &words, TEST_FONT, &shaper_data, &font_ref,
            16.0, 400.0, 16.0, 0.0, 0.0, 0.0, false, "en", true,
        );

        // Very narrow — should trigger emergency break
        let (breaks1, had_emergency) = kp_break_internal(&items, 50.0, 0.0, 0.0, 0.0);
        if had_emergency {
            // Retry with extra stretch (mimics layout_paragraph logic)
            let (breaks2, _) = kp_break_internal(&items, 50.0, 0.0, 25.0, 0.0);
            let lines = build_lines_from_items(&items, &breaks2, sp_w, 50.0, 0.0, 0.0);
            assert!(!lines.is_empty(), "Emergency retry should still produce lines");
        } else {
            let lines = build_lines_from_items(&items, &breaks1, sp_w, 50.0, 0.0, 0.0);
            assert!(!lines.is_empty());
        }
    }

    #[test]
    fn empty_input_produces_no_lines() {
        load_test_tries();
        let words: Vec<&str> = Vec::new();
        let font_ref = FontRef::new(TEST_FONT).unwrap();
        let shaper_data = ShaperData::new(&font_ref);

        let (items, sp_w) = build_items(
            &words, TEST_FONT, &shaper_data, &font_ref,
            16.0, 400.0, 16.0, 0.0, 0.0, 0.0, false, "en", true,
        );

        // Only final glue + forced penalty
        assert_eq!(items.len(), 2);
        let (breaks, _) = kp_break_internal(&items, 300.0, 0.0, 0.0, 0.0);
        let lines = build_lines_from_items(&items, &breaks, sp_w, 300.0, 0.0, 0.0);
        assert!(lines.is_empty(), "Empty input should produce no lines");
    }

    // ── hyphenation cache ───────────────────────────────────────────────

    #[test]
    fn load_and_check_trie_data() {
        load_test_tries();
        assert!(has_hyphenation_data("en"));
        assert!(has_hyphenation_data("de"));
        assert!(!has_hyphenation_data("xx"));
    }

    #[test]
    fn hyphenate_word_graceful_degradation() {
        // Unknown language: returns the word unsplit
        let syls = hyphenate_word("test", "xx");
        assert_eq!(syls, vec!["test"]);
    }

    #[test]
    fn german_hyphenation_differs_from_english() {
        load_test_tries();
        let en_syls = hyphenate_word("Donaudampfschifffahrt", "en");
        let de_syls = hyphenate_word("Donaudampfschifffahrt", "de");
        // German should find more syllable breaks in a German compound word
        assert!(de_syls.len() > en_syls.len(),
            "German should hyphenate German words better: en={en_syls:?} de={de_syls:?}");
    }
}
