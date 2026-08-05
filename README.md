# tinysemver

A drop-in replacement for [`semver`](https://www.npmjs.com/package/semver) — same API, same behaviour, a fraction of the bytes.

[![CI](https://github.com/Damin3927/tinysemver/actions/workflows/ci.yml/badge.svg)](https://github.com/Damin3927/tinysemver/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/tinysemver.svg)](https://www.npmjs.com/package/tinysemver)
[![provenance](https://img.shields.io/badge/npm-provenance-blue)](https://docs.npmjs.com/generating-provenance-statements)
[![zero dependencies](https://img.shields.io/badge/dependencies-0-brightgreen)](package.json)

```sh
npm install tinysemver
```

```diff
- import semver from "semver";
+ import semver from "tinysemver";
```

That is the entire migration. Every export keeps its name, its signature, and its
semantics — including the awkward corners: `loose` mode, `includePrerelease`,
the `<0.0.0-0` null set, prerelease precedence, `coerce` with `rtl`, and the
`SemVer` / `Range` / `Comparator` classes.

## Why

`semver` is excellent and correct, and 3.4 billion monthly downloads depend on
it. It is also CommonJS-only, ships no `exports` field, cannot be tree-shaken,
and costs 24.6 KB gzipped even if all you wanted was `satisfies`.

If you are writing a bundler plugin, an edge function, a browser-side version
check, or a CLI where startup time is visible, that is more than you meant to
pay. `tinysemver` is the same library with modern packaging.

## What you actually ship

Bundlers tree-shake per entry point, so the number that matters is the closure
of what you import, not the size of the package.

| you import | gzip | vs `semver` |
| --- | --- | --- |
| the whole namespace | **11.0 KB** | 2.2× smaller |
| `satisfies` | **10.5 KB** | 2.3× smaller |
| `gt` / `lt` / `compare` | **4.7 KB** | 5.2× smaller |
| `valid` / `parse` | **4.7 KB** | 5.2× smaller |
| `coerce` | **4.7 KB** | 5.2× smaller |
| `SemVer` class | **3.2 KB** | 7.7× smaller |
| `semver` (whole package, cannot tree-shake) | 24.6 KB | — |

Reproduce with `npm run size`.

## Why you can believe the compatibility claim

Compatibility here is not a promise in a README, it is a test that runs on every
commit.

`tinysemver` and `semver` are executed side by side across a corpus covering
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
import satisfies from "tinysemver/functions/satisfies";
import SemVer from "tinysemver/classes/semver";
import subset from "tinysemver/ranges/subset";
const gt = require("tinysemver/functions/gt");
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
[open an issue](https://github.com/Damin3927/tinysemver/issues) with the input.

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
differential testing only. `tinysemver` is an independent implementation and is
not affiliated with or endorsed by it.
