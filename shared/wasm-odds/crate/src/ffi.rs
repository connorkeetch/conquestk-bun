use serde::Serialize;
use wasm_bindgen::prelude::*;

use crate::ai_eval::{evaluate_candidates, JsCandidate as EvalCand, JsState as EvalState};
use crate::battle::{
    monte_carlo as rb_monte_carlo, simulate_battle as rb_simulate_battle, AttackerPolicy,
    DefenderPolicy,
};
use crate::dice::simulate_step as rb_simulate_step;
use crate::dp::exact_win_probability;
use crate::rng::Xoshiro128pp;
use js_sys::Uint32Array;
use js_sys::Uint8Array;
use js_sys::{Float64Array, Uint16Array};
use once_cell::sync::Lazy;
use std::sync::Mutex;

#[derive(Serialize)]
pub struct StepResult {
    pub attacker_losses: u8,
    pub defender_losses: u8,
}

#[derive(Serialize)]
pub struct BattleResult {
    pub attacker_won: bool,
    pub attacker_remaining: u16,
    pub defender_remaining: u16,
    pub steps: u32,
}

#[derive(Serialize)]
pub struct MonteCarloResult {
    pub trials: u32,
    pub wins: u32,
    pub losses: u32,
    pub p_win: f64,
    pub p_loss: f64,
    pub att_remaining_hist: Vec<u32>,
    pub def_remaining_hist: Vec<u32>,
}

#[wasm_bindgen]
pub fn version() -> String {
    format!("wasm-odds {}", env!("CARGO_PKG_VERSION"))
}

#[wasm_bindgen]
pub fn simulate_step(seed_hi: u32, seed_lo: u32, att_dice: u8, def_dice: u8) -> JsValue {
    let mut rng = Xoshiro128pp::from_seed64(seed_hi, seed_lo);
    let r = rb_simulate_step(att_dice, def_dice, &mut rng);
    serde_wasm_bindgen::to_value(&StepResult {
        attacker_losses: r.attacker_losses,
        defender_losses: r.defender_losses,
    })
    .unwrap()
}

#[wasm_bindgen]
pub fn simulate_battle(
    seed_hi: u32,
    seed_lo: u32,
    att_armies: u16,
    def_armies: u16,
    policy: JsValue,
) -> JsValue {
    // Accept policy like { attacker: 'greedy' | 'conservative', defender: 'max' | 'conservative' }
    #[derive(serde::Deserialize)]
    struct Policy {
        attacker: Option<String>,
        defender: Option<String>,
    }
    let p: Policy = serde_wasm_bindgen::from_value(policy).unwrap_or(Policy {
        attacker: None,
        defender: None,
    });
    let a = match p.attacker.as_deref() {
        Some("conservative") => AttackerPolicy::Conservative,
        _ => AttackerPolicy::Greedy,
    };
    let d = match p.defender.as_deref() {
        Some("conservative") => DefenderPolicy::Conservative,
        _ => DefenderPolicy::Max,
    };
    let rng = Xoshiro128pp::from_seed64(seed_hi, seed_lo);
    let r = rb_simulate_battle(att_armies, def_armies, rng, a, d);
    serde_wasm_bindgen::to_value(&BattleResult {
        attacker_won: r.attacker_won,
        attacker_remaining: r.attacker_remaining,
        defender_remaining: r.defender_remaining,
        steps: r.steps,
    })
    .unwrap()
}

#[wasm_bindgen]
pub fn monte_carlo(
    att_armies: u16,
    def_armies: u16,
    trials: u32,
    seed_hi: u32,
    seed_lo: u32,
) -> JsValue {
    let rng = Xoshiro128pp::from_seed64(seed_hi, seed_lo);
    let (wins, losses, att_hist, def_hist) = rb_monte_carlo(att_armies, def_armies, trials, rng);
    let p_win = (wins as f64) / (trials as f64);
    let p_loss = (losses as f64) / (trials as f64);
    serde_wasm_bindgen::to_value(&MonteCarloResult {
        trials,
        wins,
        losses,
        p_win,
        p_loss,
        att_remaining_hist: att_hist,
        def_remaining_hist: def_hist,
    })
    .unwrap()
}

#[wasm_bindgen]
pub fn odds_matrix(max_att: u16, max_def: u16, trials: u32, seed_hi: u32, seed_lo: u32) -> JsValue {
    let mut matrix: Vec<Vec<f64>> = vec![vec![0.0; max_def as usize + 1]; max_att as usize + 1];
    let mut rng = Xoshiro128pp::from_seed64(seed_hi, seed_lo);
    for a in 0..=max_att {
        for d in 0..=max_def {
            if d == 0 {
                matrix[a as usize][d as usize] = 1.0;
                continue;
            }
            if a < 2 {
                matrix[a as usize][d as usize] = 0.0;
                continue;
            }
            let seed_hi2 = rng.next_u32();
            let seed_lo2 = rng.next_u32();
            let (wins, losses, _ah, _dh) = crate::battle::monte_carlo(
                a,
                d,
                trials,
                Xoshiro128pp::from_seed64(seed_hi2, seed_lo2),
            );
            let p = (wins as f64) / ((wins + losses) as f64);
            matrix[a as usize][d as usize] = (p * 10000.0).round() / 10000.0; // stable rounding
        }
    }
    serde_wasm_bindgen::to_value(&matrix).unwrap()
}

#[wasm_bindgen]
pub fn exact_odds(att_armies: u16, def_armies: u16) -> f64 {
    exact_win_probability(att_armies, def_armies)
}

