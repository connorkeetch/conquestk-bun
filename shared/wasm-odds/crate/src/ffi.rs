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
