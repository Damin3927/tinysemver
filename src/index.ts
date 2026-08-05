export { Comparator } from "./classes/comparator.ts";
export { Range } from "./classes/range.ts";
export { SemVer } from "./classes/semver.ts";

export {
  RELEASE_TYPES,
  SEMVER_SPEC_VERSION,
  type Operator,
  type Options,
  type ReleaseType,
} from "./internal/constants.ts";
export {
  compareIdentifiers,
  rcompareIdentifiers,
} from "./internal/identifiers.ts";

export {
  clean,
  cmp,
  coerce,
  compare,
  compareBuild,
  compareLoose,
  diff,
  eq,
  gt,
  gte,
  inc,
  lt,
  lte,
  major,
  minor,
  neq,
  parse,
  patch,
  prerelease,
  rcompare,
  rsort,
  sort,
  truncate,
  valid,
} from "./functions.ts";

export {
  gtr,
  intersects,
  ltr,
  maxSatisfying,
  minSatisfying,
  minVersion,
  outside,
  satisfies,
  simplifyRange,
  subset,
  toComparators,
  validRange,
} from "./ranges.ts";

import { Comparator } from "./classes/comparator.ts";
import { Range } from "./classes/range.ts";
import { SemVer } from "./classes/semver.ts";
import {
  clean,
  cmp,
  coerce,
  compare,
  compareBuild,
  compareLoose,
  diff,
  eq,
  gt,
  gte,
  inc,
  lt,
  lte,
  major,
  minor,
  neq,
  parse,
  patch,
  prerelease,
  rcompare,
  rsort,
  sort,
  truncate,
  valid,
} from "./functions.ts";
import { RELEASE_TYPES, SEMVER_SPEC_VERSION } from "./internal/constants.ts";
import {
  compareIdentifiers,
  rcompareIdentifiers,
} from "./internal/identifiers.ts";
import {
  gtr,
  intersects,
  ltr,
  maxSatisfying,
  minSatisfying,
  minVersion,
  outside,
  satisfies,
  simplifyRange,
  subset,
  toComparators,
  validRange,
} from "./ranges.ts";

/**
 * Namespace object matching `require('semver')`, so that
 * `import semver from 'slimsemver'` behaves like the package it replaces.
 */
export default {
  parse,
  valid,
  clean,
  inc,
  diff,
  major,
  minor,
  patch,
  prerelease,
  compare,
  rcompare,
  compareLoose,
  compareBuild,
  sort,
  rsort,
  gt,
  lt,
  eq,
  neq,
  gte,
  lte,
  cmp,
  coerce,
  truncate,
  Comparator,
  Range,
  satisfies,
  toComparators,
  maxSatisfying,
  minSatisfying,
  minVersion,
  validRange,
  outside,
  gtr,
  ltr,
  intersects,
  simplifyRange,
  subset,
  SemVer,
  RELEASE_TYPES,
  SEMVER_SPEC_VERSION,
  compareIdentifiers,
  rcompareIdentifiers,
};
