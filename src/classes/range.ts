import type { Options } from "../internal/constants.ts";
import { parseOptions } from "../internal/parse-options.ts";
import {
  BUILD_STRIP,
  CARET,
  CARET_LOOSE,
  CARET_TRIM,
  COMPARATOR_LOOSE,
  COMPARATOR_TRIM,
  GTE0,
  GTE0_PRE,
  HYPHENRANGE,
  HYPHENRANGE_LOOSE,
  STAR,
  TILDE,
  TILDE_LOOSE,
  TILDE_TRIM,
  XRANGE,
  XRANGE_LOOSE,
} from "../internal/re.ts";
import { ANY, Comparator } from "./comparator.ts";
import { SemVer } from "./semver.ts";

/**
 * Bounded so a hostile input stream of distinct ranges cannot grow the process
 * heap without limit. node-semver uses an LRU here; a capped FIFO is equivalent
 * for the access pattern and keeps the dependency count at zero.
 */
const CACHE_LIMIT = 1000;
const cache = new Map<string, Comparator[]>();

export class Range {
  options!: Options;
  loose!: boolean;
  includePrerelease!: boolean;
  raw!: string;
  set!: Comparator[][];
  private formatted: string | undefined;

  constructor(range: string | Range | Comparator, optionsArg?: boolean | Options) {
    const options = parseOptions(optionsArg);

    if (range instanceof Range) {
      if (
        range.loose === !!options.loose &&
        range.includePrerelease === !!options.includePrerelease
      ) {
        return range;
      }
      return new Range(range.raw, options);
    }

    if (range instanceof Comparator) {
      this.raw = range.value;
      this.set = [[range]];
      this.options = options;
      this.loose = !!options.loose;
      this.includePrerelease = !!options.includePrerelease;
      this.formatted = undefined;
      return this;
    }

    this.options = options;
    this.loose = !!options.loose;
    this.includePrerelease = !!options.includePrerelease;

    // Collapse whitespace up front so the grammar regexes never need `\s*`,
    // which is what makes them cheap on adversarial input.
    this.raw = range.trim().split(/\s+/).join(" ");

    this.set = this.raw
      .split("||")
      .map((r) => this.parseRange(r.trim()))
      .filter((c) => c.length);

    if (!this.set.length) {
      throw new TypeError(`Invalid SemVer Range: ${this.raw}`);
    }

    // If there is more than one comparator set, drop the null sets.
    if (this.set.length > 1) {
      const first = this.set[0] as Comparator[];
      this.set = this.set.filter((c) => !isNullSet(c[0] as Comparator));
      if (this.set.length === 0) {
        this.set = [first];
      } else if (this.set.length > 1) {
        // If any set is *, the range is just *.
        for (const c of this.set) {
          if (c.length === 1 && isAny(c[0] as Comparator)) {
            this.set = [c];
            break;
          }
        }
      }
    }

    this.formatted = undefined;
  }

  get range(): string {
    if (this.formatted === undefined) {
      this.formatted = "";
      for (let i = 0; i < this.set.length; i++) {
        if (i > 0) {
          this.formatted += "||";
        }
        const comps = this.set[i] as Comparator[];
        for (let k = 0; k < comps.length; k++) {
          if (k > 0) {
            this.formatted += " ";
          }
          this.formatted += String(comps[k]).trim();
        }
      }
    }
    return this.formatted;
  }

  format(): string {
    return this.range;
  }

  toString(): string {
    return this.range;
  }

