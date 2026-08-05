/**
 * Complexity sweep across the public API.
 *
 * Several grammar patterns are quadratic *in isolation* — `XRANGE_PLAIN` and
 * `LOOSE_PLAIN` both begin with `[v=\s]*`, which overlaps any preceding
 * whitespace quantifier. They are inherited from node-semver's grammar and
 * cannot be simplified without changing what they match.
 *
 * What makes that safe is an invariant, not the patterns: every entry point
 * normalises whitespace before the grammar runs (`Range`, `Range.parseRange`,
 * `Comparator`) or caps length outright (`SemVer`), so a pattern never sees the
 * long run it would need to blow up on.
 *
 * An invariant enforced at the edges is only as good as the test that notices
 * when someone removes it. So this measures the property that actually matters
 * — cost through the public API as input grows — rather than asserting anything
 * about the patterns themselves. Testing the patterns in isolation would fail
 * on inputs they can never receive, which only trains people to ignore it.
 */
import assert from "node:assert/strict";
import test from "node:test";

import {
  Comparator,
  Range,
  coerce,
  intersects,
  minVersion,
  parse,
  satisfies,
  subset,
  validRange,
} from "../src/index.ts";

/** Fillers chosen to feed each unbounded quantifier in the grammar. */
const FILLERS: Array<[string, (n: number) => string]> = [
  ["spaces", (n) => " ".repeat(n)],
  ["digits", (n) => "1".repeat(n)],
  ["dotted", (n) => "1.".repeat(Math.floor(n / 2))],
  ["v-eq-space", (n) => "v= ".repeat(Math.floor(n / 3))],
  ["alnum", (n) => "a1-".repeat(Math.floor(n / 3))],
  ["carets", (n) => "^ ".repeat(Math.floor(n / 2))],
  ["pipes", (n) => "|| ".repeat(Math.floor(n / 3))],
];

/** Shapes that make a pattern start matching and then fail late. */
const SHAPES: Array<[string, (f: string) => string]> = [
  ["bare", (f) => f],
  ["tilde", (f) => `~${f}1.2.3`],
  ["caret", (f) => `^${f}1.2.3`],
  ["gte", (f) => `>=${f}1.2.3`],
  ["star", (f) => `${f}*`],
  ["gte0", (f) => `>=${f}0.0.0`],
  ["hyphen", (f) => `1.2.3 ${f}- ${f}2.0.0`],
  ["prerelease", (f) => `1.2.3-${f}`],
  ["build", (f) => `1.2.3+${f}`],
];

const ENTRY_POINTS: Array<[string, (s: string) => unknown]> = [
  ["validRange", (s) => validRange(s)],
  ["satisfies(version)", (s) => satisfies(s, "^1.0.0")],
  ["satisfies(range)", (s) => satisfies("1.2.3", s)],
  ["new Range", (s) => attempt(() => new Range(s))],
  ["Range.parseRange", (s) => attempt(() => new Range("*").parseRange(s))],
  ["new Comparator", (s) => attempt(() => new Comparator(s))],
  ["parse", (s) => parse(s)],
  ["coerce", (s) => coerce(s)],
  ["coerce rtl", (s) => coerce(s, { rtl: true })],
  ["subset", (s) => attempt(() => subset(s, "*"))],
  ["intersects", (s) => attempt(() => intersects(s, "^1.0.0"))],
  ["minVersion", (s) => attempt(() => minVersion(s))],
];

/** Validity is not what is under test here; only cost is. */
function attempt(fn: () => unknown): unknown {
  try {
    return fn();
  } catch {
    return null;
  }
}

const SMALL = 2_000;
const LARGE = 16_000; // 8x the input: linear costs ~8x, quadratic ~64x.
const RATIO_CEILING = 25;
const NOISE_FLOOR_MS = 20;

function timeOf(fn: (s: string) => unknown, input: string): number {
  const started = process.hrtime.bigint();
  fn(input);
  return Number(process.hrtime.bigint() - started) / 1e6;
}

test("no public entry point is superlinear in its input length", () => {
  const slow: string[] = [];

  for (const [entryName, entry] of ENTRY_POINTS) {
    for (const [fillerName, filler] of FILLERS) {
      for (const [shapeName, shape] of SHAPES) {
        const small = shape(filler(SMALL));
        const large = shape(filler(LARGE));

        // Warm up so JIT state cannot masquerade as complexity.
        timeOf(entry, small);
        const tSmall = Math.max(timeOf(entry, small), 0.02);
        const tLarge = timeOf(entry, large);

        if (tLarge > RATIO_CEILING * tSmall && tLarge > NOISE_FLOOR_MS) {
          slow.push(
            `${entryName} / ${fillerName} / ${shapeName}: ` +
              `${tSmall.toFixed(1)}ms at ${SMALL} -> ${tLarge.toFixed(1)}ms at ${LARGE} ` +
              `(${(tLarge / tSmall).toFixed(0)}x for 8x input)`,
          );
        }
      }
    }
  }

  assert.deepStrictEqual(
    slow,
    [],
    `superlinear behaviour through the public API:\n  ${slow.join("\n  ")}`,
  );
});

test("the whitespace-normalising invariant is in place at every entry point", () => {
  // The sweep above catches a removed normalisation step by timing. This states
  // the invariant directly, so the *reason* survives even if timings drift.
  const run = " ".repeat(5_000);

  assert.equal(new Range(`>=${run}1.2.3`).raw, ">= 1.2.3");
  assert.equal(new Comparator(`>=${run}1.2.3`).value, ">=1.2.3");

  // parseRange must normalise on its own, without the constructor's help.
  const comparators = new Range("*").parseRange(`>=${run}1.2.3`);
  assert.equal(comparators.map((c) => c.value).join(" "), ">=1.2.3");

  // SemVer caps length instead, before any pattern runs.
  assert.equal(parse(`1.2.3-${"a".repeat(5_000)}`), null);
});
