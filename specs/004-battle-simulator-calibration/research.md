# Research: A Calibrated Objective for the Suggestion Engine

**Feature**: [spec.md](./spec.md) | **Date**: 2026-10-13

This document resolves *how* the suggestion engine should weigh a board before anything is built,
because the answer turns out to change the design rather than just tune it. It is written against
the request to ground the objective in "data modelling and prediction standards" rather than in
argument.

The headline finding is in **B1**: the existing 10-second constant is not an arbitrary knob. It is
the exactly correct weighting under one specific, checkable, and almost certainly wrong assumption
about how long fights last. Naming that assumption tells us what to replace it with.

---

## A. What the objective should be

### A1. The decision being made

- **Decision**: the objective is the probability of winning **one specific upcoming fight**, not a
  measure of board quality in the abstract.
- **Rationale**: every surface in this app answers one question — "which board should I field for
  the fight in front of me". The run day is already part of a board, so the fight is already
  identified. An objective that ranks boards without reference to a particular opponent is
  answering a question nobody is asking, and it is how "theoretical" and "real-world" came apart.
- **Consequence**: damage is instrumental, not terminal. A board that deals twice the damage and
  loses is worse than one that deals half and wins. The current objective cannot express that,
  because it has no notion of winning.

### A2. The fight is a race, and that framing dissolves the hardest existing problem

- **Decision**: model the fight as a race between two times — `T_you`, when your board kills the
  opponent, and `T_them`, when the opponent kills your board. You win iff `T_you < T_them`.
- **Rationale**: `engine/survivability.ts` contains a long and correct argument that a defence term
  *added* to a damage term needs an exchange rate — "how many DPS is one Shield per second worth?"
  — that nobody can defend, and that picking it high means six Runerocks win while picking it low
  means nothing changes. Its workaround was to make defence stretch the discount horizon instead,
  which was the right instinct.

  The race framing removes the need for an exchange rate entirely. Offence lowers `T_you`. Defence
  raises `T_them`. Both are measured in seconds, so they are directly comparable without a
  conversion factor, and the optimum between them falls out of the arithmetic rather than being
  tuned in. This is the same virtue the existing module claims for its own model, obtained without
  the assumption that makes that model fragile.
- **Alternatives considered**: a weighted sum of damage and mitigation (needs the indefensible
  exchange rate); a Pareto front over the two (honest, but presents the user with a set of
  incomparable boards when they asked which one to field); lexicographic ordering, survive-then-
  maximise-damage (degenerate — it would field an all-Runerock board that wins no fights).

### A3. Why this subsumes "front-loaded damage matters more" rather than discarding it

- **Finding**: the front-loading intuition is correct and is a *consequence* of A2, not an axiom
  beside it.
- **Rationale**: damage that lands after `T_them` is worth exactly nothing — you are already dead.
  So the true weight on damage at time `t` is `1` before the fight ends and `0` after it, a step
  function. Under uncertainty about where that step falls, the expected weight becomes
  `P(fight still running at t)`, which is a decreasing function of `t`. Front-loading is what
  uncertainty about fight length *looks like*; it was never a separate preference.

---

## B. The weight function

### B1. Today's constant asserts that fight length is exponentially distributed with a mean of 14.4 seconds

