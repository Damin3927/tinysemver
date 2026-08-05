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

/**
 * The leading `v`/`=`/whitespace noise a loose version may carry.
 *
 * Unbounded, this is the last quadratic vector that survives whitespace
 * normalisation: `"v= "` repeated is not collapsible, so an *unanchored* scan
 * rescans the prefix from every start position. Measured on node-semver itself,
 * a 24,000-character `"v= "` range takes ~1.4s and quadruples with each
 * doubling of length.
 *
 * It only bites where the pattern is applied unanchored to a whole range
 * string, which is `COMPARATOR_TRIM` alone. Everywhere else the pattern is
 * anchored and runs against a single short token, where an unbounded prefix
 * costs nothing. So the bounded form is used exclusively for that one pattern,
 * and every other use keeps node-semver's semantics exactly — including loose
 * mode accepting an arbitrarily long prefix.
 */
const LEADING_NOISE = "[v=\\s]*";
const LEADING_NOISE_BOUNDED = "[v=\\s]{0,16}";

const plainFull = (num: string, lax: boolean, noise = LEADING_NOISE) =>
  `${lax ? noise : "v?"}${main(num)}${prerelease(num, lax)}?${BUILD}?`;

export const FULL_PLAIN = plainFull(NUMERIC, false);
export const LOOSE_PLAIN = plainFull(NUMERIC_LOOSE, true);

export const FULL = new RegExp(`^${FULL_PLAIN}$`);
export const LOOSE = new RegExp(`^${LOOSE_PLAIN}$`);

const GTLT = "((?:<|>)?=?)";

const xrangePlain = (num: string, lax: boolean, noise = LEADING_NOISE) => {
  const xid = `${num}|x|X|\\*`;
  return (
    `${noise}(${xid})` +
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

/**
 * The `_TRIM` patterns below use `\s?` where node-semver uses `\s*`/`\s+`.
 *
 * `(\s*)X\s+` is polynomial: on a long run of whitespace the engine rescans the
 * run from every start position. node-semver gets away with it because the
 * Range constructor collapses whitespace first — but `parseRange` is public, so
 * the guarantee cannot live only at the call site. `Range.parseRange` therefore
 * normalises its own input, and these patterns are written to the post-
 * normalisation alphabet, where a whitespace run is always exactly one space.
 * Bounded quantifiers make them linear while matching identically.
 */
export const TILDE = new RegExp(`^(?:~>?)${XRANGE_PLAIN}$`);
export const TILDE_LOOSE = new RegExp(`^(?:~>?)${XRANGE_PLAIN_LOOSE}$`);
export const TILDE_TRIM = new RegExp("(\\s?)(?:~>?)\\s", "g");

export const CARET = new RegExp(`^(?:\\^)${XRANGE_PLAIN}$`);
export const CARET_LOOSE = new RegExp(`^(?:\\^)${XRANGE_PLAIN_LOOSE}$`);
export const CARET_TRIM = new RegExp("(\\s?)(?:\\^)\\s", "g");

export const COMPARATOR = new RegExp(`^${GTLT}\\s*(${FULL_PLAIN})$|^$`);
export const COMPARATOR_LOOSE = new RegExp(`^${GTLT}\\s*(${LOOSE_PLAIN})$|^$`);
// The only unanchored, whole-string pattern, and therefore the only one where
// an unbounded leading-noise prefix is quadratic. See LEADING_NOISE_BOUNDED.
export const COMPARATOR_TRIM = new RegExp(
  `(\\s?)${GTLT}\\s?(${plainFull(NUMERIC_LOOSE, true, LEADING_NOISE_BOUNDED)}|${xrangePlain(NUMERIC, false, LEADING_NOISE_BOUNDED)})`,
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

// `\\s?` for the same reason as the trim patterns: comparator text is
// whitespace-normalised before this runs, so a run is never longer than one.
export const STAR = new RegExp("(<|>)?=?\\s?\\*");
export const GTE0 = new RegExp("^\\s?>=\\s?0\\.0\\.0\\s?$");
export const GTE0_PRE = new RegExp("^\\s?>=\\s?0\\.0\\.0-0\\s?$");

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
