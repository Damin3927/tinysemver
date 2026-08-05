import { cmp } from "../functions.ts";
import type { Operator, Options } from "../internal/constants.ts";
import { parseOptions } from "../internal/parse-options.ts";
import { COMPARATOR, COMPARATOR_LOOSE } from "../internal/re.ts";
import { Range } from "./range.ts";
import { SemVer } from "./semver.ts";

/** Declared `unique symbol` so `x === ANY` narrows `SemVer | AnyComparator`. */
export const ANY: unique symbol = Symbol("SemVer ANY");
export type AnyComparator = typeof ANY;

export class Comparator {
  static get ANY(): AnyComparator {
    return ANY;
  }

  options!: Options;
  loose!: boolean;
  operator!: Operator;
  semver!: SemVer | AnyComparator;
  value!: string;

  constructor(comp: string | Comparator, optionsArg?: boolean | Options) {
    const options = parseOptions(optionsArg);

    if (comp instanceof Comparator) {
      if (comp.loose === !!options.loose) {
        return comp;
      }
      comp = comp.value;
    }

    comp = comp.trim().split(/\s+/).join(" ");
    this.options = options;
    this.loose = !!options.loose;
    this.parse(comp);

    if (this.semver === ANY) {
      this.value = "";
    } else {
      this.value = this.operator + (this.semver as SemVer).version;
    }
  }

  parse(comp: string): void {
    const r = this.options.loose ? COMPARATOR_LOOSE : COMPARATOR;
    const m = comp.match(r);

    if (!m) {
      throw new TypeError(`Invalid comparator: ${comp}`);
    }

    this.operator = (m[1] !== undefined ? m[1] : "") as Operator;
    if (this.operator === "=") {
      this.operator = "";
    }

    // `>=` with no version is the "any" comparator.
    if (!m[2]) {
      this.semver = ANY;
    } else {
      this.semver = new SemVer(m[2], this.options.loose);
    }
  }

  toString(): string {
    return this.value;
  }

  test(version: string | SemVer | AnyComparator): boolean {
    if (this.semver === ANY || version === ANY) {
      return true;
    }

    if (typeof version === "string") {
      try {
        version = new SemVer(version, this.options);
      } catch {
        return false;
      }
    }

    return cmp(
      version as SemVer,
      this.operator,
      this.semver as SemVer,
      this.options,
    );
  }

  intersects(comp: Comparator, optionsArg?: boolean | Options): boolean {
    if (!(comp instanceof Comparator)) {
      throw new TypeError("a Comparator is required");
    }

    if (this.operator === "") {
      if (this.value === "") {
        return true;
      }
      return new Range(comp.value, optionsArg).test(this.value);
    }
    if (comp.operator === "") {
      if (comp.value === "") {
        return true;
      }
      return new Range(this.value, optionsArg).test(comp.semver as SemVer);
    }

    const options = parseOptions(optionsArg);

    // `<0.0.0-0` is the null set: it intersects with nothing.
    if (
      options.includePrerelease &&
      (this.value === "<0.0.0-0" || comp.value === "<0.0.0-0")
    ) {
      return false;
    }
    if (
      !options.includePrerelease &&
      (this.value.startsWith("<0.0.0") || comp.value.startsWith("<0.0.0"))
    ) {
      return false;
    }

    // Same direction increasing.
    if (this.operator.startsWith(">") && comp.operator.startsWith(">")) {
      return true;
    }
    // Same direction decreasing.
    if (this.operator.startsWith("<") && comp.operator.startsWith("<")) {
      return true;
    }
    // Same version, both sides inclusive.
    if (
      (this.semver as SemVer).version === (comp.semver as SemVer).version &&
      this.operator.includes("=") &&
      comp.operator.includes("=")
    ) {
      return true;
    }
    // Opposite directions, this one lower.
    if (
      cmp(this.semver as SemVer, "<", comp.semver as SemVer, options) &&
      this.operator.startsWith(">") &&
      comp.operator.startsWith("<")
    ) {
      return true;
    }
    // Opposite directions, this one higher.
    if (
      cmp(this.semver as SemVer, ">", comp.semver as SemVer, options) &&
      this.operator.startsWith("<") &&
      comp.operator.startsWith(">")
    ) {
      return true;
    }

    return false;
  }
}
