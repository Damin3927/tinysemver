import { MAX_SAFE_BUILD_LENGTH, MAX_SAFE_COMPONENT_LENGTH } from "./constants.ts";

/**
 * Source strings are built from the range grammar published in the SemVer spec
 * and in node-semver's README, then compiled once at module load.
 *
 * The `loose` variants relax three things the strict grammar forbids: leading
 * zeroes in numeric identifiers, a missing `-` before a prerelease, and leading
 * `v`/`=`/whitespace noise.
 */

const NUMERIC = "0|[1-9]\\d*";
const NUMERIC_LOOSE = "\\d+";
const NON_NUMERIC = "\\d*[a-zA-Z-][a-zA-Z0-9-]*";

const BUILD_ID = "[a-zA-Z0-9-]+";
const BUILD = `(?:\\+(${BUILD_ID}(?:\\.${BUILD_ID})*))`;

const main = (num: string) => `(${num})\\.(${num})\\.(${num})`;
/**
 * The non-numeric alternative must come first. Alternation is ordered, so
 * putting the numeric branch first would make `1abc` match as `1` and leave
 * `abc` behind instead of matching the whole identifier.
 */
const prerelease = (num: string, lax: boolean) => {
  const id = `(?:${NON_NUMERIC}|${num})`;
  return `(?:-${lax ? "?" : ""}(${id}(?:\\.${id})*))`;
};

const plainFull = (num: string, lax: boolean) =>
  `${lax ? "[v=\\s]*" : "v?"}${main(num)}${prerelease(num, lax)}?${BUILD}?`;

export const FULL_PLAIN = plainFull(NUMERIC, false);
export const LOOSE_PLAIN = plainFull(NUMERIC_LOOSE, true);

export const FULL = new RegExp(`^${FULL_PLAIN}$`);
export const LOOSE = new RegExp(`^${LOOSE_PLAIN}$`);

const GTLT = "((?:<|>)?=?)";

const xrangePlain = (num: string, lax: boolean) => {
  const xid = `${num}|x|X|\\*`;
  return (
    `[v=\\s]*(${xid})` +
    `(?:\\.(${xid})` +
    `(?:\\.(${xid})` +
    `(?:${prerelease(num, lax)})?${BUILD}?` +
    `)?)?`
  );
};

export const XRANGE_PLAIN = xrangePlain(NUMERIC, false);
export const XRANGE_PLAIN_LOOSE = xrangePlain(NUMERIC_LOOSE, true);

export const XRANGE = new RegExp(`^${GTLT}\\s*${XRANGE_PLAIN}$`);
export const XRANGE_LOOSE = new RegExp(`^${GTLT}\\s*${XRANGE_PLAIN_LOOSE}$`);

export const TILDE = new RegExp(`^(?:~>?)${XRANGE_PLAIN}$`);
export const TILDE_LOOSE = new RegExp(`^(?:~>?)${XRANGE_PLAIN_LOOSE}$`);
export const TILDE_TRIM = new RegExp("(\\s*)(?:~>?)\\s+", "g");

export const CARET = new RegExp(`^(?:\\^)${XRANGE_PLAIN}$`);
export const CARET_LOOSE = new RegExp(`^(?:\\^)${XRANGE_PLAIN_LOOSE}$`);
export const CARET_TRIM = new RegExp("(\\s*)(?:\\^)\\s+", "g");

export const COMPARATOR = new RegExp(`^${GTLT}\\s*(${FULL_PLAIN})$|^$`);
export const COMPARATOR_LOOSE = new RegExp(`^${GTLT}\\s*(${LOOSE_PLAIN})$|^$`);
export const COMPARATOR_TRIM = new RegExp(
  `(\\s*)${GTLT}\\s*(${LOOSE_PLAIN}|${XRANGE_PLAIN})`,
  "g",
);

export const HYPHENRANGE = new RegExp(
  `^\\s*(${XRANGE_PLAIN})\\s+-\\s+(${XRANGE_PLAIN})\\s*$`,
);
export const HYPHENRANGE_LOOSE = new RegExp(
  `^\\s*(${XRANGE_PLAIN_LOOSE})\\s+-\\s+(${XRANGE_PLAIN_LOOSE})\\s*$`,
);

/** Strips `+build` metadata from a range so it cannot bleed into a version. */
export const BUILD_STRIP = new RegExp(BUILD, "g");

export const STAR = new RegExp("(<|>)?=?\\s*\\*");
export const GTE0 = new RegExp("^\\s*>=\\s*0\\.0\\.0\\s*$");
export const GTE0_PRE = new RegExp("^\\s*>=\\s*0\\.0\\.0-0\\s*$");

const COERCE_PLAIN =
  `(^|[^\\d])` +
  `(\\d{1,${MAX_SAFE_COMPONENT_LENGTH}})` +
  `(?:\\.(\\d{1,${MAX_SAFE_COMPONENT_LENGTH}}))?` +
  `(?:\\.(\\d{1,${MAX_SAFE_COMPONENT_LENGTH}}))?`;

const COERCE_SRC = `${COERCE_PLAIN}(?:$|[^\\d])`;
const COERCE_FULL_SRC =
  COERCE_PLAIN +
  `(?:${prerelease(NUMERIC, false)})?` +
  `(?:\\+([0-9A-Za-z-]+(?:\\.[0-9A-Za-z-]+)*))?` +
  `(?:$|[^\\d])`;

export const COERCE = new RegExp(COERCE_SRC);
export const COERCE_FULL = new RegExp(COERCE_FULL_SRC);
export const COERCE_RTL = new RegExp(COERCE_SRC, "g");
export const COERCE_FULL_RTL = new RegExp(COERCE_FULL_SRC, "g");

export { MAX_SAFE_BUILD_LENGTH };
