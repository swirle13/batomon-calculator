import { corpus } from "../../data/corpus";
import { useTeamConfig } from "../../context/TeamConfigContext";
import { TrainerCard } from "../shared/TrainerCard/TrainerCard";
import { Field, Select } from "../primitives";
import type { RegionId } from "../../data/types";

/**
 * Region + Trainer selection (FR-006, FR-087, FR-089).
 *
 * Both stay `<select>`s: a 23-item list picks faster from a native control than from a grid of
 * cards, and neither choice benefits from the sprite-and-text card the creature picker needs.
 *
 * ## The selects live INSIDE the trainer card (2026-10-07)
 *
 * They were a row above it, and the card itself was mounted only once a trainer was chosen — so the
 * two controls appeared to push a card into existence below them on the first selection. They are
 * now stacked in the card's right half, and the card renders in an empty state until a trainer is
 * picked. Same two controls, in the panel whose content they determine, with nothing appearing or
 * disappearing as they are used.
 *
 * This component owns the selects and the config wiring; `TrainerCard` takes them as a slot and
 * knows nothing about the run's state.
 *
 * ## Region is first, but it does not gate anything
 *
 * The ask was "the player chooses a region before they choose anything else", so the region control
 * sits above the trainer — but it no longer DISABLES the trainer, and the creature pool no longer
 * excludes other regions.
 *
 * Gating was wrong because the region is not actually a wall: the Travelling Merchant event can put
 * a rare creature from another region in your shop, and once it is on your team you need to be able
 * to find it. A filter that hides it makes the tool unable to represent a board the player is
 * looking at, which is the one thing it must always do.
 *
 * Region still earns its place: it drives Smuggler's "opposite region" list, and out-of-region
 * creatures are MARKED in the picker rather than removed.
 */
const REGIONS: { id: RegionId; label: string }[] = [
  { id: "pantra", label: "Pantra" },
  { id: "jinto", label: "Jinto" },
];

export function TrainerPicker() {
  const { config, setTrainerId, setSelectedRegion } = useTeamConfig();
  const trainer = corpus.trainers.find((t) => t.id === config.trainerId) ?? null;

  /*
   * `labelWidth` is what keeps the two controls aligned: stacked inline fields otherwise size each
   * label to its own text, so "Region" and "Trainer" would start their selects at different
   * x-positions one above the other.
   */
  return (
    <TrainerCard
      trainer={trainer}
      controls={
        <>
          <Field label="Region" inline labelWidth="4.5rem">
            <Select
              block
              value={config.selectedRegion ?? ""}
              onChange={(e) => setSelectedRegion(e.target.value === "" ? undefined : e.target.value)}
            >
              <option value="">— choose a region —</option>
              {REGIONS.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Trainer" inline labelWidth="4.5rem">
            <Select
              block
              value={config.trainerId ?? ""}
              onChange={(e) => setTrainerId(e.target.value === "" ? null : e.target.value)}
            >
              <option value="">— none —</option>
              {[...corpus.trainers]
                .sort((a, b) => a.name.localeCompare(b.name))
                .map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
            </Select>
          </Field>
        </>
      }
    />
  );
}
