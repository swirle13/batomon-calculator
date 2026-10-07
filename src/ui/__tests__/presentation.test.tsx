import { describe, expect, it } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { TrinketPicker } from "../GridPicker/TrinketPicker";
import { CreatureSearchModal } from "../GridPicker/CreatureSearchModal";
import { TeamSummary } from "../TeamSummary/TeamSummary";
import { CorpusBrowser } from "../CorpusBrowser/CorpusBrowser";
import App from "../../App";
import { TotalDps } from "../TeamSummary/TotalDps";
import { TeamConfigProvider } from "../../context/TeamConfigContext";
import { PlacedCreatureDetails } from "../TeamSummary/PlacedCreatureDetails";
import { ModifierEditor } from "../Modifiers/ModifierEditor";
import { buildStatLines, perCastOutputOf } from "../shared/BatomonCard/BatomonCard";
import { GridPicker } from "../GridPicker/GridPicker";
import { simulate } from "../../engine/simulate";
import { corpus } from "../../data/corpus";
import type { TeamConfiguration } from "../../data/types";

/**
 * Tripwires for the round-6 presentation items that would otherwise have **no** automated coverage
 * at all (tasks.md T139, user items 1, 2, 4, 10, 13).
 *
 * These are deliberately small. The point is not exhaustive coverage of layout — it is that a
 * future change which silently undoes one of these user requests fails a test by name instead of
 * being noticed (or not) by eye three rounds later. Several of this round's own findings were
 * requests that had quietly survived from an earlier round's "verified manually" pass.
 */

const CONFIG: TeamConfiguration = {
  placements: [{ slot: { row: "front", col: 0 }, creatureId: "bumblebolt", level: 1 }],
  trainerId: null,
  trinketIds: [],
  itemIds: [],
  simulationWindowSeconds: 20,
  teamModifiers: [],
};

describe("TrinketPicker (FR-032, item 4)", () => {
  it("is not a dropdown of names, and shows each trinket's full effect text", () => {
    render(
      <TeamConfigProvider initialConfig={CONFIG}>
        <TrinketPicker />
      </TeamConfigProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: /choose trinkets/i }));

    const dialog = screen.getByRole("dialog", { name: /choose trinkets/i });
    // The whole point of item 4: a <select> of 93 names could show neither sprite nor effect.
    expect(dialog.querySelectorAll("option").length).toBeLessThan(
      corpus.trinkets.length,
    );
    // Matched on a distinctive fragment: several trinkets' effectText embeds a trigger line and a
    // newline ("On Victory\nYour team gains +5 Damage permanently."), which the DOM collapses.
    expect(screen.getByText(/Your team gains \+5 Damage permanently/)).toBeTruthy();
  });

  it("marks the trinkets whose effects actually reach the simulation", () => {
    render(
      <TeamConfigProvider initialConfig={CONFIG}>
        <TrinketPicker />
      </TeamConfigProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: /choose trinkets/i }));
    // 6 of 93 are engine-wired; that honest distinction predates this round and must survive it.
    expect(screen.getAllByText(/affects DPS/i).length).toBeGreaterThan(0);
  });
});

describe("CreatureSearchModal heading (FR-034, item 13)", () => {
  it("shows no slot position in the visible heading, but keeps it for assistive tech", () => {
    render(<CreatureSearchModal slot={{ row: "back", col: 1 }} onClose={() => {}} onSelect={() => {}} />);
    expect(screen.getByRole("heading", { name: "Choose a Batomon" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: /back row, slot/i })).toBeNull();
    // The user clicked the slot so they know which it is; a screen-reader user may not have.
    expect(screen.getByRole("dialog").getAttribute("aria-label")).toMatch(/back row, slot 2/i);
  });
});

describe("TeamSummary layout (FR-038, item 10)", () => {
  it("renders both tables inside one shared container, not two separate blocks", () => {
    const result = simulate(CONFIG, corpus);
    const { container } = render(<TeamSummary config={CONFIG} result={result} />);
    const tables = container.querySelectorAll("table");
    expect(tables.length).toBe(2);
    // Side by side as one aligned unit: both tables share a single parent element.
    expect(tables[0]!.parentElement).toBe(tables[1]!.parentElement);
  });
});

