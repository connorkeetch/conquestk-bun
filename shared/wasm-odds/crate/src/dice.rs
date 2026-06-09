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

    // Counting sort approach: tally dice faces for each side (1..6)
    let mut ac = [0u8; 7];
    let mut dc = [0u8; 7];
    for _ in 0..att_dice {
        ac[roll_die(rng) as usize] += 1;
    }
    for _ in 0..def_dice {
        dc[roll_die(rng) as usize] += 1;
    }

    // Extract top two dice (descending) for each side by walking counts
    let mut atop = [0u8; 2];
    let mut dtop = [0u8; 2];
    let mut ai = 0usize;
    let mut di = 0usize;
    for face in (1..=6).rev() {
        let mut cnt = ac[face as usize];
        while cnt > 0 && ai < 2 {
            atop[ai] = face as u8;
            ai += 1;
            cnt -= 1;
        }
        let mut cntd = dc[face as usize];
        while cntd > 0 && di < 2 {
            dtop[di] = face as u8;
            di += 1;
            cntd -= 1;
        }
        if ai >= 2 && di >= 2 {
            break;
        }
    }

    let pairs = usize::min(att_dice as usize, def_dice as usize);
    let mut attacker_losses = 0u8;
    let mut defender_losses = 0u8;
    if pairs >= 1 {
        if atop[0] <= dtop[0] {
            attacker_losses += 1;
        } else {
            defender_losses += 1;
        }
    }
    if pairs >= 2 {
        if atop[1] <= dtop[1] {
            attacker_losses += 1;
        } else {
            defender_losses += 1;
        }
    }
    StepOutcome {
        attacker_losses,
        defender_losses,
    }
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
