use std::collections::HashMap;
use once_cell::sync::Lazy;

// Exact transition probabilities for a single engagement based on dice counts.
// Enumerates all dice outcomes (up to 6^5 = 7776) and returns probability of each loss pair.

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
struct Key(u16, u16);

#[derive(Debug, Clone, Copy)]
struct Trans { a_loss: u8, d_loss: u8, p: f64 }

fn dice_combos(n: usize) -> Vec<Vec<u8>> {
    let mut res = Vec::new();
    let mut dice = vec![1u8; n];
    loop {
        res.push(dice.clone());
        let mut i = n as isize - 1;
        while i >= 0 && dice[i as usize] == 6 { i -= 1; }
        if i < 0 { break; }
        dice[i as usize] += 1;
        for j in (i as usize + 1)..n { dice[j] = 1; }
    }
    res
}

fn compare_highest(mut a: Vec<u8>, mut d: Vec<u8>) -> (u8, u8) {
    a.sort_unstable_by(|x, y| y.cmp(x));
    d.sort_unstable_by(|x, y| y.cmp(x));
    let pairs = a.len().min(d.len());
    let mut al = 0u8; let mut dl = 0u8;
    for i in 0..pairs { if a[i] <= d[i] { al += 1; } else { dl += 1; } }
    (al, dl)
}

static PRECOMP_TRANSITIONS: Lazy<[[Vec<Trans>; 3]; 2]> = Lazy::new(|| {
    // Indexing: [def_dice-1][att_dice-1]
    let mut arr: [[Vec<Trans>; 3]; 2] = [
        [Vec::new(), Vec::new(), Vec::new()],
        [Vec::new(), Vec::new(), Vec::new()],
    ];
    for att_dice in 1..=3u8 {
        for def_dice in 1..=2u8 {
            let a = dice_combos(att_dice as usize);
            let d = dice_combos(def_dice as usize);
            let total = (a.len() * d.len()) as f64;
            let mut map: HashMap<(u8, u8), u32> = HashMap::new();
            for av in &a {
                for dv in &d {
                    let (al, dl) = compare_highest(av.clone(), dv.clone());
                    *map.entry((al, dl)).or_insert(0) += 1;
                }
            }
            let mut out = Vec::new();
            for ((al, dl), count) in map.into_iter() {
                out.push(Trans { a_loss: al, d_loss: dl, p: (count as f64) / total });
            }
            // Filter zero-prob entries (unlikely) and sort for stable order
            out.retain(|t| t.p > 0.0);
            out.sort_by(|x, y| y.p.partial_cmp(&x.p).unwrap());
            arr[(def_dice - 1) as usize][(att_dice - 1) as usize] = out;
        }
    }
    arr
});

#[inline]
fn get_transitions(att_dice: u8, def_dice: u8) -> &'static [Trans] {
    &PRECOMP_TRANSITIONS[(def_dice - 1) as usize][(att_dice - 1) as usize]
}

pub fn exact_win_probability(att: u16, def: u16) -> f64 {
    let mut memo: HashMap<Key, f64> = HashMap::new();
    fn win_prob(a: u16, d: u16, memo: &mut HashMap<Key, f64>) -> f64 {
        if d == 0 { return 1.0; }
        if a < 2 { return 0.0; }
        let k = Key(a, d);
        if let Some(v) = memo.get(&k) { return *v; }
        let att_dice = (a - 1).min(3) as u8;
        let def_dice = d.min(2) as u8;
        let mut p = 0.0;
        for t in get_transitions(att_dice, def_dice) {
            let na = a.saturating_sub(t.a_loss as u16);
            let nd = d.saturating_sub(t.d_loss as u16);
            p += t.p * win_prob(na, nd, memo);
        }
        memo.insert(k, p);
        p
    }
    // Round for stability
    let p = win_prob(att, def, &mut memo);
    (p * 1_000_000.0).round() / 1_000_000.0
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn base_cases() {
        assert!((exact_win_probability(1, 1) - 0.0).abs() < 1e-12);
        assert!((exact_win_probability(2, 0) - 1.0).abs() < 1e-12);
    }

    #[test]
    fn monotonicity() {
        let p1 = exact_win_probability(5, 5);
        let p2 = exact_win_probability(6, 5);
        assert!(p2 + 1e-9 >= p1);
    }
}