describe("CorpusBrowser (FR-028/FR-030, items 1-3)", () => {
  it("renders no source-citation or source-conflict disclosures", () => {
    render(<CorpusBrowser />);
    expect(screen.queryByText(/sources & patch/i)).toBeNull();
    expect(screen.queryByText(/recorded source conflicts/i)).toBeNull();
    // ...while the data itself is untouched and still asserted by provenance.test.ts.
    expect(corpus.creatures.every((c) => c.sourceRefs.length > 0)).toBe(true);
  });

  it("puts cooldown and damage on separate lines rather than one combined line", () => {
    const { container } = render(<CorpusBrowser />);
    // Item 1's specific complaint: "It displays cost, cooldown, and damage all on the same line".
    const combined = Array.from(container.querySelectorAll("*")).filter((el) => {
      const own = Array.from(el.childNodes)
        .filter((n) => n.nodeType === Node.TEXT_NODE)
        .map((n) => n.textContent ?? "")
        .join("");
      return /Cost \$.*Cooldown.*Damage/i.test(own);
    });
    expect(combined).toEqual([]);
  });
});

/**
 * Round-7 coverage for the items that otherwise had none (tasks.md T173). Thirteen of this round's
 * twenty items would have been verified only by a by-hand walk — the same "verified by eye" gap
 * that let item 8's completely dead click handler survive an entire round of CI.
 *
 * Note these assert POSITIVES. A prior round's copy test only asserted the *absence* of the wrong
 * string, which passes just as happily if the right string never renders either.
 */
