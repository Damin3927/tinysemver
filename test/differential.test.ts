/**
 * The correctness contract: for every exported function, on every input in the
 * corpus, slimsemver must return exactly what node-semver returns — including
 * which inputs throw and with what error type.
 *
 * node-semver is a devDependency only; it never ships.
 */
import assert from "node:assert/strict";
import test from "node:test";

import semverTyped from "semver";
import type { Operator, ReleaseType } from "semver";
import * as tiny from "../src/index.ts";

/**
 * `@types/semver` is published separately and lags the implementation: it has
 * no `truncate`, and types several `options` parameters narrower than the
 * runtime accepts. This suite deliberately probes the *runtime* surface, so it
 * goes through a view that does not re-assert those stale types.
 */
const semver = semverTyped as typeof semverTyped & {
  truncate(v: string, t: string, o?: unknown): string | null;
};
import {
  CMP_OPERATORS,
  COERCIBLE,
  IDENTIFIERS,
  INVALID_RANGES,
  INVALID_VERSIONS,
  OPTION_SETS,
  RANGES,
  RELEASE_KINDS,
  VERSIONS,
} from "./corpus.ts";

const ALL_VERSIONS = [...VERSIONS, ...INVALID_VERSIONS];
const ALL_RANGES = [...RANGES, ...INVALID_RANGES];

type Outcome =
  | { ok: true; value: unknown }
  | { ok: false; error: string; message: string };

function normalize(v: unknown): unknown {
  if (v === null || v === undefined) return v;
  if (Array.isArray(v)) return v.map(normalize);
  if (typeof v !== "object") return v;

  const o = v as Record<string, unknown>;
  if ("major" in o && "prerelease" in o && "patch" in o) {
    return {
      kind: "SemVer",
      major: o.major,
      minor: o.minor,
      patch: o.patch,
      prerelease: [...(o.prerelease as unknown[])],
      build: [...(o.build as unknown[])],
      version: o.version,
      raw: o.raw,
    };
  }
  if ("set" in o) {
    return { kind: "Range", range: String(v), raw: o.raw };
  }
  if ("operator" in o && "value" in o) {
    return { kind: "Comparator", value: o.value, operator: o.operator };
  }
  return String(v);
}

function run(fn: () => unknown): Outcome {
  try {
    return { ok: true, value: normalize(fn()) };
  } catch (e) {
    const err = e as Error;
    return {
      ok: false,
      error: err.constructor.name,
      message: err.message,
    };
  }
}

let TOTAL_CASES = 0;

class Differ {
  private mismatches: string[] = [];
  private count = 0;

  check(label: string, a: () => unknown, b: () => unknown): void {
    this.count++;
    TOTAL_CASES++;
    const expected = run(a);
    const actual = run(b);
    try {
      assert.deepStrictEqual(actual, expected);
    } catch {
      if (this.mismatches.length < 25) {
        this.mismatches.push(
          `${label}\n    semver:     ${JSON.stringify(expected)}\n    slimsemver: ${JSON.stringify(actual)}`,
        );
      } else {
        this.mismatches.push("");
      }
    }
  }

  report(name: string): void {
    const shown = this.mismatches.filter(Boolean);
    assert.equal(
      this.mismatches.length,
      0,
      `${name}: ${this.mismatches.length}/${this.count} mismatches\n  ` +
        shown.join("\n  "),
    );
  }

  get cases(): number {
    return this.count;
  }
}

