//! Randomized sequences of every instruction against the built program, with the
//! shadow model as oracle (see src/fuzz.rs for the checks).
//!
//!   cargo test --release --test fuzz                 # 20 seeds × 300 steps (FUZZ_SEEDS, FUZZ_STEPS)
//!   FUZZ_SEED=42 cargo test --release --test fuzz    # one seed, reproduce a failure
//!   FUZZ_MINUTES=30 cargo test --release --test fuzz fuzz_long -- --ignored --nocapture
//!
//! Every panic message starts with "seed N step M".

use floored_tests::fuzz::Fuzz;
use std::time::{Duration, Instant};

fn env_u64(name: &str, default: u64) -> u64 {
    std::env::var(name).ok().and_then(|v| v.parse().ok()).unwrap_or(default)
}

#[test]
fn fuzz_random_sequences() {
    let steps = env_u64("FUZZ_STEPS", 300);
    let seeds: Vec<u64> = match std::env::var("FUZZ_SEED") {
        Ok(s) => vec![s.parse().expect("FUZZ_SEED")],
        Err(_) => (1..=env_u64("FUZZ_SEEDS", 20)).collect(),
    };
    let mut graduated = 0;
    let mut braked = 0;
    for seed in seeds.iter().copied() {
        let mut f = Fuzz::new(seed);
        f.run(steps);
        if f.chain.model.phase == 1 {
            graduated += 1;
        }
        if f.chain.coin().brake.engagements > 0 {
            braked += 1;
        }
        eprintln!("{}", f.summary());
    }
    // The random walk must actually reach the interesting states.
    assert!(graduated * 2 >= seeds.len(), "only {graduated}/{} seeds graduated: the generator is too timid", seeds.len());
    assert!(braked * 2 >= seeds.len(), "only {braked}/{} seeds engaged the brake", seeds.len());
}

/// Long mode: new seeds until FUZZ_MINUTES elapse (default 30). Prints each seed's summary.
#[test]
#[ignore]
fn fuzz_long() {
    let minutes = env_u64("FUZZ_MINUTES", 30);
    let steps = env_u64("FUZZ_STEPS", 600);
    let start = Instant::now();
    let mut seed = env_u64("FUZZ_SEED", 1_000);
    let mut runs = 0u64;
    let mut total_sent = 0u64;
    while start.elapsed() < Duration::from_secs(minutes * 60) {
        let mut f = Fuzz::new(seed);
        f.run(steps);
        runs += 1;
        total_sent += f.stats.sent;
        if runs % 10 == 0 {
            eprintln!("[{:>5}s] {} runs, {} transactions, last: {}", start.elapsed().as_secs(), runs, total_sent, f.summary().lines().next().unwrap_or(""));
        }
        seed += 1;
    }
    eprintln!("fuzz_long: {runs} runs, {total_sent} transactions in {} s, clean", start.elapsed().as_secs());
}
