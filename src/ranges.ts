import { ANY, Comparator } from "./classes/comparator.ts";
import { Range } from "./classes/range.ts";
import { SemVer } from "./classes/semver.ts";
import { compare, gt, gte, lt, lte } from "./functions.ts";
import type { Options } from "./internal/constants.ts";

export function satisfies(
  version: string | SemVer,
  range: string | Range,
  options?: boolean | Options,
): boolean {
  let r: Range;
  try {
    r = new Range(range, options);
  } catch {
    return false;
  }
  return r.test(version);
}

export function validRange(
  range: string | Range | null | undefined,
  options?: boolean | Options,
): string | null {
  try {
    // An empty range is `*`, which is valid.
    return new Range(range as string, options).range || "*";
  } catch {
    return null;
  }
}

export function maxSatisfying<T extends string | SemVer>(
  versions: readonly T[],
  range: string | Range,
  options?: boolean | Options,
): T | null {
  let max: T | null = null;
  let maxSV: SemVer | null = null;
  let rangeObj: Range;
  try {
    rangeObj = new Range(range, options);
  } catch {
    return null;
  }

  for (const v of versions) {
    if (rangeObj.test(v)) {
      if (!max || (maxSV as SemVer).compare(v) === -1) {
        max = v;
        maxSV = new SemVer(max, options);
      }
    }
  }
  return max;
}

export function minSatisfying<T extends string | SemVer>(
  versions: readonly T[],
  range: string | Range,
  options?: boolean | Options,
): T | null {
  let min: T | null = null;
  let minSV: SemVer | null = null;
  let rangeObj: Range;
  try {
    rangeObj = new Range(range, options);
  } catch {
    return null;
  }

  for (const v of versions) {
    if (rangeObj.test(v)) {
      if (!min || (minSV as SemVer).compare(v) === 1) {
        min = v;
        minSV = new SemVer(min, options);
      }
    }
  }
  return min;
}

export function minVersion(
  range: string | Range,
  loose?: boolean | Options,
): SemVer | null {
  const r = new Range(range, loose);

  let minver: SemVer | null = new SemVer("0.0.0");
  if (r.test(minver)) {
    return minver;
  }

  minver = new SemVer("0.0.0-0");
  if (r.test(minver)) {
    return minver;
  }

  minver = null;
  for (let i = 0; i < r.set.length; ++i) {
    const comparators = r.set[i] as Comparator[];
    let setMin: SemVer | null = null;

    for (const comparator of comparators) {
      // Clone so we never mutate the comparator's own SemVer.
      const compver = new SemVer((comparator.semver as SemVer).version);
      switch (comparator.operator) {
        case ">":
          if (compver.prerelease.length === 0) {
            compver.patch++;
          } else {
            compver.prerelease.push(0);
          }
          compver.raw = compver.format();
        // falls through
        case "":
        case ">=":
          if (!setMin || gt(compver, setMin)) {
            setMin = compver;
          }
          break;
        case "<":
        case "<=":
          // Upper bounds do not constrain the minimum.
          break;
        default:
          throw new Error(`Unexpected operation: ${comparator.operator}`);
      }
    }
    if (setMin && (!minver || gt(minver, setMin))) {
      minver = setMin;
    }
  }

  if (minver && r.test(minver)) {
    return minver;
  }

  return null;
}

export function outside(
  version: string | SemVer,
  range: string | Range,
  hilo: ">" | "<",
  options?: boolean | Options,
): boolean {
  const v = new SemVer(version, options);
  const r = new Range(range, options);

  let gtfn: typeof gt;
  let ltefn: typeof lte;
  let ltfn: typeof lt;
  let comp: string;
  let ecomp: string;
  switch (hilo) {
    case ">":
      gtfn = gt;
      ltefn = lte;
      ltfn = lt;
      comp = ">";
      ecomp = ">=";
      break;
    case "<":
      gtfn = lt;
      ltefn = gte;
      ltfn = gt;
      comp = "<";
      ecomp = "<=";
      break;
    default:
      throw new TypeError('Must provide a hilo val of "<" or ">"');
  }

  // If it satisfies the range it is not outside.
  if (satisfies(v, r, options)) {
    return false;
  }

  // From here the variable names read as if we are in `gtr` mode.
  for (let i = 0; i < r.set.length; ++i) {
    const comparators = r.set[i] as Comparator[];

    let high: Comparator | null = null;
    let low: Comparator | null = null;

    for (let comparator of comparators) {
      if (comparator.semver === ANY) {
        comparator = new Comparator(">=0.0.0");
      }
      high = high || comparator;
      low = low || comparator;
      if (
        gtfn(comparator.semver as SemVer, high.semver as SemVer, options)
      ) {
        high = comparator;
      } else if (
        ltfn(comparator.semver as SemVer, low.semver as SemVer, options)
      ) {
        low = comparator;
      }
    }

    const h = high as Comparator;
    const l = low as Comparator;

    // If the edge version comparator has the same operator, we are not outside.
    if (h.operator === comp || h.operator === ecomp) {
      return false;
    }

    if ((!l.operator || l.operator === comp) && ltefn(v, l.semver as SemVer)) {
      return false;
    }
    if (l.operator === ecomp && ltfn(v, l.semver as SemVer)) {
      return false;
    }
  }
  return true;
}

