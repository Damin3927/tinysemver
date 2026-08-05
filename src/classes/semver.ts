import {
  MAX_LENGTH,
  MAX_SAFE_INTEGER,
  type Options,
  type ReleaseType,
} from "../internal/constants.ts";
import { compareIdentifiers } from "../internal/identifiers.ts";
import { parseOptions } from "../internal/parse-options.ts";
import { FULL, LOOSE } from "../internal/re.ts";

export class SemVer {
  raw!: string;
  // Assigned after the `instanceof SemVer` fast path may return early.
  options!: Options;
  loose!: boolean;
  includePrerelease!: boolean;

  major!: number;
  minor!: number;
  patch!: number;
  prerelease!: Array<string | number>;
  build!: string[];
  version!: string;

  constructor(version: string | SemVer, optionsArg?: boolean | Options) {
    const options = parseOptions(optionsArg);

    if (version instanceof SemVer) {
      if (
        version.loose === !!options.loose &&
        version.includePrerelease === !!options.includePrerelease
      ) {
        return version;
      }
      version = version.version;
    } else if (typeof version !== "string") {
      throw new TypeError(
        `Invalid version. Must be a string. Got type "${typeof version}".`,
      );
    }

    if (version.length > MAX_LENGTH) {
      throw new TypeError(`version is longer than ${MAX_LENGTH} characters`);
    }

    this.options = options;
    this.loose = !!options.loose;
    this.includePrerelease = !!options.includePrerelease;

    const m = version.trim().match(options.loose ? LOOSE : FULL);
    if (!m) {
      throw new TypeError(`Invalid Version: ${version}`);
    }

    this.raw = version;

    this.major = +(m[1] as string);
    this.minor = +(m[2] as string);
    this.patch = +(m[3] as string);

    if (this.major > MAX_SAFE_INTEGER || this.major < 0) {
      throw new TypeError("Invalid major version");
    }
    if (this.minor > MAX_SAFE_INTEGER || this.minor < 0) {
      throw new TypeError("Invalid minor version");
    }
    if (this.patch > MAX_SAFE_INTEGER || this.patch < 0) {
      throw new TypeError("Invalid patch version");
    }

    if (!m[4]) {
      this.prerelease = [];
    } else {
      this.prerelease = m[4].split(".").map((id) => {
        if (/^[0-9]+$/.test(id)) {
          const num = +id;
          if (num >= 0 && num < MAX_SAFE_INTEGER) {
            return num;
          }
        }
        return id;
      });
    }

    this.build = m[5] ? m[5].split(".") : [];
    this.format();
  }

  format(): string {
    this.version = `${this.major}.${this.minor}.${this.patch}`;
    if (this.prerelease.length) {
      this.version += `-${this.prerelease.join(".")}`;
    }
    return this.version;
  }

  toString(): string {
    return this.version;
  }

  compare(other: string | SemVer): -1 | 0 | 1 {
    if (!(other instanceof SemVer)) {
      if (typeof other === "string" && other === this.version) {
        return 0;
      }
      other = new SemVer(other, this.options);
    }

    if (other.version === this.version) {
      return 0;
    }

    return this.compareMain(other) || this.comparePre(other);
  }

  compareMain(other: string | SemVer): -1 | 0 | 1 {
    if (!(other instanceof SemVer)) {
      other = new SemVer(other, this.options);
    }

    return (
      compareIdentifiers(this.major, other.major) ||
      compareIdentifiers(this.minor, other.minor) ||
      compareIdentifiers(this.patch, other.patch)
    );
  }

  comparePre(other: string | SemVer): -1 | 0 | 1 {
    if (!(other instanceof SemVer)) {
      other = new SemVer(other, this.options);
    }

    // A version with a prerelease has lower precedence than one without.
    if (this.prerelease.length && !other.prerelease.length) {
      return -1;
    }
    if (!this.prerelease.length && other.prerelease.length) {
      return 1;
    }
    if (!this.prerelease.length && !other.prerelease.length) {
      return 0;
    }

    return compareDotted(this.prerelease, other.prerelease);
  }

  compareBuild(other: string | SemVer): -1 | 0 | 1 {
    if (!(other instanceof SemVer)) {
      other = new SemVer(other, this.options);
    }

    return compareDotted(this.build, other.build);
  }

