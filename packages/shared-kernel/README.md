# @ssz/shared-kernel

Pure domain logic that the backend services **and** the web client must agree on,
byte for byte. No framework imports, no I/O, no dependencies — only TypeScript.

The rule that created this package: `ACCEPTANCE_CRITERIA.md` → **AC-X1**, "client and
server validation return the same codes for the same document". Two implementations of
that rule will drift; one cannot.

## Who consumes it, and how

| Consumer | Repository | Mechanism |
|---|---|---|
| `content-service`, `exercise-engine-service` | `ssz-platform` | `file:../../packages/shared-kernel`, same as `@ssz/contracts` |
| `ssz-platform-web` | separate repository | **synced source copy** — see below |
| `VoxOrd` | separate repository | *not a consumer* — see "Why not mobile" |

### Why the web client gets a copy rather than a dependency

`ssz-platform-web` is its own GitHub repository and builds on Vercel from that
repository alone. A `file:` dependency pointing outside the repository cannot install
there, and a published package would put a `version → publish → update` round trip
between every edit of a module that is still being designed.

So the web client vendors the **source**, mechanically:

```
packages/shared-kernel/src/**/*.ts          ← source of truth, edit here
        │  npm run kernel:sync              (run in ssz-platform-web)
        ▼
ssz-platform-web/src/lib/shared-kernel/     ← generated, committed, never edited
```

Every generated file carries a `DO NOT EDIT` header, and `npm run kernel:check` — wired
into the web client's `ci:check` — fails when the copy and the source disagree. The copy
is a build artefact that happens to live in git; drift is a failing check, not a
judgement call.

When the model stops churning, this becomes a published package and the sync script
goes away. Nothing in the source has to change for that: the sync copies verbatim.

### Why not mobile

`VoxOrd` renders what `GET /exercises/:id/display` hands it, and grading happens on the
server. It needs the *shape* of that projection, not the logic that produces it — a type,
which belongs in `@ssz/contracts`. Adding React Native as a third consumer would
constrain this package to whatever Metro can resolve, for no shared code.

## Rules for code in here

- No dependencies, ever. Not `zod`, not `date-fns`. If something needs a dependency, it
  is not shared-kernel code.
- Pure functions only: same input, same output, no clock, no randomness, no network.
  (Bank shuffling is therefore *not* here — it is a server concern, `SPEC_api_contract`.)
- Compiled under `strict`, `noUncheckedIndexedAccess` and `verbatimModuleSyntax`, which
  are the web client's settings. If it compiles here it compiles there.
- Relative imports carry the `.js` extension — required by `NodeNext` for the backend
  build, and understood by TypeScript, Vite and Next.js on the web side.
- Tests live next to the source as `*.test.ts` and run in the web client's Vitest
  (`npm run test:run` there) once synced. They are excluded from the backend build.

## Contents

- `wordbank-gapfill/` — the `word_bank_gap_fill` exercise model, derived selectors and
  validation engine. Handoff: `ssz-platform-web/docs/design/activity-specs/design_handoff_wordbank_gapfill/`.
  Plan: `ssz-platform-web/docs/plan/35-wordbank-gapfill-redesign.md`.