describe("round 7 presentation fixes", () => {
  it("names the creatures 'Batomon', positively (FR-042, items 2 + 9)", () => {
    render(
      <TeamConfigProvider initialConfig={CONFIG}>
        <PlacedCreatureDetails result={simulate(CONFIG, corpus)} highlightedSlot={null} />
      </TeamConfigProvider>,
    );
    render(<CreatureSearchModal slot={{ row: "back", col: 1 }} onClose={() => {}} onSelect={() => {}} />);
    expect(screen.getByRole("heading", { name: "Choose a Batomon" })).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/Banto\b/);
  });

  it("shows no corpus-snapshot prose anywhere (FR-070; FR-014 retired 2026-10-06)", () => {
    // Round 8 (WI-014) removed the prose from the browser and moved the version to a footer, which
    // was FR-014's third home. Its removal was then requested from that footer too.
    //
    // Three independent refusals is the answer, so FR-014 is RETIRED rather than quietly unmet —
    // which is exactly what the comment in App.tsx instructed should happen on a third removal.
    // Provenance survives per-record in each creature's `patch` field, and is strictly better
    // there: v1.3.0 moved 15 of 149 creatures, so one app-wide label would have been wrong for the
    // other 134 the moment a partial update landed.
    const { unmount } = render(<CorpusBrowser />);
    expect(screen.queryByText(/Corpus snapshot:/)).toBeNull();
    unmount();
    render(<App />);
    expect(screen.queryByText(/^Corpus: /)).toBeNull();
  });

  it("renders the split type background without a gradient (FR-049, item 11)", () => {
    render(<CreatureSearchModal slot={{ row: "back", col: 0 }} onClose={() => {}} onSelect={() => {}} />);
    // The sliver came from a linear-gradient painted across the border box. Two explicit halves
    // cannot reproduce it, so the absence of any gradient is the structural guarantee.
    const withGradient = Array.from(document.querySelectorAll<HTMLElement>("[style]")).filter((el) =>
      (el.getAttribute("style") ?? "").includes("linear-gradient"),
    );
    expect(withGradient).toEqual([]);
  });

  it("groups picker results into rarity sections and puts no rarity text on the cards (FR-048, item 10)", () => {
    render(<CreatureSearchModal slot={{ row: "back", col: 0 }} onClose={() => {}} onSelect={() => {}} />);
    expect(screen.getAllByRole("heading", { level: 4 }).length).toBeGreaterThan(1);
    // Rarity is structure now, not a per-card label; the only "Common" text should be headings
    // and the filter <option>, never inside a result card.
    const cardTexts = Array.from(document.querySelectorAll("button")).map((b) => b.textContent ?? "");
    expect(cardTexts.some((t) => /Common|Rare|Mythical/.test(t))).toBe(false);
  });

  it("renders grid sprites at the shared token size, not a per-call-site literal (FR-053, item 18)", () => {
    render(
      <TeamConfigProvider initialConfig={CONFIG}>
        <GridPicker onHighlightSlot={() => {}} />
      </TeamConfigProvider>,
    );
    const sprite = screen.getByRole("img", { name: "Bumblebolt" });
    // 64 is the token default (jsdom resolves no CSS custom property), up from an arbitrary 40.
    expect(sprite.getAttribute("width")).toBe("64");
  });

  it("shows cooldown at one decimal on both bands (FR-044, item 4)", () => {
    // 2026-10-06: the effective band now renders only when it DIFFERS from the card above it, so
    // this needs a creature whose battle values actually change. Bumblebolt alone no longer shows
    // two bands — which is the point of that change, not a regression in this one.
    const modified: TeamConfiguration = {
      ...CONFIG,
      teamModifiers: [{ id: "m1", stat: "damageFlatAdd", amount: 5 }],
    };
    render(
      <TeamConfigProvider initialConfig={modified}>
        <PlacedCreatureDetails result={simulate(modified, corpus)} highlightedSlot={null} />
      </TeamConfigProvider>,
    );
    // Bumblebolt's cooldown is 2.5s. Both bands must agree; they used to render 2.5 and 2.50 one
    // above the other.
    expect(screen.getAllByText("2.5").length).toBe(2);
    expect(screen.queryByText("2.50")).toBeNull();
  });

  it("hides the effective band entirely when nothing differs (item 2)", () => {
    // A second panel repeating the first invites the user to hunt for a difference and find none,
    // which is worse than no panel: it implies something changed.
    render(
      <TeamConfigProvider initialConfig={CONFIG}>
        <PlacedCreatureDetails result={simulate(CONFIG, corpus)} highlightedSlot={null} />
      </TeamConfigProvider>,
    );
    expect(screen.queryByText(/Effective this battle/i)).toBeNull();
  });

  it("reports Shield without the over-qualifying parenthetical (FR-046, item 7)", () => {
    const shieldConfig = { ...CONFIG, placements: [{ slot: { row: "back", col: 0 } as const, creatureId: "opalion", level: 1 as const }] };
    render(<TeamSummary config={shieldConfig} result={simulate(shieldConfig, corpus)} />);
    expect(screen.queryByText(/Shield \(granted\)/)).toBeNull();
    expect(screen.getByText("Shield")).toBeTruthy();
  });

  it("reports second-order status metrics, not just one averaged figure (FR-055, item 20)", () => {
    const poison = { ...CONFIG, placements: [{ slot: { row: "back", col: 0 } as const, creatureId: "drumire", level: 1 as const }] };
    render(<TeamSummary config={poison} result={simulate(poison, corpus)} />);
    // getAllByText: earlier cases in this file also render a TeamSummary, so the header text can
    // legitimately appear more than once in the shared DOM.
    expect(screen.getAllByText(/Dmg\/s \(avg\)/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Dmg\/s \(end\)/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Applied\/s/).length).toBeGreaterThan(0);
    // Growth/s² removed 2026-10-06: for Poison it was structurally IDENTICAL to Applied/s (stacks
    // never decay and a tick deals the current count, so the rate grows by exactly the applied
    // rate), always 0 for Shield, and an uninterpretable second derivative for Burn and Shock.
    // FR-055's substance — more than one averaged figure — is still met by avg, end and applied.
    expect(screen.queryByText(/Growth\/s/)).toBeNull();
  });
});

/**
 * Round 9 (FR-071/FR-072/FR-076): the headline total, the table total row, and the grid width fix.
 */