  parseRange(range: string): Comparator[] {
    // This is public API, so it cannot assume the constructor's normalisation
    // ran. Collapsing whitespace here is linear, and it is what lets the trim
    // patterns in re.ts use bounded quantifiers instead of the `(\s*)X\s+`
    // shape, which rescans a whitespace run from every start position.
    range = range.trim().split(/\s+/).join(" ");

    // Strip build metadata up front so it cannot bleed into a version.
    range = range.replace(BUILD_STRIP, "");

    const memoOpts =
      (this.options.includePrerelease ? "\0ip" : "") +
      (this.options.loose ? "\0l" : "");
    const memoKey = memoOpts + range;
    const cached = cache.get(memoKey);
    if (cached) {
      return cached;
    }

    const loose = this.options.loose;

    // `1.2.3 - 1.2.4` => `>=1.2.3 <=1.2.4`
    const hr = loose ? HYPHENRANGE_LOOSE : HYPHENRANGE;
    range = range.replace(hr, hyphenReplace(!!this.options.includePrerelease));

    // `> 1.2.3 < 1.2.5` => `>1.2.3 <1.2.5`
    range = range.replace(COMPARATOR_TRIM, "$1$2$3");
    // `~ 1.2.3` => `~1.2.3`
    range = range.replace(TILDE_TRIM, "$1~");
    // `^ 1.2.3` => `^1.2.3`
    range = range.replace(CARET_TRIM, "$1^");

    let rangeList = range
      .split(" ")
      .map((comp) => parseComparator(comp, this.options))
      .join(" ")
      .split(/\s+/)
      .map((comp) => replaceGTE0(comp, this.options));

    if (loose) {
      // In loose mode, throw out any comparator we cannot parse.
      rangeList = rangeList.filter((comp) => !!comp.match(COMPARATOR_LOOSE));
    }

    const rangeMap = new Map<string, Comparator>();
    const comparators = rangeList.map(
      (comp) => new Comparator(comp, this.options),
    );
    for (const comp of comparators) {
      if (isNullSet(comp)) {
        return [comp];
      }
      rangeMap.set(comp.value, comp);
    }
    if (rangeMap.size > 1 && rangeMap.has("")) {
      rangeMap.delete("");
    }

    const result = [...rangeMap.values()];
    if (cache.size >= CACHE_LIMIT) {
      const oldest = cache.keys().next().value;
      if (oldest !== undefined) {
        cache.delete(oldest);
      }
    }
    cache.set(memoKey, result);
    return result;
  }

  intersects(range: Range, optionsArg?: boolean | Options): boolean {
    if (!(range instanceof Range)) {
      throw new TypeError("a Range is required");
    }

    return this.set.some(
      (thisComparators) =>
        isSatisfiable(thisComparators, optionsArg) &&
        range.set.some(
          (rangeComparators) =>
            isSatisfiable(rangeComparators, optionsArg) &&
            thisComparators.every((thisComparator) =>
              rangeComparators.every((rangeComparator) =>
                thisComparator.intersects(rangeComparator, optionsArg),
              ),
            ),
        ),
    );
  }

  test(version: string | SemVer | null | undefined): boolean {
    if (!version) {
      return false;
    }

    if (typeof version === "string") {
      try {
        version = new SemVer(version, this.options);
      } catch {
        return false;
      }
    }

    for (let i = 0; i < this.set.length; i++) {
      if (testSet(this.set[i] as Comparator[], version, this.options)) {
        return true;
      }
    }
    return false;
  }
}

const isNullSet = (c: Comparator | undefined): boolean =>
  c?.value === "<0.0.0-0";
const isAny = (c: Comparator | undefined): boolean => c?.value === "";

/**
 * A comparator set is satisfiable if every member pairwise intersects.
 */
function isSatisfiable(
  comparators: Comparator[],
  options?: boolean | Options,
): boolean {
  let result = true;
  const remaining = comparators.slice();
  let test = remaining.pop();

  while (result && remaining.length) {
    result = remaining.every((other) =>
      (test as Comparator).intersects(other, options),
    );
    test = remaining.pop();
  }

  return result;
}

function parseComparator(comp: string, options: Options): string {
  comp = replaceCarets(comp, options);
  comp = replaceTildes(comp, options);
  comp = replaceXRanges(comp, options);
  comp = replaceStars(comp);
  return comp;
}

const isX = (id: string | undefined): boolean =>
  !id || id.toLowerCase() === "x" || id === "*";

/**
 * A wildcard may not be followed by a concrete component: `1.x.3` and `x.1.2`
 * are not ranges. The grammar regex happily matches them, so the ordering has
 * to be rejected here, by leaving the comparator untouched so it fails to parse
 * downstream.
 */
