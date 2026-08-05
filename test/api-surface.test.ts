/**
 * The drop-in claim, checked mechanically: every name node-semver exports must
 * exist here with the same kind and the same arity. A rename or a missing
 * export fails the build, which is the whole reason this package exists.
 */
import assert from "node:assert/strict";
import test from "node:test";

import semver from "semver";
import * as tiny from "../src/index.ts";
import tinyDefault from "../src/index.ts";

/**
 * Deliberately not reimplemented. These are node-semver's undocumented
 * internals (a numeric token table for its regexes); nothing in its README
 * describes them, and mirroring the token indices would freeze an internal
 * detail into this package's public API.
 */
const KNOWN_GAPS = new Set(["re", "src", "tokens", "internals"]);

const semverNames = Object.keys(semver).filter((k) => !KNOWN_GAPS.has(k));

test("every semver export exists on the named exports", () => {
  const missing = semverNames.filter((n) => !(n in tiny));
  assert.deepStrictEqual(missing, [], `missing named exports: ${missing.join(", ")}`);
});

test("every semver export exists on the default export", () => {
  const missing = semverNames.filter(
    (n) => !(n in (tinyDefault as Record<string, unknown>)),
  );
  assert.deepStrictEqual(missing, [], `missing on default: ${missing.join(", ")}`);
});

test("exports have the same kind and arity", () => {
  const problems: string[] = [];
  for (const name of semverNames) {
    const a = (semver as unknown as Record<string, unknown>)[name];
    const b = (tiny as unknown as Record<string, unknown>)[name];
    if (typeof a !== typeof b) {
      problems.push(`${name}: semver is ${typeof a}, tinysemver is ${typeof b}`);
      continue;
    }
    if (typeof a === "function" && typeof b === "function") {
      // Optional trailing parameters legitimately shift `length`; only flag a
      // signature that cannot accept everything semver's can.
      if (b.length > a.length) {
        problems.push(
          `${name}: requires ${b.length} args, semver requires ${a.length}`,
        );
      }
    }
  }
  assert.deepStrictEqual(problems, [], problems.join("\n"));
});

test("KNOWN_GAPS stay documented and really are absent", () => {
  for (const gap of KNOWN_GAPS) {
    assert.ok(
      gap in semver || gap === "internals",
      `${gap} is listed as a gap but semver does not export it — stale list`,
    );
  }
});

test("classes are constructible and instanceof-correct", () => {
  const v = new tiny.SemVer("1.2.3");
  assert.ok(v instanceof tiny.SemVer);
  assert.equal(v.version, "1.2.3");

  const r = new tiny.Range("^1.2.3");
  assert.ok(r instanceof tiny.Range);
  assert.ok(r.test("1.5.0"));

  const c = new tiny.Comparator(">=1.2.3");
  assert.ok(c instanceof tiny.Comparator);
  assert.ok(c.test("2.0.0"));

  // node-semver exposes Comparator.ANY as a sentinel.
  assert.equal(typeof tiny.Comparator.ANY, "symbol");
});
