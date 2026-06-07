export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function decimalString(rng: () => number, integerDigits: number, fractionDigits: number): string {
  const negative = rng() < 0.5 ? "-" : "";
  const intLength = 1 + Math.floor(rng() * Math.max(1, integerDigits));
  let integer = "";
  for (let i = 0; i < intLength; i += 1) {
    const digit = Math.floor(rng() * 10);
    integer += i === 0 && intLength > 1 && digit === 0 ? "1" : String(digit);
  }

  if (fractionDigits <= 0) {
    return `${negative}${integer}`;
  }

  const fracLength = Math.floor(rng() * (fractionDigits + 1));
  let fraction = "";
  for (let i = 0; i < fracLength; i += 1) {
    fraction += String(Math.floor(rng() * 10));
  }

  return fraction.length ? `${negative}${integer}.${fraction}` : `${negative}${integer}`;
}