const invalidXRangeOrder = (
  M: string,
  m: string,
  p: string,
): boolean => (isX(M) && !isX(m)) || (isX(m) && !!p && !isX(p));

const replaceTildes = (comp: string, options: Options): string =>
  comp
    .trim()
    .split(/\s+/)
    .map((c) => replaceTilde(c, options))
    .join(" ");

/**
 * `~1.2.3` := `>=1.2.3 <1.3.0-0` — allow patch-level changes if a minor is
 * specified, minor-level changes if not.
 *
 * With `includePrerelease`, an implied component takes `-0` as its lower bound
 * so that `~1.2` stays equivalent to the `1.2.x` x-range it is documented as.
 * An explicitly written patch does not get that treatment.
 */
function replaceTilde(comp: string, options: Options): string {
  const z = options.includePrerelease ? "-0" : "";
  const r = options.loose ? TILDE_LOOSE : TILDE;
  return comp.replace(r, (_, M: string, m: string, p: string, pr: string) => {
    if (isX(M)) return "";
    if (isX(m)) return `>=${M}.0.0${z} <${+M + 1}.0.0-0`;
    if (isX(p)) return `>=${M}.${m}.0${z} <${M}.${+m + 1}.0-0`;
    if (pr) return `>=${M}.${m}.${p}-${pr} <${M}.${+m + 1}.0-0`;
    return `>=${M}.${m}.${p} <${M}.${+m + 1}.0-0`;
  });
}

const replaceCarets = (comp: string, options: Options): string =>
  comp
    .trim()
    .split(/\s+/)
    .map((c) => replaceCaret(c, options))
    .join(" ");

/**
 * `^1.2.3` := `>=1.2.3 <2.0.0-0` — allow changes that do not modify the
 * left-most non-zero digit.
 */
function replaceCaret(comp: string, options: Options): string {
  const z = options.includePrerelease ? "-0" : "";
  const r = options.loose ? CARET_LOOSE : CARET;
  return comp.replace(r, (_, M: string, m: string, p: string, pr: string) => {
    if (isX(M)) return "";
    if (isX(m)) return `>=${M}.0.0${z} <${+M + 1}.0.0-0`;
    if (isX(p)) {
      if (M === "0") return `>=${M}.${m}.0${z} <${M}.${+m + 1}.0-0`;
      return `>=${M}.${m}.0${z} <${+M + 1}.0.0-0`;
    }
    if (pr) {
      if (M === "0") {
        if (m === "0") return `>=${M}.${m}.${p}-${pr} <${M}.${m}.${+p + 1}-0`;
        return `>=${M}.${m}.${p}-${pr} <${M}.${+m + 1}.0-0`;
      }
      return `>=${M}.${m}.${p}-${pr} <${+M + 1}.0.0-0`;
    }
    // An explicitly written patch is already the exact lower bound, so `-0`
    // must not be appended here even under `includePrerelease`.
    if (M === "0") {
      if (m === "0") return `>=${M}.${m}.${p} <${M}.${m}.${+p + 1}-0`;
      return `>=${M}.${m}.${p} <${M}.${+m + 1}.0-0`;
    }
    return `>=${M}.${m}.${p} <${+M + 1}.0.0-0`;
  });
}

const replaceXRanges = (comp: string, options: Options): string =>
  comp
    .split(/\s+/)
    .map((c) => replaceXRange(c, options))
    .join(" ");