export function gtr(
  version: string | SemVer,
  range: string | Range,
  options?: boolean | Options,
): boolean {
  return outside(version, range, ">", options);
}

export function ltr(
  version: string | SemVer,
  range: string | Range,
  options?: boolean | Options,
): boolean {
  return outside(version, range, "<", options);
}

export function intersects(
  r1: string | Range,
  r2: string | Range,
  options?: boolean | Options,
): boolean {
  const a = new Range(r1, options);
  const b = new Range(r2, options);
  return a.intersects(b, options);
}

export function toComparators(
  range: string | Range,
  options?: boolean | Options,
): string[][] {
  return new Range(range, options).set.map((comp) =>
    comp
      .map((c) => c.value)
      .join(" ")
      .trim()
      .split(" "),
  );
}

/**
 * Given a list of versions and a range, produce the shortest range string that
 * selects exactly the same versions out of that list.
 */
export function simplifyRange(
  versions: ReadonlyArray<string | SemVer>,
  range: string | Range,
  options?: boolean | Options,
): string | Range {
  const set: Array<[string, string | null]> = [];
  let first: string | null = null;
  let prev: string | null = null;

  const v = [...versions].sort((a, b) => compare(a, b, options));

  for (const version of v) {
    const included = satisfies(version, range, options);
    if (included) {
      prev = String(version);
      if (!first) {
        first = String(version);
      }
    } else {
      if (prev) {
        set.push([first as string, prev]);
      }
      prev = null;
      first = null;
    }
  }
  if (first) {
    set.push([first, null]);
  }

  const ranges: string[] = [];
  for (const [min, max] of set) {
    if (min === max) {
      ranges.push(min);
    } else if (!max && min === String(v[0])) {
      ranges.push("*");
    } else if (!max) {
      ranges.push(`>=${min}`);
    } else if (min === String(v[0])) {
      ranges.push(`<=${max}`);
    } else {
      ranges.push(`${min} - ${max}`);
    }
  }
  const simplified = ranges.join(" || ");
  const original =
    typeof (range as Range).raw === "string"
      ? (range as Range).raw
      : String(range);
  return simplified.length < original.length ? simplified : range;
}

const minimumVersionWithPreRelease = [new Comparator(">=0.0.0-0")];
const minimumVersion = [new Comparator(">=0.0.0")];

/**
 * Is every version that satisfies `sub` also guaranteed to satisfy `dom`?
 */
export function subset(
  sub: string | Range,
  dom: string | Range,
  options: Options = {},
): boolean {
  if (sub === dom) {
    return true;
  }

  const subRange = new Range(sub, options);
  const domRange = new Range(dom, options);
  let sawNonNull = false;

  OUTER: for (const simpleSub of subRange.set) {
    for (const simpleDom of domRange.set) {
      const isSub = simpleSubset(simpleSub, simpleDom, options);
      sawNonNull = sawNonNull || isSub !== null;
      if (isSub) {
        continue OUTER;
      }
    }
    // The null set is a subset of everything, so only bail if we ever saw a
    // comparator set that was actually satisfiable.
    if (sawNonNull) {
      return false;
    }
  }
  return true;
}

