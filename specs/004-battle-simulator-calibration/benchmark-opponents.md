# Benchmark Opponents: the observed ranked meta

**Feature**: [spec.md](./spec.md) | **Research**: [research.md](./research.md) | **Date**: 2026-10-13

Opponent data transcribed from [batomon.com](https://batomon.com), an unofficial community meta
companion, supplied by the user as the basis for "the most oppressive teams to play against".

This resolves **FR-017** — what an uncaptured day offers — in the best available way: neither "no
opponent" nor a synthesised one, but a board **observed across tens of thousands of real ranked
rounds**. It also supplies something the spec did not expect to get this early: per-phase round win
rates, which are a calibration target for `[OPP]` work that needs no recordings at all.

---

## A. Provenance and its limits

- **Source**: `batomon.com/meta` (Pairs) and `batomon.com/comps`, Balance 25, Steam build 25738032.
- **Pairs window**: Sep 14 – Oct 13, 2026 · mode ranked · all ranks · all rounds · **164,819
  observed rounds**.
- **Comps basis**: "recent public ranked final teams. The catalog uses Balance 25. Rank filters
  exclude runs that do not report MMR."
- **Site-wide coverage at time of capture** (`batomon.com/status`): 74,576 runs · 166,141 observed
  round boards · 4,934 players sampled.

### A1. The site's own caveat, which this project must inherit rather than restate

> "Companion matches are a self-selected observational sample from players who install, connect, and
> successfully sync runs. Results describe recorded matches; they do not establish causality or
> represent the complete Batomon population."

This is the same class of problem as `research.md` **E1** (survivorship bias in recordings) and it
is stated here by the source itself. It matters most for the pair table in **C**, where a
"round win association" is emphatically **not** a causal claim about the pairing — it is confounded
by who plays it, at what rank, with what else on the board.

### A2. No API, so this is a transcription

No public API, endpoint or JSON schema is documented for pairs or comps. The figures below were read
off the screenshots the user supplied. They are a **point-in-time snapshot of a live meta** and will
drift with the next balance patch; the site removes older patches when a new one arrives.

### A3. What the data does not contain

| Missing                           | Why it matters here                                                                                                                                                                                                                                                                                                             | Decision needed               |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| **Positions**                     | The site states plainly: "The units summarize many public boards. These grids do not show exact or recommended positions." This engine models adjacency, `behind`/`above`/`inFront` and row selectors, and the whole Puffloon result rests on it. An opponent board with no positions is not yet a board this engine can fight. | **B2**                        |
| **Integer levels**                | Levels are averages across many boards, so they come out fractional — `Onsetra 1.5`, `Bumblebolt 2.5`, `Shellter 1.5`. The corpus has discrete levels 1–4.                                                                                                                                                                      | **B3**                        |
| **Trinkets and items**            | The comp pages carry "Trainers & trinkets" and "Item ideas · effect fit" tabs that were not captured. Trinkets change this engine's output substantially — Link Cable alone redefines adjacency for the whole board.                                                                                                            | Capture later; absent for now |
| **The opponent each board faced** | Round win rates are against _the field_, not against a named enemy. So these are win rates in a population, not head-to-head results.                                                                                                                                                                                           | Affects **D** only            |
| **Fight length in seconds**       | Everything is in _rounds_. `research.md` C1–C2 predict fight length in **seconds**. Rounds and seconds are different units and nothing here bridges them.                                                                                                                                                                       | Open — see **E1**             |

---

## B. Conventions required to turn a comp into a board

### B1. Phases map to the run day the app already models

The comps are published in four phases, which is the "teams change from 0 wins to 10 wins" structure
the user identified as the valuable part. They map directly onto `TeamConfiguration.runDay`:

| Phase | Rounds | Maps to `runDay` |
| ----- | ------ | ---------------- |
| Early | R1–4   | 1–4              |
| Mid   | R5–8   | 5–8              |
| Late  | R9–12  | 9–12             |
| Final | R13+   | 13 and up        |

This is the first external confirmation that a day-indexed opponent is the right shape, and it lines
up with `ENEMY_HP_BY_DAY` being indexed the same way.

### B2. Positions: arrange the opponent with this app's own optimiser

- **Decision**: where the source gives no positions, position the opponent board by running the
  app's existing placement search over it and taking its best arrangement.
- **Rationale**: it is the only choice that is both reproducible and consistent with the user's
  stated purpose. "The hardest to defeat teams" means the opponent should not be handicapped by an
  arbitrary arrangement, and assuming the opponent plays its board as well as the app would advise
  _you_ to play it is the strongest defensible assumption. A fixed reading order would silently make
  every adjacency-dependent opponent weaker than it is in practice.
- **The caveat this creates, which must be stated wherever a benchmark result is shown**: part of
  the opponent's strength is then an artifact of our own optimiser. If the optimiser is wrong about
  positioning — and `optimize.ts` is candid that positional effects are barely modelled — the
  benchmark inherits that error on both sides of the fight.
- **Alternatives considered**: stable slot order (reproducible, but arbitrarily weakens adjacency
  comps and would make Formiqueen's aura comp a pushover for reasons unrelated to the comp);
  hand-authored positions (defensible per comp, unreproducible and does not scale past the two comps
  transcribed here); averaging over all arrangements (expensive, and reports a fight against a board
  nobody would field).

### B3. Fractional levels: round down, and say so

- **Decision**: floor a fractional level to the integer below (`1.5 → 1`, `2.5 → 2`).
- **Rationale**: a fractional level is the _mean_ across boards, so rounding up invents a board
  stronger than the modal one, and this engine's level scaling is steep — Aristobat's Multicast goes
  2 → 3 → 4 → 8 across levels, so a level rounded the wrong way can double a monster's output. Under
  the "hardest to defeat" goal the conservative direction is the wrong-looking one, but inflating an
  opponent past anything observed makes a benchmark unbeatable for a reason that is not real.
- **Record both**: the source figure is kept alongside the integer used, so a benchmark loss can be
  checked against whether rounding caused it.

---

## C. Top pairs by play rate

Read as: _how often the pair appears together_, and _the round win rate of boards containing both_.
Per **A1**, the second column is an association in an observational sample, **not** a causal claim.

| #   | Pair                     | Seen together | Round win association     |
| --- | ------------------------ | ------------- | ------------------------- |
| 01  | Furnadon + Rubbin        | 4.9% (8,112)  | 46.4% (3,763 / 8,112)     |
| 02  | Furnadon + Steamscuttle  | 4.7% (7,730)  | 42.8% (3,309 / 7,730)     |
| 03  | Cinnabark + Drumire      | 4.4% (7,274)  | 41.0% (2,979 / 7,274)     |
| 04  | Puffloon + Spinarai      | 4.2% (7,003)  | **50.5%** (3,535 / 7,003) |
| 05  | Noxnimbus + Puffloon     | 3.9% (6,441)  | 47.8% (3,077 / 6,441)     |
| 06  | Aristobat + Puffloon     | 3.8% (6,206)  | 40.4% (2,507 / 6,206)     |
| 07  | Fumungus + Puffloon      | 3.7% (6,074)  | 41.6% (2,529 / 6,074)     |
| 08  | Steamscuttle + Swoonet   | 3.7% (6,030)  | 39.0% (2,350 / 6,030)     |
| 09  | Snapscald + Steamscuttle | 3.4% (5,667)  | 37.6% (2,129 / 5,667)     |
| 10  | Electranade + Velocect   | 3.4% (5,590)  | 48.1% (2,690 / 5,590)     |
| 11  | Cobrex + Puffloon        | 3.2% (5,319)  | 46.4% (2,470 / 5,319)     |
| 12  | Ouroblaze + Steamscuttle | 3.2% (5,270)  | 45.2% (2,383 / 5,270)     |
| 13  | Bonshell + Opalion       | 3.0% (4,943)  | **55.3%** (2,733 / 4,943) |
| 14  | Cicadence + Velocect     | 2.8% (4,548)  | _obscured in capture_     |

### C1. The Puffloon rows are a direct check on advice this project has already given

Five of the top fourteen pairs contain Puffloon, so the meta agrees it is a build-around. Ranked
among themselves:

| Puffloon pair | Round win association          |
| ------------- | ------------------------------ |
| + Spinarai    | 50.5%                          |
| + Noxnimbus   | 47.8%                          |
| + Cobrex      | 46.4%                          |
| + Fumungus    | 41.6%                          |
| + Aristobat   | **40.4%** — lowest of the five |

**Aristobat + Puffloon is the weakest-performing Puffloon pair in the table**, and it is the pairing
this project's own advisor surfaced on 2026-10-09 as the max-damage lineup. The engine was right
that the pairing produces the most raw DPS on that roster; the meta suggests raw DPS is not what
wins the round. That is the whole thesis of `research.md` **A1** — damage is instrumental, not
terminal — arriving as evidence rather than as argument.

It is also _weak_ evidence, for the reason in **A1**: pair association is confounded, and Aristobat
at 25 gold appears on different boards at different ranks than Spinarai at 10. Worth noting that
**Cobrex + Puffloon (46.4%) beats Aristobat + Puffloon (40.4%)**, which is the direction the
engine's own mechanics predicted — a Puffloon reaction charges a Cobrex, so the pair compounds in a
way the Aristobat pair does not.

---

## D. Comp 1 — Formiqueen + Velocect

**Tier S+** · Onsetra core · Legendary core · R12.6 avg

| 10-Win Rate                     | Avg Wins | Avg MMR | Avg ending round | Play Rate | Runs | Players | Trainer     |
| ------------------------------- | -------- | ------- | ---------------- | --------- | ---- | ------- | ----------- |
| **63%** (32 / 51 terminal runs) | 8.3      | 3,482   | 12.6             | 1.2%      | 60   | 33      | Bug Catcher |

| Phase      | Boards | Round wins        | Composition (source levels)                                                            |
| ---------- | ------ | ----------------- | -------------------------------------------------------------------------------------- |
| Early R1–4 | 4      | **69%** (11 / 16) | Velocect 2 · Bumblebolt 1 · Brawlmantis 1 · Electranade 1 · Dragon Egg 1 · Gildshell 1 |
| Mid R5–8   | 6      | **63%** (10 / 16) | Velocect 3 · Formiqueen 2 · Bumblebolt 2.5 · Electranade 1.5 · Cherubble 1 · Pylong 1  |
| Late R9–12 | 25     | **89%** (17 / 19) | Formiqueen 2 · Velocect 3 · Onsetra 1 · Stellagon 1 · Pylong 2 · Bumblebolt 3          |
| Final R13+ | 35     | **42%** (5 / 12)  | Onsetra 2 · Velocect 3 · Formiqueen 3 · Stellagon 2 · Bumblebolt 3 · Pylong 2          |

Representative final composition: Formiqueen 3 · Onsetra 1.5 · Velocect 3 · Stellagon 2 ·
Bumblebolt 3 · Pylong 2.

### D1. This comp is a gift to the engine specifically

Both of the engine's two known-actionable positional abilities are in it. `optimize.ts` records that
"**two** creatures carry positional-target `AbilityTag`s — Formiqueen (`adjacent`) and Onsetra
(`behind`) — but `simulate()` reads **only** `cooldownSpeedModifier` tags, so **one** is actually
actionable", and names Onsetra's ignored tag as "literally one of the chaining effects that
motivated this feature".

So the top-performing comp in the meta is built on the exact positional ability this engine is
documented as not reading. Fighting it is the sharpest possible test of **B2**, and fixing Onsetra is
likely a prerequisite for the benchmark meaning anything. Pylong's `behind` Shock multiplier is in
the comp too.

---

## E. Comp 2 — Bonshell + Opalion

**Tier S+** · Dracana core · Super Rare core · R11.9 avg

| 10-Win Rate                     | Avg Wins | Avg MMR | Avg ending round | Play Rate | Runs | Players | Trainer        |
| ------------------------------- | -------- | ------- | ---------------- | --------- | ---- | ------- | -------------- |
| **46%** (31 / 67 terminal runs) | 7.6      | 3,353   | 11.9             | 1.9%      | 93   | 61      | Monster Ranger |

| Phase      | Boards | Round wins         | Composition (source levels)                                                 |
| ---------- | ------ | ------------------ | --------------------------------------------------------------------------- |
| Early R1–4 | 28     | **64%** (68 / 106) | Bonshell 1 · Scorubble 1 · Sukoi 1 · Swoonet 2 · Shellter 1.5 · Gildshell 1 |
| Mid R5–8   | 36     | **58%** (66 / 114) | Bonshell 3 · Opalion 1 · Dracana 1 · Boomagon 1.5 · Sukoi 1 · Rhizuka 1.5   |
| Late R9–12 | 50     | **73%** (61 / 84)  | Dracana 2 · Opalion 2 · Bonshell 3 · Saberhorn 1 · Celestia 1 · Cairnage 1  |
| Final R13+ | 48     | **67%** (18 / 27)  | Opalion 2 · Dracana 2 · Bonshell 3 · Cairnage 2 · Saberhorn 2 · Celestia 1  |

Representative final composition: Bonshell 3 · Dracana 2 · Opalion 2 · Saberhorn 2 · Cairnage 2 ·
Celestia 1.

---

## F. "Most oppressive" is ambiguous, and the two comps disagree about it

The user asked for "the hardest to defeat teams". The two transcribed comps rank **in opposite
orders** depending on the metric, which means the choice is load-bearing rather than cosmetic:

| Metric                      | Formiqueen + Velocect | Bonshell + Opalion        | Harder               |
| --------------------------- | --------------------- | ------------------------- | -------------------- |
| 10-Win Rate (run success)   | **63%**               | 46%                       | F+V                  |
| Final-phase round win rate  | 42%                   | **67%**                   | B+O                  |
| Pair round win association  | not in top 14         | **55.3%** (highest shown) | B+O                  |
| Sample size (boards, Final) | 35                    | 48                        | B+O better evidenced |

- **Decision**: rank benchmark opponents by **round win rate in the phase being fought**, not by
  10-win rate.
- **Rationale**: a benchmark opponent exists to be hard to beat _in one round_. The 10-win rate
  measures whole-run success, which bundles economy, shop luck and high-rolling into the figure — a
  comp can reach 10 wins by snowballing early and still field a beatable board at R13. That is
  visibly what happens here: Formiqueen + Velocect wins 63% of its runs while winning only 42% of
  its _final-phase rounds_, on a smaller sample than the comp it loses that comparison to.
- **Consequence**: for a day-13+ fight, **Bonshell + Opalion is the harder opponent** despite being
  the "second-ranked" comp by the metric the screenshots lead with.

### F1. Round win rates are a calibration target that needs no recordings

`research.md` **D2** proposed Brier scoring of win probabilities against recorded fights, assuming
recordings were the only source. These phase tables are win rates over 12–114 rounds each, which is
a usable sample. If the `[OPP]` engine fights these boards, its predicted win rates can be scored
against eight observed rates immediately.

The gap to close first: these are win rates **against the field**, not head-to-head. Comparing an
engine's head-to-head prediction against a population win rate needs a model of the field, or a
restriction to the subset of the field that is itself transcribed. With two comps that subset is two
boards, which is not a field yet.

---

## G. Loadable boards

Each board below is identified by its **`buildId`** — the project's own composition fingerprint from
`src/data/share.ts`, FNV-1a over the canonical build, "same team in, same id out — always". No new
identity scheme was invented; these are the same ids the team library uses to recognise a duplicate.

The `bat1:` code beside each one is produced by the same `exportBuild()` the Share button calls, so
**pasting it into "Load team" loads that board**. `src/data/__tests__/benchmarkOpponents.test.ts`
pins every id below and asserts the round trip, so if a corpus or canonical-form change moves one,
a test names it rather than this document going quietly stale.

Levels are floored per **B3**; positions are this app's own placement search per **B2**. `runDay` is
pinned to the first round of each phase.

### Formiqueen + Velocect

| Phase      | `buildId`  | Day | Layout (top row, then bottom)                                                         |
| ---------- | ---------- | --- | ------------------------------------------------------------------------------------- |
| Early R1–4 | `c9a66948` | 1   | velocect.2 · bumblebolt.1 · brawlmantis.1 / electranade.1 · dragonegg.1 · gildshell.1 |
| Mid R5–8   | `8874a735` | 5   | velocect.3 · formiqueen.2 · bumblebolt.2 / electranade.1 · pylong.1 · cherubble.1     |
| Late R9–12 | `d31b1da8` | 9   | formiqueen.2 · bumblebolt.3 · pylong.2 / velocect.3 · stellagon.1 · onsetra.1         |
| Final R13+ | `16359e2d` | 13  | velocect.3 · formiqueen.3 · onsetra.2 / stellagon.2 · bumblebolt.3 · pylong.2         |

**Early R1–4** — the only board of the eight the optimiser left in reading order.

```
bat1:eyJ2IjoxLCJyZWdpb24iOm51bGwsInRyYWluZXIiOm51bGwsIndpbmRvdyI6MzAsInBsYWNlbWVudHMiOlt7InJvdyI6ImJhY2siLCJjb2wiOjAsImNyZWF0dXJlSWQiOiJ2ZWxvY2VjdCIsImxldmVsIjoyLCJzaGlueSI6ZmFsc2UsIm1vZGlmaWVycyI6W119LHsicm93IjoiYmFjayIsImNvbCI6MSwiY3JlYXR1cmVJZCI6ImJ1bWJsZWJvbHQiLCJsZXZlbCI6MSwic2hpbnkiOmZhbHNlLCJtb2RpZmllcnMiOltdfSx7InJvdyI6ImJhY2siLCJjb2wiOjIsImNyZWF0dXJlSWQiOiJicmF3bG1hbnRpcyIsImxldmVsIjoxLCJzaGlueSI6ZmFsc2UsIm1vZGlmaWVycyI6W119LHsicm93IjoiZnJvbnQiLCJjb2wiOjAsImNyZWF0dXJlSWQiOiJlbGVjdHJhbmFkZSIsImxldmVsIjoxLCJzaGlueSI6ZmFsc2UsIm1vZGlmaWVycyI6W119LHsicm93IjoiZnJvbnQiLCJjb2wiOjEsImNyZWF0dXJlSWQiOiJkcmFnb25lZ2ciLCJsZXZlbCI6MSwic2hpbnkiOmZhbHNlLCJtb2RpZmllcnMiOltdfSx7InJvdyI6ImZyb250IiwiY29sIjoyLCJjcmVhdHVyZUlkIjoiZ2lsZHNoZWxsIiwibGV2ZWwiOjEsInNoaW55IjpmYWxzZSwibW9kaWZpZXJzIjpbXX1dLCJ0cmlua2V0cyI6W10sIml0ZW1zIjpbXSwicGFpbnRlZCI6W10sInNtdWdnbGVkIjpbXSwidGVhbU1vZGlmaWVycyI6W119
```

**Mid R5–8**

```
bat1:eyJ2IjoxLCJyZWdpb24iOm51bGwsInRyYWluZXIiOm51bGwsIndpbmRvdyI6MzAsInBsYWNlbWVudHMiOlt7InJvdyI6ImJhY2siLCJjb2wiOjAsImNyZWF0dXJlSWQiOiJ2ZWxvY2VjdCIsImxldmVsIjozLCJzaGlueSI6ZmFsc2UsIm1vZGlmaWVycyI6W119LHsicm93IjoiYmFjayIsImNvbCI6MSwiY3JlYXR1cmVJZCI6ImZvcm1pcXVlZW4iLCJsZXZlbCI6Miwic2hpbnkiOmZhbHNlLCJtb2RpZmllcnMiOltdfSx7InJvdyI6ImJhY2siLCJjb2wiOjIsImNyZWF0dXJlSWQiOiJidW1ibGVib2x0IiwibGV2ZWwiOjIsInNoaW55IjpmYWxzZSwibW9kaWZpZXJzIjpbXX0seyJyb3ciOiJmcm9udCIsImNvbCI6MCwiY3JlYXR1cmVJZCI6ImVsZWN0cmFuYWRlIiwibGV2ZWwiOjEsInNoaW55IjpmYWxzZSwibW9kaWZpZXJzIjpbXX0seyJyb3ciOiJmcm9udCIsImNvbCI6MSwiY3JlYXR1cmVJZCI6InB5bG9uZyIsImxldmVsIjoxLCJzaGlueSI6ZmFsc2UsIm1vZGlmaWVycyI6W119LHsicm93IjoiZnJvbnQiLCJjb2wiOjIsImNyZWF0dXJlSWQiOiJjaGVydWJibGUiLCJsZXZlbCI6MSwic2hpbnkiOmZhbHNlLCJtb2RpZmllcnMiOltdfV0sInRyaW5rZXRzIjpbXSwiaXRlbXMiOltdLCJwYWludGVkIjpbXSwic211Z2dsZWQiOltdLCJ0ZWFtTW9kaWZpZXJzIjpbXSwiZGF5Ijo1fQ
```

**Late R9–12** — 89% round wins, the comp's strongest observed phase.

```
bat1:eyJ2IjoxLCJyZWdpb24iOm51bGwsInRyYWluZXIiOm51bGwsIndpbmRvdyI6MzAsInBsYWNlbWVudHMiOlt7InJvdyI6ImJhY2siLCJjb2wiOjAsImNyZWF0dXJlSWQiOiJmb3JtaXF1ZWVuIiwibGV2ZWwiOjIsInNoaW55IjpmYWxzZSwibW9kaWZpZXJzIjpbXX0seyJyb3ciOiJiYWNrIiwiY29sIjoxLCJjcmVhdHVyZUlkIjoiYnVtYmxlYm9sdCIsImxldmVsIjozLCJzaGlueSI6ZmFsc2UsIm1vZGlmaWVycyI6W119LHsicm93IjoiYmFjayIsImNvbCI6MiwiY3JlYXR1cmVJZCI6InB5bG9uZyIsImxldmVsIjoyLCJzaGlueSI6ZmFsc2UsIm1vZGlmaWVycyI6W119LHsicm93IjoiZnJvbnQiLCJjb2wiOjAsImNyZWF0dXJlSWQiOiJ2ZWxvY2VjdCIsImxldmVsIjozLCJzaGlueSI6ZmFsc2UsIm1vZGlmaWVycyI6W119LHsicm93IjoiZnJvbnQiLCJjb2wiOjEsImNyZWF0dXJlSWQiOiJzdGVsbGFnb24iLCJsZXZlbCI6MSwic2hpbnkiOmZhbHNlLCJtb2RpZmllcnMiOltdfSx7InJvdyI6ImZyb250IiwiY29sIjoyLCJjcmVhdHVyZUlkIjoib25zZXRyYSIsImxldmVsIjoxLCJzaGlueSI6ZmFsc2UsIm1vZGlmaWVycyI6W119XSwidHJpbmtldHMiOltdLCJpdGVtcyI6W10sInBhaW50ZWQiOltdLCJzbXVnZ2xlZCI6W10sInRlYW1Nb2RpZmllcnMiOltdLCJkYXkiOjl9
```

**Final R13+**

```
bat1:eyJ2IjoxLCJyZWdpb24iOm51bGwsInRyYWluZXIiOm51bGwsIndpbmRvdyI6MzAsInBsYWNlbWVudHMiOlt7InJvdyI6ImJhY2siLCJjb2wiOjAsImNyZWF0dXJlSWQiOiJ2ZWxvY2VjdCIsImxldmVsIjozLCJzaGlueSI6ZmFsc2UsIm1vZGlmaWVycyI6W119LHsicm93IjoiYmFjayIsImNvbCI6MSwiY3JlYXR1cmVJZCI6ImZvcm1pcXVlZW4iLCJsZXZlbCI6Mywic2hpbnkiOmZhbHNlLCJtb2RpZmllcnMiOltdfSx7InJvdyI6ImJhY2siLCJjb2wiOjIsImNyZWF0dXJlSWQiOiJvbnNldHJhIiwibGV2ZWwiOjIsInNoaW55IjpmYWxzZSwibW9kaWZpZXJzIjpbXX0seyJyb3ciOiJmcm9udCIsImNvbCI6MCwiY3JlYXR1cmVJZCI6InN0ZWxsYWdvbiIsImxldmVsIjoyLCJzaGlueSI6ZmFsc2UsIm1vZGlmaWVycyI6W119LHsicm93IjoiZnJvbnQiLCJjb2wiOjEsImNyZWF0dXJlSWQiOiJidW1ibGVib2x0IiwibGV2ZWwiOjMsInNoaW55IjpmYWxzZSwibW9kaWZpZXJzIjpbXX0seyJyb3ciOiJmcm9udCIsImNvbCI6MiwiY3JlYXR1cmVJZCI6InB5bG9uZyIsImxldmVsIjoyLCJzaGlueSI6ZmFsc2UsIm1vZGlmaWVycyI6W119XSwidHJpbmtldHMiOltdLCJpdGVtcyI6W10sInBhaW50ZWQiOltdLCJzbXVnZ2xlZCI6W10sInRlYW1Nb2RpZmllcnMiOltdLCJkYXkiOjEzfQ
```

### Bonshell + Opalion

| Phase      | `buildId`  | Day | Layout (top row, then bottom)                                              |
| ---------- | ---------- | --- | -------------------------------------------------------------------------- |
| Early R1–4 | `bd5c8282` | 1   | bonshell.1 · scorubble.1 · sukoi.1 / swoonet.2 · shellter.1 · gildshell.1  |
| Mid R5–8   | `bd65db08` | 5   | bonshell.3 · dracana.1 · sukoi.1 / opalion.1 · boomagon.1 · rhizuka.1      |
| Late R9–12 | `386f3f41` | 9   | opalion.2 · celestia.1 · cairnage.1 / saberhorn.1 · bonshell.3 · dracana.2 |
| Final R13+ | `000bf6a5` | 13  | opalion.2 · cairnage.2 · celestia.1 / saberhorn.2 · bonshell.3 · dracana.2 |

**Early R1–4**

```
bat1:eyJ2IjoxLCJyZWdpb24iOm51bGwsInRyYWluZXIiOm51bGwsIndpbmRvdyI6MzAsInBsYWNlbWVudHMiOlt7InJvdyI6ImJhY2siLCJjb2wiOjAsImNyZWF0dXJlSWQiOiJib25zaGVsbCIsImxldmVsIjoxLCJzaGlueSI6ZmFsc2UsIm1vZGlmaWVycyI6W119LHsicm93IjoiYmFjayIsImNvbCI6MSwiY3JlYXR1cmVJZCI6InNjb3J1YmJsZSIsImxldmVsIjoxLCJzaGlueSI6ZmFsc2UsIm1vZGlmaWVycyI6W119LHsicm93IjoiYmFjayIsImNvbCI6MiwiY3JlYXR1cmVJZCI6InN1a29pIiwibGV2ZWwiOjEsInNoaW55IjpmYWxzZSwibW9kaWZpZXJzIjpbXX0seyJyb3ciOiJmcm9udCIsImNvbCI6MCwiY3JlYXR1cmVJZCI6InN3b29uZXQiLCJsZXZlbCI6Miwic2hpbnkiOmZhbHNlLCJtb2RpZmllcnMiOltdfSx7InJvdyI6ImZyb250IiwiY29sIjoxLCJjcmVhdHVyZUlkIjoic2hlbGx0ZXIiLCJsZXZlbCI6MSwic2hpbnkiOmZhbHNlLCJtb2RpZmllcnMiOltdfSx7InJvdyI6ImZyb250IiwiY29sIjoyLCJjcmVhdHVyZUlkIjoiZ2lsZHNoZWxsIiwibGV2ZWwiOjEsInNoaW55IjpmYWxzZSwibW9kaWZpZXJzIjpbXX1dLCJ0cmlua2V0cyI6W10sIml0ZW1zIjpbXSwicGFpbnRlZCI6W10sInNtdWdnbGVkIjpbXSwidGVhbU1vZGlmaWVycyI6W119
```

**Mid R5–8**

```
bat1:eyJ2IjoxLCJyZWdpb24iOm51bGwsInRyYWluZXIiOm51bGwsIndpbmRvdyI6MzAsInBsYWNlbWVudHMiOlt7InJvdyI6ImJhY2siLCJjb2wiOjAsImNyZWF0dXJlSWQiOiJib25zaGVsbCIsImxldmVsIjozLCJzaGlueSI6ZmFsc2UsIm1vZGlmaWVycyI6W119LHsicm93IjoiYmFjayIsImNvbCI6MSwiY3JlYXR1cmVJZCI6ImRyYWNhbmEiLCJsZXZlbCI6MSwic2hpbnkiOmZhbHNlLCJtb2RpZmllcnMiOltdfSx7InJvdyI6ImJhY2siLCJjb2wiOjIsImNyZWF0dXJlSWQiOiJzdWtvaSIsImxldmVsIjoxLCJzaGlueSI6ZmFsc2UsIm1vZGlmaWVycyI6W119LHsicm93IjoiZnJvbnQiLCJjb2wiOjAsImNyZWF0dXJlSWQiOiJvcGFsaW9uIiwibGV2ZWwiOjEsInNoaW55IjpmYWxzZSwibW9kaWZpZXJzIjpbXX0seyJyb3ciOiJmcm9udCIsImNvbCI6MSwiY3JlYXR1cmVJZCI6ImJvb21hZ29uIiwibGV2ZWwiOjEsInNoaW55IjpmYWxzZSwibW9kaWZpZXJzIjpbXX0seyJyb3ciOiJmcm9udCIsImNvbCI6MiwiY3JlYXR1cmVJZCI6InJoaXp1a2EiLCJsZXZlbCI6MSwic2hpbnkiOmZhbHNlLCJtb2RpZmllcnMiOltdfV0sInRyaW5rZXRzIjpbXSwiaXRlbXMiOltdLCJwYWludGVkIjpbXSwic211Z2dsZWQiOltdLCJ0ZWFtTW9kaWZpZXJzIjpbXSwiZGF5Ijo1fQ
```

**Late R9–12**

```
bat1:eyJ2IjoxLCJyZWdpb24iOm51bGwsInRyYWluZXIiOm51bGwsIndpbmRvdyI6MzAsInBsYWNlbWVudHMiOlt7InJvdyI6ImJhY2siLCJjb2wiOjAsImNyZWF0dXJlSWQiOiJvcGFsaW9uIiwibGV2ZWwiOjIsInNoaW55IjpmYWxzZSwibW9kaWZpZXJzIjpbXX0seyJyb3ciOiJiYWNrIiwiY29sIjoxLCJjcmVhdHVyZUlkIjoiY2VsZXN0aWEiLCJsZXZlbCI6MSwic2hpbnkiOmZhbHNlLCJtb2RpZmllcnMiOltdfSx7InJvdyI6ImJhY2siLCJjb2wiOjIsImNyZWF0dXJlSWQiOiJjYWlybmFnZSIsImxldmVsIjoxLCJzaGlueSI6ZmFsc2UsIm1vZGlmaWVycyI6W119LHsicm93IjoiZnJvbnQiLCJjb2wiOjAsImNyZWF0dXJlSWQiOiJzYWJlcmhvcm4iLCJsZXZlbCI6MSwic2hpbnkiOmZhbHNlLCJtb2RpZmllcnMiOltdfSx7InJvdyI6ImZyb250IiwiY29sIjoxLCJjcmVhdHVyZUlkIjoiYm9uc2hlbGwiLCJsZXZlbCI6Mywic2hpbnkiOmZhbHNlLCJtb2RpZmllcnMiOltdfSx7InJvdyI6ImZyb250IiwiY29sIjoyLCJjcmVhdHVyZUlkIjoiZHJhY2FuYSIsImxldmVsIjoyLCJzaGlueSI6ZmFsc2UsIm1vZGlmaWVycyI6W119XSwidHJpbmtldHMiOltdLCJpdGVtcyI6W10sInBhaW50ZWQiOltdLCJzbXVnZ2xlZCI6W10sInRlYW1Nb2RpZmllcnMiOltdLCJkYXkiOjl9
```

**Final R13+** — the hardest of the eight by **F**'s ranking: 67% round wins on 48 boards.

```
bat1:eyJ2IjoxLCJyZWdpb24iOm51bGwsInRyYWluZXIiOm51bGwsIndpbmRvdyI6MzAsInBsYWNlbWVudHMiOlt7InJvdyI6ImJhY2siLCJjb2wiOjAsImNyZWF0dXJlSWQiOiJvcGFsaW9uIiwibGV2ZWwiOjIsInNoaW55IjpmYWxzZSwibW9kaWZpZXJzIjpbXX0seyJyb3ciOiJiYWNrIiwiY29sIjoxLCJjcmVhdHVyZUlkIjoiY2Fpcm5hZ2UiLCJsZXZlbCI6Miwic2hpbnkiOmZhbHNlLCJtb2RpZmllcnMiOltdfSx7InJvdyI6ImJhY2siLCJjb2wiOjIsImNyZWF0dXJlSWQiOiJjZWxlc3RpYSIsImxldmVsIjoxLCJzaGlueSI6ZmFsc2UsIm1vZGlmaWVycyI6W119LHsicm93IjoiZnJvbnQiLCJjb2wiOjAsImNyZWF0dXJlSWQiOiJzYWJlcmhvcm4iLCJsZXZlbCI6Miwic2hpbnkiOmZhbHNlLCJtb2RpZmllcnMiOltdfSx7InJvdyI6ImZyb250IiwiY29sIjoxLCJjcmVhdHVyZUlkIjoiYm9uc2hlbGwiLCJsZXZlbCI6Mywic2hpbnkiOmZhbHNlLCJtb2RpZmllcnMiOltdfSx7InJvdyI6ImZyb250IiwiY29sIjoyLCJjcmVhdHVyZUlkIjoiZHJhY2FuYSIsImxldmVsIjoyLCJzaGlueSI6ZmFsc2UsIm1vZGlmaWVycyI6W119XSwidHJpbmtldHMiOltdLCJpdGVtcyI6W10sInBhaW50ZWQiOltdLCJzbXVnZ2xlZCI6W10sInRlYW1Nb2RpZmllcnMiOltdLCJkYXkiOjEzfQ
```

### G1. What loading one of these shows today, and what it does not

The app has no opponent side yet, so loading a benchmark board puts **their** team in **your** grid.
That is still useful — it is how to inspect what the meta's boards actually do, and the Late
Formiqueen board is the fastest way to see the Onsetra gap in **D1** for yourself — but it is not a
fight. Fighting one needs User Story 3.

---

## H. Open questions

1. **Rounds vs seconds.** Everything here is in rounds; `research.md` C1–C2 predict fight length in
   seconds. `ENEMY_HP_BY_DAY` is per day and the engine's clock is in seconds, so the bridge exists
   for HP but not for "average ending round 12.6" — which describes _when a run ends_, not how long
   a fight lasts. These are not the same quantity and should not be conflated.
2. **Refreshing after a balance patch.** The boards are transcribed by name and identified by this
   project's own `buildId` (**G**), so a patch that changes the meta means re-transcribing the
   compositions and regenerating the ids — the test in
   `src/data/__tests__/benchmarkOpponents.test.ts` will fail until the published ids are updated to
   match, which is the intended behaviour. batomon.com documents no public API, so there is nothing
   to re-fetch from.
3. **Trinkets.** Uncaptured, and the engine is sensitive to them. A benchmark opponent without
   trinkets is weaker than the real thing in a way that is not quantified.
4. **Onsetra.** Known not to be read by `simulate()` and present in the top comp at every phase from
   Late onward. Until it is modelled, a fight against Comp 1 understates it.