  inc(
    release: ReleaseType | "pre" | "release",
    identifier?: string,
    identifierBase?: string | boolean,
  ): this {
    if (release.startsWith("pre")) {
      if (!identifier && identifierBase === false) {
        throw new Error("invalid increment argument: identifier is empty");
      }
      // Reject an identifier that would produce an unparseable version.
      if (identifier) {
        const r = this.options.loose ? /^[0-9A-Za-z-]+$/ : /^[a-zA-Z0-9-]+$/;
        if (!r.test(identifier)) {
          throw new Error(`invalid identifier: ${identifier}`);
        }
      }
    }

    switch (release) {
      case "premajor":
        this.prerelease.length = 0;
        this.patch = 0;
        this.minor = 0;
        this.major++;
        this.inc("pre", identifier, identifierBase);
        break;
      case "preminor":
        this.prerelease.length = 0;
        this.patch = 0;
        this.minor++;
        this.inc("pre", identifier, identifierBase);
        break;
      case "prepatch":
        // If this is already a prerelease, it will bump to the next patch.
        this.prerelease.length = 0;
        this.inc("patch", identifier, identifierBase);
        this.inc("pre", identifier, identifierBase);
        break;
      case "prerelease":
        if (this.prerelease.length === 0) {
          this.inc("patch", identifier, identifierBase);
        }
        this.inc("pre", identifier, identifierBase);
        break;
      case "release":
        if (this.prerelease.length === 0) {
          throw new Error(`version ${this.raw} is not a prerelease`);
        }
        this.prerelease.length = 0;
        break;

      case "major":
        // A prerelease of a x.0.0 bumps to the release, not the next major.
        if (
          this.minor !== 0 ||
          this.patch !== 0 ||
          this.prerelease.length === 0
        ) {
          this.major++;
        }
        this.minor = 0;
        this.patch = 0;
        this.prerelease = [];
        break;
      case "minor":
        if (this.patch !== 0 || this.prerelease.length === 0) {
          this.minor++;
        }
        this.patch = 0;
        this.prerelease = [];
        break;
      case "patch":
        if (this.prerelease.length === 0) {
          this.patch++;
        }
        this.prerelease = [];
        break;

      case "pre": {
        const base = Number(identifierBase) ? 1 : 0;

        if (this.prerelease.length === 0) {
          this.prerelease = [base];
        } else {
          let i = this.prerelease.length;
          while (--i >= 0) {
            if (typeof this.prerelease[i] === "number") {
              (this.prerelease[i] as number)++;
              i = -2;
            }
          }
          if (i === -1) {
            // No numeric component to bump: `1.2.0-beta` -> `1.2.0-beta.0`
            if (
              identifier === this.prerelease.join(".") &&
              identifierBase === false
            ) {
              throw new Error(
                "invalid increment argument: identifier already exists",
              );
            }
            this.prerelease.push(base);
          }
        }

        if (identifier) {
          let prerelease: Array<string | number> = [identifier, base];
          if (identifierBase === false) {
            prerelease = [identifier];
          }
          if (compareIdentifiers(this.prerelease[0] as string, identifier) === 0) {
            // Coercing `isNaN`, not `Number.isNaN`: a missing second component
            // must count as NaN so `inc('0.0.0','premajor','0')` -> `1.0.0-0.0`.
            if (Number.isNaN(Number(this.prerelease[1]))) {
              this.prerelease = prerelease;
            }
          } else {
            this.prerelease = prerelease;
          }
        }
        break;
      }

      default:
        throw new Error(`invalid increment argument: ${release}`);
    }

    this.raw = this.format();
    if (this.build.length) {
      this.raw += `+${this.build.join(".")}`;
    }
    return this;
  }
}

function compareDotted(
  a: ReadonlyArray<string | number>,
  b: ReadonlyArray<string | number>,
): -1 | 0 | 1 {
  const len = Math.max(a.length, b.length);
  for (let i = 0; i <= len; i++) {
    const x = a[i];
    const y = b[i];
    if (x === undefined && y === undefined) return 0;
    if (y === undefined) return 1;
    if (x === undefined) return -1;
    if (x === y) continue;
    return compareIdentifiers(x, y);
  }
  return 0;
}