function simpleSubset(
  subArg: Comparator[],
  domArg: Comparator[],
  options: Options,
): boolean | null {
  let sub = subArg;
  let dom = domArg;

  if (sub === dom) {
    return true;
  }

  if (sub.length === 1 && (sub[0] as Comparator).semver === ANY) {
    if (dom.length === 1 && (dom[0] as Comparator).semver === ANY) {
      return true;
    }
    sub = options.includePrerelease
      ? minimumVersionWithPreRelease
      : minimumVersion;
  }

  if (dom.length === 1 && (dom[0] as Comparator).semver === ANY) {
    if (options.includePrerelease) {
      return true;
    }
    dom = minimumVersion;
  }

  const eqSet = new Set<SemVer>();
  let gtComp: Comparator | undefined;
  let ltComp: Comparator | undefined;

  for (const c of sub) {
    if (c.operator === ">" || c.operator === ">=") {
      gtComp = higherGT(gtComp, c, options);
    } else if (c.operator === "<" || c.operator === "<=") {
      ltComp = lowerLT(ltComp, c, options);
    } else {
      eqSet.add(c.semver as SemVer);
    }
  }

  if (eqSet.size > 1) {
    return null;
  }

  let gtltComp: number | undefined;
  if (gtComp && ltComp) {
    gtltComp = compare(
      gtComp.semver as SemVer,
      ltComp.semver as SemVer,
      options,
    );
    if (gtltComp > 0) {
      return null;
    }
    if (
      gtltComp === 0 &&
      (gtComp.operator !== ">=" || ltComp.operator !== "<=")
    ) {
      return null;
    }
  }

  // Iterates once or zero times.
  for (const eq of eqSet) {
    if (gtComp && !satisfies(eq, String(gtComp), options)) {
      return null;
    }
    if (ltComp && !satisfies(eq, String(ltComp), options)) {
      return null;
    }
    for (const c of dom) {
      if (!satisfies(eq, String(c), options)) {
        return false;
      }
    }
    return true;
  }

  let higher: Comparator | undefined;
  let lower: Comparator | undefined;
  let hasDomLT = false;
  let hasDomGT = false;

  // If the subset bound is a prerelease, the superset needs a comparator with
  // the same [major, minor, patch] tuple that also names a prerelease.
  let needDomLTPre: SemVer | false =
    ltComp && !options.includePrerelease && (ltComp.semver as SemVer).prerelease.length
      ? (ltComp.semver as SemVer)
      : false;
  let needDomGTPre: SemVer | false =
    gtComp && !options.includePrerelease && (gtComp.semver as SemVer).prerelease.length
      ? (gtComp.semver as SemVer)
      : false;

  // `<1.2.3-0` is the same as `<1.2.3`.
  if (
    needDomLTPre &&
    needDomLTPre.prerelease.length === 1 &&
    (ltComp as Comparator).operator === "<" &&
    needDomLTPre.prerelease[0] === 0
  ) {
    needDomLTPre = false;
  }

  for (const c of dom) {
    hasDomGT = hasDomGT || c.operator === ">" || c.operator === ">=";
    hasDomLT = hasDomLT || c.operator === "<" || c.operator === "<=";

    if (gtComp) {
      if (needDomGTPre) {
        const cs = c.semver as SemVer;
        if (
          cs.prerelease &&
          cs.prerelease.length &&
          cs.major === needDomGTPre.major &&
          cs.minor === needDomGTPre.minor &&
          cs.patch === needDomGTPre.patch
        ) {
          needDomGTPre = false;
        }
      }
      if (c.operator === ">" || c.operator === ">=") {
        higher = higherGT(gtComp, c, options);
        if (higher === c && higher !== gtComp) {
          return false;
        }
      } else if (gtComp.operator === ">=" && !c.test(gtComp.semver)) {
        // Comparator.test, not satisfies: this is a raw bound check that must
        // not apply the "prereleases only match their own tuple" rule.
        return false;
      }
    }

    if (ltComp) {
      if (needDomLTPre) {
        const cs = c.semver as SemVer;
        if (
          cs.prerelease &&
          cs.prerelease.length &&
          cs.major === needDomLTPre.major &&
          cs.minor === needDomLTPre.minor &&
          cs.patch === needDomLTPre.patch
        ) {
          needDomLTPre = false;
        }
      }
      if (c.operator === "<" || c.operator === "<=") {
        lower = lowerLT(ltComp, c, options);
        if (lower === c && lower !== ltComp) {
          return false;
        }
      } else if (ltComp.operator === "<=" && !c.test(ltComp.semver)) {
        return false;
      }
    }

    if (!c.operator && (ltComp || gtComp) && gtltComp !== 0) {
      return false;
    }
  }

  // A bound on one side with nothing matching on the other cannot be a subset.
  if (gtComp && hasDomLT && !ltComp && gtltComp !== 0) {
    return false;
  }
  if (ltComp && hasDomGT && !gtComp && gtltComp !== 0) {
    return false;
  }

  if (needDomGTPre || needDomLTPre) {
    return false;
  }

  return true;
}

function higherGT(
  a: Comparator | undefined,
  b: Comparator,
  options: Options,
): Comparator {
  if (!a) {
    return b;
  }
  const comp = compare(a.semver as SemVer, b.semver as SemVer, options);
  if (comp > 0) return a;
  if (comp < 0) return b;
  return b.operator === ">" && a.operator === ">=" ? b : a;
}

function lowerLT(
  a: Comparator | undefined,
  b: Comparator,
  options: Options,
): Comparator {
  if (!a) {
    return b;
  }
  const comp = compare(a.semver as SemVer, b.semver as SemVer, options);
  if (comp < 0) return a;
  if (comp > 0) return b;
  return b.operator === "<" && a.operator === "<=" ? b : a;
}