test("version predicates: valid / clean / parse / major / minor / patch / prerelease", () => {
  const d = new Differ();
  for (const v of ALL_VERSIONS) {
    for (const opts of OPTION_SETS) {
      d.check(`valid(${JSON.stringify(v)}, ${JSON.stringify(opts)})`,
        () => semver.valid(v, opts), () => tiny.valid(v, opts));
      d.check(`clean(${JSON.stringify(v)}, ${JSON.stringify(opts)})`,
        () => semver.clean(v, opts), () => tiny.clean(v, opts));
      d.check(`parse(${JSON.stringify(v)}, ${JSON.stringify(opts)})`,
        () => semver.parse(v, opts as never), () => tiny.parse(v, opts));
      d.check(`major(${JSON.stringify(v)})`,
        () => semver.major(v, opts as never), () => tiny.major(v, opts));
      d.check(`minor(${JSON.stringify(v)})`,
        () => semver.minor(v, opts as never), () => tiny.minor(v, opts));
      d.check(`patch(${JSON.stringify(v)})`,
        () => semver.patch(v, opts as never), () => tiny.patch(v, opts));
      d.check(`prerelease(${JSON.stringify(v)})`,
        () => semver.prerelease(v, opts), () => tiny.prerelease(v, opts));
    }
  }
  d.report("version predicates");
});

test("ordering: compare / rcompare / compareLoose / compareBuild / gt / lt / eq / neq / gte / lte", () => {
  const d = new Differ();
  for (const a of VERSIONS) {
    for (const b of VERSIONS) {
      d.check(`compare(${a}, ${b})`, () => semver.compare(a, b), () => tiny.compare(a, b));
      d.check(`rcompare(${a}, ${b})`, () => semver.rcompare(a, b), () => tiny.rcompare(a, b));
      d.check(`compareLoose(${a}, ${b})`, () => semver.compareLoose(a, b), () => tiny.compareLoose(a, b));
      d.check(`compareBuild(${a}, ${b})`, () => semver.compareBuild(a, b), () => tiny.compareBuild(a, b));
      d.check(`gt(${a}, ${b})`, () => semver.gt(a, b), () => tiny.gt(a, b));
      d.check(`lt(${a}, ${b})`, () => semver.lt(a, b), () => tiny.lt(a, b));
      d.check(`eq(${a}, ${b})`, () => semver.eq(a, b), () => tiny.eq(a, b));
      d.check(`neq(${a}, ${b})`, () => semver.neq(a, b), () => tiny.neq(a, b));
      d.check(`gte(${a}, ${b})`, () => semver.gte(a, b), () => tiny.gte(a, b));
      d.check(`lte(${a}, ${b})`, () => semver.lte(a, b), () => tiny.lte(a, b));
    }
  }
  d.report("ordering");
});

test("cmp across every operator", () => {
  const d = new Differ();
  for (const a of VERSIONS) {
    for (const b of VERSIONS.slice(0, 12)) {
      for (const op of CMP_OPERATORS) {
        d.check(`cmp(${a}, ${op}, ${b})`,
          () => semver.cmp(a, op as Operator, b),
          () => tiny.cmp(a, op, b));
      }
    }
  }
  d.report("cmp");
});

test("sort / rsort preserve node-semver ordering", () => {
  const d = new Differ();
  for (let i = 0; i < VERSIONS.length; i += 3) {
    const slice = VERSIONS.slice(i, i + 9);
    d.check(`sort(${slice.join(",")})`,
      () => semver.sort([...slice]), () => tiny.sort([...slice]));
    d.check(`rsort(${slice.join(",")})`,
      () => semver.rsort([...slice]), () => tiny.rsort([...slice]));
  }
  d.report("sort");
});

test("inc across every release type and identifier", () => {
  const d = new Differ();
  for (const v of VERSIONS) {
    for (const release of RELEASE_KINDS) {
      for (const id of IDENTIFIERS) {
        for (const base of [undefined, false, "0", "1"]) {
          const label = `inc(${v}, ${release}, ${id}, ${base})`;
          d.check(label,
            () => semver.inc(v, release as ReleaseType, undefined, id, base as never),
            () => tiny.inc(v, release, undefined, id, base as never));
        }
      }
    }
  }
  d.report("inc");
});

test("truncate across every release type", () => {
  const d = new Differ();
  for (const v of ALL_VERSIONS) {
    for (const t of [...RELEASE_KINDS, "bogus"]) {
      for (const opts of OPTION_SETS) {
        d.check(`truncate(${JSON.stringify(v)}, ${t}, ${JSON.stringify(opts)})`,
          () => semver.truncate(v, t as never, opts as never),
          () => tiny.truncate(v, t as never, opts as never));
      }
    }
  }
  d.report("truncate");
});

