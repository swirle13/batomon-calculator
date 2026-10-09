# Project Setup & Engineering Practice

**Created**: 2026-10-08

How to structure the new project so the existing engine is **imported rather than copied**, and
what that choice costs and constrains. Written against the React Native recommendation
(`research.md` E3); the §5 alternatives cover the other branches.

---

## 1. The decision that shapes everything else: one repo or two?

The brief says the new work lives in a **separate, private repo**. The calculator is a **public**
repo deployed to GitHub Pages. Those two facts are in direct tension with the thing that makes this
port cheap, because **you cannot share a pnpm workspace across two repositories.**

The engine and corpus have to live somewhere that both the web app and the mobile app can consume.
There are three honest ways to arrange that, and the choice is the user's:

### Option A — One private monorepo, web app moves into it

```
batomon/                        (private)
  apps/
    web/                        the existing Vite SPA
    mobile/                     Expo + dev client
  packages/
    engine/                     src/engine/ verbatim
    corpus/                     src/data/ verbatim
    contracts/                  BoardReading, shared across TS and Kotlin codegen
```

- **Best technical outcome.** One `pnpm install`, one `turbo run test`, atomic cross-cutting
  changes, no version skew between the two apps' engines, instant hot reload across package
  boundaries.
- **Cost:** the public calculator repo becomes private, or becomes a deploy-only mirror. GitHub
  Pages can serve from a private repo on paid plans; otherwise push `dist/` to a thin public repo
  from CI. The project's existing `deploy.yml` and the "push every commit" workflow both need
  rework.
- The calculator's README notes it is a fan tool redistributing the game's artwork — there may be an
  independent reason to prefer it stay public and visible. That's a judgement call, not a technical one.

### Option B — Two repos, engine published as a private package

Extract `@batomon/engine` and `@batomon/corpus` and publish to GitHub Packages (private npm
registry, free for private repos). Both apps depend on a version.

- **Keeps the public repo public.** Clean boundary; forces the engine's API to be deliberate.
- **Cost:** every engine change becomes publish → bump → install in two places. During the period
  when the engine is changing *because of* mobile work — which is most of this project, given the
  opponent-modelling and coverage gaps — that friction is constant and it is the main reason people
  abandon this setup. Also needs a release workflow and auth config in both repos' CI.

### Option C — Git subtree or submodule

The engine lives in its own repo, vendored into both.

- Submodules are a well-known source of confusion and detached-HEAD accidents, especially with
  multiple agent sessions working in the same tree (which this repo's own rules already warn
  about). Subtree is less error-prone but makes history messy.
- **Not recommended.** It has Option B's friction without its clean versioning story.

### Recommendation

**Option A if the web app can move; Option B if it cannot.** The deciding question is not technical
— it is whether the calculator staying public matters. Worth settling before any code, because
retrofitting a monorepo later means rewriting both apps' build configs.

A pragmatic middle path: start with **Option A as a private monorepo**, and keep publishing the
built web app to the existing public repo as a deploy artifact. The source goes private, the site
stays up at the same URL, and the engine stays shared. That is probably the best of both, and it
costs one CI workflow.

---

## 2. Monorepo mechanics (Option A)

The 2026 consensus for a TypeScript monorepo spanning web and React Native:

**pnpm workspaces + Turborepo.** pnpm's content-addressable store eliminates duplicate
`node_modules` and prevents phantom dependencies; Turborepo adds task graphs and caching once build
time hurts. Several sources note you can start with pnpm workspaces alone and add Turborepo later —
reasonable here, since this repo is small.

Three configuration details are **non-obvious and will cost a day each if missed:**

### 2.1 `nodeLinker: hoisted` is mandatory for Expo

```yaml
# pnpm-workspace.yaml
packages:
  - "apps/*"
  - "packages/*"
nodeLinker: hoisted
```

pnpm's default isolated store loads **two copies of `react-native`** into one bundle, which crashes
at startup with `Maximum call stack size exceeded`. Hoisting guarantees a single native runtime.
This is Expo's own recommendation for monorepos and it is not optional.

### 2.2 Metro must be told about the workspace

```js
// apps/mobile/metro.config.js
config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
];
config.resolver.disableHierarchicalLookup = true;
```

Metro does not discover workspace packages on its own. Symptom when missing: imports resolve in the
editor and fail at bundle time.

### 2.3 Internal packages export raw TypeScript — no build step

```json
{
  "name": "@batomon/engine",
  "private": true,
  "exports": { ".": "./src/index.ts" }
}
```

Both Vite and Metro transform TypeScript directly. Pointing `exports` at source rather than a
compiled `dist` means editing `simulate.ts` hot-reloads **both** apps with no intermediate build.
With a `dist` step instead, every engine change needs a rebuild before either app sees it — which,
on a project whose whole premise is sharing the engine, is friction in exactly the wrong place.

Pair with TypeScript project references and a shared `packages/tsconfig` base so the strict-mode
settings the calculator's Constitution Principle II depends on (`strict`, `noImplicitAny`,
`noUncheckedIndexedAccess`) are declared once and inherited everywhere.

---

## 3. The extraction, as a sequence

The order matters: each step should leave the web app green, so the extraction is reversible at
every point and never becomes a long-lived broken branch.

