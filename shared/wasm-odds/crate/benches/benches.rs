use criterion::{criterion_group, criterion_main, Criterion, black_box};
use wasm_odds::{monte_carlo, simulate_battle};
use wasm_odds::rng::Xoshiro128pp; // re-exported via crate root
use wasm_odds::battle::{AttackerPolicy, DefenderPolicy};

fn bench_single_step(_c: &mut Criterion) {
    // Kept simple; main cost is in battle/MC
}

fn bench_full_battle(c: &mut Criterion) {
    c.bench_function("full_battle_20v15", |b| {
        b.iter(|| {
            let rng = Xoshiro128pp::from_seed64(0xABCD_0001, 0x1234_5678);
            let _ = simulate_battle(black_box(20), black_box(15), rng, AttackerPolicy::Greedy, DefenderPolicy::Max);
        })
    });
}

fn bench_mc(c: &mut Criterion) {
    c.bench_function("mc_50k_20v15", |b| {
        b.iter(|| {
            let rng = Xoshiro128pp::from_seed64(0xABCD_0001, 0x1234_5678);
            let _ = monte_carlo(black_box(20), black_box(15), black_box(50_000), rng);
        })
    });
}

criterion_group!(benches, bench_full_battle, bench_mc);
criterion_main!(benches);

