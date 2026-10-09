import type { StatModifier, TeamConfiguration, TeamPlacement } from "./types";
import { ModifierScope } from "./enums";
import { scopeOf } from "./modifierScope";

/**
 * Sharing a build: a portable code plus a stable id derived from the build's content.
 *
 * ## Two different things, deliberately not conflated
 *
 * - **The code** is the build. It round-trips losslessly, so it is what you paste to restore work.
 * - **The id** is a short fingerprint *of* the build. It cannot restore anything; it exists so two
 *   people can tell whether they are looking at the same team, and so a saved build has a stable
 *   name that changes when — and only when — the build changes.
 *
 * Conflating them is the obvious mistake: a hash is not reversible, so a "UUID" alone can never
 * restore a team. The ask said "exported/imported with a UUID value… so that time-sensitive work
 * isn't lost", and losing work is exactly what a hash-only scheme would do.
 *
 * ## Why the id is content-derived rather than random
 *
 * A random UUID would differ every time you exported the same team, which defeats both uses above.
 * Deriving it from the content means the same team always yields the same id, and any change —
 * a level, a modifier, the region — yields a different one.
 *
 * ## Why canonicalisation is the hard part
 *
 * The same team can be represented many ways: slots in a different array order, trinkets listed
 * differently, `paintedCreatureIds` absent versus empty, a modifier carrying a freshly-generated
 * `id`. All of those must produce the SAME fingerprint, or the id is a fingerprint of the editing
 * history rather than of the team. `canonicalize` below is what makes that true, and it is the part
 * worth reading carefully.
 */

/** Bumped only when the code format changes incompatibly. Guards against silently misreading. */
const FORMAT_VERSION = 1;
const PREFIX = "bat1:";

/**
 * A modifier's runtime `id` is a fresh UUID per session and says nothing about the build.
 *
 * `scope` is emitted only when it is NOT the default (2026-10-08). It is build content — a bonus
 * attached to the slot survives a monster swap and one attached to the monster does not, so two
 * teams differing only in that are different builds — but writing it unconditionally would change
 * the canonical form of every build that predates the field, and with it every build id, for teams
 * nobody edited.
 *
 * `label` is emitted the same way, and for a stronger reason than attribution (2026-10-08): it is
 * what `addPlacementModifier` matches on, so a +4% Cooldown Speed labelled "Tempo Charm" and an
 * unlabelled one are two chips that behave differently — the trinket's stepper can step its own
 * back down and must not touch the other. Dropping it on export turned an imported build's banked
 * grants into bonuses with no control attached to them.
 */
function canonicalModifiers(modifiers: StatModifier[] | undefined) {
  return (modifiers ?? [])
    .map((m) => ({
      stat: m.stat,
      amount: m.amount,
      ...(scopeOf(m) === ModifierScope.Creature ? {} : { scope: scopeOf(m) }),
      ...(m.label === undefined ? {} : { label: m.label }),
    }))
    // Two modifiers added in a different order are the same build.
    .sort((a, b) => a.stat.localeCompare(b.stat) || a.amount - b.amount || (a.label ?? "").localeCompare(b.label ?? ""));
}

function canonicalPlacements(placements: TeamPlacement[]) {
  return placements
    .map((p) => ({
      row: p.slot.row,
      col: p.slot.col,
      creatureId: p.creatureId,
      level: p.level,
      // `undefined` and `false` are the same build; normalize so they hash alike.
      shiny: p.shiny === true,
      modifiers: canonicalModifiers(p.modifiers),
    }))
    // Sorted by SLOT, not by array position: dragging A onto B's slot and back is the same team.
    .sort((a, b) => a.row.localeCompare(b.row) || a.col - b.col);
}

/**
 * One representation per distinct build.
 *
 * Every optional field is normalized to a present value, every list is sorted, and nothing
 * session-scoped (modifier ids) survives. Key order is fixed by construction because the object
 * literal below is written in a fixed order and `JSON.stringify` preserves insertion order.
 */
export function canonicalize(config: TeamConfiguration) {
  return {
    v: FORMAT_VERSION,
    region: config.selectedRegion ?? null,
    trainer: config.trainerId ?? null,
    window: config.simulationWindowSeconds,
    placements: canonicalPlacements(config.placements),
    trinkets: [...config.trinketIds].sort(),
    items: [...config.itemIds].sort(),
    painted: [...(config.paintedCreatureIds ?? [])].sort(),
    smuggled: [...(config.smuggledCreatureIds ?? [])].sort(),
    teamModifiers: canonicalModifiers(config.teamModifiers),
  };
}