1. **Break the one layering violation.** `engine/effects.ts` imports `TYPE_COLORS` from
   `data/typeColors.ts` purely for the list of type names. Replace with `ALL_CREATURE_TYPES` derived
   from the enum. One small commit; `npm run test` stays green.
2. **Break the one test layering violation.** `engine/__tests__/selfScaling.test.ts` imports from
   `ui/shared/BatomonCard/perCastOutput`. Move `perCastOutput.ts` into the shared layer (it is pure,
   140 LOC, and it belongs there anyway).
3. **Stand up the workspace** with `apps/web` as the only app and `packages/engine` + `packages/corpus`
   as the only packages. Move files, fix import paths, confirm the test suite still reports 207
   engine cases passing and the site still builds.
4. **Extract the state actions** from `TeamConfigContext.tsx` into a plain module. The provider keeps
   working; it now wraps functions instead of containing them.
5. **Only then** add `apps/mobile`.

Step 3 is the one worth being careful about: it is a large, mechanical, import-path-only diff, and
it should be its own commit with nothing else in it.

---

## 4. Practice to carry over, and practice to add

### Carry over

The calculator's constitution is unusually good and most of it transfers. Specifically:

- **Principle I (data / engine / UI as three independently testable layers).** This is the reason
  the port is cheap. It now earns a stronger form: the engine must not know whether its inputs came
  from a form or a camera.
- **Principle II (strict TypeScript, closed discriminated unions, no bare strings).** The corpus is
  hand-collected and the type system is the defense. Nothing about mobile changes that; a scanner
  producing bare strings would be worse than a human typing them.
- **Principle III (test-first for engine mechanics, with the source cited in a comment).** The 207
  cases are the project's credibility.
- **Principle VII (shared design language, no bespoke cards).** The calculator learned this the
  expensive way — three card treatments, two cooldown formatters disagreeing on decimals, chip
  styling in three files. A mobile app with an overlay surface *and* a full-screen surface has the
  same hazard in a new shape.

### Add

Three new principles the existing constitution has no analogue for:

**Perception is a layer, and it is testable from stored frames.** The vision pipeline must be
callable on a PNG on disk, never only on a live device. Corollary: a golden-frame corpus of real
labeled screenshots exists from week one and every perception change runs against all of it. This
is Principle III's equivalent for the half of the app that is new, and without it that half is
untestable (see `port-inventory.md` §7).

**Read-only is a hard boundary, not a preference.** No input injection, no interaction with the
game process, no network traffic to the game's backend, no credentials, ever. This is the line that
keeps Calcy IV and Poke Genie legitimate (`research.md` F1), and writing it into the constitution
means it cannot erode feature by feature.

**A wrong reading must be visible and correctable.** The web app's inputs are typed by the user and
therefore correct by construction. A scan can be wrong. Every displayed figure must trace to a
reading the user can see and override, and low-confidence reads must say so rather than guess.
Silent wrongness in an advisory tool is worse than no tool.

### Workflow

Keep spec-driven development — it has visibly worked here (`specs/001-batomon-dps-calculator/` is
~10,700 lines of spec, research, data model, tasks and validation logs backing 181 commits, and the
research log is where retracted findings get recorded rather than quietly forgotten). The same
`/speckit-specify` → `/speckit-plan` → `/speckit-tasks` → `/speckit-implement` loop applies; this
document set is the `specify` output.

One addition: **the new `research.md` needs a retraction discipline from the start.** The existing
one has it (section G1 retracts F5's "hard blocker" conclusion as a tooling artifact; H9 retracts a
"100% confirmed" corpus claim). In a domain where Play policy and OS behaviour change under you,
that habit matters more here than it did there.

---

## 5. If the framework choice goes the other way

### Flutter

`packages/` sharing does not apply — Dart and TypeScript do not share source. The realistic
structure is a Dart monorepo with Melos, and the calculator becomes a **specification and a test
vector source** rather than a dependency:

- Export the 207 engine test cases as language-neutral fixtures (JSON input → expected output) and
  run them against the Dart port. That is the only way to get evidence the port is faithful.
- Export the corpus as JSON and load at runtime, or generate Dart source from it. The former loses
  the compile-time guarantees Principle II exists for; the latter means a codegen step that must
  re-run on every corpus change.
- Budget 4–8 weeks before the first mobile feature exists (`port-inventory.md` §8).

### Native Kotlin (the KU-9 branch)

If the spike finds React Native is pure overhead, the engine still needs a home. In rough order of
preference:

1. **Embed a JS runtime.** Bundle the engine + corpus (~57 KB gzipped) and run it in Hermes or
   QuickJS from Kotlin, behind a single `computeAdvice(configJson): adviceJson` call. Keeps the
   shared package, keeps the tests, keeps the web app on the same source. Unusual, but the interface
   is genuinely that narrow — `placementAdvice.ts` is already documented as plain-data-in,
   plain-data-out specifically because it crosses a `postMessage` boundary.
2. **Kotlin port.** Same cost shape as the Dart port, with the same test-fidelity problem.
3. **Local HTTP/IPC to a Node process.** Not viable on Android.

Option 1 is worth taking seriously. The whole reason the engine survived a Web Worker boundary
cleanly is that its public surface is one pure function over structured-clone-safe data — which is
also exactly what a JNI boundary wants.
