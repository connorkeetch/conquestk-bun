// xoshiro128++ with SplitMix64 seeding
// Deterministic and fast. Integer-only core.

#[inline]
fn rotl32(x: u32, k: u32) -> u32 {
    (x << k) | (x >> (32 - k))
}

pub struct Xoshiro128pp {
    s: [u32; 4],
}

impl Xoshiro128pp {
    pub fn from_seed64(seed_hi: u32, seed_lo: u32) -> Self {
        // Expand 64-bit seed into 128-bit state via SplitMix64
        let mut sm = SplitMix64::new(((seed_hi as u64) << 32) | (seed_lo as u64));
        let s0 = sm.next_u64() as u32;
        let s1 = (sm.next_u64() as u32) ^ 0x9E37_79B9; // decorrelate
        let s2 = sm.next_u64() as u32;
        let s3 = (sm.next_u64() as u32) ^ 0x243F_6A88;
        let mut rng = Self { s: [s0, s1, s2, s3] };
        // Avoid all-zero state
        if rng.s == [0, 0, 0, 0] {
            rng.s = [0x1, 0x2, 0x3, 0x4];
        }
        rng
    }

    #[inline]
    pub fn next_u32(&mut self) -> u32 {
        let result = rotl32(self.s[0].wrapping_add(self.s[3]), 7).wrapping_add(self.s[0]);

        let t = self.s[1] << 9;

        self.s[2] ^= self.s[0];
        self.s[3] ^= self.s[1];
        self.s[1] ^= self.s[2];
        self.s[0] ^= self.s[3];

        self.s[2] ^= t;
        self.s[3] = rotl32(self.s[3], 11);

        result
    }

    #[inline]
    pub fn next_range_inclusive(&mut self, min: u32, max: u32) -> u32 {
        // Simple modulus mapping; deterministic. Accepts minor bias for simplicity.
        let span = max - min + 1;
        (self.next_u32() % span) + min
    }
}

struct SplitMix64 {
    state: u64,
}

impl SplitMix64 {
    pub fn new(seed: u64) -> Self {
        Self { state: seed }
    }
    pub fn next_u64(&mut self) -> u64 {
        self.state = self.state.wrapping_add(0x9E37_79B9_7F4A_7C15);
        let mut z = self.state;
        z = (z ^ (z >> 30)).wrapping_mul(0xBF58_476D_1CE4_E5B9);
        z = (z ^ (z >> 27)).wrapping_mul(0x94D0_49BB_1331_11EB);
        z ^ (z >> 31)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rng_is_deterministic() {
        let mut a = Xoshiro128pp::from_seed64(0xABCD_0001, 0x1234_5678);
        let mut b = Xoshiro128pp::from_seed64(0xABCD_0001, 0x1234_5678);
        for _ in 0..1000 {
            assert_eq!(a.next_u32(), b.next_u32());
        }
    }
}

