# Security Policy

## Reporting a vulnerability

Report privately through
[GitHub Security Advisories](https://github.com/Damin3927/tinysemver/security/advisories/new).
Please do not open a public issue for a suspected vulnerability.

Expect an acknowledgement within 72 hours and a fix or a stated timeline within
14 days.

## Supported versions

The latest minor of the current major receives security fixes.

## Supply-chain posture

`tinysemver` parses untrusted strings, and it tends to sit deep in dependency
trees where nobody reads its diffs. Both facts inform how it is built and
released.

**Nothing runs on install.** Zero runtime dependencies, and no `preinstall`,
`install`, `postinstall`, or `prepare` script. Installing this package copies
files and executes nothing. CI asserts this on every commit
(`scripts/verify-package.mjs`).

**No npm token exists.** Publishing uses npm
[trusted publishing](https://docs.npmjs.com/trusted-publishers) over GitHub
OIDC: the release workflow mints a short-lived, workflow-scoped credential. No
long-lived token is stored in the repository, in GitHub secrets, or on a
maintainer's machine, so there is nothing to exfiltrate or rotate.

**Releases are attested.** Published with `--provenance`, so npm records a
signed, verifiable link from the tarball back to the exact commit and workflow
run that produced it. Verify with `npm audit signatures`.

> One exception, stated plainly: `1.0.0` was published from a maintainer
> machine and therefore has no provenance. npm only lets a trusted publisher be
> configured on a package that already exists, so a brand-new name cannot have
> an attested first release. `1.0.0` exists to claim the name and enable that
> configuration; every version after it is published by the release workflow
> with provenance.

**The published tarball is inspected, not trusted.** CI builds the tarball and
fails on any file outside a strict allowlist — no source maps, no dotfiles, no
`src/`, no `test/`. The `files` field is a starting point, not the check.

**Actions are pinned by commit SHA**, not by moving tag, so a compromised or
retagged action cannot silently enter the release path. Dependabot keeps the
pins current. Workflows declare `contents: read` and opt into more only where
required, and check out with `persist-credentials: false`.

**The toolchain is deliberately small.** Building and testing needs only
TypeScript and Node's built-in test runner. `node-semver` is a devDependency
used solely as the differential oracle and never ships.

**Denial of service is treated as a bug, and the claim is tested.**
`test/redos.test.ts` runs pathological input — 50,000-character whitespace and
digit runs, 2,000-way range unions, oversized prereleases — through the public
API under a wall-clock budget, so a complexity regression fails CI rather than
shipping.

Concretely: the tilde and caret trim patterns use bounded quantifiers instead of
node-semver's `(\s*)X\s+`, which rescans a whitespace run from every start
position; `Range.parseRange` normalises its own input rather than relying on the
constructor having done it, because it is public API; version length is capped
before any regex runs; and the range cache is bounded so a stream of distinct
hostile ranges cannot grow the heap without limit.

## Threat model

In scope: incorrect parsing or comparison that causes a caller to accept a
version it should reject; catastrophic backtracking or unbounded memory growth
on adversarial input; anything that ships in the tarball but is not in the
repository.

Out of scope: `node-semver` behaviours faithfully reproduced here. This package
is a drop-in replacement, so it matches its reference implementation including
quirks. If a divergence is desired, that is a feature request, not a
vulnerability — but a divergence that is *not* deliberate is a bug worth
reporting.
