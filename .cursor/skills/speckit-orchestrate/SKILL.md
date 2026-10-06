---
name: "speckit-orchestrate"
description: "Run the full plan -> tasks -> validate -> implement loop for a list of items or findings. Invokes /speckit-plan and /speckit-tasks for the provided items, uses a subagent to validate that tasks.md fully captures and answers every item, remediates any gaps, then runs /speckit-implement. Use when handing over a batch of findings, review comments, audit results, or feature asks to be designed and built in one pass."
compatibility: "Requires spec-kit project structure with .specify/ directory"
disable-model-invocation: true
metadata:
  author: "local"
  source: "orchestration wrapper over speckit-plan / speckit-tasks / speckit-implement"
---

## User Input

```text
$ARGUMENTS
```

$ARGUMENTS is the **work-item list**: the items, findings, review comments, audit
results, or asks to design and build. It is the authoritative input for every
downstream step and for validation. If it is empty, STOP and ask the user for the
list instead of inventing one.

## What this skill does

Runs one complete spec-kit round over a work-item list:

```text
Step 0  Preflight + build the work-item ledger
Step 1  /speckit-plan      (design the items)
Step 2  /speckit-tasks     (break the items into tasks)
Step 3  Validation subagent: does tasks.md fully capture and answer every item?
Step 4  Remediate gaps, re-validate (max 3 rounds)
Step 5  /speckit-implement (build the tasks)
Step 6  Final report
```

The orchestrator (you) owns the ledger, the gate decisions, and all edits. The
subagent is read-only and only renders a verdict.

## Step 0: Preflight and ledger

1. Resolve the active feature: run `.specify/scripts/bash/check-prerequisites.sh --json --paths-only`
   from the repo root and parse `FEATURE_DIR` and `BRANCH`. All paths are absolute.
2. Confirm `FEATURE_DIR/spec.md` exists. If it does not, STOP: this skill operates on
   an existing feature. Tell the user to run `/speckit-specify` first.
3. Determine the round number `N`: the lowest integer for which
   `FEATURE_DIR/orchestration/round-<N>-items.md` does not yet exist (start at 1).
4. Decompose $ARGUMENTS into **atomic, individually checkable items**. One item per
   distinct ask. Split compound items ("fix X and document Y") into separate items.
   Preserve the user's wording verbatim in the `Ask` field — do not paraphrase,
   soften, reinterpret, or merge items, and do not add asks the user did not make.
5. Write the ledger to `FEATURE_DIR/orchestration/round-<N>-items.md` using this format:

   ```markdown
   # Round <N> work items

   Source: /speckit-orchestrate invocation, <date>
   Branch: <BRANCH>

   ## WI-001
   - **Ask** (verbatim): <the user's exact words for this item>
   - **Type**: behavior change | bug fix | data correction | docs | question to answer | refactor
   - **Done means**: <what observable state satisfies this item>

   ## WI-002
   ...
   ```

6. Echo the ledger as a short numbered list to the user and state the ledger path.
   Do not ask for confirmation; continue to Step 1.

## Step 1: Plan

Invoke `/speckit-plan`, passing the full ledger content as its arguments, prefixed with:

```text
Design the following work items for this feature. Each item is identified by its WI-xxx
id; keep those ids traceable in plan.md and any design artifacts you touch so coverage
can be validated later.
```

You MUST actually invoke the skill and wait for it to finish. Invoke it the same way
you would run the command yourself in this session (in skills mode this may be
`/skill:speckit-plan` or `$speckit-plan` rather than the literal `/speckit-plan`).
Describing or summarizing the step does not run it.

If `/speckit-plan` halts on a constitution gate or an unresolved NEEDS CLARIFICATION,
do not override it: stop and report which item triggered it.

## Step 2: Tasks

Invoke `/speckit-tasks`, passing the same ledger content, prefixed with:

```text
Generate tasks covering the following work items. Every item must map to at least one
task, and each task description must cite the WI-xxx id(s) it satisfies so coverage can
be validated later. Quote any constraint verbatim rather than leaving it to
implementation-time discretion.
```

Same invocation rule as Step 1: actually run it and wait for it to finish.

## Step 3: Validation subagent

Launch exactly one subagent with the `Task` tool: `subagent_type: generalPurpose`,
`model: inherit`, foreground (not background). It must be read-only — it reports, it
does not fix.

Prompt template (fill the bracketed values):

