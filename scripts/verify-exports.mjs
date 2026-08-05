/**
 * Resolve every public entry point the way a consumer actually would.
 *
 * The unit tests import from `src/`, and the smoke test reads files out of
 * `dist/` by path. Neither exercises the `exports` map, which is its own
 * program with its own failure modes — and it shipped broken once:
 * `slimsemver/functions/sort.js` resolved to `.../sort.js.js` and threw, while
 * `semver/functions/sort.js` worked. Storybook imports exactly that form.
 *
 * So this packs the real tarball, installs it into a scratch directory
 * alongside node-semver, and requires that every specifier resolve here if and
 * only if it resolves there.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const SUBPATHS = [
  "functions/parse", "functions/valid", "functions/clean", "functions/inc",
  "functions/diff", "functions/major", "functions/minor", "functions/patch",
  "functions/prerelease", "functions/compare", "functions/rcompare",
  "functions/compare-loose", "functions/compare-build", "functions/sort",
  "functions/rsort", "functions/gt", "functions/lt", "functions/eq",
  "functions/neq", "functions/gte", "functions/lte", "functions/cmp",
  "functions/coerce", "functions/satisfies",
  "classes/semver", "classes/range", "classes/comparator",
  "ranges/valid", "ranges/outside", "ranges/gtr", "ranges/ltr",
  "ranges/intersects", "ranges/simplify", "ranges/subset",
  "ranges/min-version", "ranges/max-satisfying", "ranges/min-satisfying",
  "ranges/to-comparators",
  "internals/identifiers",
  "preload",
];

const dir = mkdtempSync(join(tmpdir(), "slimsemver-exports-"));
const failures = [];

try {
  const tarball = execFileSync(
    "npm",
    ["pack", "--silent", "--ignore-scripts", "--pack-destination", dir],
    { encoding: "utf8" },
  ).trim();

  writeFileSync(
    join(dir, "package.json"),
    JSON.stringify({ name: "scratch", private: true, version: "0.0.0" }) + "\n",
  );
  execFileSync(
    "npm",
    ["install", "--silent", "--no-audit", "--no-fund", "semver", join(dir, tarball)],
    { cwd: dir, stdio: ["ignore", "ignore", "inherit"] },
  );

  // Probe in a child process so one bad specifier cannot abort the sweep.
  const probe = (pkg, spec, kind) => {
    const specifier = spec ? `${pkg}/${spec}` : pkg;
    const src =
      kind === "esm"
        ? `import x from ${JSON.stringify(specifier)}; console.log(typeof x)`
        : `console.log(typeof require(${JSON.stringify(specifier)}))`;
    try {
      return execFileSync(
        process.execPath,
        kind === "esm" ? ["--input-type=module", "-e", src] : ["-e", src],
        { cwd: dir, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
      ).trim();
    } catch {
      return null;
    }
  };

  let checked = 0;
  for (const spec of SUBPATHS) {
    // node-semver's deep paths are real files, so both forms are in the wild.
    for (const form of [spec, `${spec}.js`]) {
      for (const kind of ["esm", "cjs"]) {
        checked++;
        const expected = probe("semver", form, kind);
        const actual = probe("slimsemver", form, kind);
        if (expected !== null && actual === null) {
          failures.push(
            `${kind} ${form}: semver resolves it (${expected}), slimsemver does not`,
          );
        } else if (expected !== null && actual !== expected) {
          failures.push(
            `${kind} ${form}: semver gives ${expected}, slimsemver gives ${actual}`,
          );
        }
      }
    }
  }

  // The root entry, both ways.
  for (const kind of ["esm", "cjs"]) {
    checked++;
    const expected = probe("semver", "", kind);
    const actual = probe("slimsemver", "", kind);
    if (expected !== actual) {
      failures.push(`${kind} root: semver ${expected}, slimsemver ${actual}`);
    }
  }

  console.log(`exports: ${checked} specifiers resolved the same as node-semver`);
} finally {
  rmSync(dir, { recursive: true, force: true });
}

if (failures.length) {
  console.error("\nverify-exports FAILED:");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log("verify-exports: OK");
