use crate::dp::exact_win_probability;
use serde::Deserialize;

#[derive(Deserialize)
]#[allow(non_snake_case)]
pub struct JsTerritory {
    pub id: String,
    pub ownerId: Option<String>,
    pub armies: u16,
}

#[derive(Deserialize)]
#[serde(tag = "kind")]
pub enum JsCandidate {
    #[serde(rename = "attack")]
    Attack { from: String, to: String },
    #[serde(rename = "deploy")]
    Deploy {
        territory: String,
        armies: Option<u16>,
    },
    #[serde(rename = "fortify")]
    Fortify {
        from: String,
        to: String,
        armies: Option<u16>,
    },
}

#[derive(Deserialize)]
#[allow(non_snake_case)]
pub struct JsState {
    pub territories: Vec<JsTerritory>,
    pub currentPlayerId: String,
}

#[derive(Deserialize, Default)]
pub struct EvalOpts {
    pub difficulty: Option<String>,
}

pub fn evaluate_candidates(
    state: JsState,
    candidates: Vec<JsCandidate>,
    opts: EvalOpts,
) -> Vec<f64> {
    use std::collections::HashMap;
    let mut map: HashMap<&str, &JsTerritory> = HashMap::new();
    for t in &state.territories {
        map.insert(t.id.as_str(), t);
    }
    let difficulty = opts.difficulty.unwrap_or_else(|| "commander".to_string());
    let mut scores = Vec::with_capacity(candidates.len());
    for cand in candidates {
        let score = match cand {
            JsCandidate::Attack { from, to } => {
                let tf = map.get(from.as_str());
                let tt = map.get(to.as_str());
                if let (Some(f), Some(t)) = (tf, tt) {
                    // Only consider if from owned by current player and to not owned by them
                    let owned_ok = f.ownerId.as_deref() == Some(state.currentPlayerId.as_str());
                    let not_own_to = t.ownerId.as_deref() != Some(state.currentPlayerId.as_str());
                    if owned_ok && not_own_to {
                        let att = if f.armies > 0 {
                            f.armies.saturating_sub(1)
                        } else {
                            0
                        };
                        let def = t.armies;
                        if att >= 1 && def >= 0 {
                            exact_win_probability(att as u16, def as u16)
                        } else {
                            0.0
                        }
                    } else {
                        0.0
                    }
                } else {
                    0.0
                }
            }
            JsCandidate::Deploy { territory, .. } => {
                if difficulty == "recruit" {
                    0.0
                } else {
                    if let Some(t) = map.get(territory.as_str()) {
                        let owned_ok = t.ownerId.as_deref() == Some(state.currentPlayerId.as_str());
                        if !owned_ok {
                            0.0
                        } else {
                            let armies = t.armies as f64;
                            (1.0 / (1.0 + armies)).min(1.0)
                        }
                    } else {
                        0.0
                    }
                }
            }
            JsCandidate::Fortify { from, to, .. } => {
                if difficulty == "recruit" {
                    0.0
                } else {
                    let tf = map.get(from.as_str());
                    let tt = map.get(to.as_str());
                    if let (Some(f), Some(t)) = (tf, tt) {
                        let both_owned = f.ownerId.as_deref()
                            == Some(state.currentPlayerId.as_str())
                            && t.ownerId.as_deref() == Some(state.currentPlayerId.as_str());
                        if !both_owned {
                            0.0
                        } else {
                            let weak =
                                |armies: u16| -> f64 { (1.0 / (1.0 + armies as f64)).min(1.0) };
                            let benefit = weak(t.armies) - weak(f.armies);
                            if difficulty == "grandmaster" {
                                (benefit * 1.25).max(0.0)
                            } else {
                                benefit.max(0.0)
                            }
                        }
                    } else {
                        0.0
                    }
                }
            }
        };
        scores.push(score);
    }
    scores
}