```text
Read-only audit. Do not edit, create, or delete any file.

Work-item ledger: [absolute path to round-<N>-items.md]
Tasks file: [absolute path to FEATURE_DIR/tasks.md]
Plan: [absolute path to FEATURE_DIR/plan.md]
Spec: [absolute path to FEATURE_DIR/spec.md]
Other design artifacts in [FEATURE_DIR]: data-model.md, research.md, quickstart.md,
contracts/ (read any that exist)

For EVERY work item in the ledger, decide one verdict:
- COVERED: one or more tasks fully capture the ask, and anything the item asked to be
  decided or answered is actually decided or answered in the design artifacts.
- PARTIAL: tasks touch the item but leave part of the ask, a stated constraint, or a
  question unaddressed.
- MISSING: no task addresses the item.

Rules:
- Cite specific task IDs and file:line evidence for every verdict. A verdict with no
  evidence is not acceptable.
- Judge against the ask's own wording, not against what the plan decided to do. A task
  that reinterprets or narrows the ask is PARTIAL, not COVERED.
- For items of type "question to answer", COVERED requires a concrete answer recorded
  in a design artifact, not merely a task to investigate it.
- Also flag tasks that assert a constraint, number, or behavior the ledger and spec do
  not support (overreach), and tasks that are too vague to execute without further
  interpretation.
- Do not propose implementation code. Report gaps only.

Return exactly this structure:

## Verdict table
| Item | Verdict | Evidence (task IDs / file:line) |

## Gaps
One block per PARTIAL or MISSING item: the item id, exactly what is unaddressed, and
the smallest change that would close it.

## Overreach / vagueness
Bulleted, with evidence. Omit the section if there is none.

## Summary
counts of COVERED / PARTIAL / MISSING, and a single PASS or FAIL verdict. PASS requires
every item COVERED and no overreach findings.
```

When the subagent returns:

1. Write its full report to `FEATURE_DIR/orchestration/round-<N>-validation.md`,
   appending a `## Validation pass <k>` heading for each pass.
2. Report to the user: the verdict counts, PASS/FAIL, and a one-line summary of each
   gap. Do not paste the whole report into chat.

## Step 4: Remediate and re-validate

If the verdict is PASS, skip to Step 5.

If FAIL, for each gap, apply the smallest correct fix yourself:

- Missing or partial coverage → add or tighten tasks in `FEATURE_DIR/tasks.md`,
  following that file's existing checklist format (`- [ ] T### [P?] [US#] Description
  with file path`) and continuing its task-ID sequence.
- A gap rooted in design rather than task breakdown (an undecided question, a missing
  entity, an unresolved constraint) → fix the design artifact (`plan.md`,
  `data-model.md`, `research.md`) first, then add the task.
- An item the ledger cannot satisfy without changing the spec → do NOT silently edit
  `spec.md` scope. Record it and surface it in the Step 6 report.
- Overreach → remove or correct the unsupported assertion rather than inventing
  justification for it.

Then re-launch a fresh validation subagent (same prompt, same ledger) and append its
report as the next validation pass.

Repeat up to **3 validation passes total**. If still FAIL after the third pass, STOP
before implementing and use `AskQuestion` to offer: proceed to implement with the
remaining gaps listed, keep remediating, or hand back for a scope decision.

## Step 5: Implement

Once validation returns PASS, invoke `/speckit-implement` automatically — do not ask
for approval. Pass as its arguments:

```text
Implement the tasks for round <N> work items (ledger: <path to round-<N>-items.md>).
Validation passed on pass <k>; see <path to round-<N>-validation.md>.
```

Same invocation rule as Steps 1 and 2: actually run it and wait for it to finish.
Let `/speckit-implement` own its own checklist gate, ignore-file verification, and
task-marking behavior; do not duplicate or pre-empt them here.

## Step 6: Final report

Report, in prose with a single table for the per-item outcome:

- Branch and feature dir.
- Ledger path and validation report path.
- Per item: verdict at final validation pass, and whether its tasks are now implemented.
- Number of validation passes used and what remediation each pass triggered.
- Anything deliberately left undone, and why (spec-scope decisions, gates hit, failed
  tasks). Name these plainly — an item that was dropped is more important to the user
  than a list of what succeeded.

## Rules

- Run the steps in order. Never run `/speckit-tasks` before `/speckit-plan` finishes,
  and never run `/speckit-implement` before validation returns PASS or the user
  explicitly chooses to proceed with gaps.
- The ledger is immutable once written. Remediation changes tasks and design artifacts,
  never the recorded asks.
- One subagent per validation pass, launched fresh. Validation subagents are single-use;
  do not resume one.
- Use absolute paths for file operations; use repo-relative paths when referencing files
  in reports.
- If any step halts (gate failure, user stop, failed task), stop the loop and report
  where it stopped. Do not skip ahead to a later step to salvage progress.

## Done When

- [ ] Ledger written with every ask captured verbatim as an atomic item
- [ ] `/speckit-plan` and `/speckit-tasks` both actually invoked for the ledger
- [ ] At least one validation subagent pass run, its report saved, and findings reported
- [ ] All gaps remediated, or explicitly accepted by the user
- [ ] `/speckit-implement` run after PASS (or after explicit user go-ahead)
- [ ] Final report delivered with per-item outcome and anything left undone
