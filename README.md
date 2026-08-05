# slimsemver

A drop-in replacement for [`semver`](https://www.npmjs.com/package/semver) — same API, same behaviour, a fraction of the bytes.

[![CI](https://github.com/Damin3927/slimsemver/actions/workflows/ci.yml/badge.svg)](https://github.com/Damin3927/slimsemver/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/slimsemver.svg)](https://www.npmjs.com/package/slimsemver)
[![provenance](https://img.shields.io/badge/npm-provenance-blue)](https://docs.npmjs.com/generating-provenance-statements)
[![zero dependencies](https://img.shields.io/badge/dependencies-0-brightgreen)](package.json)

```sh
npm install slimsemver
```

```diff
- import semver from "semver";
+ import semver from "slimsemver";
```

That is the entire migration. Every export keeps its name, its signature, and its
semantics — including the awkward corners: `loose` mode, `includePrerelease`,
the `<0.0.0-0` null set, prerelease precedence, `coerce` with `rtl`, and the
`SemVer` / `Range` / `Comparator` classes.

## Why

Not for the bytes. `semver` is one function per file, so a bundler already drops
what you do not import — measured with esbuild, importing `semver/functions/gt.js`
costs 3.0 KB gzip against 3.1 KB here, and `semver/functions/satisfies.js` is
actually *smaller* than the equivalent import from this package. If you import
the whole namespace it is 8.6 KB against 6.9 KB, so about 1.7 KB. Real, but not a
reason to change a dependency.

Two things are worth changing a dependency for.

**Range parsing here is linear. In `semver` it is quadratic**, and that survived
the fix for CVE-2022-25883. A range built by repeating `"v= "` is not collapsed
by the whitespace normalisation that fix added, so it still rescans the same
prefix from every start position:

| range length | `slimsemver` | `semver@7.8.5` |
| --- | --- | --- |
| 6,000 | 4.4 ms | 89 ms |
| 12,000 | 4.2 ms | 354 ms |
| 24,000 | 8.2 ms | 1,325 ms |
| 48,000 | **17 ms** | **5,336 ms** |

Time quadruples as the input doubles. That matters if you parse range strings a
third party can influence — a registry manifest, a lockfile, a webhook, a form
field. Behaviour is unchanged: the differential suite below covers that boundary
explicitly.

**It is ESM, and it ships its own types**, so you can drop `@types/semver` and
stop paying for a CommonJS module in an ESM graph.

That is the whole pitch. If neither applies to you, `semver` is a fine library
and you should keep using it.

## What it costs, measured properly

Bundled with esbuild — minified, tree-shaken, gzipped. Reproduce with `npm run size`.

| import shape | `semver` | `slimsemver` |
| --- | --- | --- |
| default import, whole namespace | 8.6 KB | **6.9 KB** |
| named `satisfies` | 8.6 KB | **6.4 KB** |
| named `gt` / `lt` / `compare` | 8.6 KB | **6.4 KB** |
| deep path `functions/satisfies` | **5.6 KB** | 6.4 KB |
| deep path `functions/gt` | **3.0 KB** | 3.1 KB |
| deep path `major`/`minor`/`patch`/`prerelease` | 3.2 KB | **3.1 KB** |

Installed on disk the two are the same: 99 KB here, 98.7 KB for `semver`.

An earlier version of this README claimed 2.4–8× smaller. That number came from
summing the gzipped source of the module closure, which is not what a bundler
emits. It was wrong by about an order of magnitude and is corrected above.

## Why you can believe the compatibility claim

Compatibility here is not a promise in a README, it is a test that runs on every
commit.

`slimsemver` and `semver` are executed side by side across a corpus covering
every production in the range grammar, and the results must be **byte-identical
— including which inputs throw and with what error type**:

```
→ 119,796 differential cases vs node-semver, 0 mismatches
```

A **differential fuzzer** generates inputs rather than relying on the ones
somebody thought of — valid versions and ranges from the grammar, mutations of
them, and outright garbage — and requires the two libraries to agree on all of
them. It runs on every commit and soaks 4 million inputs nightly. It has already
earned its place: it found that `1.x.3` and `x.1.2` were accepted here and
rejected by `semver`, which no hand-written case had covered.

A third suite asserts that every name `semver` exports also exists here, with
the same kind and a compatible arity, so a rename or an omission fails the
build. That is how `truncate` — added to `semver` recently and easy to miss —
got caught before release.

Run it yourself:

```sh
npm ci && npm test
```

## Subpath imports work too

The deep paths that bundle-conscious code already uses are supported, including
their CommonJS `module.exports = fn` shape:

```js
import satisfies from "slimsemver/functions/satisfies";
import SemVer from "slimsemver/classes/semver";
import subset from "slimsemver/ranges/subset";
const gt = require("slimsemver/functions/gt");
```

Both ESM and CommonJS are shipped, with types for each.

## Known differences

One, and it is deliberate:

- **`re`, `src`, and `tokens` are not exported.** These are `semver`'s
  undocumented internals — a table of regexes addressed by numeric index. No
  part of `semver`'s README describes them, and mirroring the index assignments
  would freeze somebody else's implementation detail into this package's public
  API. Everything documented is present.

If you find any other divergence, that is a bug — please
[open an issue](https://github.com/Damin3927/slimsemver/issues) with the input.

## Security

Range parsing is **linear where node-semver's is quadratic**. A range built from
repeated `"v= "` makes `semver@7.8.5` rescan the same prefix from every start
position — 48,000 characters takes it 5.4 seconds, against 16 ms here — which
matters if anything you parse can be influenced by a third party. Behaviour is
unchanged; the differential suite covers that boundary explicitly.

Zero runtime dependencies. Nothing executes on install. Releases are published
from CI using [trusted publishing](https://docs.npmjs.com/trusted-publishers)
over OIDC — no npm token exists in this repository to be stolen — and carry a
signed
[provenance attestation](https://docs.npmjs.com/generating-provenance-statements)
linking the tarball to the commit that produced it:

```sh
npm audit signatures
```

See [SECURITY.md](SECURITY.md) for the full posture and threat model.

## Requirements

Node 18 or newer. Works in browsers and edge runtimes; no Node built-ins are
used at runtime.

## License

MIT © [Damin3927](https://github.com/Damin3927)

`semver` is a separate project by GitHub/npm, used here as a devDependency for
differential testing only. `slimsemver` is an independent implementation and is
not affiliated with or endorsed by it.