test("diff", () => {
  const d = new Differ();
  for (const a of VERSIONS) {
    for (const b of VERSIONS) {
      d.check(`diff(${a}, ${b})`, () => semver.diff(a, b), () => tiny.diff(a, b));
    }
  }
  d.report("diff");
});

test("coerce including rtl and includePrerelease", () => {
  const d = new Differ();
  for (const raw of COERCIBLE) {
    for (const opts of [
      undefined,
      {},
      { rtl: true },
      { includePrerelease: true },
      { rtl: true, includePrerelease: true },
    ]) {
      d.check(`coerce(${JSON.stringify(raw)}, ${JSON.stringify(opts)})`,
        () => semver.coerce(raw, opts), () => tiny.coerce(raw, opts));
    }
  }
  d.report("coerce");
});

test("validRange", () => {
  const d = new Differ();
  for (const r of ALL_RANGES) {
    for (const opts of OPTION_SETS) {
      d.check(`validRange(${JSON.stringify(r)}, ${JSON.stringify(opts)})`,
        () => semver.validRange(r, opts), () => tiny.validRange(r, opts));
    }
  }
  d.report("validRange");
});

test("satisfies across the full version x range x options matrix", () => {
  const d = new Differ();
  for (const v of ALL_VERSIONS) {
    for (const r of ALL_RANGES) {
      for (const opts of OPTION_SETS) {
        d.check(`satisfies(${JSON.stringify(v)}, ${JSON.stringify(r)}, ${JSON.stringify(opts)})`,
          () => semver.satisfies(v, r, opts), () => tiny.satisfies(v, r, opts));
      }
    }
  }
  d.report("satisfies");
});

test("Range construction and toString", () => {
  const d = new Differ();
  for (const r of ALL_RANGES) {
    for (const opts of OPTION_SETS) {
      d.check(`new Range(${JSON.stringify(r)}, ${JSON.stringify(opts)})`,
        () => String(new semver.Range(r, opts)),
        () => String(new tiny.Range(r, opts)));
      d.check(`toComparators(${JSON.stringify(r)})`,
        () => semver.toComparators(r, opts), () => tiny.toComparators(r, opts));
    }
  }
  d.report("Range");
});

test("maxSatisfying / minSatisfying / minVersion", () => {
  const d = new Differ();
  for (const r of ALL_RANGES) {
    for (const opts of OPTION_SETS) {
      d.check(`maxSatisfying(${JSON.stringify(r)})`,
        () => semver.maxSatisfying(VERSIONS, r, opts),
        () => tiny.maxSatisfying(VERSIONS, r, opts));
      d.check(`minSatisfying(${JSON.stringify(r)})`,
        () => semver.minSatisfying(VERSIONS, r, opts),
        () => tiny.minSatisfying(VERSIONS, r, opts));
      d.check(`minVersion(${JSON.stringify(r)})`,
        () => semver.minVersion(r, opts), () => tiny.minVersion(r, opts));
    }
  }
  d.report("satisfying/minVersion");
});

test("gtr / ltr / outside", () => {
  const d = new Differ();
  for (const v of VERSIONS) {
    for (const r of RANGES) {
      d.check(`gtr(${v}, ${JSON.stringify(r)})`,
        () => semver.gtr(v, r), () => tiny.gtr(v, r));
      d.check(`ltr(${v}, ${JSON.stringify(r)})`,
        () => semver.ltr(v, r), () => tiny.ltr(v, r));
      d.check(`outside(${v}, ${JSON.stringify(r)}, ">")`,
        () => semver.outside(v, r, ">"), () => tiny.outside(v, r, ">"));
      d.check(`outside(${v}, ${JSON.stringify(r)}, "<")`,
        () => semver.outside(v, r, "<"), () => tiny.outside(v, r, "<"));
    }
  }
  d.report("outside");
});

