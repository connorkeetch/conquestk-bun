use crate::rng::Xoshiro128pp;

#[derive(Debug, Clone, Copy)]
pub struct StepOutcome {
    pub attacker_losses: u8,
    pub defender_losses: u8,
}

#[inline]
fn roll_die(rng: &mut Xoshiro128pp) -> u8 {
    (rng.next_range_inclusive(1, 6) as u8)
}

#[inline]
fn sort_desc(slice: &mut [u8]) {
    slice.sort_unstable_by(|a, b| b.cmp(a));
}

pub fn simulate_step(att_dice: u8, def_dice: u8, rng: &mut Xoshiro128pp) -> StepOutcome {
    debug_assert!(att_dice >= 1 && att_dice <= 3);
    debug_assert!(def_dice >= 1 && def_dice <= 2);

    let mut a = [0u8; 3];
    let mut d = [0u8; 2];
    for i in 0..att_dice as usize {
        a[i] = roll_die(rng);
    }
    for i in 0..def_dice as usize {
        d[i] = roll_die(rng);
    }
    let a_slice = &mut a[..att_dice as usize];
    let d_slice = &mut d[..def_dice as usize];
    sort_desc(a_slice);
    sort_desc(d_slice);

    let pairs = att_dice.min(def_dice) as usize;
    let mut attacker_losses = 0u8;
    let mut defender_losses = 0u8;
    for i in 0..pairs {
        if a_slice[i] <= d_slice[i] { attacker_losses += 1; } else { defender_losses += 1; }
    }
    StepOutcome { attacker_losses, defender_losses }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::rng::Xoshiro128pp;

    #[test]
    fn step_outcome_bounds() {
        let mut rng = Xoshiro128pp::from_seed64(1, 2);
        for _ in 0..1000 {
            let s = simulate_step(3, 2, &mut rng);
            assert!(s.attacker_losses <= 2);
            assert!(s.defender_losses <= 2);
            assert!(s.attacker_losses + s.defender_losses >= 1);
        }
    }
}

