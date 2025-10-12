use crate::dice::{simulate_step, StepOutcome};
use crate::rng::Xoshiro128pp;

#[derive(Debug, Clone, Copy)]
pub enum AttackerPolicy {
    Greedy,
    Conservative,
}

#[derive(Debug, Clone, Copy)]
pub enum DefenderPolicy {
    Max,
    Conservative,
}

#[derive(Debug, Clone, Copy)]
pub struct BattleResult {
    pub attacker_won: bool,
    pub attacker_remaining: u16,
    pub defender_remaining: u16,
    pub steps: u32,
}

#[inline]
fn choose_attacker_dice(att: u16, policy: AttackerPolicy) -> u8 {
    if att < 2 {
        return 0;
    }
    match policy {
        AttackerPolicy::Greedy => (att - 1).min(3) as u8,
        AttackerPolicy::Conservative => ((att - 1).min(2)) as u8,
    }
}

#[inline]
fn choose_defender_dice(def: u16, policy: DefenderPolicy) -> u8 {
    if def == 0 {
        return 0;
    }
    match policy {
        DefenderPolicy::Max => def.min(2) as u8,
        DefenderPolicy::Conservative => 1u8.min(def as u8),
    }
}

pub fn simulate_battle(
    mut att: u16,
    mut def: u16,
    mut rng: Xoshiro128pp,
    a_policy: AttackerPolicy,
    d_policy: DefenderPolicy,
) -> BattleResult {
    let mut steps: u32 = 0;
    while att >= 2 && def > 0 {
        let att_d = choose_attacker_dice(att, a_policy);
        let def_d = choose_defender_dice(def, d_policy);
        if att_d == 0 || def_d == 0 {
            break;
        }
        let StepOutcome {
            attacker_losses,
            defender_losses,
        } = simulate_step(att_d, def_d, &mut rng);
        att = att.saturating_sub(attacker_losses as u16);
        def = def.saturating_sub(defender_losses as u16);
        steps += 1;
    }
    BattleResult {
        attacker_won: def == 0,
        attacker_remaining: att,
        defender_remaining: def,
        steps,
    }
}

pub fn monte_carlo(
    att: u16,
    def: u16,
    trials: u32,
    mut rng: Xoshiro128pp,
) -> (u32, u32, Vec<u32>, Vec<u32>) {
    let mut wins = 0u32;
    let mut losses = 0u32;
    let mut att_hist = vec![0u32; att as usize + 1];
    let mut def_hist = vec![0u32; def as usize + 1];

    for _ in 0..trials {
        let seed_hi = rng.next_u32();
        let seed_lo = rng.next_u32();
        let r = simulate_battle(
            att,
            def,
            Xoshiro128pp::from_seed64(seed_hi, seed_lo),
            AttackerPolicy::Greedy,
            DefenderPolicy::Max,
        );
        if r.attacker_won {
            wins += 1;
            att_hist[r.attacker_remaining as usize] += 1;
        } else {
            losses += 1;
            def_hist[r.defender_remaining as usize] += 1;
        }
    }
    (wins, losses, att_hist, def_hist)
}
