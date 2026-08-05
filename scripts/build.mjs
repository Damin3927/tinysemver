import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const dist = join(root, "dist");

/**
 * node-semver exposes deep subpaths (`semver/functions/satisfies`) that
 * bundle-size-conscious consumers import directly. Being a drop-in means
 * honouring those too, including their CommonJS `module.exports = fn` shape,
 * which `tsc` cannot emit from an ES module. So they are generated verbatim.
 *
 * kebab file name -> exported binding in the compiled module.
 */
const SUBPATHS = {
  functions: {
    module: "functions.js",
    single: {
      parse: "parse",
      valid: "valid",
      clean: "clean",
      inc: "inc",
      diff: "diff",
      major: "major",
      minor: "minor",
      patch: "patch",
      prerelease: "prerelease",
      compare: "compare",
      rcompare: "rcompare",
      "compare-loose": "compareLoose",
      "compare-build": "compareBuild",
      sort: "sort",
      rsort: "rsort",
      gt: "gt",
      lt: "lt",
      eq: "eq",
      neq: "neq",
      gte: "gte",
      lte: "lte",
      cmp: "cmp",
      coerce: "coerce",
      truncate: "truncate",
    },
  },
  "functions-ranges": {
    module: "ranges.js",
    dir: "functions",
    single: { satisfies: "satisfies" },
  },
  classes: {
    module: null,
    single: {
      semver: ["classes/semver.js", "SemVer"],
      range: ["classes/range.js", "Range"],
      comparator: ["classes/comparator.js", "Comparator"],
    },
  },
  ranges: {
    module: "ranges.js",
    single: {
      valid: "validRange",
      outside: "outside",
      gtr: "gtr",
      ltr: "ltr",
      intersects: "intersects",
      simplify: "simplifyRange",
      subset: "subset",
      "min-version": "minVersion",
      "max-satisfying": "maxSatisfying",
      "min-satisfying": "minSatisfying",
      "to-comparators": "toComparators",
    },
  },
  internals: {
    module: "internal/identifiers.js",
    named: {
      identifiers: ["compareIdentifiers", "rcompareIdentifiers"],
    },
  },
};

function compile(config) {
  execFileSync(
    process.execPath,
    [join(root, "node_modules", "typescript", "bin", "tsc"), "-p", config],
    { cwd: root, stdio: "inherit" },
  );
}

function emit(format, relPath, contents) {
  const full = join(dist, format, relPath);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, contents);
}

function shimSingle(format, dir, file, moduleRel, binding) {
  const from = `../../${moduleRel}`;
  if (format === "esm") {
    emit(
      "esm",
      `shims/${dir}/${file}.js`,
      `export { ${binding} as default } from "${from}";\n`,
    );
    emit(
      "esm",
      `shims/${dir}/${file}.d.ts`,
      `import { ${binding} } from "${from}";\n` +
        `export default ${binding};\n`,
    );
  } else {
    emit(
      "cjs",
      `shims/${dir}/${file}.js`,
      `"use strict";\nmodule.exports = require("${from}").${binding};\n`,
    );
    emit(
      "cjs",
      `shims/${dir}/${file}.d.ts`,
      `import { ${binding} } from "${from}";\n` + `export = ${binding};\n`,
    );
  }
}

function shimNamed(format, dir, file, moduleRel, bindings) {
  const from = `../../${moduleRel}`;
  const list = bindings.join(", ");
  if (format === "esm") {
    emit("esm", `shims/${dir}/${file}.js`, `export { ${list} } from "${from}";\n`);
    emit(
      "esm",
      `shims/${dir}/${file}.d.ts`,
      `export { ${list} } from "${from}";\n`,
    );
  } else {
    emit(
      "cjs",
      `shims/${dir}/${file}.js`,
      `"use strict";\nconst m = require("${from}");\n` +
        bindings.map((b) => `exports.${b} = m.${b};`).join("\n") +
        "\n",
    );
    emit(
      "cjs",
      `shims/${dir}/${file}.d.ts`,
      `export { ${list} } from "${from}";\n`,
    );
  }
}

function generateShims(format) {
  for (const group of Object.values(SUBPATHS)) {
    const dir = group.dir ?? Object.keys(SUBPATHS).find((k) => SUBPATHS[k] === group);
    const outDir = group.dir ?? dir;
    for (const [file, target] of Object.entries(group.single ?? {})) {
      const [moduleRel, binding] = Array.isArray(target)
        ? target
        : [group.module, target];
      shimSingle(format, outDir, file, moduleRel, binding);
    }
    for (const [file, bindings] of Object.entries(group.named ?? {})) {
      shimNamed(format, outDir, file, group.module, bindings);
    }
  }

  // `semver/preload` exists purely to warm the module cache.
  if (format === "esm") {
    emit("esm", "shims/preload.js", `export * from "../index.js";\nexport { default } from "../index.js";\n`);
    emit("esm", "shims/preload.d.ts", `export * from "../index.js";\nexport { default } from "../index.js";\n`);
  } else {
    emit("cjs", "shims/preload.js", `"use strict";\nmodule.exports = require("../index.js");\n`);
    emit("cjs", "shims/preload.d.ts", `import m = require("../index.js");\nexport = m;\n`);
  }
}

rmSync(dist, { recursive: true, force: true });

compile("tsconfig.esm.json");
compile("tsconfig.cjs.json");

// The root package is ESM; the CJS tree needs its own opt-out.
writeFileSync(
  join(dist, "cjs", "package.json"),
  JSON.stringify({ type: "commonjs" }, null, 2) + "\n",
);
writeFileSync(
  join(dist, "esm", "package.json"),
  JSON.stringify({ type: "module" }, null, 2) + "\n",
);

generateShims("esm");
generateShims("cjs");

console.log("build: dist/esm + dist/cjs + subpath shims");
