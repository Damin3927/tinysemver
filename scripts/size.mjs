/**
 * Reports what a consumer actually ships.
 *
 * The whole-package number flatters nobody: what matters for a tree-shaking
 * bundler is the transitive module closure of the entry points you import. So
 * resolve that closure per public API and gzip only those modules.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { gzipSync } from "node:zlib";

const root = resolve(import.meta.dirname, "..");
const esm = join(root, "dist", "esm");

const IMPORT_RE = /(?:from|import)\s*["']([^"']+)["']/g;

function closure(entry) {
  const seen = new Set();
  const stack = [entry];
  while (stack.length) {
    const file = stack.pop();
    if (seen.has(file)) continue;
    seen.add(file);
    const src = readFileSync(file, "utf8");
    for (const m of src.matchAll(IMPORT_RE)) {
      const spec = m[1];
      if (!spec.startsWith(".")) continue;
      stack.push(resolve(dirname(file), spec));
    }
  }
  return seen;
}

const gzipOf = (files) => {
  let raw = 0;
  let gz = 0;
  for (const f of files) {
    const b = readFileSync(f);
    raw += b.length;
    gz += gzipSync(b, { level: 9 }).length;
  }
  return { raw, gz };
};

function walk(dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.js$/.test(p)) out.push(p);
  }
  return out;
}

const kb = (n) => `${(n / 1024).toFixed(1)} KB`;

const ENTRIES = {
  "everything (import * from 'slimsemver')": join(esm, "index.js"),
  "satisfies": join(esm, "shims", "functions", "satisfies.js"),
  "gt / lt / compare": join(esm, "shims", "functions", "gt.js"),
  "valid / parse": join(esm, "shims", "functions", "parse.js"),
  "coerce": join(esm, "shims", "functions", "coerce.js"),
  "SemVer class": join(esm, "shims", "classes", "semver.js"),
  "subset": join(esm, "shims", "ranges", "subset.js"),
};

console.log("slimsemver — shipped bytes by entry point (gzip, tree-shaken closure)\n");
const rows = [];
for (const [label, entry] of Object.entries(ENTRIES)) {
  const files = closure(entry);
  const { raw, gz } = gzipOf(files);
  rows.push([label, String(files.size), kb(raw), kb(gz)]);
}

const semverDir = join(root, "node_modules", "semver");
let semverRow = null;
try {
  statSync(semverDir);
  const files = walk(semverDir).filter((f) => !f.includes(`${"semver"}/node_modules`));
  const { raw, gz } = gzipOf(files);
  semverRow = ["semver (whole package, no tree-shaking)", String(files.length), kb(raw), kb(gz)];
} catch {
  /* semver is a devDependency; absent in a production install */
}

const all = semverRow ? [...rows, semverRow] : rows;
const head = ["entry point", "modules", "raw", "gzip"];
const widths = head.map((h, i) =>
  Math.max(h.length, ...all.map((r) => r[i].length)),
);
const line = (cells) =>
  cells.map((c, i) => c.padEnd(widths[i])).join("  ").trimEnd();

console.log(line(head));
console.log(widths.map((w) => "-".repeat(w)).join("  "));
for (const r of rows) console.log(line(r));
if (semverRow) {
  console.log(widths.map((w) => "-".repeat(w)).join("  "));
  console.log(line(semverRow));
}
