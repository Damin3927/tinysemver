/**
 * Runs against the built artifact rather than the source, on every Node version
 * in `engines`. The differential suite needs native TypeScript execution and so
 * only runs on new Node; this is what proves the published files actually load
 * and behave on Node 18.
 *
 * Usage: node test/smoke.mjs
 */
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";

const require = createRequire(import.meta.url);
const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));

let checks = 0;
const ok = (cond, label) => {
  checks++;
  assert.ok(cond, label);
};
const eq = (a, b, label) => {
  checks++;
  assert.deepStrictEqual(a, b, label);
};

// --- ESM entry -------------------------------------------------------------
const esm = await import("../dist/esm/index.js");

eq(esm.satisfies("1.2.3", "^1.0.0"), true, "esm satisfies");
eq(esm.satisfies("2.0.0", "^1.0.0"), false, "esm satisfies false");
eq(esm.gt("2.0.0", "1.9.9"), true, "esm gt");
eq(esm.valid("v1.2.3"), "1.2.3", "esm valid strips v");
eq(esm.clean("  =v1.2.3   "), "1.2.3", "esm clean");
eq(esm.inc("1.2.3", "minor"), "1.3.0", "esm inc");
eq(esm.diff("1.2.3", "2.0.0"), "major", "esm diff");
eq(String(esm.coerce("v2.x")), "2.0.0", "esm coerce");
eq(esm.maxSatisfying(["1.0.0", "1.2.0", "2.0.0"], "^1.0.0"), "1.2.0", "esm maxSatisfying");
eq(esm.subset("^1.2.3", ">=1.0.0"), true, "esm subset");
eq(esm.truncate("1.2.3-beta.4+build", "minor"), "1.2.0", "esm truncate");
eq(String(new esm.Range("^1.2.3")), ">=1.2.3 <2.0.0-0", "esm Range toString");
ok(new esm.SemVer("1.2.3") instanceof esm.SemVer, "esm SemVer instanceof");
eq(esm.SEMVER_SPEC_VERSION, "2.0.0", "esm spec version");

// Default export must mirror `require('semver')`.
ok(typeof esm.default.satisfies === "function", "esm default has satisfies");
ok(typeof esm.default.SemVer === "function", "esm default has SemVer");

// --- CJS entry -------------------------------------------------------------
const cjs = require("../dist/cjs/index.js");
eq(cjs.satisfies("1.2.3", "^1.0.0"), true, "cjs satisfies");
eq(cjs.valid("1.2.3"), "1.2.3", "cjs valid");
ok(typeof cjs.SemVer === "function", "cjs SemVer");
ok(new cjs.Range("^1.0.0").test("1.5.0"), "cjs Range.test");

// --- Subpath compatibility with node-semver --------------------------------
const satisfiesEsm = (await import("../dist/esm/shims/functions/satisfies.js")).default;
eq(satisfiesEsm("1.2.3", "^1.0.0"), true, "esm subpath satisfies");

const SemVerEsm = (await import("../dist/esm/shims/classes/semver.js")).default;
eq(new SemVerEsm("1.2.3").major, 1, "esm subpath SemVer");

// node-semver's subpaths are `module.exports = fn`; ours must match exactly.
const satisfiesCjs = require("../dist/cjs/shims/functions/satisfies.js");
eq(typeof satisfiesCjs, "function", "cjs subpath is the bare function");
eq(satisfiesCjs("1.2.3", "^1.0.0"), true, "cjs subpath satisfies");

const idents = require("../dist/cjs/shims/internals/identifiers.js");
eq(typeof idents.compareIdentifiers, "function", "cjs internals/identifiers");

// Every deep path must resolve in both the bare and the `.js` form, because
// node-semver's are real files on disk and real code writes them both ways —
// Storybook, for one, imports `semver/functions/sort.js`. Resolution is not
// covered by the API tests, and this shipped broken once.
for (const spec of [
  "functions/sort", "functions/satisfies", "functions/gt", "functions/coerce",
  "classes/semver", "classes/range", "classes/comparator",
  "ranges/subset", "ranges/valid", "ranges/min-version",
  "internals/identifiers", "preload",
]) {
  for (const form of [spec, `${spec}.js`]) {
    const target = form.replace(/^([^/]+)\//, (_, dir) =>
      dir === "preload" ? "" : `${dir}/`);
    const rel = form === "preload" || form === "preload.js"
      ? "../dist/cjs/shims/preload.js"
      : `../dist/cjs/shims/${target.replace(/\.js$/, "")}.js`;
    ok(require(rel) !== undefined, `cjs deep path resolves: ${form}`);
  }
}

// --- Supply-chain invariants ----------------------------------------------
eq(pkg.dependencies ?? {}, {}, "package must have zero runtime dependencies");
for (const hook of ["preinstall", "install", "postinstall", "prepare"]) {
  eq(pkg.scripts?.[hook], undefined, `package must not define a ${hook} script`);
}

console.log(`smoke: ${checks} assertions passed on Node ${process.version}`);
