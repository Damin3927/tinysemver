/**
 * Measures what a bundler actually emits.
 *
 * This script used to sum the gzipped source of the transitive module closure.
 * That number is not what ships: it skips minification, and it counts whole
 * modules where a bundler does dead-code elimination inside them. It overstated
 * the difference by roughly an order of magnitude, and the wrong figure reached
 * the README and a pull request against another project before anyone checked
 * it against a real build.
 *
 * So it now runs esbuild — bundle, minify, tree-shake, gzip — over the same
 * import shapes for both libraries, and prints them side by side.
 */
import { execFileSync } from "node:child_process";
import { gzipSync } from "node:zlib";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { build } from "esbuild";

// Both libraries are resolved from a real install, so the numbers reflect the
// published `exports` map rather than whatever the working tree happens to be.
const dir = mkdtempSync(join(tmpdir(), "slimsemver-size-"));
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

async function bundle(code) {
  const entry = join(dir, "entry.mjs");
  writeFileSync(entry, code);
  const result = await build({
    entryPoints: [entry],
    bundle: true,
    minify: true,
    treeShaking: true,
    format: "esm",
    platform: "browser",
    write: false,
    absWorkingDir: dir,
  });
  const out = result.outputFiles[0].contents;
  return { min: out.length, gzip: gzipSync(out, { level: 9 }).length };
}

/** Each case is the same program written against each library. */
const CASES = [
  {
    label: "default import, whole namespace",
    semver: 'import s from "semver"; console.log(s);',
    slim: 'import * as s from "slimsemver"; console.log(s);',
  },
  {
    label: "named: satisfies",
    semver: 'import { satisfies } from "semver"; console.log(satisfies);',
    slim: 'import { satisfies } from "slimsemver"; console.log(satisfies);',
  },
  {
    label: "named: gt / lt / compare",
    semver: 'import { gt, lt, compare } from "semver"; console.log(gt, lt, compare);',
    slim: 'import { gt, lt, compare } from "slimsemver"; console.log(gt, lt, compare);',
  },
  {
    label: "deep path: satisfies",
    semver: 'import x from "semver/functions/satisfies.js"; console.log(x);',
    slim: 'import x from "slimsemver/functions/satisfies"; console.log(x);',
  },
  {
    label: "deep path: gt",
    semver: 'import x from "semver/functions/gt.js"; console.log(x);',
    slim: 'import x from "slimsemver/functions/gt"; console.log(x);',
  },
  {
    label: "deep path: major/minor/patch/prerelease",
    semver:
      'import a from "semver/functions/major.js"; import b from "semver/functions/minor.js"; import c from "semver/functions/patch.js"; import d from "semver/functions/prerelease.js"; console.log(a,b,c,d);',
    slim:
      'import a from "slimsemver/functions/major"; import b from "slimsemver/functions/minor"; import c from "slimsemver/functions/patch"; import d from "slimsemver/functions/prerelease"; console.log(a,b,c,d);',
  },
];

const kb = (n) => `${(n / 1024).toFixed(1)} KB`;

try {
  const rows = [];
  for (const c of CASES) {
    const a = await bundle(c.semver);
    const b = await bundle(c.slim);
    const delta = a.gzip - b.gzip;
    rows.push([
      c.label,
      kb(a.gzip),
      kb(b.gzip),
      `${delta >= 0 ? "-" : "+"}${kb(Math.abs(delta))}`,
    ]);
  }

  const head = ["import shape", "semver", "slimsemver", "delta"];
  const w = head.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i].length)));
  const line = (cells) => cells.map((c, i) => c.padEnd(w[i])).join("  ").trimEnd();

  console.log("bundled with esbuild (minified, tree-shaken, gzip)\n");
  console.log(line(head));
  console.log(w.map((n) => "-".repeat(n)).join("  "));
  for (const r of rows) console.log(line(r));
  console.log(
    "\nsemver is one function per file, so a bundler already drops what you do\n" +
      "not import. Size is not the reason to switch — see the README.",
  );
} finally {
  rmSync(dir, { recursive: true, force: true });
}
