export const SEMVER_SPEC_VERSION = "2.0.0";

export const MAX_LENGTH = 256;
export const MAX_SAFE_COMPONENT_LENGTH = 16;
export const MAX_SAFE_BUILD_LENGTH = MAX_LENGTH - 6;
export const MAX_SAFE_INTEGER = Number.MAX_SAFE_INTEGER || 9007199254740991;

export const RELEASE_TYPES = [
  "major",
  "premajor",
  "minor",
  "preminor",
  "patch",
  "prepatch",
  "prerelease",
] as const;

export type ReleaseType = (typeof RELEASE_TYPES)[number];

export type Operator = "" | "=" | "<" | ">" | "<=" | ">=";

export interface Options {
  loose?: boolean | undefined;
  includePrerelease?: boolean | undefined;
  rtl?: boolean | undefined;
}