- **Finding**: `timeWeightedScore` computes `score += damage · 0.5^(t / halfLife)`. That weight is
  `exp(−λt)` with `λ = ln2 / halfLife`. In survival analysis, `S(t) = exp(−λt)` is **exactly** the
  survival function of a constant hazard rate `λ`, and this identity is the standard rationalisation
  of exponential discounting: if a reward's value is the probability it is still collectable, a known
  constant hazard implies exponential discounting and nothing else.
  (Sozou 1998; restated in [Reinforcement Learning with Non-Exponential Discounting](https://proceedings.neurips.cc/paper_files/paper/2022/file/178b306c7ee66a66db2171646e17da36-Paper-Conference.pdf), §3.1–3.2,
  and [Pitis 2019](http://arxiv.org/pdf/1902.06865v1), §3.1: "a known hazard rate of h(t) = λ … gives
  s(t) = e^−λt".)

  With `halfLife = 10`, `λ = 0.0693 s⁻¹`, and the implied mean fight length is `1/λ` = **14.4
  seconds**. So the app's objective currently asserts, for every board on every day, that fights end
  at a constant rate with a mean of 14.4 seconds.
- **Why that is almost certainly wrong**: a constant hazard is the unique *memoryless* survival
  function. It claims that however long a fight has already run, the expected time remaining is
  still 14.4 seconds. Fights in this game do not work that way — HP depletes monotonically, so a
  fight becomes **more** likely to end the longer it has gone on. That is an *increasing* hazard,
  and the exponential is the one shape that cannot represent it. The standard texts make the same
  point about the exponential model generally: "the main drawback … is that it is often implausible
  to assume a constant hazard over time"
  ([Columbia, Time-to-Event Data Analysis](https://www.publichealth.columbia.edu/research/population-health-methods/time-event-data-analysis)).
- **The internal inconsistency this exposes**: the default simulation window is 30 seconds, and
  `S(30) = 0.5³ = 12.5%`. The app weights the last two-thirds of its own simulation window at under
  an eighth, while simultaneously reporting "effective this battle" figures over that full 30
  seconds *unweighted*. The two halves of the app already disagree about how long a fight lasts.
  This is the misalignment the feature request named, stated as arithmetic.

### B2. The weight should be the survival function of the fight-length distribution

- **Decision**: weight damage at time `t` by `S(t) = P(T_them > t)` — the probability the fight is
  still running — rather than by a fixed exponential.
- **Rationale**: this is A3 made operational, and it is the general form of which today's model is
  one special case. The generic relation `S(t) = exp(−∫₀ᵗ h(τ)dτ)` means any belief about *when*
  fights end induces its own weight curve, and substituting a better belief needs no change to the
  shape of the code — only to the function supplying `S`.
- **What it gives for free**: the three readings below are the same formula with different inputs,
  which is what makes the staging in the spec a sequence of refinements rather than three rewrites.

| Belief about fight length | Weight `S(t)` | Status |
|---|---|---|
| Constant hazard, mean 14.4s, same for all boards | `exp(−t·ln2/10)` | **Today** |
| Known kill time `T` for this board and day | `exp(−t·ln2/T)`, or a step at `T` | **Shippable now** (C1) |
| Distribution over `T`, fitted to recordings | Weibull/empirical `S(t)` | Needs captures (C2) |
| The opponent's own simulated kill time | `P(T_them > t)` from the two-sided engine | Needs `[OPP]` (C3) |

### B3. Uncertainty about the hazard flattens the curve — do not sharpen prematurely

- **Finding**: a *known* constant hazard gives exponential decay, but an **unknown** one does not.
  With an exponential prior over the hazard rate the expected survival function is hyperbolic,
  `S(t) = 1/(1 + kt)` (Sozou 1998; both sources above derive it, with the Gamma-prior
  generalisation). Hyperbolic decays markedly **slower** than exponential in the tail.
- **Consequence**: while fight length is poorly known — which is now, with one run's HP curve and no
  calibration — the defensible weight is *flatter* than an exponential, not sharper. Replacing the
  constant with a confidently sharp step at a predicted `T` would be the opposite of what the
  uncertainty licenses.
- **Decision**: keep the exponential form in the first slice and move only its anchor (C1).
  Sharpen the shape only once C2 has measured the spread, and treat the flat-to-sharp direction as
  something earned by data rather than assumed.

---

## C. Predicting fight length

### C1. First slice: anchor the half-life to the engine's own predicted kill time

- **Decision**: set `halfLife` from `timeToKillSeconds(config, corpus, runDay, series)` instead of
  from a constant, retaining the exponential form per B3.
- **Rationale**: this needs no new data, no opponent model and no new engine surface. The function
  already exists, already simulates past the window to find a real kill time, and is already
  day-indexed through `ENEMY_HP_BY_DAY`. It converts the anchor from "a guess that is the same for
  every board" into "a figure computed from this board against this day", which is strictly more
  informative even while the HP curve underneath it is from a single run.
- **Why this is the honest reading of "orient the math against that"**: the request was for the
  weighting and the reported figures to agree. Anchoring both to one predicted fight length is
  exactly that, and it also removes the B1 inconsistency — the window and the weight stop
  describing different fights.
- **Known bias**: `timeToKillSeconds` measures time to kill a **passive** HP pool.
  `data/enemyHealth.ts` is explicit that this is "a floor on time-to-kill, not a prediction",
  because the modelled enemy has "no healing, no status clearing, no shields". Predicted fights are
  therefore biased **short**, which means the first slice will over-weight front-loaded damage —
  less than today, but in the same direction. This is a bias of known sign, which is the kind worth
  shipping with and stating.
- **Alternatives considered**: `hp / windowAverageDps` (already rejected inside `timeToKill.ts` for
  a good reason — Poison never decays, so cumulative damage grows superlinearly and the two-mon
  Venopuff/Magmite pair deals 20× the window but 393× the damage; dividing by an average rate was
  two orders of magnitude wrong for exactly the archetype this calculator exists to evaluate);
  a hand-authored per-day table of fight lengths (no better grounded than the constant it replaces,
  and insensitive to the board).

### C2. Second slice: fit a distribution, not a point

- **Decision**: once recordings exist, fit a parametric survival model to observed fight lengths —
  Weibull as the default family — and use its `S(t)` directly.
- **Rationale**: Weibull admits a shape parameter, so it can represent the increasing hazard that
  B1 argues this game must have, and it reduces to the exponential at shape `k = 1`. That means the
  fitted shape is itself a *test* of today's model: if `k` comes out near 1, the constant hazard was
  defensible; if `k > 1` materially, it was not. A model whose fitting procedure can falsify its
  predecessor is worth more than one that merely replaces it.
- **Covariate**: run day, at minimum. The user's observation is that fight length falls early, rises
  mid-run, then falls again from roughly day 9 — a shape no single scalar can hold, and the thing a
  day-covariate model exists to capture.
- **Alternatives considered**: Kaplan–Meier (non-parametric, no extrapolation to unobserved days —
  and most days will be unobserved for a long time); log-normal (plausible fit, no interpretable
  hazard shape); fixed empirical mean per day (throws away the spread that B3 says is the whole
  point).

### C3. Third slice: read the horizon off the opponent

- **Decision**: with a two-sided engine, `S(t) = P(T_them > t)` is computed rather than fitted.
- **Rationale**: this is the terminal form. It needs no fight-length model at all, because the
  fight length *is* the simulation's output. It also eliminates the mirror assumption outright: the
  opponent's damage is simulated, so `assumedIncomingDps` stops being an assumption.

---

## D. How to know whether any of this worked

### D1. Fight length: CRPS

- **Decision**: evaluate fight-length predictions with the **Continuous Ranked Probability Score**,
  `CRPS(F, y) = ∫(F(x) − 1{y ≤ x})² dx`, averaged over recordings.
- **Rationale**: CRPS is the standard strictly-proper scoring rule for real-valued *probabilistic*
  forecasts. It rewards being both accurate and appropriately sharp, which is precisely the
  trade-off B3 warns about — a model that reports a confident wrong fight length must score worse
  than one that reports an honest wide one. It is also the right shape for this project's staging:
  CRPS "reduces to the absolute error loss when point forecasts are issued"
  ([Gneiting & Raftery 2007, JASA](https://sites.stat.washington.edu/people/raftery/Research/PDF/Gneiting2007jasa.pdf);
  see also the [2025 review](https://arxiv.org/html/2504.01781v4)). So C1's point prediction and
  C2's distribution are scored on one comparable scale, and the improvement from one to the other is
  measurable rather than asserted.
- **Alternatives considered**: MAE/MAPE (fine for a point forecast, cannot score a distribution at
  all, so C1 and C2 would not be comparable); log score (strictly proper, but assigns harsh
  penalties regardless of overall closeness whenever predicted density at the observation is low —
  unsuitable with a handful of recordings).

### D2. Win/loss: Brier score, plus a calibration check

- **Decision**: score win probability with the Brier score and inspect calibration separately from
  accuracy.
- **Rationale**: Brier is the proper scoring rule for binary outcomes, and CRPS is its integral over
  all thresholds — so the two metrics are the same object at two granularities, which keeps D1 and
  D2 from being separate verdicts that can disagree. Calibration deserves its own look because an
  advisor that says "80% likely to win" should be right about 80% of the time; a model can rank
  boards correctly and still be badly calibrated, and the user-facing claim is the probability.

### D3. The acceptance bar

- **Decision**: a day-sensitive horizon has earned its place when its fight-length error is smaller
  than the *difference between adjacent days' predictions*.
- **Rationale**: this is the threshold at which varying the anchor by day carries more signal than
  noise. Below it, a per-day prediction is a more elaborate way of being wrong than a constant, and
  should be said to be.

---

## E. Pitfalls this project is specifically exposed to

### E1. Survivorship bias in the recordings

Recordings are made of fights the user chose to play, on boards they chose to build, and most
likely ones they won. A fight-length model fitted to them describes winning fights, not fights. The
`[OPP]` calibration work must record losses deliberately or state that it did not.

### E2. One run's HP curve carrying the whole model

`ENEMY_HP_BY_DAY` is a single run read off the battle UI. Its own documentation flags that rank,
opponent strength and run seed are all plausible additional inputs and none is ruled out. Every
figure in C1 inherits that, and a second run is the cheapest possible improvement to the entire
feature.

### E3. Goodhart on the benchmark set

Once a benchmark opponent set exists, the advisor can be tuned until it beats the benchmarks. The
benchmarks then stop measuring anything. Keep a holdout: at least one recorded fight that no
objective change is permitted to be fitted against.

### E4. Sudden death is an unmodelled bound on the quantity being predicted

`enemyHealth.ts` records that a prior 15-second claim was unsupported by observation — the recorded
battle ran past 23 seconds — and that whether sudden death has a fixed onset, or varies by day, is
unknown. If it exists it truncates fight length, which is the exact quantity C1 and C2 predict. A
fight-length model fitted without it will absorb its effect into the wrong parameter.

### E5. The floor and ceiling are load-bearing, not defensive

A board that kills instantly gives a horizon near zero, which discounts everything to nothing and
makes every lineup score identically; a board that never kills gives an unbounded horizon, which
removes the discount altogether and reverts the objective to raw window total. Both are reachable
by a user in normal play — an empty-ish board and an overpowered one — so the bounds in FR-003 are
part of the model, and the ceiling in particular should be no larger than the point at which the
discount stops discriminating.

---

## F. Recommendation

Build **C1** now: one function, replacing one constant, in the slice the spec calls P1. It is the
whole of the reported problem, it needs no data this project does not already have, and B1 shows it
replaces a demonstrably wrong assumption rather than merely a vague one.

Hold the shape of the curve fixed while doing it (B3). The temptation will be to sharpen the
discount once a specific predicted kill time is in hand, and the uncertainty does not yet license
it.

Record CRPS against whatever recordings exist from the first day C1 ships, even if there are only
one or two and the number is meaningless at that `n`. The metric's value is that it makes C2's
improvement over C1 measurable, and it can only do that if C1 was measured too.

---

## Sources

- Gneiting, T. & Raftery, A. E. (2007). *Strictly Proper Scoring Rules, Prediction, and Estimation.*
  JASA 102(477), 359–378. [PDF](https://sites.stat.washington.edu/people/raftery/Research/PDF/Gneiting2007jasa.pdf)
  — CRPS definition, propriety, relation to the Brier score.
- *Proper Scoring Rules for Estimation and Forecast Evaluation* (2025 review).
  [arXiv:2504.01781](https://arxiv.org/html/2504.01781v4) — CRPS properties, comparison with the
  log score.
- Sozou, P. D. (1998). *On hyperbolic discounting and uncertain hazard rates.* Proc. R. Soc. B.
  — known constant hazard ⇒ exponential discounting; uncertain hazard ⇒ hyperbolic.
- *Reinforcement Learning with Non-Exponential Discounting* (NeurIPS 2022).
  [PDF](https://proceedings.neurips.cc/paper_files/paper/2022/file/178b306c7ee66a66db2171646e17da36-Paper-Conference.pdf)
  — survival/hazard/discount identities, §3.1–3.2.
- Pitis, S. (2019). *Rethinking the Discount Factor in Reinforcement Learning.*
  [arXiv:1902.06865](http://arxiv.org/pdf/1902.06865v1) — discount factor as per-step continuation
  probability.
- Columbia Mailman School, *Time-To-Event Data Analysis.*
  [Link](https://www.publichealth.columbia.edu/research/population-health-methods/time-event-data-analysis)
  — `S(t) = e^−H(t)`, parametric family selection, the implausibility of constant hazard.
- This repository: `src/engine/optimize.ts` (`TIME_WEIGHT_HALF_LIFE_SECONDS`,
  `timeWeightedScore`), `src/engine/survivability.ts` (the exchange-rate argument and the mirror
  assumption), `src/data/enemyHealth.ts` (the HP curve, its provenance, the passive-enemy caveat,
  sudden death), `src/engine/timeToKill.ts` (why averaging a rate fails).
