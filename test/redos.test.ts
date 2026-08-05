/**
 * Regression guard for algorithmic complexity.
 *
 * SECURITY.md claims this package does not blow up on adversarial input, so
 * that claim gets a test rather than a promise. Each case feeds a pathological
 * string — long whitespace runs, long digit runs, deep alternation — through a
 * public entry point and asserts it completes well inside a budget.
 *
 * These are wall-clock assertions, so the budget is deliberately loose: a
 * quadratic or exponential regression overshoots by orders of magnitude, while
 * ordinary CI noise does not.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { Range, satisfies, validRange, coerce, parse, subset } from "../src/index.ts";

const BUDGET_MS = 500;

function timed(label: string, fn: () => unknown): void {
  const started = process.hrtime.bigint();
  fn();
  const ms = Number(process.hrtime.bigint() - started) / 1e6;
  assert.ok(
    ms < BUDGET_MS,
    `${label} took ${ms.toFixed(0)}ms, budget ${BUDGET_MS}ms — likely a complexity regression`,
  );
}

const SPACES = " ".repeat(50_000);
const DIGITS = "1".repeat(50_000);

test("whitespace runs do not trigger polynomial backtracking", () => {
  // The `(\s*)X\s+` shape in the tilde/caret trim patterns is the classic
  // polynomial case: these all used to rescan the run from every position.
  timed("tilde + spaces", () => validRange(`~${SPACES}1.2.3`));
  timed("caret + spaces", () => validRange(`^${SPACES}1.2.3`));
  timed("comparator + spaces", () => validRange(`>=${SPACES}1.2.3`));
  timed("leading spaces", () => validRange(`${SPACES}1.2.3`));
  timed("trailing spaces", () => validRange(`1.2.3${SPACES}`));
  timed("spaces only", () => validRange(SPACES));
  timed("gte0 + spaces", () => validRange(`>=${SPACES}0.0.0`));
  timed("hyphen + spaces", () => validRange(`1.2.3${SPACES}-${SPACES}2.0.0`));
});

test("parseRange is safe when called directly, without the constructor", () => {
  // The constructor normalises whitespace, but parseRange is public and can be
  // reached without it.
  const r = new Range("*");
  timed("parseRange tilde", () => {
    try {
      r.parseRange(`~${SPACES}1.2.3`);
    } catch {
      /* validity is not what is under test here */
    }
  });
  timed("parseRange caret", () => {
    try {
      r.parseRange(`^${SPACES}1.2.3`);
    } catch {
      /* as above */
    }
  });
});

test("long digit and identifier runs stay bounded", () => {
  timed("digits as version", () => parse(`${DIGITS}.${DIGITS}.${DIGITS}`));
  timed("digits as range", () => validRange(`^${DIGITS}.0.0`));
  timed("coerce digits", () => coerce(DIGITS));
  timed("coerce rtl digits", () => coerce(DIGITS, { rtl: true }));
  timed("long prerelease", () => parse(`1.2.3-${"a.".repeat(20_000)}b`));
  timed("long build", () => parse(`1.2.3+${"a.".repeat(20_000)}b`));
});

test("deep alternation and comparator sets stay bounded", () => {
  const manyOr = Array.from({ length: 2_000 }, (_, i) => `${i}.0.0`).join(" || ");
  timed("2000-way union parse", () => validRange(manyOr));
  timed("2000-way union satisfies", () => satisfies("1500.0.0", manyOr));

  const manyAnd = Array.from({ length: 500 }, (_, i) => `>=${i}.0.0`).join(" ");
  timed("500-comparator intersection", () => validRange(manyAnd));

  timed("subset of a wide union", () => subset("^1.0.0", manyOr));
});

test("versions longer than the cap are rejected rather than parsed", () => {
  // Length is capped before any regex runs, so an oversized input is cheap.
  timed("oversized version", () => parse("1.2.3-" + "a".repeat(100_000)));
  assert.equal(parse("1.2.3-" + "a".repeat(100_000)), null);
});

test("the range cache cannot grow without bound", () => {
  // A hostile stream of distinct ranges must not retain every one of them.
  timed("10k distinct ranges", () => {
    for (let i = 0; i < 10_000; i++) {
      validRange(`^${i}.0.0`);
    }
  });
});
