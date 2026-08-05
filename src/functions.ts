import { SemVer } from "./classes/semver.ts";
import { RELEASE_TYPES, type Options, type ReleaseType } from "./internal/constants.ts";
import {
  COERCE,
  COERCE_FULL,
  COERCE_FULL_RTL,
  COERCE_RTL,
} from "./internal/re.ts";

export function parse(
  version: string | SemVer | null | undefined,
  options?: boolean | Options,
  throwErrors = false,
): SemVer | null {
  if (version instanceof SemVer) {
    return version;
  }
  try {
    return new SemVer(version as string, options);
  } catch (er) {
    if (!throwErrors) {
      return null;
    }
    throw er;
  }
}

export function valid(
  version: string | SemVer | null | undefined,
  options?: boolean | Options,
): string | null {
  const v = parse(version, options);
  return v ? v.version : null;
}

export function clean(
  version: string,
  options?: boolean | Options,
): string | null {
  const s = parse(version.trim().replace(/^[=v]+/, ""), options);
  return s ? s.version : null;
}

export function inc(
  version: string | SemVer,
  release: ReleaseType | "pre" | "release",
  options?: boolean | Options | string,
  identifier?: string | boolean,
  identifierBase?: string | boolean,
): string | null {
  // Legacy call shape: inc(version, release, identifier, identifierBase)
  if (typeof options === "string") {
    identifierBase = identifier as string | boolean | undefined;
    identifier = options;
    options = undefined;
  }

  try {
    return new SemVer(
      version instanceof SemVer ? version.version : version,
      options as boolean | Options | undefined,
    ).inc(release, identifier as string | undefined, identifierBase).version;
  } catch {
    return null;
  }
}

export function diff(
  version1: string | SemVer,
  version2: string | SemVer,
): ReleaseType | null {
  const v1 = parse(version1, undefined, true) as SemVer;
  const v2 = parse(version2, undefined, true) as SemVer;
  const comparison = v1.compare(v2);

  if (comparison === 0) {
    return null;
  }

  const v1Higher = comparison > 0;
  const highVersion = v1Higher ? v1 : v2;
  const lowVersion = v1Higher ? v2 : v1;
  const highHasPre = !!highVersion.prerelease.length;
  const lowHasPre = !!lowVersion.prerelease.length;

  if (lowHasPre && !highHasPre) {
    // Going from a prerelease to a release.
    if (!lowVersion.patch && !lowVersion.minor) {
      return "major";
    }
    if (lowVersion.compareMain(highVersion) === 0) {
      if (lowVersion.minor && !lowVersion.patch) {
        return "minor";
      }
      return "patch";
    }
  }

  const prefix = highHasPre ? "pre" : "";

  if (v1.major !== v2.major) {
    return (prefix + "major") as ReleaseType;
  }
  if (v1.minor !== v2.minor) {
    return (prefix + "minor") as ReleaseType;
  }
  if (v1.patch !== v2.patch) {
    return (prefix + "patch") as ReleaseType;
  }
  return "prerelease";
}

/**
 * Drops every component below `truncation`. Any `pre*` truncation keeps the
 * prerelease and only strips build metadata; an unknown truncation is `null`.
 */
export function truncate(
  version: string | SemVer,
  truncation: ReleaseType,
  options?: boolean | Options,
): string | null {
  if (!(RELEASE_TYPES as readonly string[]).includes(truncation)) {
    return null;
  }

  const cloned = parse(
    version instanceof SemVer ? version.version : version,
    options,
  );
  if (!cloned) {
    return null;
  }

  if (truncation.startsWith("pre")) {
    return cloned.version;
  }

  cloned.prerelease = [];
  switch (truncation) {
    case "major":
      cloned.minor = 0;
      cloned.patch = 0;
      break;
    case "minor":
      cloned.patch = 0;
      break;
  }
  return cloned.format();
}

export function major(a: string | SemVer, loose?: boolean | Options): number {
  return new SemVer(a, loose).major;
}

export function minor(a: string | SemVer, loose?: boolean | Options): number {
  return new SemVer(a, loose).minor;
}

export function patch(a: string | SemVer, loose?: boolean | Options): number {
  return new SemVer(a, loose).patch;
}

export function prerelease(
  version: string | SemVer,
  options?: boolean | Options,
): ReadonlyArray<string | number> | null {
  const parsed = parse(version, options);
  return parsed && parsed.prerelease.length ? parsed.prerelease : null;
}

