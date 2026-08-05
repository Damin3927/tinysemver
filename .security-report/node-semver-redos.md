# ReDoS in `semver` — incomplete fix for CVE-2022-25883

**Package:** `semver` (npm/node-semver)
**Affected:** 7.8.5 (latest at time of writing); expected to affect every version since 7.5.2
**Component:** `new Range()` / `validRange()` / `satisfies()` — any entry point that parses a range
**Class:** CWE-1333, inefficient regular expression complexity

## Summary

The fix for CVE-2022-25883 (7.5.2, commit `717534ee`, "better handling of whitespace")
mitigated ReDoS in range parsing by collapsing whitespace before the grammar
regexes run:

```js
this.raw = range.trim().split(/\s+/).join(' ')
```

That defeats a payload made of a long whitespace *run*, and it does — a
200,000-character whitespace-padded range now parses in well under a
millisecond.

But the underlying quadratic pattern was not changed. `XRANGEPLAIN` and
`LOOSEPLAIN` still begin with the unbounded `[v=\s]*`, and a payload can reach
it by using characters that whitespace collapsing does not remove. Repeating
`"v= "` produces a string of `v=` tokens separated by *single* spaces, so
normalisation leaves it intact, and `COMPARATORTRIM` — which is applied
unanchored to the whole range string — rescans the prefix from every start
position.

## Reproduction

```js
const semver = require('semver');   // 7.8.5

for (const reps of [1000, 2000, 4000, 8000, 16000]) {
  const payload = 'v= '.repeat(reps);
  const started = process.hrtime.bigint();
  try { new semver.Range(payload); } catch {}
  const ms = Number(process.hrtime.bigint() - started) / 1e6;
  console.log(payload.length, ms.toFixed(1) + 'ms');
}
```

Measured on Node 26.6.0, semver 7.8.5:

| payload length | `new Range()` | ratio |
| --- | --- | --- |
| 3,000 | 28.5 ms | |
| 6,000 | 86.5 ms | 3.0× |
| 12,000 | 348.5 ms | 4.0× |
| 24,000 | 1,366.6 ms | 3.9× |
| 48,000 | 5,676.7 ms | 4.2× |

Time quadruples as length doubles — quadratic. For comparison, the
CVE-2022-25883 payload shape on the same build:

```js
new semver.Range('1.2.3'.padStart(200000, ' '))   // 0.1 ms — fix is effective here
```

The payload is rejected as an invalid range in both cases; the cost is paid
before that answer is returned.

## Impact

Any caller that parses a range string it does not control. That includes
registry and manifest tooling, lockfile processing, plugin and dependency
resolvers, and any service accepting a version range as input. A single
48 KB request occupies the event loop for over five seconds; because the cost is
quadratic, a 100 KB payload is roughly four times worse again.

This is the same reachability as CVE-2022-25883 — "untrusted user data is
provided as a range" — with a payload shape the 7.5.2 mitigation does not cover.

## Suggested fix

Bounding the prefix is sufficient and appears observationally free. The prefix
exists to accept `v1.2.3`, `=1.2.3` and `= 1.2.3`; every longer form is already
rejected (`v=1.2.3`, `v=v=1.2.3` and `= = 1.2.3` all return `null` today), so a
small bound changes only how quickly the rejection happens:

```js
createToken('LEADINGNOISE', '[v=\\s]{0,16}')
```

It only needs to apply to `COMPARATORTRIM`, the one pattern applied unanchored
to a whole range string. The other uses are anchored and run against a single
short token, where an unbounded prefix costs nothing — so scoping it there
preserves the current grammar exactly, including loose mode accepting an
arbitrarily long prefix.

I verified this scoping against a differential corpus of 119,796 cases
(`semver` vs a reimplementation, comparing return values and thrown error types
across the full range grammar and all option combinations): the bounded form
produces identical results on every case, while the payload above drops from
5,676 ms to 16 ms.

## Disclosure

Reported privately per `SECURITY.md`. No public issue or PR has been opened. I
am happy to supply the differential corpus or a patch, and will follow whatever
disclosure timeline you prefer.
