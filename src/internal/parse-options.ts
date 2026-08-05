import type { Options } from "./constants.ts";

const EMPTY: Options = Object.freeze({});
const LOOSE: Options = Object.freeze({ loose: true });

/**
 * node-semver's long-standing calling convention: a truthy non-object in the
 * options position means `{ loose: true }`. Kept for drop-in compatibility.
 */
export function parseOptions(options?: boolean | Options): Options {
  if (!options) return EMPTY;
  if (typeof options !== "object") return LOOSE;
  return options;
}