export function compare(
  a: string | SemVer,
  b: string | SemVer,
  loose?: boolean | Options,
): -1 | 0 | 1 {
  return new SemVer(a, loose).compare(new SemVer(b, loose));
}

export function rcompare(
  a: string | SemVer,
  b: string | SemVer,
  loose?: boolean | Options,
): -1 | 0 | 1 {
  return compare(b, a, loose);
}

export function compareLoose(
  a: string | SemVer,
  b: string | SemVer,
): -1 | 0 | 1 {
  return compare(a, b, true);
}

export function compareBuild(
  a: string | SemVer,
  b: string | SemVer,
  loose?: boolean | Options,
): -1 | 0 | 1 {
  const versionA = new SemVer(a, loose);
  const versionB = new SemVer(b, loose);
  return versionA.compare(versionB) || versionA.compareBuild(versionB);
}

export function sort<T extends string | SemVer>(
  list: T[],
  loose?: boolean | Options,
): T[] {
  return list.sort((a, b) => compareBuild(a, b, loose));
}

export function rsort<T extends string | SemVer>(
  list: T[],
  loose?: boolean | Options,
): T[] {
  return list.sort((a, b) => compareBuild(b, a, loose));
}

export function gt(
  a: string | SemVer,
  b: string | SemVer,
  loose?: boolean | Options,
): boolean {
  return compare(a, b, loose) > 0;
}

export function lt(
  a: string | SemVer,
  b: string | SemVer,
  loose?: boolean | Options,
): boolean {
  return compare(a, b, loose) < 0;
}

export function eq(
  a: string | SemVer,
  b: string | SemVer,
  loose?: boolean | Options,
): boolean {
  return compare(a, b, loose) === 0;
}

export function neq(
  a: string | SemVer,
  b: string | SemVer,
  loose?: boolean | Options,
): boolean {
  return compare(a, b, loose) !== 0;
}

export function gte(
  a: string | SemVer,
  b: string | SemVer,
  loose?: boolean | Options,
): boolean {
  return compare(a, b, loose) >= 0;
}

export function lte(
  a: string | SemVer,
  b: string | SemVer,
  loose?: boolean | Options,
): boolean {
  return compare(a, b, loose) <= 0;
}

export function cmp(
  a: string | SemVer,
  op: string,
  b: string | SemVer,
  loose?: boolean | Options,
): boolean {
  switch (op) {
    case "===":
      return strictValue(a) === strictValue(b);
    case "!==":
      return strictValue(a) !== strictValue(b);
    case "":
    case "=":
    case "==":
      return eq(a, b, loose);
    case "!=":
      return neq(a, b, loose);
    case ">":
      return gt(a, b, loose);
    case ">=":
      return gte(a, b, loose);
    case "<":
      return lt(a, b, loose);
    case "<=":
      return lte(a, b, loose);
    default:
      throw new TypeError(`Invalid operator: ${op}`);
  }
}

function strictValue(v: string | SemVer): string {
  return typeof v === "object" ? v.version : v;
}

export function coerce(
  version: string | number | SemVer | null | undefined,
  options?: Options,
): SemVer | null {
  if (version instanceof SemVer) {
    return version;
  }

  if (typeof version === "number") {
    version = String(version);
  }

  if (typeof version !== "string") {
    return null;
  }

  const opts = options || {};

  let match: RegExpExecArray | RegExpMatchArray | null = null;
  if (!opts.rtl) {
    match = version.match(opts.includePrerelease ? COERCE_FULL : COERCE);
  } else {
    // Find the right-most coercible substring, scanning left to right and
    // keeping the last match that is not a prefix of a longer later one.
    const re = opts.includePrerelease ? COERCE_FULL_RTL : COERCE_RTL;
    let next: RegExpExecArray | null;
    while (
      (next = re.exec(version)) &&
      (!match ||
        (match as RegExpMatchArray).index! + match[0].length !== version.length)
    ) {
      if (
        !match ||
        next.index + next[0].length !==
          (match as RegExpMatchArray).index! + match[0].length
      ) {
        match = next;
      }
      re.lastIndex = next.index + next[1]!.length + next[2]!.length;
    }
    re.lastIndex = -1;
  }

  if (match === null) {
    return null;
  }

  const majorPart = match[2];
  const minorPart = match[3] || "0";
  const patchPart = match[4] || "0";
  const pre = opts.includePrerelease && match[5] ? `-${match[5]}` : "";
  const build = opts.includePrerelease && match[6] ? `+${match[6]}` : "";

  return parse(`${majorPart}.${minorPart}.${patchPart}${pre}${build}`, opts);
}