/**
 * FNV-1a, 32 bits, run over the canonical JSON and rendered as 8 hex characters.
 *
 * Chosen over a cryptographic hash because this is an identity check between humans, not a
 * security boundary: `crypto.subtle.digest` is async, which would make every call site async for
 * no benefit here. 32 bits is short enough to read aloud and long enough that an accidental
 * collision between builds a person is actually comparing is not a practical concern.
 */
function fnv1a(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    // `Math.imul` for a real 32-bit multiply; `*` would lose precision past 2^53.
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

/** The build's stable fingerprint. Same team in, same id out — always. */
export function buildId(config: TeamConfiguration): string {
  return fnv1a(JSON.stringify(canonicalize(config)));
}

/** Base64url: survives a URL, a chat message and a double-click without escaping. */
function toBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(code: string): string {
  const padded = code.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

/**
 * The portable code. Encodes the CANONICAL form, so the same team always produces the same string
 * — which means a user can tell at a glance whether two codes are the same build without decoding.
 */
export function exportBuild(config: TeamConfiguration): string {
  return PREFIX + toBase64Url(JSON.stringify(canonicalize(config)));
}

/** The query parameter a shared link carries, e.g. `?b=bat1:...`. */
export const BUILD_PARAM = "b";

/**
 * A shareable URL for this build.
 *
 * Built from `window.location` so it works in dev, in preview and under the GitHub Pages base path
 * without any of them being hard-coded. Existing query parameters are preserved — a link should not
 * quietly drop something else the URL was carrying.
 */
export function buildUrl(config: TeamConfiguration): string {
  const url = new URL(window.location.href);
  url.searchParams.set(BUILD_PARAM, exportBuild(config));
  url.hash = "";
  return url.toString();
}

/**
 * The build the page was opened with, or `null`.
 *
 * Returns `null` rather than throwing on a malformed parameter: a bad link should leave the user
 * with an empty builder they can use, not an error page. A bad code they PASTED does throw — there
 * the user is waiting on a specific action and silence would look like the button is broken.
 */
export function readBuildFromUrl(search = window.location.search): TeamConfiguration | null {
  const raw = new URLSearchParams(search).get(BUILD_PARAM);
  if (!raw) return null;
  try {
    return importBuild(raw);
  } catch {
    return null;
  }
}

export class InvalidBuildCodeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidBuildCodeError";
  }
}

/**
 * Decodes a code back into a configuration.
 *
 * Throws rather than returning a partial team: a build that silently drops a creature is worse than
 * one that refuses to load, because the user would keep working against a team they did not build.
 */
export function importBuild(code: string): TeamConfiguration {
  let trimmed = code.trim();

  // People paste whichever they were handed. Pulling the code out of a URL here means the import
  // field accepts both without the caller having to guess which it received.
  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const fromUrl = new URL(trimmed).searchParams.get(BUILD_PARAM);
      if (fromUrl) trimmed = fromUrl.trim();
    } catch {
      // Not a parseable URL — fall through and let the prefix check produce the clearer message.
    }
  }
  if (!trimmed.startsWith(PREFIX)) {
    throw new InvalidBuildCodeError(`Not a build code — expected it to start with "${PREFIX}".`);
  }

  let parsed: ReturnType<typeof canonicalize>;
  try {
    parsed = JSON.parse(fromBase64Url(trimmed.slice(PREFIX.length)));
  } catch {
    throw new InvalidBuildCodeError("Build code is corrupt or incomplete.");
  }

  if (parsed?.v !== FORMAT_VERSION) {
    throw new InvalidBuildCodeError(
      `Build code is format v${parsed?.v}, this app reads v${FORMAT_VERSION}.`,
    );
  }

  return {
    selectedRegion: parsed.region ?? undefined,
    trainerId: parsed.trainer ?? null,
    simulationWindowSeconds: parsed.window,
    placements: parsed.placements.map((p) => ({
      slot: { row: p.row, col: p.col },
      creatureId: p.creatureId,
      level: p.level,
      ...(p.shiny ? { shiny: true } : {}),
      // Modifier ids are regenerated: they are session identity, not build content.
      modifiers: p.modifiers.map((m, i) => ({ ...m, id: `imported-${p.row}${p.col}-${i}` })),
    })),
    trinketIds: parsed.trinkets,
    itemIds: parsed.items,
    paintedCreatureIds: parsed.painted,
    smuggledCreatureIds: parsed.smuggled,
    teamModifiers: parsed.teamModifiers.map((m, i) => ({ ...m, id: `imported-team-${i}` })),
  };
}