describe("round 9: total DPS and grid sizing", () => {
  /** The user's own team: four Poison creatures, zero direct damage. */
  const poisonTeam: TeamConfiguration = {
    placements: [
      { slot: { row: "front", col: 1 }, creatureId: "miasmaw", level: 1 },
      { slot: { row: "front", col: 2 }, creatureId: "cobrex", level: 1 },
      { slot: { row: "back", col: 0 }, creatureId: "drumire", level: 1 },
      { slot: { row: "back", col: 1 }, creatureId: "fumungus", level: 1 },
    ],
    trainerId: null,
    trinketIds: [],
    itemIds: [],
    simulationWindowSeconds: 20,
    teamModifiers: [],
  };

  it("shows a non-zero headline total for a team whose every DPS row reads 0.00 (FR-072)", () => {
    const result = simulate(poisonTeam, corpus);
    // The defect this fixes: perCreatureDps counts DIRECT damage only, so this team read 0.00
    // everywhere while dealing ~136.6/s.
    //
    // 2026-10-06 (T244): this asserted ZERO rows. It is now 1 — Fumungus's "additional Damage equal
    // to 200% of the Poison stacks on the enemy" is modelled, and that damage is DIRECT, so the
    // board is no longer a pure-status team. The headline figure still matters (3 of 4 creatures
    // contribute nothing to the direct column), so the test's point survives; its premise moved.
    expect(Object.keys(result.perCreatureDps).length).toBe(1);
    render(<TotalDps config={poisonTeam} result={result} />);
    // RE-DERIVED round 9 (T202/T200b), not re-baselined. This read 136.60 while every creature
    // ability on this board was inert. With the effect resolver and the event-driven scheduler,
    // Miasmaw applies Poison 336 instead of 10 and Cobrex fires at t=9.1 instead of t=15, so the
    // team's real output is 1155.70/s. The ~8.5x jump IS the answer to the user's "I think the DPS
    // measurement is off" -- it was, by that factor, for this archetype.
    // 2026-10-06 (T213): was 1155.70. Drumire's ally-cast Cooldown Speed grant now applies and
    // COMPOUNDS -- every Toxic ally cast adds another +5% for the rest of the battle -- so the
    // team's real output rises. The compounding is what the ability says ("for this battle",
    // granted per cast); it converges because the simulation window bounds it. The effect grows
    // superlinearly with the window, because each extra cast earned by the speed-up earns further
    // speed-up.
    //
    // 2026-10-06 (T244): 1217.80 -> 1658.90. Fumungus is on this board and its ability -- "additional
    // Damage equal to 200% of the Poison stacks on the enemy" -- was previously unmodelled, leaving
    // it dealing nothing. The capture identified it as the team's LARGEST damage term, so a 36%
    // rise is the expected direction and rough magnitude, not a surprise.
    //
    // 2026-10-06 (status pooling): 1658.90 -> 1774.40. Poison used to tick once per APPLICATION, on
    // separate clocks; it now ticks once for the whole stack on one cadence, which is both fewer
    // ticks and a larger amount each. For this Poison-heavy board the larger amount dominates.
    //
    // 2026-10-06 (global tick grid): ticks now run on a clock anchored to battle start rather than
    // to first application, and a tick sharing a cast's instant reads the PRE-cast stack. Both are
    // from frame-by-frame play (research.md B2a); for this board they net back to 1774.40.
    expect(screen.getByText("1774.40")).toBeTruthy();
  });

  it("states the engine's coverage ceiling right where the number is (FR-075)", () => {
    const result = simulate(poisonTeam, corpus);
    render(<TotalDps config={poisonTeam} result={result} />);
    // Round 11 replaced the sentence with a counter; 2026-10-06 made the counter measure abilities
    // that NEED modelling. It previously used every placed creature as the denominator, so a team
    // whose creatures have no abilities at all read "0 of 3 modelled" beside a correct DPS figure.
    // With a real gap it still reports one; with nothing outstanding it renders nothing.
    expect(screen.getByText(/\d+ of \d+ abilities not yet modelled/)).toBeTruthy();
  });

  it("reads 'DPS average' until the scrubber is moved (WI-R11-003)", () => {
    const result = simulate(poisonTeam, corpus);
    render(<TotalDps config={poisonTeam} result={result} />);
    expect(screen.getByText("DPS average")).toBeTruthy();
    // The direct-vs-facilitated explanation is gone; only the figure and its caption remain.
    expect(screen.queryByText(/status\/facilitated/)).toBeNull();
  });

  it("adds a total row to the per-creature table (FR-072 / WI-002)", () => {
    const result = simulate(poisonTeam, corpus);
    render(<TeamSummary config={poisonTeam} result={result} />);
    expect(screen.getByRole("rowheader", { name: "Total" })).toBeTruthy();
  });
});

