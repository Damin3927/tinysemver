/**
 * Gate on what actually gets published.
 *
 * A `files` allowlist is easy to get wrong, and a compromised or careless
 * change can slip an extra file — a dotfile, a stray token, a lifecycle hook —
 * into the tarball without anyone reading the diff. So the tarball is built and
 * inspected in CI, and the build fails on anything unexpected.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync("package.json", "utf8"));

const failures = [];
const fail = (msg) => failures.push(msg);

// `npm pack --dry-run --json` reports the exact file list without writing it.
const packed = JSON.parse(
  execFileSync("npm", ["pack", "--dry-run", "--json", "--ignore-scripts"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
  }),
)[0];

const files = packed.files.map((f) => f.path).sort();

const ALLOWED = [
  /^package\.json$/,
  /^README\.md$/,
  /^LICENSE$/,
  /^dist\/(esm|cjs)\/package\.json$/,
  /^dist\/(esm|cjs)\/[\w./-]+\.(js|d\.ts)$/,
];

for (const f of files) {
  if (!ALLOWED.some((re) => re.test(f))) {
    fail(`unexpected file in tarball: ${f}`);
  }
}

// Things that must never ship.
for (const f of files) {
  if (/\.map$/.test(f)) fail(`source map in tarball: ${f}`);
  if (/\.tsbuildinfo$/.test(f)) fail(`build info in tarball: ${f}`);
  if (/(^|\/)\.(env|npmrc|git)/.test(f)) fail(`dotfile in tarball: ${f}`);
  if (/(^|\/)(test|scripts|src)\//.test(f)) fail(`non-dist source in tarball: ${f}`);
}

// Supply-chain invariants.
const deps = Object.keys(pkg.dependencies ?? {});
if (deps.length) fail(`runtime dependencies present: ${deps.join(", ")}`);

for (const hook of ["preinstall", "install", "postinstall", "prepare", "prepublish"]) {
  if (pkg.scripts?.[hook]) fail(`lifecycle script that runs on install: ${hook}`);
}

if (pkg.publishConfig?.provenance !== true) {
  fail("publishConfig.provenance must be true");
}
if (pkg.publishConfig?.access !== "public") {
  fail("publishConfig.access must be 'public'");
}

// Both entry points and every subpath target must exist in the tarball.
const set = new Set(files);
const required = [
  "dist/esm/index.js",
  "dist/esm/index.d.ts",
  "dist/cjs/index.js",
  "dist/cjs/index.d.ts",
  "dist/cjs/package.json",
  "dist/esm/shims/functions/satisfies.js",
  "dist/cjs/shims/functions/satisfies.js",
  "dist/esm/shims/classes/semver.js",
  "dist/esm/shims/ranges/subset.js",
  "dist/esm/shims/internals/identifiers.js",
  "dist/esm/shims/preload.js",
];
for (const f of required) {
  if (!set.has(f)) fail(`missing required file: ${f}`);
}

console.log(`tarball: ${files.length} files, ${(packed.size / 1024).toFixed(1)} KB packed, ${(packed.unpackedSize / 1024).toFixed(1)} KB unpacked`);

if (failures.length) {
  console.error("\nverify-package FAILED:");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log("verify-package: OK");