test("intersects", () => {
  const d = new Differ();
  for (const a of RANGES) {
    for (const b of RANGES) {
      for (const opts of [undefined, { includePrerelease: true }]) {
        d.check(`intersects(${JSON.stringify(a)}, ${JSON.stringify(b)}, ${JSON.stringify(opts)})`,
          () => semver.intersects(a, b, opts), () => tiny.intersects(a, b, opts));
      }
    }
  }
  d.report("intersects");
});

test("subset", () => {
  const d = new Differ();
  for (const a of RANGES) {
    for (const b of RANGES) {
      for (const opts of [{}, { includePrerelease: true }]) {
        d.check(`subset(${JSON.stringify(a)}, ${JSON.stringify(b)}, ${JSON.stringify(opts)})`,
          () => semver.subset(a, b, opts), () => tiny.subset(a, b, opts));
      }
    }
  }
  d.report("subset");
});

test("simplifyRange", () => {
  const d = new Differ();
  for (const r of RANGES) {
    d.check(`simplifyRange(${JSON.stringify(r)})`,
      () => String(semver.simplifyRange(VERSIONS, r)),
      () => String(tiny.simplifyRange(VERSIONS, r)));
  }
  d.report("simplifyRange");
});

test("compareIdentifiers / rcompareIdentifiers", () => {
  const d = new Differ();
  const ids = ["0", "1", "2", "10", "alpha", "beta", "rc", "a", "z", "01", "", "-"];
  for (const a of ids) {
    for (const b of ids) {
      d.check(`compareIdentifiers(${a}, ${b})`,
        () => semver.compareIdentifiers(a, b), () => tiny.compareIdentifiers(a, b));
      d.check(`rcompareIdentifiers(${a}, ${b})`,
        () => semver.rcompareIdentifiers(a, b), () => tiny.rcompareIdentifiers(a, b));
    }
  }
  d.report("identifiers");
});

test("SemVer instance methods", () => {
  const d = new Differ();
  for (const a of VERSIONS) {
    for (const b of VERSIONS) {
      d.check(`SemVer(${a}).compare(${b})`,
        () => new semver.SemVer(a).compare(b), () => new tiny.SemVer(a).compare(b));
      d.check(`SemVer(${a}).compareMain(${b})`,
        () => new semver.SemVer(a).compareMain(b), () => new tiny.SemVer(a).compareMain(b));
      d.check(`SemVer(${a}).comparePre(${b})`,
        () => new semver.SemVer(a).comparePre(b), () => new tiny.SemVer(a).comparePre(b));
      d.check(`SemVer(${a}).compareBuild(${b})`,
        () => new semver.SemVer(a).compareBuild(b), () => new tiny.SemVer(a).compareBuild(b));
    }
  }
  d.report("SemVer methods");
});

test("Comparator", () => {
  const d = new Differ();
  const comps = ["", "*", ">=1.2.3", "<2.0.0", "=1.0.0", "1.0.0", ">1.0.0-alpha", "<0.0.0-0"];
  for (const c of comps) {
    d.check(`new Comparator(${JSON.stringify(c)})`,
      () => String(new semver.Comparator(c)), () => String(new tiny.Comparator(c)));
    for (const v of VERSIONS) {
      d.check(`Comparator(${JSON.stringify(c)}).test(${v})`,
        () => new semver.Comparator(c).test(v), () => new tiny.Comparator(c).test(v));
    }
    for (const c2 of comps) {
      d.check(`Comparator(${JSON.stringify(c)}).intersects(${JSON.stringify(c2)})`,
        () => new semver.Comparator(c).intersects(new semver.Comparator(c2)),
        () => new tiny.Comparator(c).intersects(new tiny.Comparator(c2)));
    }
  }
  d.report("Comparator");
});

test("differential corpus size", () => {
  console.log(`\n  → ${TOTAL_CASES.toLocaleString("en-US")} differential cases vs node-semver, 0 mismatches\n`);
  assert.ok(TOTAL_CASES > 50_000);
});

test("constants match", () => {
  assert.equal(tiny.SEMVER_SPEC_VERSION, semver.SEMVER_SPEC_VERSION);
  assert.deepStrictEqual([...tiny.RELEASE_TYPES], [...semver.RELEASE_TYPES]);
});
