/**
 * Differential fuzzing.
 *
 * The hand-written corpus in `corpus.ts` covers every production in the range
 * grammar, but it only covers the combinations somebody thought of. This
 * generates inputs instead — valid versions and ranges from the grammar, then
 * mutations of them, then outright garbage — and requires slimsemver and
 * node-semver to agree on every one.
 *
 * The PRNG is seeded and the seed is printed, so a failure is reproducible:
 *
 *   SLIMSEMVER_FUZZ_SEED=12345 SLIMSEMVER_FUZZ_ITERATIONS=200000 npm test
 */
import assert from "node:assert/strict";
import test from "node:test";

import semverTyped from "semver";
import * as tiny from "../src/index.ts";

const semver = semverTyped as typeof semverTyped & {
  truncate(v: string, t: string, o?: unknown): string | null;
};

const SEED = Number(process.env.SLIMSEMVER_FUZZ_SEED ?? 0x5eed1e);
const ITERATIONS = Number(process.env.SLIMSEMVER_FUZZ_ITERATIONS ?? 25_000);

/** xorshift32 — small, fast, and reproducible across platforms. */
function makeRng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 0x1_0000_0000;
  };
}

const rng = makeRng(SEED);
const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rng() * xs.length)] as T;
const int = (n: number): number => Math.floor(rng() * n);

const NUMS = ["0", "1", "2", "3", "9", "10", "99", "x", "X", "*"];
const PRE_IDS = ["alpha", "beta", "rc", "0", "1", "2", "10", "a", "-", "0a", "x"];
const BUILD_IDS = ["build", "sha", "0", "abc123", "a-b"];
const OPS = ["", "=", ">", ">=", "<", "<=", "~", "^", "~>"];
const JOINERS = [" ", " || ", " - ", "||", "  "];
const NOISE = ["v", "=", " ", "vv", "v=", "  ", "\t"];

function version(): string {
  let v = `${pick(NUMS)}.${pick(NUMS)}.${pick(NUMS)}`;
  if (rng() < 0.35) {
    const n = 1 + int(3);
    v += "-" + Array.from({ length: n }, () => pick(PRE_IDS)).join(".");
  }
  if (rng() < 0.2) {
    const n = 1 + int(2);
    v += "+" + Array.from({ length: n }, () => pick(BUILD_IDS)).join(".");
  }
  return v;
}

function term(): string {
  const prefix = rng() < 0.15 ? pick(NOISE) : "";
  return `${pick(OPS)}${prefix}${version()}`;
}

function range(): string {
  const n = 1 + int(3);
  let r = term();
  for (let i = 1; i < n; i++) {
    r += pick(JOINERS) + term();
  }
  return r;
}

/** Small edits, which is where parsers usually disagree. */
function mutate(s: string): string {
  if (!s.length) return s;
  const i = int(s.length);
  switch (int(6)) {
    case 0:
      return s.slice(0, i) + s.slice(i + 1);
    case 1:
      return s.slice(0, i) + pick([".", "-", "+", " ", "|", "^", "~", "=", ">", "<", "*", "x", "0"]) + s.slice(i);
    case 2:
      return s.slice(0, i) + s.slice(i).toUpperCase();
    case 3:
      return s.repeat(1 + int(2));
    case 4:
      return s.slice(i);
    default:
      return s.slice(0, i);
  }
}

function garbage(): string {
  const n = int(24);
  const alphabet = "0123456789.-+ vx*|^~<>=X abc\t";
  let s = "";
  for (let i = 0; i < n; i++) s += alphabet[int(alphabet.length)];
  return s;
}

function nextInput(): string {
  const r = rng();
  if (r < 0.35) return range();
  if (r < 0.6) return version();
  if (r < 0.85) return mutate(rng() < 0.5 ? range() : version());
  return garbage();
}

type Outcome = { ok: true; value: unknown } | { ok: false; error: string; message: string };

function run(fn: () => unknown): Outcome {
  try {
    const v = fn();
    return {
      ok: true,
      value: v !== null && typeof v === "object" ? String(v) : v,
    };
  } catch (e) {
    const err = e as Error;
    return { ok: false, error: err.constructor.name, message: err.message };
  }
}

const OPTION_SETS = [
  undefined,
  { loose: true },
  { includePrerelease: true },
  { loose: true, includePrerelease: true },
] as const;

test(`differential fuzz: ${ITERATIONS.toLocaleString("en-US")} generated inputs (seed ${SEED})`, () => {
  const failures: string[] = [];

  for (let i = 0; i < ITERATIONS && failures.length < 10; i++) {
    const a = nextInput();
    const b = nextInput();
    const opts = pick(OPTION_SETS);

    const cases: Array<[string, () => unknown, () => unknown]> = [
      [`valid(${JSON.stringify(a)})`, () => semver.valid(a, opts as never), () => tiny.valid(a, opts)],
      [`validRange(${JSON.stringify(a)})`, () => semver.validRange(a, opts as never), () => tiny.validRange(a, opts)],
      [`satisfies(${JSON.stringify(a)}, ${JSON.stringify(b)})`, () => semver.satisfies(a, b, opts as never), () => tiny.satisfies(a, b, opts)],
      [`coerce(${JSON.stringify(a)})`, () => semver.coerce(a, opts as never), () => tiny.coerce(a, opts)],
      [`compare(${JSON.stringify(a)}, ${JSON.stringify(b)})`, () => semver.compare(a, b, opts as never), () => tiny.compare(a, b, opts)],
      [`minVersion(${JSON.stringify(a)})`, () => semver.minVersion(a, opts as never), () => tiny.minVersion(a, opts)],
      [`intersects(${JSON.stringify(a)}, ${JSON.stringify(b)})`, () => semver.intersects(a, b, opts as never), () => tiny.intersects(a, b, opts)],
      [`subset(${JSON.stringify(a)}, ${JSON.stringify(b)})`, () => semver.subset(a, b, (opts ?? {}) as never), () => tiny.subset(a, b, opts ?? {})],
      [`Range(${JSON.stringify(a)})`, () => String(new semver.Range(a, opts as never)), () => String(new tiny.Range(a, opts))],
    ];

    for (const [label, expectedFn, actualFn] of cases) {
      const expected = run(expectedFn);
      const actual = run(actualFn);
      try {
        assert.deepStrictEqual(actual, expected);
      } catch {
        failures.push(
          `${label} opts=${JSON.stringify(opts)}\n    semver:     ${JSON.stringify(expected)}\n    slimsemver: ${JSON.stringify(actual)}`,
        );
      }
    }
  }

  assert.deepStrictEqual(
    failures,
    [],
    `fuzz divergence (reproduce with SLIMSEMVER_FUZZ_SEED=${SEED}):\n  ${failures.join("\n  ")}`,
  );
});