describe("effective band renders healing (2026-10-06)", () => {
  // Dribblet is a pure healer: healAmount 15, no damage, no status. The "Effective this battle"
  // band read "No published per-cast output" beside a card that showed "Heal 15" — because
  // `perCreatureEffectiveStats` carried no heal field at all, and the band's `buildStatLines` call
  // omitted it. 9 species were fully blank this way and 20 were missing a heal line.
  const healerTeam: TeamConfiguration = {
    placements: [{ slot: { row: "back", col: 0 }, creatureId: "dribblet", level: 1 }],
    trainerId: null,
    trinketIds: [],
    itemIds: [],
    simulationWindowSeconds: 20,
    teamModifiers: [],
  };

  it("carries heal through to the effective stats", () => {
    const result = simulate(healerTeam, corpus);
    expect(result.perCreatureEffectiveStats["dribblet@back0"]!.output.heal).toBe(15);
  });

  it("renders a Heal line rather than an empty band", () => {
    const effective = simulate(healerTeam, corpus).perCreatureEffectiveStats["dribblet@back0"]!;
    // The point of `PerCastOutput`: the band passes the engine's shape straight through, with no
    // field list to forget a stat in.
    const lines = buildStatLines(effective.output);
    // An empty list is what `StatLines` renders as "No published per-cast output".
    expect(lines).not.toHaveLength(0);
    expect(lines.map((l) => l.label)).toContain("Heal 15");
  });

  it("GUARD: no creature whose only output is healing can produce an empty effective band", () => {
    const healOnly = corpus.creatures.filter(
      (c) =>
        c.level === 1 &&
        (c.healAmount ?? 0) > 0 &&
        c.baseDamage === null &&
        (c.appliesStatus ?? []).length === 0,
    );
    expect(healOnly.length, "fixture depends on heal-only species existing").toBeGreaterThan(0);
    for (const c of healOnly) {
      const lines = buildStatLines(perCastOutputOf(c));
      expect(lines.length, `${c.name} renders an empty effective band`).toBeGreaterThan(0);
    }
  });
});

describe("modifier amount input (2026-10-07)", () => {
  const CFG: TeamConfiguration = {
    placements: [{ slot: { row: "back", col: 0 }, creatureId: "bumblebolt", level: 1 }],
    trainerId: null,
    trinketIds: [],
    itemIds: [],
    simulationWindowSeconds: 30,
    teamModifiers: [],
  };

  it("starts empty rather than prefilled with 0", () => {
    // A prefilled zero meant typing 20 produced "020" unless you deleted it first. The placeholder
    // still shows the expected shape without putting a value in the field.
    render(
      <TeamConfigProvider initialConfig={CFG}>
        <ModifierEditor />
      </TeamConfigProvider>,
    );
    const input = screen.getByLabelText(/Amount to add for Bumblebolt/) as HTMLInputElement;
    expect(input.value).toBe("");
    expect(input.placeholder).toBe("0");
  });

  it("Enter adds the modifier, without reaching for the Add button", () => {
    render(
      <TeamConfigProvider initialConfig={CFG}>
        <ModifierEditor />
      </TeamConfigProvider>,
    );
    const input = screen.getByLabelText(/Amount to add for Bumblebolt/) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "20" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(screen.getByText(/Damage \+20/)).toBeTruthy();
    // Cleared and still focused, so a second modifier can be typed straight away — adding several
    // in a row is the normal case.
    expect(input.value).toBe("");
    expect(document.activeElement).toBe(input);
  });

  it("Enter with an empty or zero amount does nothing", () => {
    render(
      <TeamConfigProvider initialConfig={CFG}>
        <ModifierEditor />
      </TeamConfigProvider>,
    );
    const input = screen.getByLabelText(/Amount to add for Bumblebolt/) as HTMLInputElement;
    fireEvent.keyDown(input, { key: "Enter" });
    fireEvent.change(input, { target: { value: "0" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(screen.queryByText(/Damage \+0/)).toBeNull();
  });
});
