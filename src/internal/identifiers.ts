const NUMERIC_ONLY = /^[0-9]+$/;

/**
 * Precedence per SemVer §11: numeric identifiers compare numerically, everything
 * else compares as ASCII, and a numeric identifier always sorts below a
 * non-numeric one.
 */
export function compareIdentifiers(
  a: string | number,
  b: string | number,
): -1 | 0 | 1 {
  const aNum = NUMERIC_ONLY.test(String(a));
  const bNum = NUMERIC_ONLY.test(String(b));

  let x: string | number = a;
  let y: string | number = b;
  if (aNum && bNum) {
    x = +a;
    y = +b;
  }

  if (x === y) return 0;
  if (aNum && !bNum) return -1;
  if (bNum && !aNum) return 1;
  return x < y ? -1 : 1;
}

export function rcompareIdentifiers(
  a: string | number,
  b: string | number,
): -1 | 0 | 1 {
  return compareIdentifiers(b, a);
}