function replaceXRange(comp: string, options: Options): string {
  comp = comp.trim();
  const r = options.loose ? XRANGE_LOOSE : XRANGE;
  return comp.replace(
    r,
    (ret: string, gtlt: string, M: string, m: string, p: string) => {
      if (invalidXRangeOrder(M, m, p)) {
        return comp;
      }

      const xM = isX(M);
      const xm = xM || isX(m);
      const xp = xm || isX(p);
      const anyX = xp;

      if (gtlt === "=" && anyX) {
        gtlt = "";
      }

      // When matching prereleases, the floor is -0, the lowest possible value.
      let pr = options.includePrerelease ? "-0" : "";

      if (xM) {
        if (gtlt === ">" || gtlt === "<") {
          // Nothing is allowed.
          return "<0.0.0-0";
        }
        // Nothing is forbidden.
        return "*";
      }

      if (gtlt && anyX) {
        // Patch is an x, because we have any x at all.
        let mm: string | number = m as string;
        if (xm) {
          mm = 0;
        }
        let pp: string | number = 0;

        if (gtlt === ">") {
          // `>1` => `>=2.0.0`, `>1.2` => `>=1.3.0`
          gtlt = ">=";
          if (xm) {
            M = String(+M + 1);
            mm = 0;
            pp = 0;
          } else {
            mm = +(m as string) + 1;
            pp = 0;
          }
        } else if (gtlt === "<=") {
          // `<=0.7.x` is actually `<0.8.0`, since any 0.7.x should pass.
          gtlt = "<";
          if (xm) {
            M = String(+M + 1);
          } else {
            mm = +(m as string) + 1;
          }
        }

        if (gtlt === "<") {
          pr = "-0";
        }

        return `${gtlt + M}.${mm}.${pp}${pr}`;
      }

      if (xm) {
        return `>=${M}.0.0${pr} <${+M + 1}.0.0-0`;
      }
      if (xp) {
        return `>=${M}.${m}.0${pr} <${M}.${+(m as string) + 1}.0-0`;
      }

      return ret;
    },
  );
}

const replaceStars = (comp: string): string => comp.trim().replace(STAR, "");

const replaceGTE0 = (comp: string, options: Options): string =>
  comp.trim().replace(options.includePrerelease ? GTE0_PRE : GTE0, "");

/**
 * `1.2 - 3.4.5` => `>=1.2.0 <=3.4.5`
 * `1.2.3 - 3.4` => `>=1.2.0 <3.5.0-0`
 */
function hyphenReplace(incPr: boolean) {
  return (
    _$0: string,
    from: string,
    fM: string,
    fm: string,
    fp: string,
    fpr: string,
    _fb: string,
    to: string,
    tM: string,
    tm: string,
    tp: string,
    tpr: string,
  ): string => {
    if (isX(fM)) {
      from = "";
    } else if (isX(fm)) {
      from = `>=${fM}.0.0${incPr ? "-0" : ""}`;
    } else if (isX(fp)) {
      from = `>=${fM}.${fm}.0${incPr ? "-0" : ""}`;
    } else if (fpr) {
      from = `>=${from}`;
    } else {
      from = `>=${from}${incPr ? "-0" : ""}`;
    }

    if (isX(tM)) {
      to = "";
    } else if (isX(tm)) {
      to = `<${+tM + 1}.0.0-0`;
    } else if (isX(tp)) {
      to = `<${tM}.${+tm + 1}.0-0`;
    } else if (tpr) {
      to = `<=${tM}.${tm}.${tp}-${tpr}`;
    } else if (incPr) {
      to = `<${tM}.${tm}.${+tp + 1}-0`;
    } else {
      to = `<=${to}`;
    }

    return `${from} ${to}`.trim();
  };
}

function testSet(
  set: Comparator[],
  version: SemVer,
  options: Options,
): boolean {
  for (let i = 0; i < set.length; i++) {
    if (!(set[i] as Comparator).test(version)) {
      return false;
    }
  }

  if (version.prerelease.length && !options.includePrerelease) {
    // A prerelease only satisfies the range if some comparator in the set
    // explicitly names a prerelease of the same [major, minor, patch] tuple.
    for (let i = 0; i < set.length; i++) {
      const comparator = set[i] as Comparator;
      if (comparator.semver === ANY) {
        continue;
      }
      const allowed = comparator.semver as SemVer;
      if (allowed.prerelease.length > 0) {
        if (
          allowed.major === version.major &&
          allowed.minor === version.minor &&
          allowed.patch === version.patch
        ) {
          return true;
        }
      }
    }
    return false;
  }

  return true;
}