/// Compute exact odds for many attacker/defender pairs in one call using typed arrays.
/// This drastically reduces JS<->WASM bridging overhead compared to per-candidate calls.
#[wasm_bindgen]
pub fn bulk_exact_odds(att: Uint16Array, def: Uint16Array) -> Float64Array {
    let n = core::cmp::min(att.length(), def.length()) as usize;
    if n == 0 {
        return Float64Array::new_with_length(0);
    }
    let mut a = vec![0u16; n];
    let mut d = vec![0u16; n];
    att.subarray(0, n as u32).copy_to(&mut a[..]);
    def.subarray(0, n as u32).copy_to(&mut d[..]);
    let mut out = vec![0f64; n];
    for i in 0..n {
        out[i] = exact_win_probability(a[i], d[i]);
    }
    Float64Array::from(out.as_slice())
}

// === Persistent eval state (handle-based) ===

struct EvalStateMeta {
    len: usize,
    // Keep ids to allow future extensions (string->index resolution)
    #[allow(dead_code)]
    ids: Vec<String>,
}

static EVAL_STATES: Lazy<Mutex<Vec<Option<EvalStateMeta>>>> = Lazy::new(|| Mutex::new(Vec::new()));

#[wasm_bindgen]
pub fn init_eval_state(ids: JsValue) -> u32 {
    let ids_vec: Vec<String> = serde_wasm_bindgen::from_value(ids).unwrap_or_default();
    let mut store = EVAL_STATES.lock().unwrap();
    // Try to reuse an empty slot
    for (i, slot) in store.iter_mut().enumerate() {
        if slot.is_none() {
            *slot = Some(EvalStateMeta {
                len: ids_vec.len(),
                ids: ids_vec,
            });
            return i as u32;
        }
    }
    store.push(Some(EvalStateMeta {
        len: ids_vec.len(),
        ids: ids_vec,
    }));
    (store.len() - 1) as u32
}

#[wasm_bindgen]
pub fn free_eval_state(handle: u32) {
    let mut store = EVAL_STATES.lock().unwrap();
    let idx = handle as usize;
    if idx < store.len() {
        store[idx] = None;
    }
}

#[wasm_bindgen]
pub fn ai_eval_attacks_with_handle(
    handle: u32,
    owned_by_current: Uint8Array,
    armies: Uint16Array,
    pairs: Uint32Array,
) -> Float64Array {
    let store = EVAL_STATES.lock().unwrap();
    let idx = handle as usize;
    if idx >= store.len() || store[idx].is_none() {
        return Float64Array::new_with_length(0);
    }
    let meta = store[idx].as_ref().unwrap();
    let len = meta.len as u32;

    let owned_len = owned_by_current.length();
    let armies_len = armies.length();
    if owned_len < len || armies_len < len {
        return Float64Array::new_with_length(0);
    }

    let pairs_len = pairs.length();
    if !pairs_len.is_multiple_of(2) {
        return Float64Array::new_with_length(0);
    }
    let n = (pairs_len / 2) as usize;

    let armies_vec = {
        let mut v = vec![0u16; len as usize];
        armies.subarray(0, len).copy_to(&mut v[..]);
        v
    };
    let owned_vec = {
        let mut v = vec![0u8; len as usize];
        owned_by_current.subarray(0, len).copy_to(&mut v[..]);
        v
    };

    let mut out = vec![0f64; n];
    #[allow(clippy::needless_range_loop)]
    for i in 0..n {
        let from = pairs.get_index((i * 2) as u32);
        let to = pairs.get_index((i * 2 + 1) as u32);
        if from >= len || to >= len {
            out[i] = 0.0;
            continue;
        }
        let f = from as usize;
        let t = to as usize;
        // Valid only if from is owned by current player and to is not owned by them
        let owned_ok = owned_vec[f] != 0 && owned_vec[t] == 0;
        if !owned_ok {
            out[i] = 0.0;
            continue;
        }
        let att = if armies_vec[f] > 0 {
            armies_vec[f].saturating_sub(1)
        } else {
            0
        };
        let def = armies_vec[t];
        if att < 1 {
            out[i] = 0.0;
            continue;
        }
        out[i] = exact_win_probability(att, def);
    }
    Float64Array::from(out.as_slice())
}

#[wasm_bindgen]
pub fn exact_odds_matrix(max_att: u16, max_def: u16) -> JsValue {
    let mut matrix: Vec<Vec<f64>> = vec![vec![0.0; max_def as usize + 1]; max_att as usize + 1];
    for a in 0..=max_att {
        for d in 0..=max_def {
            matrix[a as usize][d as usize] = exact_win_probability(a, d);
        }
    }
    serde_wasm_bindgen::to_value(&matrix).unwrap()
}

#[wasm_bindgen]
pub fn ai_evaluate(state: JsValue, candidates: JsValue, opts: JsValue) -> JsValue {
    let s: EvalState = serde_wasm_bindgen::from_value(state).unwrap_or(EvalState {
        territories: vec![],
        currentPlayerId: String::new(),
    });
    let c: Vec<EvalCand> = serde_wasm_bindgen::from_value(candidates).unwrap_or_default();
    #[derive(serde::Deserialize, Default)]
    struct Opts {
        difficulty: Option<String>,
    }
    let o: Opts = serde_wasm_bindgen::from_value(opts).unwrap_or_default();
    let scores = evaluate_candidates(
        s,
        c,
        crate::ai_eval::EvalOpts {
            difficulty: o.difficulty,
        },
    );
    serde_wasm_bindgen::to_value(&scores).unwrap()
}
