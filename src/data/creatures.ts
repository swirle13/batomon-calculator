import type { CreatureSpecies } from "./types";
import { AbilityTagKind, AbilityTrigger, CreatureType, DamageChannel, ModifierStat, Rarity, StatChangeStat, StatusEffectType, TargetKind } from "./enums";
import { Species } from "./ids";

/**
 * The creature corpus: 149 named Batomon, reconciled from berrymint's imported Balance 24 / 1.2.0
 * catalog and patched to v1.3.0 from the official notes.
 *
 * ## One entry per species (2026-10-08)
 *
 * This file used to hold 596 records — one per (species, level) — which repeated each creature's
 * name, rarity, types, sprite and trigger four times and ran to 11.5k lines. It now holds 149
 * entries whose level 1 stat line sits inline, with `levels` carrying only what changes at 2, 3
 * and 4. Anything a level omits is inherited from level 1.
 *
 * Nothing downstream reads this shape. `data/corpus.ts` materialises all four levels of every
 * species into the flat `CreatureRecord` the engine and the UI have always read, so the collapse
 * is a change of storage and not of meaning. `corpusIntegrity` and `levelSeries` both still
 * check all 596 resolved records value-for-value against the authoritative source.
 *
 * The level progressions are stored, never computed. Levels 2 and 3 are usually 2x and 3x level 1,
 * but level 4 multipliers observed across the corpus run 1x, 2x, 3x, 6x, 12x, 24x, 30x, 100x and
 * 999x, and damage alone has 15 distinct progression shapes — there is no formula to replace them
 * with.
 *
 * ## Provenance
 *
 * Sources: batomon.net's community dex (Rarity/Types/ability text), batomonshowdown.wiki's demo
 * tier/cost table (Cost), batodex.com's per-level series (stats). The sources disagree on the
 * roster total (144 vs. 149 vs. 88) because they count different things — ordinary shop entries
 * vs. all dex rows including events/placeholders vs. species. This file reconciles them into one
 * list.
 *
 * Two creature types absent from the original union were observed directly in these sources and
 * added to `CreatureType`: "Curio" and "NULL" (see `types.ts` for the inline citation).
 */

export const creatures: CreatureSpecies[] = [{
	id: Species.Bumblebolt,
	name: "Bumblebolt",
	rarity: Rarity.Common,
	types: [CreatureType.Bug, CreatureType.Electric],
	spriteFile: "bumblebolt.png",
	shopCost: 10,
	baseCooldownSeconds: 2.5,
	baseMulticast: 1,
	publishedCast: { damage: 3, channel: DamageChannel.Direct },
	appliesStatus: [{ type: StatusEffectType.Shock, amount: 1 }],
	abilityText: "Deals 3 direct damage every 2.5 seconds and applies 1 Shock. \"The poster Common: 2.5s, Shock, cheap.\"",
	abilityTags: [],
	levels: {
		2: {
			publishedCast: { damage: 6, channel: DamageChannel.Direct },
			appliesStatus: [{ type: StatusEffectType.Shock, amount: 2 }],
			abilityText: "",
		},
		3: {
			publishedCast: { damage: 9, channel: DamageChannel.Direct },
			appliesStatus: [{ type: StatusEffectType.Shock, amount: 3 }],
			abilityText: "",
		},
		4: {
			baseMulticast: 2,
			publishedCast: { damage: 9, channel: DamageChannel.Direct },
			appliesStatus: [{ type: StatusEffectType.Shock, amount: 3 }],
			abilityText: "",
		},
	},
}, {
	id: Species.Formiqueen,
	name: "Formiqueen",
	rarity: Rarity.Rare,
	types: [CreatureType.Bug],
	abilityTrigger: AbilityTrigger.Ongoing,
	spriteFile: "formiqueen.png",
	shopCost: 25,
	baseCooldownSeconds: 4,
	baseMulticast: 1,
	publishedCast: { damage: 60, channel: DamageChannel.Direct },
	abilityText: "Ongoing: Adjacent Common allies have +25% Cooldown Speed.",
	abilityTags: [
	  { kind: AbilityTagKind.Ongoing, target: { kind: TargetKind.Adjacent, sameTeamOnly: true }, effect: { statChange: { stat: StatChangeStat.CooldownSpeed, amount: 0.25 } } },
	  { kind: AbilityTagKind.CooldownSpeedModifier, target: { kind: TargetKind.Adjacent, sameTeamOnly: true }, amount: 0.25 },
	],
	levels: {
		2: {
			publishedCast: { damage: 120, channel: DamageChannel.Direct },
			abilityText: "Adjacent Common allies have +50% Cooldown Speed.",
			abilityTags: [
			  { kind: AbilityTagKind.Ongoing, target: { kind: TargetKind.Adjacent, sameTeamOnly: true }, effect: { statChange: { stat: StatChangeStat.CooldownSpeed, amount: 0.5 } } },
			  { kind: AbilityTagKind.CooldownSpeedModifier, target: { kind: TargetKind.Adjacent, sameTeamOnly: true }, amount: 0.5 },
			],
		},
		3: {
			publishedCast: { damage: 180, channel: DamageChannel.Direct },
			abilityText: "Adjacent Common allies have +75% Cooldown Speed.",
			abilityTags: [
			  { kind: AbilityTagKind.Ongoing, target: { kind: TargetKind.Adjacent, sameTeamOnly: true }, effect: { statChange: { stat: StatChangeStat.CooldownSpeed, amount: 0.75 } } },
			  { kind: AbilityTagKind.CooldownSpeedModifier, target: { kind: TargetKind.Adjacent, sameTeamOnly: true }, amount: 0.75 },
			],
		},
		4: {
			publishedCast: { damage: 720, channel: DamageChannel.Direct },
			abilityText: "Adjacent Common allies have +225% Cooldown Speed.",
			abilityTags: [
			  { kind: AbilityTagKind.Ongoing, target: { kind: TargetKind.Adjacent, sameTeamOnly: true }, effect: { statChange: { stat: StatChangeStat.CooldownSpeed, amount: 2.25 } } },
			  { kind: AbilityTagKind.CooldownSpeedModifier, target: { kind: TargetKind.Adjacent, sameTeamOnly: true }, amount: 2.25 },
			],
		},
	},
}, {
	id: Species.Venopuff,
	name: "Venopuff",
	rarity: Rarity.Common,
	types: [CreatureType.Toxic],
	spriteFile: "venopuff.png",
	shopCost: 15,
	baseCooldownSeconds: 3.5,
	baseMulticast: 1,
	appliesStatus: [{ type: StatusEffectType.Poison, amount: 4 }],
	abilityText: "",
	abilityTags: [],
	levels: {
		2: {
			appliesStatus: [{ type: StatusEffectType.Poison, amount: 8 }],
		},
		3: {
			appliesStatus: [{ type: StatusEffectType.Poison, amount: 12 }],
		},
		4: {
			baseMulticast: 2,
			appliesStatus: [{ type: StatusEffectType.Poison, amount: 12 }],
		},
	},
}, {
	id: Species.Scorchimp,
	name: "Scorchimp",
	rarity: Rarity.Common,
	types: [CreatureType.Fire],
	evolvesInto: Species.Sunsage,
	evolvesAtLevel: 3,
	spriteFile: "scorchimp.png",
	shopCost: 10,
	baseCooldownSeconds: 5.5,
	baseMulticast: 1,
	publishedCast: { damage: 5, channel: DamageChannel.Direct },
	appliesStatus: [{ type: StatusEffectType.Burn, amount: 5 }],
	abilityText: "Deals 5 direct damage and applies 5 Burn every 5.5 seconds. Evolves at level 3 into Sunsage.",
	abilityTags: [],
	levels: {
		2: {
			publishedCast: { damage: 10, channel: DamageChannel.Direct },
			appliesStatus: [{ type: StatusEffectType.Burn, amount: 10 }],
			abilityText: "Evolves at level 3.",
		},
		3: {
			publishedCast: { damage: 15, channel: DamageChannel.Direct },
			appliesStatus: [{ type: StatusEffectType.Burn, amount: 15 }],
			abilityText: "Evolves at level 3.",
		},
		4: {
			publishedCast: { damage: 15, channel: DamageChannel.Direct },
			appliesStatus: [{ type: StatusEffectType.Burn, amount: 15 }],
			abilityText: "Evolves at level 3.",
		},
	},
}, {
	id: Species.Pebbler,
	name: "Pebbler",
	rarity: Rarity.Common,
	types: [CreatureType.Rock],
	abilityTrigger: AbilityTrigger.OnCast,
	spriteFile: "pebbler.png",
	shopCost: 15,
	baseCooldownSeconds: 5,
	baseMulticast: 1,
	appliesStatus: [{ type: StatusEffectType.Shield, amount: 20 }],
	abilityText: "+15 Shield for this battle.",
	abilityTags: [
	  { kind: AbilityTagKind.BuffOnCast, target: { kind: TargetKind.Self }, effect: { statusGrant: { type: StatusEffectType.Shield, amount: 15 } } },
	],
	levels: {
		2: {
			appliesStatus: [{ type: StatusEffectType.Shield, amount: 40 }],
			abilityText: "+30 Shield for this battle.",
			abilityTags: [
			  { kind: AbilityTagKind.BuffOnCast, target: { kind: TargetKind.Self }, effect: { statusGrant: { type: StatusEffectType.Shield, amount: 30 } } },
			],
		},
		3: {
			appliesStatus: [{ type: StatusEffectType.Shield, amount: 60 }],
			abilityText: "+45 Shield for this battle.",
			abilityTags: [
			  { kind: AbilityTagKind.BuffOnCast, target: { kind: TargetKind.Self }, effect: { statusGrant: { type: StatusEffectType.Shield, amount: 45 } } },
			],
		},
		4: {
			appliesStatus: [{ type: StatusEffectType.Shield, amount: 120 }],
			abilityText: "+90 Shield for this battle.",
			abilityTags: [
			  { kind: AbilityTagKind.BuffOnCast, target: { kind: TargetKind.Self }, effect: { statusGrant: { type: StatusEffectType.Shield, amount: 90 } } },
			],
		},
	},
}, {
	id: Species.Onsetra,
	name: "Onsetra",
	rarity: Rarity.Legendary,
	types: [CreatureType.Dragon],
	spriteFile: "onsetra.png",
	shopCost: 50,
	baseCooldownSeconds: 4,
	baseMulticast: 1,
	publishedCast: { damage: 100, channel: DamageChannel.Direct },
	abilityText: "Ongoing: the ally behind applies its Ongoing abilities 1 additional time.",
	abilityTags: [
	  { kind: AbilityTagKind.Ongoing, target: { kind: TargetKind.Behind }, effect: { extraOngoingApplications: 1 } },
	],
	levels: {
		2: {
			publishedCast: { damage: 200, channel: DamageChannel.Direct },
			abilityText: "The ally behind applies its Ongoing abilities 2 additional time(s).",
			abilityTags: [
			  { kind: AbilityTagKind.Ongoing, target: { kind: TargetKind.Behind }, effect: { extraOngoingApplications: 2 } },
			],
		},
		3: {
			publishedCast: { damage: 300, channel: DamageChannel.Direct },
			abilityText: "The ally behind applies its Ongoing abilities 3 additional time(s).",
			abilityTags: [
			  { kind: AbilityTagKind.Ongoing, target: { kind: TargetKind.Behind }, effect: { extraOngoingApplications: 3 } },
			],
		},
		4: {
			publishedCast: { damage: 3000, channel: DamageChannel.Direct },
			abilityText: "The ally behind applies its Ongoing abilities 24 additional time(s).",
			abilityTags: [
			  { kind: AbilityTagKind.Ongoing, target: { kind: TargetKind.Behind }, effect: { extraOngoingApplications: 24 } },
			],
		},
	},
}, {
	id: Species.Aegistruct,
	name: "Aegistruct",
	rarity: Rarity.SuperRare,
	types: [CreatureType.Rock],
	abilityTrigger: AbilityTrigger.OnBattleStart,
	spriteFile: "aegistruct.png",
	shopCost: 45,
	baseCooldownSeconds: 6,
	baseMulticast: 1,
	appliesStatus: [{ type: StatusEffectType.Shield, amount: 150 }],
	abilityText: "Gain Shield for this battle equal to 1x the Shield of adjacent allies. (Except other Aegistruct)",
	abilityTags: [],
	levels: {
		2: {
			abilityText: "Gain Shield for this battle equal to 2x the Shield of adjacent allies.\n(Except other Aegistruct)",
		},
		3: {
			abilityText: "Gain Shield for this battle equal to 3x the Shield of adjacent allies.\n(Except other Aegistruct)",
		},
		4: {
			abilityText: "Gain Shield for this battle equal to 12x the Shield of adjacent allies.\n(Except other Aegistruct)",
		},
	},
}, {
	id: Species.Aerophim,
	name: "Aerophim",
	rarity: Rarity.Mythical,
	types: [CreatureType.Flying],
	abilityTrigger: AbilityTrigger.OnCast,
	spriteFile: "aerophim.png",
	shopCost: 80,
	baseCooldownSeconds: 6,
	baseMulticast: 1,
	publishedCast: { damage: 666, channel: DamageChannel.Direct },
	abilityText: "Give adjacent allies +1 Multicast permanently and transform them into random monsters of their rarity.",
	abilityTags: [],
	levels: {
		2: {
			abilityText: "Give adjacent allies +2 Multicast permanently and transform them into random monsters of their rarity.",
		},
		3: {
			abilityText: "Give adjacent allies +3 Multicast permanently and transform them into random monsters of their rarity.",
		},
		4: {
			abilityText: "Give adjacent allies +60 Multicast permanently and transform them into random monsters of their rarity.",
		},
	},
}, {
	id: Species.Aristobat,
	name: "Aristobat",
	rarity: Rarity.Rare,
	types: [CreatureType.Toxic, CreatureType.Flying],
	spriteFile: "aristobat.png",
	shopCost: 25,
	baseCooldownSeconds: 4,
	baseMulticast: 2,
	appliesStatus: [{ type: StatusEffectType.Poison, amount: 4 }],
	abilityText: "",
	abilityTags: [],
	levels: {
		2: {
			baseMulticast: 3,
			appliesStatus: [{ type: StatusEffectType.Poison, amount: 6 }],
		},
		3: {
			baseMulticast: 4,
			appliesStatus: [{ type: StatusEffectType.Poison, amount: 8 }],
		},
		4: {
			baseMulticast: 8,
			appliesStatus: [{ type: StatusEffectType.Poison, amount: 16 }],
		},
	},
}, {
	id: Species.Aster,
	name: "Aster",
	rarity: Rarity.Rare,
	types: [CreatureType.Water],
	abilityTrigger: AbilityTrigger.OnBattleStart,
	spriteFile: "aster.png",
	shopCost: 40,
	baseCooldownSeconds: 3,
	baseMulticast: 1,
	healAmount: 40,
	abilityText: "Adjacent Water allies gain +25 Heal permanently.",
	abilityTags: [],
	levels: {
		2: {
			abilityText: "Adjacent Water allies gain +50 Heal permanently.",
		},
		3: {
			abilityText: "Adjacent Water allies gain +75 Heal permanently.",
		},
		4: {
			healAmount: 160,
			abilityText: "Adjacent Water allies gain +225 Heal permanently.",
		},
	},
}, {
	id: Species.Aviarab,
	name: "Aviarab",
	rarity: Rarity.Uncommon,
	types: [CreatureType.Bug, CreatureType.Flying],
	abilityTrigger: AbilityTrigger.OnBought,
	spriteFile: "aviarab.png",
	shopCost: 25,
	baseCooldownSeconds: 3.5,
	baseMulticast: 2,
	publishedCast: { damage: 15, channel: DamageChannel.Direct },
	abilityText: "Give the next Flying monster you buy +1 Multicast.",
	abilityTags: [],
	levels: {
		2: {
			publishedCast: { damage: 30, channel: DamageChannel.Direct },
			abilityText: "Give the next Flying monster you buy +2 Multicast.",
		},
		3: {
			publishedCast: { damage: 45, channel: DamageChannel.Direct },
			abilityText: "Give the next Flying monster you buy +3 Multicast.",
		},
		4: {
			publishedCast: { damage: 90, channel: DamageChannel.Direct },
			abilityText: "Give the next Flying monster you buy +6 Multicast.",
		},
	},
}, {
	id: Species.Basilord,
	name: "Basilord",
	rarity: Rarity.Legendary,
	types: [CreatureType.Fire],
	spriteFile: "basilord.png",
	shopCost: 100,
	baseCooldownSeconds: 8,
	baseMulticast: 1,
	appliesStatus: [{ type: StatusEffectType.Burn, amount: 170 }],
	abilityText: "",
	abilityTags: [],
	levels: {
		2: {
			appliesStatus: [{ type: StatusEffectType.Burn, amount: 340 }],
		},
		3: {
			appliesStatus: [{ type: StatusEffectType.Burn, amount: 510 }],
		},
		4: {
			baseCooldownSeconds: 1,
			appliesStatus: [{ type: StatusEffectType.Burn, amount: 510 }],
		},
	},
}, {
	id: Species.Beetbud,
	name: "Beetbud",
	rarity: Rarity.Common,
	types: [CreatureType.Fighting, CreatureType.Grass],
	evolvesInto: Species.Beetdown,
	evolvesAtLevel: 3,
	spriteFile: "beetbud.png",
	shopCost: 10,
	baseCooldownSeconds: 4.5,
	baseMulticast: 1,
	publishedCast: { damage: 35, channel: DamageChannel.Direct },
	abilityText: "Evolves at level 3.",
	abilityTags: [],
	levels: {
		2: {
			publishedCast: { damage: 70, channel: DamageChannel.Direct },
		},
		3: {
			publishedCast: { damage: 105, channel: DamageChannel.Direct },
		},
		4: {
			baseMulticast: 2,
			publishedCast: { damage: 105, channel: DamageChannel.Direct },
		},
	},
}, {
	id: Species.Berroon,
	name: "Berroon",
	rarity: Rarity.Uncommon,
	types: [CreatureType.Grass],
	abilityTrigger: AbilityTrigger.OnBattleStart,
	spriteFile: "berroon.png",
	shopCost: 20,
	baseCooldownSeconds: 4,
	baseMulticast: 1,
	publishedCast: { damage: 40, channel: DamageChannel.Direct },
	abilityText: "The next 1 items in your shop will be Berries.",
	abilityTags: [],
	levels: {
		2: {
			abilityText: "The next 2 items in your shop will be Berries.",
		},
		3: {
			abilityText: "The next 3 items in your shop will be Berries.",
		},
		4: {
			publishedCast: { damage: 160, channel: DamageChannel.Direct },
			abilityText: "The next 6 items in your shop will be Berries.",
		},
	},
}, {
	id: Species.Blazewing,
	name: "Blazewing",
	rarity: Rarity.SuperRare,
	types: [CreatureType.Fire, CreatureType.Flying],
	spriteFile: "blazewing.png",
	shopCost: 35,
	baseCooldownSeconds: 5,
	baseMulticast: 3,
	appliesStatus: [{ type: StatusEffectType.Burn, amount: 5 }],
	abilityText: "",
	abilityTags: [],
	levels: {
		2: {
			baseMulticast: 5,
		},
		3: {
			baseMulticast: 7,
		},
		4: {
			baseMulticast: 28,
			appliesStatus: [{ type: StatusEffectType.Burn, amount: 10 }],
		},
	},
}, {
	id: Species.Blessom,
	name: "Blessom",
	rarity: Rarity.Uncommon,
	types: [CreatureType.Grass],
	spriteFile: "blessom.png",
	shopCost: 0,
	baseCooldownSeconds: 4.5,
	baseMulticast: 1,
	publishedCast: { damage: 50, channel: DamageChannel.Direct },
	abilityText: "At the start of each day, monsters in your shop gain +50 Damage.",
	abilityTags: [],
	levels: {
		2: {
			publishedCast: { damage: 100, channel: DamageChannel.Direct },
			abilityText: "At the start of each day, monsters in your shop gain +100 Damage.",
		},
		3: {
			publishedCast: { damage: 150, channel: DamageChannel.Direct },
			abilityText: "At the start of each day, monsters in your shop gain +150 Damage.",
		},
		4: {
			publishedCast: { damage: 300, channel: DamageChannel.Direct },
			abilityText: "At the start of each day, monsters in your shop gain +300 Damage.",
		},
	},
}, {
	id: Species.Blixie,
	name: "Blixie",
	rarity: Rarity.Legendary,
	types: [CreatureType.Fire],
	abilityTrigger: AbilityTrigger.OnCast,
	spriteFile: "blixie.png",
	shopCost: 55,
	baseCooldownSeconds: 6,
	baseMulticast: 1,
	appliesStatus: [{ type: StatusEffectType.Burn, amount: 30 }],
	abilityText: "Give the Fire ally behind this monster's Burn for this battle.",
	abilityTags: [],
	levels: {
		2: {
			abilityText: "Give the Fire ally behind 2x this monster's Burn for this battle.",
		},
		3: {
			abilityText: "Give the Fire ally behind 3x this monster's Burn for this battle.",
		},
		4: {
			appliesStatus: [{ type: StatusEffectType.Burn, amount: 300 }],
			abilityText: "Give the Fire ally behind 30x this monster's Burn for this battle.",
		},
	},
}, {
	id: Species.Bonshell,
	name: "Bonshell",
	rarity: Rarity.Uncommon,
	types: [CreatureType.Rock, CreatureType.Grass],
	abilityTrigger: AbilityTrigger.OnCast,
	spriteFile: "bonshell.png",
	shopCost: 0,
	baseCooldownSeconds: 7,
	baseMulticast: 1,
	appliesStatus: [{ type: StatusEffectType.Shield, amount: 100 }],
	abilityText: "+80 Damage and +80 Shield for this battle.",
	abilityTags: [
	  { kind: AbilityTagKind.BuffOnCast, target: { kind: TargetKind.Self }, effect: { statChange: { stat: StatChangeStat.Damage, amount: 80 } } },
	  { kind: AbilityTagKind.BuffOnCast, target: { kind: TargetKind.Self }, effect: { statusGrant: { type: StatusEffectType.Shield, amount: 80 } } },
	],
	levels: {
		2: {
			appliesStatus: [{ type: StatusEffectType.Shield, amount: 200 }],
			abilityText: "+160 Damage and +160 Shield for this battle.",
			abilityTags: [
			  { kind: AbilityTagKind.BuffOnCast, target: { kind: TargetKind.Self }, effect: { statChange: { stat: StatChangeStat.Damage, amount: 160 } } },
			  { kind: AbilityTagKind.BuffOnCast, target: { kind: TargetKind.Self }, effect: { statusGrant: { type: StatusEffectType.Shield, amount: 160 } } },
			],
		},
		3: {
			appliesStatus: [{ type: StatusEffectType.Shield, amount: 300 }],
			abilityText: "+240 Damage and +240 Shield for this battle.",
			abilityTags: [
			  { kind: AbilityTagKind.BuffOnCast, target: { kind: TargetKind.Self }, effect: { statChange: { stat: StatChangeStat.Damage, amount: 240 } } },
			  { kind: AbilityTagKind.BuffOnCast, target: { kind: TargetKind.Self }, effect: { statusGrant: { type: StatusEffectType.Shield, amount: 240 } } },
			],
		},
		4: {
			appliesStatus: [{ type: StatusEffectType.Shield, amount: 600 }],
			abilityText: "+480 Damage and +480 Shield for this battle.",
			abilityTags: [
			  { kind: AbilityTagKind.BuffOnCast, target: { kind: TargetKind.Self }, effect: { statChange: { stat: StatChangeStat.Damage, amount: 480 } } },
			  { kind: AbilityTagKind.BuffOnCast, target: { kind: TargetKind.Self }, effect: { statusGrant: { type: StatusEffectType.Shield, amount: 480 } } },
			],
		},
	},
}, {
	id: Species.Boomagon,
	name: "Boomagon",
	rarity: Rarity.Uncommon,
	types: [CreatureType.Dragon],
	abilityTrigger: AbilityTrigger.OnCast,
	spriteFile: "boomagon.png",
	shopCost: 30,
	baseCooldownSeconds: 7,
	baseMulticast: 1,
	publishedCast: { damage: 40, channel: DamageChannel.Direct },
	abilityText: "Give the ally behind +3% Cooldown Speed permanently.",
	abilityTags: [],
	levels: {
		2: {
			abilityText: "Give the ally behind +6% Cooldown Speed permanently.",
		},
		3: {
			abilityText: "Give the ally behind +9% Cooldown Speed permanently.",
		},
		4: {
			abilityText: "Give the ally behind +18% Cooldown Speed permanently.",
		},
	},
}, {
	id: Species.Brawlmantis,
	name: "Brawlmantis",
	rarity: Rarity.Uncommon,
	types: [CreatureType.Bug, CreatureType.Fighting],
	abilityTrigger: AbilityTrigger.OnVictory,
	spriteFile: "brawlmantis.png",
	shopCost: 30,
	baseCooldownSeconds: 5.5,
	baseMulticast: 1,
	publishedCast: { damage: 50, channel: DamageChannel.Direct },
	abilityText: "This and Common allies gain +10 Damage permanently.",
	abilityTags: [
	  { kind: AbilityTagKind.ManualTrigger, trigger: AbilityTrigger.OnVictory, effects: [{ stat: ModifierStat.DamageFlatAdd, amount: 10 }], target: { kind: TargetKind.AllAllies, rarityFilter: Rarity.Common }, includeSelf: true },
	],
	levels: {
		2: {
			publishedCast: { damage: 100, channel: DamageChannel.Direct },
			abilityText: "This and Common allies gain +20 Damage permanently.",
			abilityTags: [
			  { kind: AbilityTagKind.ManualTrigger, trigger: AbilityTrigger.OnVictory, effects: [{ stat: ModifierStat.DamageFlatAdd, amount: 20 }], target: { kind: TargetKind.AllAllies, rarityFilter: Rarity.Common }, includeSelf: true },
			],
		},
		3: {
			publishedCast: { damage: 150, channel: DamageChannel.Direct },
			abilityText: "This and Common allies gain +30 Damage permanently.",
			abilityTags: [
			  { kind: AbilityTagKind.ManualTrigger, trigger: AbilityTrigger.OnVictory, effects: [{ stat: ModifierStat.DamageFlatAdd, amount: 30 }], target: { kind: TargetKind.AllAllies, rarityFilter: Rarity.Common }, includeSelf: true },
			],
		},
		4: {
			baseMulticast: 2,
			publishedCast: { damage: 150, channel: DamageChannel.Direct },
			abilityText: "This and Common allies gain +60 Damage permanently.",
			abilityTags: [
			  { kind: AbilityTagKind.ManualTrigger, trigger: AbilityTrigger.OnVictory, effects: [{ stat: ModifierStat.DamageFlatAdd, amount: 60 }], target: { kind: TargetKind.AllAllies, rarityFilter: Rarity.Common }, includeSelf: true },
			],
		},
	},
}, {
	id: Species.Brimtoad,
	name: "Brimtoad",
	rarity: Rarity.Uncommon,
	types: [CreatureType.Fire, CreatureType.Toxic],
	abilityTrigger: AbilityTrigger.OnBattleStart,
	spriteFile: "brimtoad.png",
	shopCost: 0,
	baseCooldownSeconds: 6,
	baseMulticast: 1,
	appliesStatus: [{ type: StatusEffectType.Burn, amount: 1 }, { type: StatusEffectType.Poison, amount: 1 }],
	abilityText: "+4 Burn and +4 Poison permanently.",
	abilityTags: [],
	levels: {
		2: {
			appliesStatus: [{ type: StatusEffectType.Burn, amount: 2 }, { type: StatusEffectType.Poison, amount: 2 }],
			abilityText: "+8 Burn and +8 Poison permanently.",
		},
		3: {
			appliesStatus: [{ type: StatusEffectType.Burn, amount: 3 }, { type: StatusEffectType.Poison, amount: 3 }],
			abilityText: "+12 Burn and +12 Poison permanently.",
		},
		4: {
			appliesStatus: [{ type: StatusEffectType.Burn, amount: 12 }, { type: StatusEffectType.Poison, amount: 12 }],
			abilityText: "+48 Burn and +48 Poison permanently.",
		},
	},
}, {
	id: Species.Bunchop,
	name: "Bunchop",
	rarity: Rarity.Common,
	types: [CreatureType.Fighting],
	abilityTrigger: AbilityTrigger.Ongoing,
	spriteFile: "bunchop.png",
	shopCost: 0,
	baseCooldownSeconds: 4,
	baseMulticast: 1,
	publishedCast: { damage: 50, channel: DamageChannel.Direct },
	abilityText: "Your team has +50 HP. On Victory Increase this ability's HP bonus by +50.",
	abilityTags: [],
	levels: {
		2: {
			publishedCast: { damage: 100, channel: DamageChannel.Direct },
			abilityText: "Your team has +50 HP.\nOn Victory\nIncrease this ability's HP bonus by +100.",
		},
		3: {
			publishedCast: { damage: 150, channel: DamageChannel.Direct },
			abilityText: "Your team has +50 HP.\nOn Victory\nIncrease this ability's HP bonus by +150.",
		},
		4: {
			publishedCast: { damage: 300, channel: DamageChannel.Direct },
			abilityText: "Your team has +50 HP.\nOn Victory\nIncrease this ability's HP bonus by +300.",
		},
	},
}, {
	id: Species.Cairnage,
	name: "Cairnage",
	rarity: Rarity.Legendary,
	types: [CreatureType.Rock],
	abilityTrigger: AbilityTrigger.OnCast,
	spriteFile: "cairnage.png",
	shopCost: 0,
	baseCooldownSeconds: 5.5,
	baseMulticast: 1,
	appliesStatus: [{ type: StatusEffectType.Shield, amount: 500 }],
	abilityText: "Allies gain Damage for this battle equal to 0.8x their Shield.",
	abilityTags: [],
	levels: {
		2: {
			appliesStatus: [{ type: StatusEffectType.Shield, amount: 1000 }],
			abilityText: "Allies gain Damage for this battle equal to 1.6x their Shield.",
		},
		3: {
			appliesStatus: [{ type: StatusEffectType.Shield, amount: 1500 }],
			abilityText: "Allies gain Damage for this battle equal to 2.4x their Shield.",
		},
		4: {
			appliesStatus: [{ type: StatusEffectType.Shield, amount: 12000 }],
			abilityText: "Allies gain Damage for this battle equal to 19.2x their Shield.",
		},
	},
}, {
	id: Species.Cawnushi,
	name: "Cawnushi",
	rarity: Rarity.SuperRare,
	types: [CreatureType.Flying, CreatureType.Ghost],
	abilityTrigger: AbilityTrigger.OnKnockout,
	spriteFile: "cawnushi.png",
	shopCost: 0,
	baseCooldownSeconds: 5.5,
	baseMulticast: 2,
	publishedCast: { damage: 50, channel: DamageChannel.Direct },
	abilityText: "On Knockout of any monster, this gains +60 Damage permanently.",
	abilityTags: [
	  { kind: AbilityTagKind.ManualTrigger, trigger: AbilityTrigger.OnKnockout, effects: [{ stat: ModifierStat.DamageFlatAdd, amount: 60 }] },
	],
	levels: {
		2: {
			publishedCast: { damage: 100, channel: DamageChannel.Direct },
			abilityText: "On Knockout of any monster, this gains +120 Damage permanently.",
			abilityTags: [
			  { kind: AbilityTagKind.ManualTrigger, trigger: AbilityTrigger.OnKnockout, effects: [{ stat: ModifierStat.DamageFlatAdd, amount: 120 }] },
			],
		},
		3: {
			publishedCast: { damage: 150, channel: DamageChannel.Direct },
			abilityText: "On Knockout of any monster, this gains +180 Damage permanently.",
			abilityTags: [
			  { kind: AbilityTagKind.ManualTrigger, trigger: AbilityTrigger.OnKnockout, effects: [{ stat: ModifierStat.DamageFlatAdd, amount: 180 }] },
			],
		},
		4: {
			publishedCast: { damage: 1200, channel: DamageChannel.Direct },
			abilityText: "On Knockout of any monster, this gains +1440 Damage permanently.",
			abilityTags: [
			  { kind: AbilityTagKind.ManualTrigger, trigger: AbilityTrigger.OnKnockout, effects: [{ stat: ModifierStat.DamageFlatAdd, amount: 1440 }] },
			],
		},
	},
}, {
	id: Species.Celestia,
	name: "Celestia",
	rarity: Rarity.SuperRare,
	types: [CreatureType.Dragon],
	abilityTrigger: AbilityTrigger.OnBattleStart,
	spriteFile: "celestia.png",
	shopCost: 30,
	baseCooldownSeconds: 6.5,
	baseMulticast: 1,
	publishedCast: { damage: 130, channel: DamageChannel.Direct },
	abilityText: "Disable abilities of all Ongoing monsters in this row.",
	abilityTags: [],
	levels: {
		2: {
			publishedCast: { damage: 260, channel: DamageChannel.Direct },
		},
		3: {
			publishedCast: { damage: 390, channel: DamageChannel.Direct },
		},
		4: {
			publishedCast: { damage: 3120, channel: DamageChannel.Direct },
		},
	},
}, {
	id: Species.Cherubble,
	name: "Cherubble",
	rarity: Rarity.Rare,
	types: [CreatureType.Rock],
	abilityTrigger: AbilityTrigger.OnCast,
	spriteFile: "cherubble.png",
	shopCost: 25,
	baseCooldownSeconds: 4,
	baseMulticast: 1,
	appliesStatus: [{ type: StatusEffectType.Shield, amount: 100 }],
	abilityText: "Give adjacent allies Protect 1.",
	abilityTags: [],
	levels: {
		2: {
			baseCooldownSeconds: 2,
		},
		3: {
			baseCooldownSeconds: 1.3,
		},
		4: {
			baseCooldownSeconds: 1.3,
			baseMulticast: 4,
		},
	},
}, {
	id: Species.Cicadence,
	name: "Cicadence",
	rarity: Rarity.Rare,
	types: [CreatureType.Bug],
	abilityTrigger: AbilityTrigger.OnCast,
	spriteFile: "cicadence.png",
	shopCost: 25,
	baseCooldownSeconds: 6,
	baseMulticast: 1,
	publishedCast: { damage: 100, channel: DamageChannel.Direct },
	abilityText: "Trigger the Bug ally above.",
	abilityTags: [],
	levels: {
		2: {
			baseCooldownSeconds: 3,
		},
		3: {
			baseCooldownSeconds: 2,
		},
		4: {
			baseCooldownSeconds: 2,
			baseMulticast: 2,
			publishedCast: { damage: 200, channel: DamageChannel.Direct },
		},
	},
}, {
	id: Species.Cinderfly,
	name: "Cinderfly",
	rarity: Rarity.Uncommon,
	types: [CreatureType.Bug, CreatureType.Fire],
	spriteFile: "cinderfly.png",
	shopCost: 30,
	baseCooldownSeconds: 5,
	baseMulticast: 1,
	appliesStatus: [{ type: StatusEffectType.Burn, amount: 7 }],
	abilityText: "After you buy a Bug monster, this gains +10% Cooldown Speed.",
	abilityTags: [],
	levels: {
		2: {
			abilityText: "After you buy a Bug monster, this gains +20% Cooldown Speed.",
		},
		3: {
			abilityText: "After you buy a Bug monster, this gains +30% Cooldown Speed.",
		},
		4: {
			baseMulticast: 2,
			appliesStatus: [{ type: StatusEffectType.Burn, amount: 14 }],
			abilityText: "After you buy a Bug monster, this gains +60% Cooldown Speed.",
		},
	},
}, {
	id: Species.Cinnabark,
	name: "Cinnabark",
	rarity: Rarity.Uncommon,
	types: [CreatureType.Rock, CreatureType.Toxic],
	abilityTrigger: AbilityTrigger.Ongoing,
	spriteFile: "cinnabark.png",
	shopCost: 0,
	baseCooldownSeconds: 4,
	baseMulticast: 1,
	appliesStatus: [{ type: StatusEffectType.Poison, amount: 5 }],
	abilityText: "Has additional Shield equal to 100% of the Poison stacks on the enemy.",
	abilityTags: [],
	levels: {
		2: {
			appliesStatus: [{ type: StatusEffectType.Poison, amount: 10 }],
			abilityText: "Has additional Shield equal to 200% of the Poison stacks on the enemy.",
		},
		3: {
			appliesStatus: [{ type: StatusEffectType.Poison, amount: 15 }],
			abilityText: "Has additional Shield equal to 300% of the Poison stacks on the enemy.",
		},
		4: {
			appliesStatus: [{ type: StatusEffectType.Poison, amount: 30 }],
			abilityText: "Has additional Shield equal to 600% of the Poison stacks on the enemy.",
		},
	},
}, {
	id: Species.Clawnetic,
	name: "Clawnetic",
	rarity: Rarity.SuperRare,
	types: [CreatureType.Steel],
	spriteFile: "clawnetic.png",
	shopCost: 45,
	baseCooldownSeconds: 3,
	baseMulticast: 1,
	publishedCast: { damage: 60, channel: DamageChannel.Direct },
	abilityText: "Whenever an ally inflicts Shock, Charge this by 1 second(s).",
	abilityTags: [],
	levels: {
		2: {
			baseMulticast: 2,
		},
		3: {
			baseMulticast: 3,
		},
		4: {
			baseMulticast: 24,
			publishedCast: { damage: 600, channel: DamageChannel.Direct },
		},
	},
}, {
	id: Species.Coalem,
	name: "Coalem",
	rarity: Rarity.SuperRare,
	types: [CreatureType.Fire, CreatureType.Rock],
	abilityTrigger: AbilityTrigger.OnBattleStart,
	spriteFile: "coalem.png",
	shopCost: 45,
	baseCooldownSeconds: 15,
	baseMulticast: 1,
	appliesStatus: [{ type: StatusEffectType.Shield, amount: 550 }, { type: StatusEffectType.Burn, amount: 20 }],
	abilityText: "Trigger this.",
	abilityTags: [],
	levels: {
		2: {
			appliesStatus: [{ type: StatusEffectType.Shield, amount: 1100 }, { type: StatusEffectType.Burn, amount: 40 }],
		},
		3: {
			appliesStatus: [{ type: StatusEffectType.Shield, amount: 1650 }, { type: StatusEffectType.Burn, amount: 60 }],
		},
		4: {
			baseCooldownSeconds: 5,
			appliesStatus: [{ type: StatusEffectType.Shield, amount: 6600 }, { type: StatusEffectType.Burn, amount: 240 }],
		},
	},
}, {
	id: Species.Cobrex,
	name: "Cobrex",
	rarity: Rarity.Legendary,
	types: [CreatureType.Toxic],
	spriteFile: "cobrex.png",
	shopCost: 50,
	baseCooldownSeconds: 15,
	baseMulticast: 1,
	appliesStatus: [{ type: StatusEffectType.Poison, amount: 300 }],
	abilityText: "Whenever an ally inflicts Poison, Charge this by 1 second(s).",
	abilityTags: [
	  { kind: AbilityTagKind.ChargeOnAllyStatus, status: StatusEffectType.Poison, seconds: 1 },
	],
	levels: {
		2: {
			appliesStatus: [{ type: StatusEffectType.Poison, amount: 600 }],
		},
		3: {
			appliesStatus: [{ type: StatusEffectType.Poison, amount: 900 }],
		},
		4: {
			baseCooldownSeconds: 2,
			appliesStatus: [{ type: StatusEffectType.Poison, amount: 900 }],
		},
	},
}, {
	id: Species.Cordycant,
	name: "Cordycant",
	rarity: Rarity.Rare,
	types: [CreatureType.Toxic, CreatureType.Bug],
	abilityTrigger: AbilityTrigger.OnBought,
	spriteFile: "cordycant.png",
	shopCost: 0,
	baseCooldownSeconds: 4,
	baseMulticast: 1,
	appliesStatus: [{ type: StatusEffectType.Poison, amount: 8 }],
	abilityText: "Give the next monster you buy Toxic typing and +8 Poison.",
	abilityTags: [],
	levels: {
		2: {
			appliesStatus: [{ type: StatusEffectType.Poison, amount: 16 }],
			abilityText: "Give the next monster you buy Toxic typing and +16 Poison.",
		},
		3: {
			appliesStatus: [{ type: StatusEffectType.Poison, amount: 24 }],
			abilityText: "Give the next monster you buy Toxic typing and +24 Poison.",
		},
		4: {
			appliesStatus: [{ type: StatusEffectType.Poison, amount: 96 }],
			abilityText: "Give the next monster you buy Toxic typing and +96 Poison.",
		},
	},
}, {
	id: Species.Cosmivore,
	name: "Cosmivore",
	rarity: Rarity.Mythical,
	types: [CreatureType.Ghost],
	spriteFile: "cosmivore.png",
	shopCost: 80,
	baseCooldownSeconds: 7,
	baseMulticast: 1,
	publishedCast: { damage: 1, channel: DamageChannel.Direct },
	abilityText: "When rerolling the shop, gain 20% of the total stats of the monsters remaining in the shop (excluding Multicast and Cooldown).",
	abilityTags: [],
	levels: {
		2: {
			abilityText: "When rerolling the shop, gain 40% of the total stats of the monsters remaining in the shop (excluding Multicast and Cooldown).",
		},
		3: {
			abilityText: "When rerolling the shop, gain 60% of the total stats of the monsters remaining in the shop (excluding Multicast and Cooldown).",
		},
		4: {
			abilityText: "When rerolling the shop, gain 600% of the total stats of the monsters remaining in the shop (excluding Multicast and Cooldown).",
		},
	},
}, {
	id: Species.Craghorn,
	name: "Craghorn",
	rarity: Rarity.Uncommon,
	types: [CreatureType.Grass, CreatureType.Rock],
	abilityTrigger: AbilityTrigger.OnItemUsed,
	spriteFile: "alpinine.png",
	shopCost: 0,
	baseCooldownSeconds: 6,
	baseMulticast: 1,
	publishedCast: { damage: 20, channel: DamageChannel.Direct },
	appliesStatus: [{ type: StatusEffectType.Shield, amount: 20 }],
	abilityText: "When you use an item, this gains +20 Damage and Shield.",
	abilityTags: [
	  { kind: AbilityTagKind.ManualTrigger, trigger: AbilityTrigger.OnItemUsed, effects: [{ stat: ModifierStat.DamageFlatAdd, amount: 20 }, { stat: ModifierStat.ShieldAmountAdd, amount: 20 }] },
	],
	levels: {
		2: {
			abilityText: "When you use an item, this gains +40 Damage and Shield.",
			abilityTags: [
			  { kind: AbilityTagKind.ManualTrigger, trigger: AbilityTrigger.OnItemUsed, effects: [{ stat: ModifierStat.DamageFlatAdd, amount: 40 }, { stat: ModifierStat.ShieldAmountAdd, amount: 40 }] },
			],
		},
		3: {
			abilityText: "When you use an item, this gains +60 Damage and Shield.",
			abilityTags: [
			  { kind: AbilityTagKind.ManualTrigger, trigger: AbilityTrigger.OnItemUsed, effects: [{ stat: ModifierStat.DamageFlatAdd, amount: 60 }, { stat: ModifierStat.ShieldAmountAdd, amount: 60 }] },
			],
		},
		4: {
			publishedCast: { damage: 80, channel: DamageChannel.Direct },
			appliesStatus: [{ type: StatusEffectType.Shield, amount: 80 }],
			abilityText: "When you use an item, this gains +120 Damage and Shield.",
			abilityTags: [
			  { kind: AbilityTagKind.ManualTrigger, trigger: AbilityTrigger.OnItemUsed, effects: [{ stat: ModifierStat.DamageFlatAdd, amount: 120 }, { stat: ModifierStat.ShieldAmountAdd, amount: 120 }] },
			],
		},
	},
}, {
	id: Species.Danuki,
	name: "Danuki",
	rarity: Rarity.SuperRare,
	types: [CreatureType.Ghost],
	spriteFile: "danuki.png",
	shopCost: 45,
	baseCooldownSeconds: 6,
	baseMulticast: 1,
	publishedCast: { damage: 40, channel: DamageChannel.Direct },
	abilityText: "On ally knockout, this gains 70% of their Damage for this battle. (Except other Danuki)",
	abilityTags: [],
	levels: {
		2: {
			baseCooldownSeconds: 3,
			abilityText: "On ally knockout, this gains 70% of their Damage for this battle.\n(Except other Danuki)",
		},
		3: {
			baseCooldownSeconds: 2,
			abilityText: "On ally knockout, this gains 70% of their Damage for this battle.\n(Except other Danuki)",
		},
		4: {
			baseCooldownSeconds: 2,
			baseMulticast: 4,
			abilityText: "On ally knockout, this gains 70% of their Damage for this battle.\n(Except other Danuki)",
		},
	},
}, {
	id: Species.Dirgefin,
	name: "Dirgefin",
	rarity: Rarity.Rare,
	types: [CreatureType.Ghost, CreatureType.Water],
	abilityTrigger: AbilityTrigger.OnCast,
	spriteFile: "dirgefin.png",
	shopCost: 25,
	baseCooldownSeconds: 9,
	baseMulticast: 1,
	publishedCast: { damage: 50, channel: DamageChannel.Direct },
	healAmount: 100,
	abilityText: "Knockout all Common allies and enemies.",
	abilityTags: [],
	levels: {
		2: {
			baseCooldownSeconds: 4.5,
		},
		3: {
			baseCooldownSeconds: 3,
		},
		4: {
			baseCooldownSeconds: 3,
			baseMulticast: 2,
			publishedCast: { damage: 100, channel: DamageChannel.Direct },
			healAmount: 200,
		},
	},
}, {
	id: Species.Dollhime,
	name: "Dollhime",
	rarity: Rarity.Rare,
	types: [CreatureType.Curio],
	abilityTrigger: AbilityTrigger.OnTrinketGained,
	spriteFile: "dollhime.png",
	shopCost: 0,
	baseCooldownSeconds: 6,
	baseMulticast: 1,
	abilityText: "+50 Damage permanently.",
	abilityTags: [
	  { kind: AbilityTagKind.ManualTrigger, trigger: AbilityTrigger.OnTrinketGained, effects: [{ stat: ModifierStat.DamageFlatAdd, amount: 50 }] },
	],
	levels: {
		2: {
			abilityText: "+100 Damage permanently.",
			abilityTags: [
			  { kind: AbilityTagKind.ManualTrigger, trigger: AbilityTrigger.OnTrinketGained, effects: [{ stat: ModifierStat.DamageFlatAdd, amount: 100 }] },
			],
		},
		3: {
			abilityText: "+150 Damage permanently.",
			abilityTags: [
			  { kind: AbilityTagKind.ManualTrigger, trigger: AbilityTrigger.OnTrinketGained, effects: [{ stat: ModifierStat.DamageFlatAdd, amount: 150 }] },
			],
		},
		4: {
			abilityText: "+600 Damage permanently.",
			abilityTags: [
			  { kind: AbilityTagKind.ManualTrigger, trigger: AbilityTrigger.OnTrinketGained, effects: [{ stat: ModifierStat.DamageFlatAdd, amount: 600 }] },
			],
		},
	},
}, {
	id: Species.Dracana,
	name: "Dracana",
	rarity: Rarity.Rare,
	types: [CreatureType.Dragon],
	abilityTrigger: AbilityTrigger.OnCast,
	spriteFile: "dracana.png",
	shopCost: 30,
	baseCooldownSeconds: 3,
	baseMulticast: 1,
	publishedCast: { damage: 5, channel: DamageChannel.Direct },
	abilityText: "Charge the ally behind by 1 second(s). (Dracana can't receive charge)",
	abilityTags: [],
	levels: {
		2: {
			publishedCast: { damage: 10, channel: DamageChannel.Direct },
			abilityText: "Charge the ally behind by 2 second(s).\n(Dracana can't receive charge)",
		},
		3: {
			publishedCast: { damage: 15, channel: DamageChannel.Direct },
			abilityText: "Charge the ally behind by 3 second(s).\n(Dracana can't receive charge)",
		},
		4: {
			publishedCast: { damage: 45, channel: DamageChannel.Direct },
			abilityText: "Charge the ally behind by 18 second(s).\n(Dracana can't receive charge)",
		},
	},
}, {
	id: Species.Draconarch,
	name: "Draconarch",
	rarity: Rarity.Legendary,
	types: [CreatureType.Dragon],
	abilityTrigger: AbilityTrigger.OnCast,
	spriteFile: "dragonarch.png",
	shopCost: 60,
	baseCooldownSeconds: 5,
	baseMulticast: 1,
	publishedCast: { damage: 100, channel: DamageChannel.Direct },
	abilityText: "Activate the On Battle Start abilities of adjacent allies and increase this monster's Cooldown by 6 for this battle.",
	abilityTags: [],
	levels: {
		2: {
			baseMulticast: 2,
			abilityText: "Activate the On Battle Start abilities of adjacent allies and increase this monster's Cooldown by 3 for this battle.",
		},
		3: {
			baseMulticast: 3,
			abilityText: "Activate the On Battle Start abilities of adjacent allies and increase this monster's Cooldown by 2 for this battle.",
		},
		4: {
			baseMulticast: 24,
			abilityText: "Activate the On Battle Start abilities of adjacent allies and increase this monster's Cooldown by 1 for this battle.",
		},
	},
}, {
	id: Species.Dragonegg,
	name: "Dragon Egg",
	rarity: Rarity.SuperRare,
	types: [],
	spriteFile: "dragon_egg_0.png",
	shopCost: 0,
	baseCooldownSeconds: 10,
	baseMulticast: 1,
	publishedCast: { damage: 1, channel: DamageChannel.Direct },
	abilityText: "Hatches a Legendary Dragon monster in 2 days.",
	abilityTags: [],
}, {
	id: Species.Dribblet,
	name: "Dribblet",
	rarity: Rarity.Common,
	types: [CreatureType.Water],
	evolvesInto: Species.Emperooze,
	evolvesAtLevel: 3,
	spriteFile: "dribblet.png",
	shopCost: 10,
	baseCooldownSeconds: 3,
	baseMulticast: 1,
	healAmount: 15,
	abilityText: "Evolves at level 3.",
	abilityTags: [],
	levels: {
		2: {
			healAmount: 30,
		},
		3: {
			healAmount: 45,
		},
		4: {
			healAmount: 45,
		},
	},
}, {
	id: Species.Drumire,
	name: "Drumire",
	rarity: Rarity.SuperRare,
	types: [CreatureType.Toxic],
	spriteFile: "drumire.png",
	shopCost: 0,
	baseCooldownSeconds: 8,
	baseMulticast: 1,
	appliesStatus: [{ type: StatusEffectType.Poison, amount: 20 }],
	abilityText: "When a Toxic ally casts, give it +5% Cooldown Speed for this battle.",
	abilityTags: [
	  { kind: AbilityTagKind.CooldownSpeedOnAllyCast, typeFilter: CreatureType.Toxic, amount: 0.05 },
	],
	levels: {
		2: {
			appliesStatus: [{ type: StatusEffectType.Poison, amount: 40 }],
			abilityText: "When a Toxic ally casts, give it +10% Cooldown Speed for this battle.",
			abilityTags: [
			  { kind: AbilityTagKind.CooldownSpeedOnAllyCast, typeFilter: CreatureType.Toxic, amount: 0.1 },
			],
		},
		3: {
			appliesStatus: [{ type: StatusEffectType.Poison, amount: 60 }],
			abilityText: "When a Toxic ally casts, give it +15% Cooldown Speed for this battle.",
			abilityTags: [
			  { kind: AbilityTagKind.CooldownSpeedOnAllyCast, typeFilter: CreatureType.Toxic, amount: 0.15 },
			],
		},
		4: {
			appliesStatus: [{ type: StatusEffectType.Poison, amount: 480 }],
			abilityText: "When a Toxic ally casts, give it +120% Cooldown Speed for this battle.",
			abilityTags: [
			  { kind: AbilityTagKind.CooldownSpeedOnAllyCast, typeFilter: CreatureType.Toxic, amount: 1.2 },
			],
		},
	},
}, {
	id: Species.Dryadell,
	name: "Dryadell",
	rarity: Rarity.SuperRare,
	types: [CreatureType.Grass],
	abilityTrigger: AbilityTrigger.OnCast,
	spriteFile: "dryadell.png",
	shopCost: 45,
	baseCooldownSeconds: 6,
	baseMulticast: 1,
	publishedCast: { damage: 70, channel: DamageChannel.Direct },
	abilityText: "Trigger the Grass ally above.",
	abilityTags: [],
	levels: {
		2: {
			baseMulticast: 2,
		},
		3: {
			baseMulticast: 3,
		},
		4: {
			baseMulticast: 12,
			publishedCast: { damage: 140, channel: DamageChannel.Direct },
		},
	},
}, {
	id: Species.Electranade,
	name: "Electranade",
	rarity: Rarity.Uncommon,
	types: [CreatureType.Electric],
	abilityTrigger: AbilityTrigger.OnCast,
	spriteFile: "galvanade.png",
	shopCost: 25,
	baseCooldownSeconds: 4.5,
	baseMulticast: 1,
	appliesStatus: [{ type: StatusEffectType.Shock, amount: 25 }],
	abilityText: "Knockout self.",
	abilityTags: [],
	levels: {
		2: {
			appliesStatus: [{ type: StatusEffectType.Shock, amount: 50 }],
		},
		3: {
			appliesStatus: [{ type: StatusEffectType.Shock, amount: 75 }],
		},
		4: {
			appliesStatus: [{ type: StatusEffectType.Shock, amount: 300 }],
		},
	},
}, {
	id: Species.Emberpaw,
	name: "Emberpaw",
	rarity: Rarity.SuperRare,
	types: [CreatureType.Fire],
	evolvesInto: Species.Oniclaw,
	spriteFile: "emberpaw.png",
	shopCost: 0,
	baseCooldownSeconds: 6,
	baseMulticast: 1,
	publishedCast: { damage: 50, channel: DamageChannel.Direct },
	appliesStatus: [{ type: StatusEffectType.Burn, amount: 5 }],
	abilityText: "Evolve when your team inflicts Burn 25 times.",
	abilityTags: [],
}, {
	id: Species.Emburn,
	name: "Emburn",
	rarity: Rarity.Uncommon,
	types: [CreatureType.Fire, CreatureType.Ghost],
	abilityTrigger: AbilityTrigger.OnKnockout,
	spriteFile: "emburn.png",
	shopCost: 0,
	baseCooldownSeconds: 6,
	baseMulticast: 1,
	appliesStatus: [{ type: StatusEffectType.Burn, amount: 6 }],
	abilityText: "On Knockout of this or an ally, this gains +3 Burn permanently.",
	abilityTags: [
	  { kind: AbilityTagKind.ManualTrigger, trigger: AbilityTrigger.OnKnockout, effects: [{ stat: ModifierStat.BurnAmountAdd, amount: 3 }] },
	],
	levels: {
		2: {
			appliesStatus: [{ type: StatusEffectType.Burn, amount: 12 }],
			abilityText: "On Knockout of this or an ally, this gains +6 Burn permanently.",
			abilityTags: [
			  { kind: AbilityTagKind.ManualTrigger, trigger: AbilityTrigger.OnKnockout, effects: [{ stat: ModifierStat.BurnAmountAdd, amount: 6 }] },
			],
		},
		3: {
			appliesStatus: [{ type: StatusEffectType.Burn, amount: 18 }],
			abilityText: "On Knockout of this or an ally, this gains +9 Burn permanently.",
			abilityTags: [
			  { kind: AbilityTagKind.ManualTrigger, trigger: AbilityTrigger.OnKnockout, effects: [{ stat: ModifierStat.BurnAmountAdd, amount: 9 }] },
			],
		},
		4: {
			appliesStatus: [{ type: StatusEffectType.Burn, amount: 72 }],
			abilityText: "On Knockout of this or an ally, this gains +18 Burn permanently.",
			abilityTags: [
			  { kind: AbilityTagKind.ManualTrigger, trigger: AbilityTrigger.OnKnockout, effects: [{ stat: ModifierStat.BurnAmountAdd, amount: 18 }] },
			],
		},
	},
}, {
	id: Species.Faebloom,
	name: "Faebloom",
	rarity: Rarity.Mythical,
	types: [CreatureType.Grass],
	spriteFile: "faebloom.png",
	shopCost: 80,
	baseCooldownSeconds: 7,
	baseMulticast: 1,
	publishedCast: { damage: 777, channel: DamageChannel.Direct },
	abilityText: "Mythical Item may appear in your shop. Ongoing Adjacent allies have +10% Damage per Mythical Item used. (currently +X% Damage)",
	abilityTags: [],
	levels: {
		2: {
			abilityText: "Mythical Item may appear in your shop.\nOngoing\nAdjacent allies have +20% Damage per Mythical Item used. (currently +X% Damage)",
		},
		3: {
			abilityText: "Mythical Item may appear in your shop.\nOngoing\nAdjacent allies have +30% Damage per Mythical Item used. (currently +X% Damage)",
		},
		4: {
			abilityText: "Mythical Item may appear in your shop.\nOngoing\nAdjacent allies have +300% Damage per Mythical Item used. (currently +X% Damage)",
		},
	},
}, {
	id: Species.Fernfowl,
	name: "Fernfowl",
	rarity: Rarity.Legendary,
	types: [CreatureType.Flying, CreatureType.Grass],
	evolvesInto: Species.Quillustrous,
	spriteFile: "fernfowl.png",
	shopCost: 0,
	baseCooldownSeconds: 7,
	baseMulticast: 2,
	publishedCast: { damage: 100, channel: DamageChannel.Direct },
	abilityText: "Evolve after your team deals 15000 non-status Damage.(currently 0)",
	abilityTags: [],
	levels: {
		2: {
			publishedCast: { damage: 200, channel: DamageChannel.Direct },
		},
		3: {
			publishedCast: { damage: 300, channel: DamageChannel.Direct },
		},
		4: {
			publishedCast: { damage: 3000, channel: DamageChannel.Direct },
		},
	},
}, {
	id: Species.Flarilisk,
	name: "Flarilisk",
	rarity: Rarity.SuperRare,
	types: [CreatureType.Fire],
	evolvesInto: Species.Basilord,
	abilityTrigger: AbilityTrigger.OnVictory,
	spriteFile: "flarilisk.png",
	shopCost: 60,
	baseCooldownSeconds: 8,
	baseMulticast: 1,
	appliesStatus: [{ type: StatusEffectType.Burn, amount: 10 }],
	abilityText: "Evolve.",
	abilityTags: [],
	levels: {
		2: {
			appliesStatus: [{ type: StatusEffectType.Burn, amount: 20 }],
		},
		3: {
			appliesStatus: [{ type: StatusEffectType.Burn, amount: 30 }],
		},
		4: {
			baseCooldownSeconds: 1,
			appliesStatus: [{ type: StatusEffectType.Burn, amount: 60 }],
		},
	},
}, {
	id: Species.Frillet,
	name: "Frillet",
	rarity: Rarity.Common,
	types: [CreatureType.Water],
	evolvesInto: Species.Dewlotl,
	evolvesAtLevel: 3,
	spriteFile: "frillet.png",
	shopCost: 0,
	baseCooldownSeconds: 4,
	baseMulticast: 1,
	publishedCast: { damage: 10, channel: DamageChannel.Direct },
	healAmount: 10,
	abilityText: "Evolves at level 3.",
	abilityTags: [],
	levels: {
		2: {
			publishedCast: { damage: 20, channel: DamageChannel.Direct },
			healAmount: 20,
		},
		3: {
			publishedCast: { damage: 30, channel: DamageChannel.Direct },
			healAmount: 30,
		},
		4: {
			baseMulticast: 2,
			publishedCast: { damage: 30, channel: DamageChannel.Direct },
			healAmount: 30,
		},
	},
}, {
	id: Species.Frizzly,
	name: "Frizzly",
	rarity: Rarity.Uncommon,
	types: [CreatureType.Electric],
	abilityTrigger: AbilityTrigger.OnBattleStart,
	spriteFile: "frizzly.png",
	shopCost: 25,
	baseCooldownSeconds: 7,
	baseMulticast: 1,
	publishedCast: { damage: 1, channel: DamageChannel.Direct },
	appliesStatus: [{ type: StatusEffectType.Shock, amount: 8 }],
	abilityText: "On Battle Start: Trigger this.",
	abilityTags: [],
	levels: {
		2: {
			appliesStatus: [{ type: StatusEffectType.Shock, amount: 16 }],
			abilityText: "Trigger this.",
		},
		3: {
			appliesStatus: [{ type: StatusEffectType.Shock, amount: 24 }],
			abilityText: "Trigger this.",
		},
		4: {
			baseMulticast: 2,
			appliesStatus: [{ type: StatusEffectType.Shock, amount: 48 }],
			abilityText: "Trigger this.",
		},
	},
}, {
	id: Species.Fumungus,
	name: "Fumungus",
	rarity: Rarity.SuperRare,
	types: [CreatureType.Grass, CreatureType.Toxic],
	abilityTrigger: AbilityTrigger.Ongoing,
	spriteFile: "fumungus.png",
	shopCost: 40,
	baseCooldownSeconds: 3,
	baseMulticast: 1,
	appliesStatus: [{ type: StatusEffectType.Poison, amount: 6 }],
	abilityText: "Has additional Damage equal to 100% of the Poison stacks on the enemy.",
	abilityTags: [
	  { kind: AbilityTagKind.StatFromTargetStatus, status: StatusEffectType.Poison, multiplier: 1 },
	],
	levels: {
		2: {
			abilityText: "Has additional Damage equal to 200% of the Poison stacks on the enemy.",
			abilityTags: [
			  { kind: AbilityTagKind.StatFromTargetStatus, status: StatusEffectType.Poison, multiplier: 2 },
			],
		},
		3: {
			abilityText: "Has additional Damage equal to 300% of the Poison stacks on the enemy.",
			abilityTags: [
			  { kind: AbilityTagKind.StatFromTargetStatus, status: StatusEffectType.Poison, multiplier: 3 },
			],
		},
		4: {
			baseCooldownSeconds: 1.5,
			appliesStatus: [{ type: StatusEffectType.Poison, amount: 12 }],
			abilityText: "Has additional Damage equal to 1200% of the Poison stacks on the enemy.",
			abilityTags: [
			  { kind: AbilityTagKind.StatFromTargetStatus, status: StatusEffectType.Poison, multiplier: 12 },
			],
		},
	},
}, {
	id: Species.Furnadon,
	name: "Furnadon",
	rarity: Rarity.Common,
	types: [CreatureType.Fire, CreatureType.Curio],
	abilityTrigger: AbilityTrigger.Ongoing,
	spriteFile: "furnadon.png",
	shopCost: 0,
	baseCooldownSeconds: 5,
	baseMulticast: 1,
	appliesStatus: [{ type: StatusEffectType.Burn, amount: 4 }],
	abilityText: "Has an additional +1 Burn for each Trinket that you own.",
	abilityTags: [],
	levels: {
		2: {
			appliesStatus: [{ type: StatusEffectType.Burn, amount: 8 }],
			abilityText: "Has an additional +2 Burn for each Trinket that you own.",
		},
		3: {
			appliesStatus: [{ type: StatusEffectType.Burn, amount: 12 }],
			abilityText: "Has an additional +3 Burn for each Trinket that you own.",
		},
		4: {
			appliesStatus: [{ type: StatusEffectType.Burn, amount: 24 }],
			abilityText: "Has an additional +6 Burn for each Trinket that you own.",
		},
	},
}, {
	id: Species.Gachapod,
	name: "Gachapod",
	rarity: Rarity.Legendary,
	types: [CreatureType.Curio],
	spriteFile: "gachapod.png",
	shopCost: 0,
	baseCooldownSeconds: 6,
	baseMulticast: 1,
	publishedCast: { damage: 100, channel: DamageChannel.Direct },
	abilityText: "When this triggers,",
	abilityTags: [],
	levels: {
		2: {
			publishedCast: { damage: 200, channel: DamageChannel.Direct },
		},
		3: {
			publishedCast: { damage: 300, channel: DamageChannel.Direct },
		},
		4: {
			publishedCast: { damage: 2400, channel: DamageChannel.Direct },
		},
	},
}, {
	id: Species.Gaiadrasil,
	name: "Gaiadrasil",
	rarity: Rarity.Legendary,
	types: [CreatureType.Grass],
	abilityTrigger: AbilityTrigger.Ongoing,
	spriteFile: "gaiadrasil.png",
	shopCost: 60,
	baseCooldownSeconds: 9,
	baseMulticast: 1,
	abilityText: "Has additional Damage equal to 100% of the total Damage of adjacent allies. (Except other Gaiadrasil)",
	abilityTags: [],
	levels: {
		2: {
			baseCooldownSeconds: 4.5,
			abilityText: "Has additional Damage equal to 100% of the total Damage of adjacent allies.\n(Except other Gaiadrasil)",
		},
		3: {
			baseCooldownSeconds: 3,
			abilityText: "Has additional Damage equal to 100% of the total Damage of adjacent allies.\n(Except other Gaiadrasil)",
		},
		4: {
			baseCooldownSeconds: 3,
			abilityText: "Has additional Damage equal to 1000% of the total Damage of adjacent allies.\n(Except other Gaiadrasil)",
		},
	},
}, {
	id: Species.Galvanine,
	name: "Galvanine",
	rarity: Rarity.Legendary,
	types: [CreatureType.Electric],
	abilityTrigger: AbilityTrigger.OnCast,
	spriteFile: "galvanine.png",
	shopCost: 50,
	baseCooldownSeconds: 7,
	baseMulticast: 1,
	publishedCast: { damage: 10, channel: DamageChannel.Direct },
	appliesStatus: [{ type: StatusEffectType.Shock, amount: 6 }],
	abilityText: "+50% Cooldown Speed and +2 Shock for this battle.",
	abilityTags: [],
	levels: {
		2: {
			publishedCast: { damage: 20, channel: DamageChannel.Direct },
			appliesStatus: [{ type: StatusEffectType.Shock, amount: 12 }],
			abilityText: "+50% Cooldown Speed and +4 Shock for this battle.",
		},
		3: {
			publishedCast: { damage: 30, channel: DamageChannel.Direct },
			appliesStatus: [{ type: StatusEffectType.Shock, amount: 18 }],
			abilityText: "+50% Cooldown Speed and +6 Shock for this battle.",
		},
		4: {
			publishedCast: { damage: 30, channel: DamageChannel.Direct },
			appliesStatus: [{ type: StatusEffectType.Shock, amount: 144 }],
			abilityText: "+50% Cooldown Speed and +48 Shock for this battle.",
		},
	},
}, {
	id: Species.Geminiss,
	name: "Geminiss",
	rarity: Rarity.Legendary,
	types: [CreatureType.Rock],
	abilityTrigger: AbilityTrigger.OnCast,
	spriteFile: "geminiss.png",
	shopCost: 50,
	baseCooldownSeconds: 10,
	baseMulticast: 1,
	appliesStatus: [{ type: StatusEffectType.Shield, amount: 100 }],
	abilityText: "Give adjacent allies +50% Shield for this battle.",
	abilityTags: [],
	levels: {
		2: {
			abilityText: "Give adjacent allies +100% Shield for this battle.",
		},
		3: {
			abilityText: "Give adjacent allies +150% Shield for this battle.",
		},
		4: {
			appliesStatus: [{ type: StatusEffectType.Shield, amount: 1000 }],
			abilityText: "Give adjacent allies +1500% Shield for this battle.",
		},
	},
}, {
	id: Species.Gemwing,
	name: "Gemwing",
	rarity: Rarity.SuperRare,
	types: [CreatureType.Bug],
	abilityTrigger: AbilityTrigger.OnCast,
	spriteFile: "gemwing.png",
	shopCost: 0,
	baseCooldownSeconds: 6,
	baseMulticast: 1,
	publishedCast: { damage: 150, channel: DamageChannel.Direct },
	abilityText: "Activate the On Bought ability of the ally above 1 time(s).",
	abilityTags: [],
	levels: {
		2: {
			publishedCast: { damage: 300, channel: DamageChannel.Direct },
			abilityText: "Activate the On Bought ability of the ally above 2 time(s).",
		},
		3: {
			publishedCast: { damage: 450, channel: DamageChannel.Direct },
			abilityText: "Activate the On Bought ability of the ally above 3 time(s).",
		},
		4: {
			publishedCast: { damage: 900, channel: DamageChannel.Direct },
			abilityText: "Activate the On Bought ability of the ally above 12 time(s).",
		},
	},
}, {
	id: Species.Gildshell,
	name: "Gildshell",
	rarity: Rarity.Uncommon,
	types: [CreatureType.Bug],
	abilityTrigger: AbilityTrigger.OnBattleStart,
	spriteFile: "gildshell.png",
	shopCost: 20,
	baseCooldownSeconds: 2,
	baseMulticast: 1,
	publishedCast: { damage: 1, channel: DamageChannel.Direct },
	abilityText: "+20 Sell Value permanently.",
	abilityTags: [],
	levels: {
		2: {
			abilityText: "+40 Sell Value permanently.",
		},
		3: {
			abilityText: "+60 Sell Value permanently.",
		},
		4: {
			publishedCast: { damage: 100, channel: DamageChannel.Direct },
			abilityText: "+240 Sell Value permanently.",
		},
	},
}, {
	id: Species.Ginsage,
	name: "Ginsage",
	rarity: Rarity.SuperRare,
	types: [CreatureType.Grass],
	abilityTrigger: AbilityTrigger.OnBattleStart,
	spriteFile: "ginsage.png",
	shopCost: 0,
	baseCooldownSeconds: 7,
	baseMulticast: 1,
	publishedCast: { damage: 150, channel: DamageChannel.Direct },
	abilityText: "Adjacent Grass allies gain +7% Cooldown Speed permanently.",
	abilityTags: [],
	levels: {
		2: {
			publishedCast: { damage: 300, channel: DamageChannel.Direct },
			abilityText: "Adjacent Grass allies gain +14% Cooldown Speed permanently.",
		},
		3: {
			publishedCast: { damage: 450, channel: DamageChannel.Direct },
			abilityText: "Adjacent Grass allies gain +21% Cooldown Speed permanently.",
		},
		4: {
			publishedCast: { damage: 3600, channel: DamageChannel.Direct },
			abilityText: "Adjacent Grass allies gain +168% Cooldown Speed permanently.",
		},
	},
}, {
	id: Species.Goldora,
	name: "Goldora",
	rarity: Rarity.Mythical,
	types: [CreatureType.Curio],
	spriteFile: "goldora.png",
	shopCost: 80,
	baseCooldownSeconds: 6,
	baseMulticast: 1,
	publishedCast: { damage: 333, channel: DamageChannel.Direct },
	abilityText: "On the first cast, gain 1 random non-unique Legendary Trinket(s) for each Legendary ally.",
	abilityTags: [],
	levels: {
		2: {
			abilityText: "On the first cast, gain 2 random non-unique Legendary Trinket(s) for each Legendary ally.",
		},
		3: {
			abilityText: "On the first cast, gain 3 random non-unique Legendary Trinket(s) for each Legendary ally.",
		},
		4: {
			abilityText: "On the first cast, gain 30 random non-unique Legendary Trinket(s) for each Legendary ally.",
		},
	},
}, {
	id: Species.Guardiant,
	name: "Guardiant",
	rarity: Rarity.Common,
	types: [CreatureType.Bug],
	abilityTrigger: AbilityTrigger.OnBought,
	spriteFile: "guardiant.png",
	shopCost: 15,
	baseCooldownSeconds: 4,
	baseMulticast: 1,
	publishedCast: { damage: 15, channel: DamageChannel.Direct },
	abilityText: "After you buy a Bug monster, this gains +8 Damage.",
	abilityTags: [
	  { kind: AbilityTagKind.ManualTrigger, trigger: AbilityTrigger.OnBought, effects: [{ stat: ModifierStat.DamageFlatAdd, amount: 8 }] },
	],
	levels: {
		2: {
			abilityText: "After you buy a Bug monster, this gains +16 Damage.",
			abilityTags: [
			  { kind: AbilityTagKind.ManualTrigger, trigger: AbilityTrigger.OnBought, effects: [{ stat: ModifierStat.DamageFlatAdd, amount: 16 }] },
			],
		},
		3: {
			abilityText: "After you buy a Bug monster, this gains +24 Damage.",
			abilityTags: [
			  { kind: AbilityTagKind.ManualTrigger, trigger: AbilityTrigger.OnBought, effects: [{ stat: ModifierStat.DamageFlatAdd, amount: 24 }] },
			],
		},
		4: {
			publishedCast: { damage: 30, channel: DamageChannel.Direct },
			abilityText: "After you buy a Bug monster, this gains +48 Damage.",
			abilityTags: [
			  { kind: AbilityTagKind.ManualTrigger, trigger: AbilityTrigger.OnBought, effects: [{ stat: ModifierStat.DamageFlatAdd, amount: 48 }] },
			],
		},
	},
}, {
	id: Species.Humbolt,
	name: "Humbolt",
	rarity: Rarity.Rare,
	types: [CreatureType.Electric, CreatureType.Flying],
	spriteFile: "humbolt.png",
	shopCost: 25,
	baseCooldownSeconds: 4,
	baseMulticast: 2,
	publishedCast: { damage: 30, channel: DamageChannel.Direct },
	appliesStatus: [{ type: StatusEffectType.Shock, amount: 1 }],
	abilityText: "",
	abilityTags: [],
	levels: {
		2: {
			baseMulticast: 3,
			publishedCast: { damage: 40, channel: DamageChannel.Direct },
		},
		3: {
			baseMulticast: 4,
			publishedCast: { damage: 45, channel: DamageChannel.Direct },
		},
		4: {
			baseMulticast: 8,
			publishedCast: { damage: 45, channel: DamageChannel.Direct },
		},
	},
}, {
	id: Species.Ignit,
	name: "Ignit",
	rarity: Rarity.Rare,
	types: [CreatureType.Fire],
	evolvesInto: Species.Flarilisk,
	abilityTrigger: AbilityTrigger.OnVictory,
	spriteFile: "ignit.png",
	shopCost: 40,
	baseCooldownSeconds: 8,
	baseMulticast: 1,
	appliesStatus: [{ type: StatusEffectType.Burn, amount: 1 }],
	abilityText: "Evolve.",
	abilityTags: [],
	levels: {
		2: {
			appliesStatus: [{ type: StatusEffectType.Burn, amount: 2 }],
		},
		3: {
			appliesStatus: [{ type: StatusEffectType.Burn, amount: 3 }],
		},
		4: {
			baseCooldownSeconds: 1,
			appliesStatus: [{ type: StatusEffectType.Burn, amount: 3 }],
		},
	},
}, {
	id: Species.Ironcore,
	name: "Ironcore",
	rarity: Rarity.Rare,
	types: [CreatureType.Steel],
	abilityTrigger: AbilityTrigger.OnCast,
	spriteFile: "ironcore.png",
	shopCost: 40,
	baseCooldownSeconds: 2,
	baseMulticast: 1,
	publishedCast: { damage: 30, channel: DamageChannel.Direct },
	abilityText: "Charge adjacent Electric allies by 1 second(s). (Ironcore can't receive charge)",
	abilityTags: [],
	levels: {
		2: {
			abilityText: "Charge adjacent Electric allies by 2 second(s).\n(Ironcore can't receive charge)",
		},
		3: {
			abilityText: "Charge adjacent Electric allies by 3 second(s).\n(Ironcore can't receive charge)",
		},
		4: {
			abilityText: "Charge adjacent Electric allies by 6 second(s).\n(Ironcore can't receive charge)",
		},
	},
}, {
	id: Species.Joltail,
	name: "Joltail",
	rarity: Rarity.Common,
	types: [CreatureType.Electric],
	spriteFile: "joltail.png",
	shopCost: 15,
	baseCooldownSeconds: 4.5,
	baseMulticast: 1,
	publishedCast: { damage: 1, channel: DamageChannel.Direct },
	appliesStatus: [{ type: StatusEffectType.Shock, amount: 4 }],
	abilityText: "",
	abilityTags: [],
	levels: {
		2: {
			publishedCast: { damage: 2, channel: DamageChannel.Direct },
			appliesStatus: [{ type: StatusEffectType.Shock, amount: 8 }],
		},
		3: {
			publishedCast: { damage: 3, channel: DamageChannel.Direct },
			appliesStatus: [{ type: StatusEffectType.Shock, amount: 12 }],
		},
		4: {
			baseMulticast: 2,
			publishedCast: { damage: 3, channel: DamageChannel.Direct },
			appliesStatus: [{ type: StatusEffectType.Shock, amount: 12 }],
		},
	},
}, {
	id: Species.Kappow,
	name: "Kappow",
	rarity: Rarity.Uncommon,
	types: [CreatureType.Water, CreatureType.Fighting],
	abilityTrigger: AbilityTrigger.OnVictory,
	spriteFile: "kappow.png",
	shopCost: 25,
	baseCooldownSeconds: 5.5,
	baseMulticast: 1,
	publishedCast: { damage: 50, channel: DamageChannel.Direct },
	abilityText: "Level up. This can level up indefinitely.",
	abilityTags: [],
	levels: {
		2: {
			publishedCast: { damage: 100, channel: DamageChannel.Direct },
		},
		3: {
			publishedCast: { damage: 150, channel: DamageChannel.Direct },
		},
		4: {
			publishedCast: { damage: 300, channel: DamageChannel.Direct },
		},
	},
}, {
	id: Species.Kickrane,
	name: "Kickrane",
	rarity: Rarity.Rare,
	types: [CreatureType.Fighting, CreatureType.Flying],
	abilityTrigger: AbilityTrigger.OnVictory,
	spriteFile: "kickrane.png",
	shopCost: 0,
	baseCooldownSeconds: 4.5,
	baseMulticast: 2,
	publishedCast: { damage: 30, channel: DamageChannel.Direct },
	abilityText: "This and all your allies gain +20 Damage permanently.",
	abilityTags: [
	  { kind: AbilityTagKind.ManualTrigger, trigger: AbilityTrigger.OnVictory, effects: [{ stat: ModifierStat.DamageFlatAdd, amount: 20 }], target: { kind: TargetKind.AllAllies }, includeSelf: true },
	],
	levels: {
		2: {
			publishedCast: { damage: 60, channel: DamageChannel.Direct },
			abilityText: "This and all your allies gain +40 Damage permanently.",
			abilityTags: [
			  { kind: AbilityTagKind.ManualTrigger, trigger: AbilityTrigger.OnVictory, effects: [{ stat: ModifierStat.DamageFlatAdd, amount: 40 }], target: { kind: TargetKind.AllAllies }, includeSelf: true },
			],
		},
		3: {
			publishedCast: { damage: 90, channel: DamageChannel.Direct },
			abilityText: "This and all your allies gain +60 Damage permanently.",
			abilityTags: [
			  { kind: AbilityTagKind.ManualTrigger, trigger: AbilityTrigger.OnVictory, effects: [{ stat: ModifierStat.DamageFlatAdd, amount: 60 }], target: { kind: TargetKind.AllAllies }, includeSelf: true },
			],
		},
		4: {
			publishedCast: { damage: 360, channel: DamageChannel.Direct },
			abilityText: "This and all your allies gain +240 Damage permanently.",
			abilityTags: [
			  { kind: AbilityTagKind.ManualTrigger, trigger: AbilityTrigger.OnVictory, effects: [{ stat: ModifierStat.DamageFlatAdd, amount: 240 }], target: { kind: TargetKind.AllAllies }, includeSelf: true },
			],
		},
	},
}, {
	id: Species.Kindlepot,
	name: "Kindlepot",
	rarity: Rarity.Common,
	types: [CreatureType.Fire, CreatureType.Curio],
	evolvesInto: Species.Furnadon,
	spriteFile: "kindlepot.png",
	shopCost: 10,
	baseCooldownSeconds: 5,
	baseMulticast: 1,
	appliesStatus: [{ type: StatusEffectType.Burn, amount: 4 }],
	abilityText: "Evolve after collecting 5 more Trinkets.(5 left!)",
	abilityTags: [],
	levels: {
		2: {
			shopCost: 0,
			appliesStatus: [{ type: StatusEffectType.Burn, amount: 8 }],
		},
		3: {
			shopCost: 0,
			appliesStatus: [{ type: StatusEffectType.Burn, amount: 12 }],
		},
		4: {
			shopCost: 0,
			appliesStatus: [{ type: StatusEffectType.Burn, amount: 24 }],
		},
	},
}, {
	id: Species.Lamplet,
	name: "Lamplet",
	rarity: Rarity.Common,
	types: [CreatureType.Bug, CreatureType.Fire],
	spriteFile: "lamplet.png",
	shopCost: 0,
	baseCooldownSeconds: 2.5,
	baseMulticast: 1,
	appliesStatus: [{ type: StatusEffectType.Burn, amount: 1 }],
	abilityText: "",
	abilityTags: [],
	levels: {
		2: {
			appliesStatus: [{ type: StatusEffectType.Burn, amount: 2 }],
		},
		3: {
			appliesStatus: [{ type: StatusEffectType.Burn, amount: 3 }],
		},
		4: {
			baseMulticast: 2,
			appliesStatus: [{ type: StatusEffectType.Burn, amount: 3 }],
		},
	},
}, {
	id: Species.Leafleap,
	name: "Leafleap",
	rarity: Rarity.Common,
	types: [CreatureType.Bug, CreatureType.Grass],
	abilityTrigger: AbilityTrigger.OnBought,
	spriteFile: "leafleap.png",
	shopCost: 0,
	baseCooldownSeconds: 4,
	baseMulticast: 1,
	publishedCast: { damage: 40, channel: DamageChannel.Direct },
	abilityText: "Give all monsters in the shop +5 Damage for the rest of the run.",
	abilityTags: [],
	levels: {
		2: {
			publishedCast: { damage: 80, channel: DamageChannel.Direct },
			abilityText: "Give all monsters in the shop +10 Damage for the rest of the run.",
		},
		3: {
			publishedCast: { damage: 120, channel: DamageChannel.Direct },
			abilityText: "Give all monsters in the shop +15 Damage for the rest of the run.",
		},
		4: {
			publishedCast: { damage: 240, channel: DamageChannel.Direct },
			abilityText: "Give all monsters in the shop +30 Damage for the rest of the run.",
		},
	},
}, {
	id: Species.Lignite,
	name: "Lignite",
	rarity: Rarity.Rare,
	types: [CreatureType.Fire],
	abilityTrigger: AbilityTrigger.Ongoing,
	spriteFile: "lignite.png",
	shopCost: 30,
	baseCooldownSeconds: 5,
	baseMulticast: 1,
	appliesStatus: [{ type: StatusEffectType.Burn, amount: 3 }],
	abilityText: "Has additional Damage equal to 20 times this monster's Burn.",
	abilityTags: [],
	levels: {
		2: {
			abilityText: "Has additional Damage equal to 40 times this monster's Burn.",
		},
		3: {
			abilityText: "Has additional Damage equal to 60 times this monster's Burn.",
		},
		4: {
			abilityText: "Has additional Damage equal to 120 times this monster's Burn.",
		},
	},
}, {
	id: Species.Lumijel,
	name: "Lumijel",
	rarity: Rarity.Rare,
	types: [CreatureType.Water],
	abilityTrigger: AbilityTrigger.OnBattleStart,
	spriteFile: "lumijel.png",
	shopCost: 0,
	baseCooldownSeconds: 5,
	baseMulticast: 1,
	publishedCast: { damage: 20, channel: DamageChannel.Direct },
	healAmount: 30,
	abilityText: "Allies of level 3 or above gain +15 Damage and +15 Heal permanently.",
	abilityTags: [],
	levels: {
		2: {
			publishedCast: { damage: 40, channel: DamageChannel.Direct },
			healAmount: 60,
			abilityText: "Allies of level 3 or above gain +30 Damage and +30 Heal permanently.",
		},
		3: {
			publishedCast: { damage: 60, channel: DamageChannel.Direct },
			healAmount: 90,
			abilityText: "Allies of level 3 or above gain +45 Damage and +45 Heal permanently.",
		},
		4: {
			publishedCast: { damage: 240, channel: DamageChannel.Direct },
			healAmount: 360,
			abilityText: "Allies of level 3 or above gain +180 Damage and +180 Heal permanently.",
		},
	},
}, {
	id: Species.Magmalith,
	name: "Magmalith",
	rarity: Rarity.Rare,
	types: [CreatureType.Fire],
	abilityTrigger: AbilityTrigger.OnCast,
	spriteFile: "magmalith.png",
	shopCost: 30,
	baseCooldownSeconds: 9,
	baseMulticast: 1,
	appliesStatus: [{ type: StatusEffectType.Burn, amount: 5 }],
	abilityText: "Give the ally above +2 Burn permanently.",
	abilityTags: [
	  { kind: AbilityTagKind.BuffOnCast, target: { kind: TargetKind.Above }, effect: { statusGrant: { type: StatusEffectType.Burn, amount: 2 } } },
	],
	levels: {
		2: {
			appliesStatus: [{ type: StatusEffectType.Burn, amount: 10 }],
			abilityText: "Give the ally above +4 Burn permanently.",
			abilityTags: [
			  { kind: AbilityTagKind.BuffOnCast, target: { kind: TargetKind.Above }, effect: { statusGrant: { type: StatusEffectType.Burn, amount: 4 } } },
			],
		},
		3: {
			appliesStatus: [{ type: StatusEffectType.Burn, amount: 15 }],
			abilityText: "Give the ally above +6 Burn permanently.",
			abilityTags: [
			  { kind: AbilityTagKind.BuffOnCast, target: { kind: TargetKind.Above }, effect: { statusGrant: { type: StatusEffectType.Burn, amount: 6 } } },
			],
		},
		4: {
			appliesStatus: [{ type: StatusEffectType.Burn, amount: 30 }],
			abilityText: "Give the ally above +24 Burn permanently.",
			abilityTags: [
			  { kind: AbilityTagKind.BuffOnCast, target: { kind: TargetKind.Above }, effect: { statusGrant: { type: StatusEffectType.Burn, amount: 24 } } },
			],
		},
	},
}, {
	id: Species.Magmite,
	name: "Magmite",
	rarity: Rarity.Common,
	types: [CreatureType.Fire, CreatureType.Rock],
	spriteFile: "magmite.png",
	shopCost: 15,
	baseCooldownSeconds: 4.5,
	baseMulticast: 1,
	appliesStatus: [{ type: StatusEffectType.Shield, amount: 40 }, { type: StatusEffectType.Burn, amount: 4 }],
	abilityText: "",
	abilityTags: [],
	levels: {
		2: {
			appliesStatus: [{ type: StatusEffectType.Shield, amount: 80 }, { type: StatusEffectType.Burn, amount: 8 }],
		},
		3: {
			appliesStatus: [{ type: StatusEffectType.Shield, amount: 120 }, { type: StatusEffectType.Burn, amount: 12 }],
		},
		4: {
			appliesStatus: [{ type: StatusEffectType.Shield, amount: 480 }, { type: StatusEffectType.Burn, amount: 12 }],
		},
	},
}, {
	id: Species.Mallogre,
	name: "Mallogre",
	rarity: Rarity.SuperRare,
	types: [CreatureType.Curio, CreatureType.Rock],
	abilityTrigger: AbilityTrigger.OnBattleStart,
	spriteFile: "mallogre.png",
	shopCost: 0,
	baseCooldownSeconds: 8,
	baseMulticast: 1,
	publishedCast: { damage: 100, channel: DamageChannel.Direct },
	appliesStatus: [{ type: StatusEffectType.Shield, amount: 100 }],
	abilityText: "+4 Damage and +4 Shield permanently for each Trinket that you own.",
	abilityTags: [],
	levels: {
		2: {
			abilityText: "+8 Damage and +8 Shield permanently for each Trinket that you own.",
		},
		3: {
			abilityText: "+12 Damage and +12 Shield permanently for each Trinket that you own.",
		},
		4: {
			abilityText: "+96 Damage and +96 Shield permanently for each Trinket that you own.",
		},
	},
}, {
	id: Species.Miasmaw,
	name: "Miasmaw",
	rarity: Rarity.Legendary,
	types: [CreatureType.Toxic],
	abilityTrigger: AbilityTrigger.OnBattleStart,
	spriteFile: "miasmaw.png",
	shopCost: 0,
	baseCooldownSeconds: 3,
	baseMulticast: 1,
	appliesStatus: [{ type: StatusEffectType.Poison, amount: 10 }],
	abilityText: "Gain Poison for this battle equal to 1x the total Poison of your allies. (Except other Miasmaw)",
	abilityTags: [
	  { kind: AbilityTagKind.BattleStartStatusFromAllies, status: StatusEffectType.Poison, multiplier: 1 },
	],
	levels: {
		2: {
			abilityText: "Gain Poison for this battle equal to 2x the total Poison of your allies.\n(Except other Miasmaw)",
			abilityTags: [
			  { kind: AbilityTagKind.BattleStartStatusFromAllies, status: StatusEffectType.Poison, multiplier: 2 },
			],
		},
		3: {
			abilityText: "Gain Poison for this battle equal to 3x the total Poison of your allies.\n(Except other Miasmaw)",
			abilityTags: [
			  { kind: AbilityTagKind.BattleStartStatusFromAllies, status: StatusEffectType.Poison, multiplier: 3 },
			],
		},
		4: {
			abilityText: "Gain Poison for this battle equal to 24x the total Poison of your allies.\n(Except other Miasmaw)",
			abilityTags: [
			  { kind: AbilityTagKind.BattleStartStatusFromAllies, status: StatusEffectType.Poison, multiplier: 24 },
			],
		},
	},
}, {
	id: Species.Missingn,
	name: "MissingN.",
	rarity: Rarity.Mythical,
	types: [CreatureType.NULL],
	abilityTrigger: AbilityTrigger.OnBattleStart,
	spriteFile: "missing_no.png",
	shopCost: 0,
	baseCooldownSeconds: 30,
	baseMulticast: 1,
	publishedCast: { damage: 1, channel: DamageChannel.Direct },
	abilityText: "For this battle, transform into a random monster 1 rarity above your shop's highest available rarity.",
	abilityTags: [],
}, {
	id: Species.Mosslug,
	name: "Mosslug",
	rarity: Rarity.Common,
	types: [CreatureType.Water, CreatureType.Grass],
	abilityTrigger: AbilityTrigger.OnCast,
	spriteFile: "mosslug.png",
	shopCost: 10,
	baseCooldownSeconds: 6,
	baseMulticast: 1,
	healAmount: 30,
	abilityText: "+20 Damage for this battle.",
	abilityTags: [
	  { kind: AbilityTagKind.BuffOnCast, target: { kind: TargetKind.Self }, effect: { statChange: { stat: StatChangeStat.Damage, amount: 20 } } },
	],
	levels: {
		2: {
			healAmount: 60,
			abilityText: "+40 Damage for this battle.",
			abilityTags: [
			  { kind: AbilityTagKind.BuffOnCast, target: { kind: TargetKind.Self }, effect: { statChange: { stat: StatChangeStat.Damage, amount: 40 } } },
			],
		},
		3: {
			healAmount: 90,
			abilityText: "+60 Damage for this battle.",
			abilityTags: [
			  { kind: AbilityTagKind.BuffOnCast, target: { kind: TargetKind.Self }, effect: { statChange: { stat: StatChangeStat.Damage, amount: 60 } } },
			],
		},
		4: {
			healAmount: 90,
			abilityText: "+120 Damage for this battle.",
			abilityTags: [
			  { kind: AbilityTagKind.BuffOnCast, target: { kind: TargetKind.Self }, effect: { statChange: { stat: StatChangeStat.Damage, amount: 120 } } },
			],
		},
	},
}, {
	id: Species.Nekoffin,
	name: "Nekoffin",
	rarity: Rarity.Uncommon,
	types: [CreatureType.Curio, CreatureType.Ghost],
	abilityTrigger: AbilityTrigger.OnKnockedOut,
	spriteFile: "nekoffin.png",
	shopCost: 0,
	baseCooldownSeconds: 13,
	baseMulticast: 1,
	publishedCast: { damage: 200, channel: DamageChannel.Direct },
	abilityText: "Gain a random non-unique Common Trinket.",
	abilityTags: [],
	levels: {
		2: {
			publishedCast: { damage: 400, channel: DamageChannel.Direct },
			abilityText: "Gain 2 random non-unique Common Trinkets.",
		},
		3: {
			publishedCast: { damage: 600, channel: DamageChannel.Direct },
			abilityText: "Gain 3 random non-unique Common Trinkets.",
		},
		4: {
			publishedCast: { damage: 2300, channel: DamageChannel.Direct },
			abilityText: "Gain 12 random non-unique Common Trinkets.",
		},
	},
}, {
	id: Species.Ninflora,
	name: "Ninflora",
	rarity: Rarity.SuperRare,
	types: [CreatureType.Grass, CreatureType.Fighting],
	abilityTrigger: AbilityTrigger.OnVictory,
	spriteFile: "ninflora.png",
	shopCost: 0,
	baseCooldownSeconds: 4,
	baseMulticast: 1,
	publishedCast: { damage: 50, channel: DamageChannel.Direct },
	abilityText: "This and your Grass allies gain +10% Cooldown Speed permanently.",
	abilityTags: [],
	levels: {
		2: {
			publishedCast: { damage: 100, channel: DamageChannel.Direct },
			abilityText: "This and your Grass allies gain +20% Cooldown Speed permanently.",
		},
		3: {
			publishedCast: { damage: 150, channel: DamageChannel.Direct },
			abilityText: "This and your Grass allies gain +30% Cooldown Speed permanently.",
		},
		4: {
			publishedCast: { damage: 1200, channel: DamageChannel.Direct },
			abilityText: "This and your Grass allies gain +240% Cooldown Speed permanently.",
		},
	},
}, {
	id: Species.Noxalith,
	name: "Noxalith",
	rarity: Rarity.Rare,
	types: [CreatureType.Toxic],
	abilityTrigger: AbilityTrigger.OnCast,
	spriteFile: "noxalith.png",
	shopCost: 30,
	baseCooldownSeconds: 7,
	baseMulticast: 1,
	appliesStatus: [{ type: StatusEffectType.Poison, amount: 5 }],
	abilityText: "Give the ally above +3 Poison permanently.",
	abilityTags: [
	  { kind: AbilityTagKind.BuffOnCast, target: { kind: TargetKind.Above }, effect: { statusGrant: { type: StatusEffectType.Poison, amount: 3 } } },
	],
	levels: {
		2: {
			appliesStatus: [{ type: StatusEffectType.Poison, amount: 10 }],
			abilityText: "Give the ally above +6 Poison permanently.",
			abilityTags: [
			  { kind: AbilityTagKind.BuffOnCast, target: { kind: TargetKind.Above }, effect: { statusGrant: { type: StatusEffectType.Poison, amount: 6 } } },
			],
		},
		3: {
			appliesStatus: [{ type: StatusEffectType.Poison, amount: 15 }],
			abilityText: "Give the ally above +9 Poison permanently.",
			abilityTags: [
			  { kind: AbilityTagKind.BuffOnCast, target: { kind: TargetKind.Above }, effect: { statusGrant: { type: StatusEffectType.Poison, amount: 9 } } },
			],
		},
		4: {
			appliesStatus: [{ type: StatusEffectType.Poison, amount: 30 }],
			abilityText: "Give the ally above +36 Poison permanently.",
			abilityTags: [
			  { kind: AbilityTagKind.BuffOnCast, target: { kind: TargetKind.Above }, effect: { statusGrant: { type: StatusEffectType.Poison, amount: 36 } } },
			],
		},
	},
}, {
	id: Species.Noxnimbus,
	name: "Noxnimbus",
	rarity: Rarity.Uncommon,
	types: [CreatureType.Toxic],
	abilityTrigger: AbilityTrigger.OnCast,
	spriteFile: "noxnimbus.png",
	shopCost: 25,
	baseCooldownSeconds: 3,
	baseMulticast: 1,
	appliesStatus: [{ type: StatusEffectType.Poison, amount: 1 }],
	abilityText: "Adjacent Toxic allies gain +3 Poison for this battle.",
	abilityTags: [
	  { kind: AbilityTagKind.BuffOnCast, target: { kind: TargetKind.Adjacent, typeFilter: CreatureType.Toxic }, effect: { statusGrant: { type: StatusEffectType.Poison, amount: 3 } } },
	],
	levels: {
		2: {
			abilityText: "Adjacent Toxic allies gain +6 Poison for this battle.",
			abilityTags: [
			  { kind: AbilityTagKind.BuffOnCast, target: { kind: TargetKind.Adjacent, typeFilter: CreatureType.Toxic }, effect: { statusGrant: { type: StatusEffectType.Poison, amount: 6 } } },
			],
		},
		3: {
			abilityText: "Adjacent Toxic allies gain +9 Poison for this battle.",
			abilityTags: [
			  { kind: AbilityTagKind.BuffOnCast, target: { kind: TargetKind.Adjacent, typeFilter: CreatureType.Toxic }, effect: { statusGrant: { type: StatusEffectType.Poison, amount: 9 } } },
			],
		},
		4: {
			baseMulticast: 2,
			abilityText: "Adjacent Toxic allies gain +18 Poison for this battle.",
			abilityTags: [
			  { kind: AbilityTagKind.BuffOnCast, target: { kind: TargetKind.Adjacent, typeFilter: CreatureType.Toxic }, effect: { statusGrant: { type: StatusEffectType.Poison, amount: 18 } } },
			],
		},
	},
}, {
	id: Species.Null00,
	name: "NULL-00",
	rarity: Rarity.Mythical,
	types: [CreatureType.NULL],
	abilityTrigger: AbilityTrigger.Ongoing,
	spriteFile: "null_00.png",
	shopCost: 0,
	baseCooldownSeconds: 4,
	baseMulticast: 1,
	appliesStatus: [{ type: StatusEffectType.Shield, amount: 40 }],
	abilityText: "Allies and enemies in this row have +3 Cooldown.",
	abilityTags: [],
	levels: {
		2: {
			appliesStatus: [{ type: StatusEffectType.Shield, amount: 80 }],
			abilityText: "Allies and enemies in this row have +6 Cooldown.",
		},
		3: {
			appliesStatus: [{ type: StatusEffectType.Shield, amount: 120 }],
			abilityText: "Allies and enemies in this row have +9 Cooldown.",
		},
		4: {
			appliesStatus: [{ type: StatusEffectType.Shield, amount: 9999 }],
			abilityText: "Allies and enemies in this row have +999 Cooldown.",
		},
	},
}, {
	id: Species.Null7f,
	name: "NULL-7F",
	rarity: Rarity.Mythical,
	types: [CreatureType.NULL],
	abilityTrigger: AbilityTrigger.OnCast,
	spriteFile: "null_7f.png",
	shopCost: 0,
	baseCooldownSeconds: 12,
	baseMulticast: 1,
	publishedCast: { damage: 180, channel: DamageChannel.Direct },
	abilityText: "Knockout a random enemy.",
	abilityTags: [],
	levels: {
		2: {
			baseCooldownSeconds: 6,
		},
		3: {
			baseCooldownSeconds: 4,
		},
		4: {
			baseCooldownSeconds: 1,
			publishedCast: { damage: 9999, channel: DamageChannel.Direct },
		},
	},
}, {
	id: Species.Nullff,
	name: "NULL-FF",
	rarity: Rarity.Mythical,
	types: [CreatureType.NULL],
	abilityTrigger: AbilityTrigger.OnBattleStart,
	spriteFile: "null_ff.png",
	shopCost: 0,
	baseCooldownSeconds: 9,
	baseMulticast: 1,
	publishedCast: { damage: 99, channel: DamageChannel.Direct },
	abilityText: "Trigger this and allies in this row.",
	abilityTags: [],
	levels: {
		2: {
			baseMulticast: 2,
		},
		3: {
			baseMulticast: 3,
		},
		4: {
			baseMulticast: 999,
			publishedCast: { damage: 999, channel: DamageChannel.Direct },
		},
	},
}, {
	id: Species.Omnichrome,
	name: "Omnichrome",
	rarity: Rarity.Mythical,
	types: [CreatureType.All],
	abilityTrigger: AbilityTrigger.OnBattleStart,
	spriteFile: "omnichrome.png",
	shopCost: 80,
	baseCooldownSeconds: 5,
	baseMulticast: 1,
	publishedCast: { damage: 1, channel: DamageChannel.Direct },
	abilityText: "Gain 80% of the stats of the enemy monster with the highest stats permanently (excluding Multicast and Cooldown).",
	abilityTags: [],
	levels: {
		2: {
			abilityText: "Gain 160% of the stats of the enemy monster with the highest stats permanently (excluding Multicast and Cooldown).",
		},
		3: {
			abilityText: "Gain 240% of the stats of the enemy monster with the highest stats permanently (excluding Multicast and Cooldown).",
		},
		4: {
			abilityText: "Gain 2400% of the stats of the enemy monster with the highest stats permanently (excluding Multicast and Cooldown).",
		},
	},
}, {
	id: Species.Oniclaw,
	name: "Oniclaw",
	rarity: Rarity.SuperRare,
	types: [CreatureType.Fire],
	spriteFile: "oniclaw.png",
	shopCost: 0,
	baseCooldownSeconds: 6,
	baseMulticast: 1,
	publishedCast: { damage: 100, channel: DamageChannel.Direct },
	appliesStatus: [{ type: StatusEffectType.Burn, amount: 5 }],
	abilityText: "Whenever your team inflicts Burn, gain +50% Damage this battle.",
	abilityTags: [],
	levels: {
		2: {
			abilityText: "Whenever your team inflicts Burn, gain +100% Damage this battle.",
		},
		3: {
			abilityText: "Whenever your team inflicts Burn, gain +150% Damage this battle.",
		},
		4: {
			abilityText: "Whenever your team inflicts Burn, gain +1200% Damage this battle.",
		},
	},
}, {
	id: Species.Opalion,
	name: "Opalion",
	rarity: Rarity.SuperRare,
	types: [CreatureType.Rock],
	abilityTrigger: AbilityTrigger.OnCast,
	spriteFile: "opalion.png",
	shopCost: 0,
	baseCooldownSeconds: 6,
	baseMulticast: 1,
	appliesStatus: [{ type: StatusEffectType.Shield, amount: 90 }],
	abilityText: "Trigger 1 random Rock allies. (Except other Opalion)",
	abilityTags: [],
	levels: {
		2: {
			baseMulticast: 2,
			abilityText: "Trigger 1 random Rock allies.\n(Except other Opalion)",
		},
		3: {
			baseMulticast: 3,
			abilityText: "Trigger 1 random Rock allies.\n(Except other Opalion)",
		},
		4: {
			baseMulticast: 12,
			appliesStatus: [{ type: StatusEffectType.Shield, amount: 180 }],
			abilityText: "Trigger 1 random Rock allies.\n(Except other Opalion)",
		},
	},
}, {
	id: Species.Orcana,
	name: "Orcana",
	rarity: Rarity.SuperRare,
	types: [CreatureType.Water],
	abilityTrigger: AbilityTrigger.Ongoing,
	spriteFile: "orcana.png",
	shopCost: 0,
	baseCooldownSeconds: 8,
	baseMulticast: 1,
	healAmount: 200,
	abilityText: "Has an additional +160 Damage and +160 Heal for each ally of level 3 or above.",
	abilityTags: [],
	levels: {
		2: {
			abilityText: "Has an additional +320 Damage and +320 Heal for each ally of level 3 or above.",
		},
		3: {
			abilityText: "Has an additional +480 Damage and +480 Heal for each ally of level 3 or above.",
		},
		4: {
			abilityText: "Has an additional +1920 Damage and +1920 Heal for each ally of level 3 or above.",
		},
	},
}, {
	id: Species.Ouroblaze,
	name: "Ouroblaze",
	rarity: Rarity.Legendary,
	types: [CreatureType.Dragon, CreatureType.Fire],
	abilityTrigger: AbilityTrigger.Ongoing,
	spriteFile: "ouroblaze.png",
	shopCost: 0,
	baseCooldownSeconds: 8,
	baseMulticast: 1,
	publishedCast: { damage: 400, channel: DamageChannel.Direct },
	abilityText: "Has additional Burn equal to 50% of the Burn stacks on the enemy.",
	abilityTags: [],
	levels: {
		2: {
			abilityText: "Has additional Burn equal to 100% of the Burn stacks on the enemy.",
		},
		3: {
			abilityText: "Has additional Burn equal to 150% of the Burn stacks on the enemy.",
		},
		4: {
			abilityText: "Has additional Burn equal to 1500% of the Burn stacks on the enemy.",
		},
	},
}, {
	id: Species.Panbud,
	name: "Panbud",
	rarity: Rarity.Common,
	types: [CreatureType.Grass],
	evolvesInto: Species.Bambudo,
	evolvesAtLevel: 3,
	spriteFile: "panbud.png",
	shopCost: 10,
	baseCooldownSeconds: 5,
	baseMulticast: 1,
	publishedCast: { damage: 25, channel: DamageChannel.Direct },
	abilityText: "Evolves at level 3.",
	abilityTags: [],
	levels: {
		2: {
			publishedCast: { damage: 50, channel: DamageChannel.Direct },
		},
		3: {
			publishedCast: { damage: 75, channel: DamageChannel.Direct },
		},
		4: {
			publishedCast: { damage: 75, channel: DamageChannel.Direct },
		},
	},
}, {
	id: Species.Pawsperity,
	name: "Pawsperity",
	rarity: Rarity.Uncommon,
	types: [CreatureType.Fighting, CreatureType.Curio],
	abilityTrigger: AbilityTrigger.OnVictory,
	spriteFile: "pawsperity.png",
	shopCost: 0,
	baseCooldownSeconds: 6.5,
	baseMulticast: 1,
	publishedCast: { damage: 100, channel: DamageChannel.Direct },
	abilityText: "Gain a random non-unique Common Trinket.",
	abilityTags: [],
	levels: {
		2: {
			publishedCast: { damage: 200, channel: DamageChannel.Direct },
			abilityText: "Gain 2 random non-unique Common Trinkets.",
		},
		3: {
			publishedCast: { damage: 300, channel: DamageChannel.Direct },
			abilityText: "Gain 3 random non-unique Common Trinkets.",
		},
		4: {
			publishedCast: { damage: 600, channel: DamageChannel.Direct },
			abilityText: "Gain 6 random non-unique Common Trinkets.",
		},
	},
}, {
	id: Species.Petrirex,
	name: "Petrirex",
	rarity: Rarity.Rare,
	types: [CreatureType.Rock, CreatureType.Ghost],
	abilityTrigger: AbilityTrigger.OnCast,
	spriteFile: "petrirex.png",
	shopCost: 0,
	baseCooldownSeconds: 5.5,
	baseMulticast: 1,
	publishedCast: { damage: 50, channel: DamageChannel.Direct },
	abilityText: "Knockout adjacent allies and gain +20 Shield permanently for each ally Knockout.",
	abilityTags: [
	  { kind: AbilityTagKind.KnockoutAlliesOnBattleStart, target: { kind: TargetKind.Adjacent }, effectPerKnockout: { statusGrant: { type: StatusEffectType.Shield, amount: 20 } } },
	],
	levels: {
		2: {
			publishedCast: { damage: 100, channel: DamageChannel.Direct },
			abilityText: "Knockout adjacent allies and gain +40 Shield permanently for each ally Knockout.",
			abilityTags: [
			  { kind: AbilityTagKind.KnockoutAlliesOnBattleStart, target: { kind: TargetKind.Adjacent }, effectPerKnockout: { statusGrant: { type: StatusEffectType.Shield, amount: 40 } } },
			],
		},
		3: {
			publishedCast: { damage: 150, channel: DamageChannel.Direct },
			abilityText: "Knockout adjacent allies and gain +60 Shield permanently for each ally Knockout.",
			abilityTags: [
			  { kind: AbilityTagKind.KnockoutAlliesOnBattleStart, target: { kind: TargetKind.Adjacent }, effectPerKnockout: { statusGrant: { type: StatusEffectType.Shield, amount: 60 } } },
			],
		},
		4: {
			publishedCast: { damage: 600, channel: DamageChannel.Direct },
			abilityText: "Knockout adjacent allies and gain +240 Shield permanently for each ally Knockout.",
			abilityTags: [
			  { kind: AbilityTagKind.KnockoutAlliesOnBattleStart, target: { kind: TargetKind.Adjacent }, effectPerKnockout: { statusGrant: { type: StatusEffectType.Shield, amount: 240 } } },
			],
		},
	},
}, {
	id: Species.Pipskull,
	name: "Pipskull",
	rarity: Rarity.Common,
	types: [CreatureType.Ghost],
	evolvesInto: Species.Ratacomb,
	spriteFile: "pipskull.png",
	shopCost: 15,
	baseCooldownSeconds: 4,
	baseMulticast: 1,
	publishedCast: { damage: 20, channel: DamageChannel.Direct },
	abilityText: "Evolve after this monster experiences Knockout 3 times.",
	abilityTags: [],
	levels: {
		2: {
			publishedCast: { damage: 40, channel: DamageChannel.Direct },
		},
		3: {
			publishedCast: { damage: 60, channel: DamageChannel.Direct },
		},
		4: {
			publishedCast: { damage: 120, channel: DamageChannel.Direct },
		},
	},
}, {
	id: Species.Plunderbird,
	name: "Plunderbird",
	rarity: Rarity.Uncommon,
	types: [CreatureType.Water, CreatureType.Flying],
	abilityTrigger: AbilityTrigger.OnCast,
	spriteFile: "plunderbird.png",
	shopCost: 30,
	baseCooldownSeconds: 5,
	baseMulticast: 2,
	publishedCast: { damage: 1, channel: DamageChannel.Direct },
	healAmount: 25,
	abilityText: "Gain $1.",
	abilityTags: [],
	levels: {
		2: {
			baseMulticast: 3,
			healAmount: 35,
		},
		3: {
			baseMulticast: 4,
			healAmount: 55,
		},
		4: {
			baseMulticast: 8,
			healAmount: 55,
			abilityText: "Gain $2.",
		},
	},
}, {
	id: Species.Pompummel,
	name: "Pompummel",
	rarity: Rarity.Legendary,
	types: [CreatureType.Fighting],
	abilityTrigger: AbilityTrigger.OnCast,
	spriteFile: "pompummel.png",
	shopCost: 0,
	baseCooldownSeconds: 6,
	baseMulticast: 1,
	publishedCast: { damage: 300, channel: DamageChannel.Direct },
	abilityText: "Activate the On Victory ability of the ally above.",
	abilityTags: [],
	levels: {
		2: {
			baseCooldownSeconds: 3,
		},
		3: {
			baseCooldownSeconds: 2,
		},
		4: {
			baseCooldownSeconds: 2,
			baseMulticast: 10,
		},
	},
}, {
	id: Species.Prismagon,
	name: "Prismagon",
	rarity: Rarity.SuperRare,
	types: [CreatureType.Dragon],
	abilityTrigger: AbilityTrigger.OnCast,
	spriteFile: "prismagon.png",
	shopCost: 45,
	baseCooldownSeconds: 4.5,
	baseMulticast: 1,
	publishedCast: { damage: 100, channel: DamageChannel.Direct },
	abilityText: "+10 Damage permanently for each unique type on your team.",
	abilityTags: [
	  { kind: AbilityTagKind.StatFromUniqueTypes, target: { kind: TargetKind.Self }, effect: { statChange: { stat: StatChangeStat.Damage, amount: 10 } } },
	],
	levels: {
		2: {
			abilityText: "+20 Damage permanently for each unique type on your team.",
			abilityTags: [
			  { kind: AbilityTagKind.StatFromUniqueTypes, target: { kind: TargetKind.Self }, effect: { statChange: { stat: StatChangeStat.Damage, amount: 20 } } },
			],
		},
		3: {
			abilityText: "+30 Damage permanently for each unique type on your team.",
			abilityTags: [
			  { kind: AbilityTagKind.StatFromUniqueTypes, target: { kind: TargetKind.Self }, effect: { statChange: { stat: StatChangeStat.Damage, amount: 30 } } },
			],
		},
		4: {
			abilityText: "+240 Damage permanently for each unique type on your team.",
			abilityTags: [
			  { kind: AbilityTagKind.StatFromUniqueTypes, target: { kind: TargetKind.Self }, effect: { statChange: { stat: StatChangeStat.Damage, amount: 240 } } },
			],
		},
	},
}, {
	id: Species.Puffloon,
	name: "Puffloon",
	rarity: Rarity.Uncommon,
	types: [CreatureType.Toxic, CreatureType.Water],
	spriteFile: "puffloon.png",
	shopCost: 30,
	baseCooldownSeconds: 10,
	baseMulticast: 1,
	appliesStatus: [{ type: StatusEffectType.Poison, amount: 1 }],
	healAmount: 10,
	abilityText: "Trigger this when adjacent Toxic allies trigger. (Except other Puffloon)",
	abilityTags: [
	  { kind: AbilityTagKind.TriggerOnAllyTrigger, target: { kind: TargetKind.Adjacent, typeFilter: CreatureType.Toxic } },
	],
	levels: {
		2: {
			baseMulticast: 2,
			abilityText: "Trigger this when adjacent Toxic allies trigger.\n(Except other Puffloon)",
		},
		3: {
			baseMulticast: 3,
			abilityText: "Trigger this when adjacent Toxic allies trigger.\n(Except other Puffloon)",
		},
		4: {
			baseMulticast: 12,
			abilityText: "Trigger this when adjacent Toxic allies trigger.\n(Except other Puffloon)",
		},
	},
}, {
	id: Species.Purpleegg,
	name: "Purple Egg",
	rarity: Rarity.SuperRare,
	types: [],
	spriteFile: "purple_egg.png",
	shopCost: 0,
	baseCooldownSeconds: 10,
	baseMulticast: 1,
	publishedCast: { damage: 1, channel: DamageChannel.Direct },
	abilityText: "Hatches a level 2 monster after a number of days.",
	abilityTags: [],
	levels: {
		2: {
			abilityText: "Hatches a level 3 monster after a number of days.",
		},
		3: {
			abilityText: "Hatches a level 4 monster after a number of days.",
		},
		4: {
			abilityText: "Hatches a level 4 monster after a number of days.",
		},
	},
}, {
	id: Species.Pylong,
	name: "Pylong",
	rarity: Rarity.SuperRare,
	types: [CreatureType.Electric],
	abilityTrigger: AbilityTrigger.Ongoing,
	spriteFile: "pylong.png",
	shopCost: 40,
	baseCooldownSeconds: 7,
	baseMulticast: 1,
	publishedCast: { damage: 1, channel: DamageChannel.Direct },
	appliesStatus: [{ type: StatusEffectType.Shock, amount: 15 }],
	abilityText: "Ally behind has +100% Shock.",
	abilityTags: [],
	levels: {
		2: {
			abilityText: "Ally behind has +200% Shock.",
		},
		3: {
			abilityText: "Ally behind has +300% Shock.",
		},
		4: {
			abilityText: "Ally behind has +2400% Shock.",
		},
	},
}, {
	id: Species.Pyrokami,
	name: "Pyrokami",
	rarity: Rarity.Rare,
	types: [CreatureType.Fire],
	abilityTrigger: AbilityTrigger.OnCast,
	spriteFile: "pyrokami.png",
	shopCost: 0,
	baseCooldownSeconds: 4,
	baseMulticast: 1,
	appliesStatus: [{ type: StatusEffectType.Burn, amount: 5 }],
	abilityText: "+10 Burn for this battle.",
	abilityTags: [
	  { kind: AbilityTagKind.BuffOnCast, target: { kind: TargetKind.Self }, effect: { statusGrant: { type: StatusEffectType.Burn, amount: 10 } } },
	],
	levels: {
		2: {
			appliesStatus: [{ type: StatusEffectType.Burn, amount: 10 }],
			abilityText: "+20 Burn for this battle.",
			abilityTags: [
			  { kind: AbilityTagKind.BuffOnCast, target: { kind: TargetKind.Self }, effect: { statusGrant: { type: StatusEffectType.Burn, amount: 20 } } },
			],
		},
		3: {
			appliesStatus: [{ type: StatusEffectType.Burn, amount: 15 }],
			abilityText: "+30 Burn for this battle.",
			abilityTags: [
			  { kind: AbilityTagKind.BuffOnCast, target: { kind: TargetKind.Self }, effect: { statusGrant: { type: StatusEffectType.Burn, amount: 30 } } },
			],
		},
		4: {
			appliesStatus: [{ type: StatusEffectType.Burn, amount: 30 }],
			abilityText: "+60 Burn for this battle.",
			abilityTags: [
			  { kind: AbilityTagKind.BuffOnCast, target: { kind: TargetKind.Self }, effect: { statusGrant: { type: StatusEffectType.Burn, amount: 60 } } },
			],
		},
	},
}, {
	id: Species.Pyronade,
	name: "Pyronade",
	rarity: Rarity.Uncommon,
	types: [CreatureType.Fire],
	abilityTrigger: AbilityTrigger.OnCast,
	spriteFile: "infernade.png",
	shopCost: 25,
	baseCooldownSeconds: 4.5,
	baseMulticast: 1,
	appliesStatus: [{ type: StatusEffectType.Burn, amount: 20 }],
	abilityText: "Knockout self.",
	abilityTags: [],
	levels: {
		2: {
			appliesStatus: [{ type: StatusEffectType.Burn, amount: 40 }],
		},
		3: {
			appliesStatus: [{ type: StatusEffectType.Burn, amount: 60 }],
		},
		4: {
			appliesStatus: [{ type: StatusEffectType.Burn, amount: 240 }],
		},
	},
}, {
	id: Species.Quillustrous,
	name: "Quillustrous",
	rarity: Rarity.Legendary,
	types: [CreatureType.Flying, CreatureType.Grass],
	abilityTrigger: AbilityTrigger.Ongoing,
	spriteFile: "quillustrous.png",
	shopCost: 0,
	baseCooldownSeconds: 7,
	baseMulticast: 2,
	publishedCast: { damage: 150, channel: DamageChannel.Direct },
	abilityText: "Has additional Damage equal to 50% of the total Damage of your allies. (Except other Quillustrous)",
	abilityTags: [],
	levels: {
		2: {
			publishedCast: { damage: 300, channel: DamageChannel.Direct },
			abilityText: "Has additional Damage equal to 100% of the total Damage of your allies.\n(Except other Quillustrous)",
		},
		3: {
			publishedCast: { damage: 450, channel: DamageChannel.Direct },
			abilityText: "Has additional Damage equal to 150% of the total Damage of your allies.\n(Except other Quillustrous)",
		},
		4: {
			publishedCast: { damage: 4500, channel: DamageChannel.Direct },
			abilityText: "Has additional Damage equal to 1500% of the total Damage of your allies.\n(Except other Quillustrous)",
		},
	},
}, {
	id: Species.Ratacomb,
	name: "Ratacomb",
	rarity: Rarity.Common,
	types: [CreatureType.Ghost],
	abilityTrigger: AbilityTrigger.OnKnockedOut,
	spriteFile: "ratacomb.png",
	shopCost: 15,
	baseCooldownSeconds: 4,
	baseMulticast: 1,
	publishedCast: { damage: 20, channel: DamageChannel.Direct },
	abilityText: "+1 Multicast permanently.",
	abilityTags: [
	  { kind: AbilityTagKind.ManualTrigger, trigger: AbilityTrigger.OnKnockedOut, effects: [{ stat: ModifierStat.MulticastAdd, amount: 1 }] },
	],
	levels: {
		2: {
			publishedCast: { damage: 40, channel: DamageChannel.Direct },
			abilityText: "+2 Multicast permanently.",
			abilityTags: [
			  { kind: AbilityTagKind.ManualTrigger, trigger: AbilityTrigger.OnKnockedOut, effects: [{ stat: ModifierStat.MulticastAdd, amount: 2 }] },
			],
		},
		3: {
			publishedCast: { damage: 60, channel: DamageChannel.Direct },
			abilityText: "+3 Multicast permanently.",
			abilityTags: [
			  { kind: AbilityTagKind.ManualTrigger, trigger: AbilityTrigger.OnKnockedOut, effects: [{ stat: ModifierStat.MulticastAdd, amount: 3 }] },
			],
		},
		4: {
			publishedCast: { damage: 120, channel: DamageChannel.Direct },
			abilityText: "+6 Multicast permanently.",
			abilityTags: [
			  { kind: AbilityTagKind.ManualTrigger, trigger: AbilityTrigger.OnKnockedOut, effects: [{ stat: ModifierStat.MulticastAdd, amount: 6 }] },
			],
		},
	},
}, {
	id: Species.Rattleghast,
	name: "Rattleghast",
	rarity: Rarity.Common,
	types: [CreatureType.Ghost, CreatureType.Toxic],
	abilityTrigger: AbilityTrigger.OnBattleStart,
	spriteFile: "rattleghast.png",
	shopCost: 15,
	baseCooldownSeconds: 3.5,
	baseMulticast: 1,
	appliesStatus: [{ type: StatusEffectType.Poison, amount: 1 }],
	abilityText: "Knockout adjacent allies and gain +4 Poison this battle for each ally Knockout.",
	abilityTags: [
	  { kind: AbilityTagKind.KnockoutAlliesOnBattleStart, target: { kind: TargetKind.Adjacent }, effectPerKnockout: { statusGrant: { type: StatusEffectType.Poison, amount: 4 } } },
	],
	levels: {
		2: {
			abilityText: "Knockout adjacent allies and gain +8 Poison this battle for each ally Knockout.",
			abilityTags: [
			  { kind: AbilityTagKind.KnockoutAlliesOnBattleStart, target: { kind: TargetKind.Adjacent }, effectPerKnockout: { statusGrant: { type: StatusEffectType.Poison, amount: 8 } } },
			],
		},
		3: {
			abilityText: "Knockout adjacent allies and gain +12 Poison this battle for each ally Knockout.",
			abilityTags: [
			  { kind: AbilityTagKind.KnockoutAlliesOnBattleStart, target: { kind: TargetKind.Adjacent }, effectPerKnockout: { statusGrant: { type: StatusEffectType.Poison, amount: 12 } } },
			],
		},
		4: {
			abilityText: "Knockout adjacent allies and gain +24 Poison this battle for each ally Knockout.",
			abilityTags: [
			  { kind: AbilityTagKind.KnockoutAlliesOnBattleStart, target: { kind: TargetKind.Adjacent }, effectPerKnockout: { statusGrant: { type: StatusEffectType.Poison, amount: 24 } } },
			],
		},
	},
}, {
	id: Species.Reapra,
	name: "Reapra",
	rarity: Rarity.SuperRare,
	types: [CreatureType.Ghost],
	abilityTrigger: AbilityTrigger.OnCast,
	spriteFile: "reapra.png",
	shopCost: 35,
	baseCooldownSeconds: 7.5,
	baseMulticast: 1,
	publishedCast: { damage: 120, channel: DamageChannel.Direct },
	abilityText: "Knockout the enemy opposite of this.",
	abilityTags: [],
	levels: {
		2: {
			baseCooldownSeconds: 3.7,
		},
		3: {
			baseCooldownSeconds: 2.5,
		},
		4: {
			baseCooldownSeconds: 2.5,
			publishedCast: { damage: 960, channel: DamageChannel.Direct },
			abilityText: "Knockout a random enemy.",
		},
	},
}, {
	id: Species.Rhizuka,
	name: "Rhizuka",
	rarity: Rarity.Rare,
	types: [CreatureType.Rock],
	spriteFile: "rhizuka.png",
	shopCost: 0,
	baseCooldownSeconds: 15,
	baseMulticast: 1,
	publishedCast: { damage: 200, channel: DamageChannel.Direct },
	abilityText: "Trigger this when an ally applies Shield. (Except other Rhizuka)",
	abilityTags: [],
	levels: {
		2: {
			baseMulticast: 2,
			abilityText: "Trigger this when an ally applies Shield.\n(Except other Rhizuka)",
		},
		3: {
			baseMulticast: 3,
			abilityText: "Trigger this when an ally applies Shield.\n(Except other Rhizuka)",
		},
		4: {
			baseMulticast: 12,
			abilityText: "Trigger this when an ally applies Shield.\n(Except other Rhizuka)",
		},
	},
}, {
	id: Species.Rigalord,
	name: "Rigalord",
	rarity: Rarity.Mythical,
	types: [CreatureType.Ghost],
	abilityTrigger: AbilityTrigger.OnBattleStart,
	spriteFile: "rigalord.png",
	shopCost: 80,
	baseCooldownSeconds: 2,
	baseMulticast: 1,
	publishedCast: { damage: 1, channel: DamageChannel.Direct },
	abilityText: "Spawn exact copies of the Batomon this devoured in empty slots the bottom row. They ONLY trigger when this casts.",
	abilityTags: [],
	levels: {
		2: {
			baseMulticast: 2,
		},
		3: {
			baseMulticast: 3,
		},
		4: {
			baseMulticast: 30,
		},
	},
}, {
	id: Species.Riglet,
	name: "Riglet",
	rarity: Rarity.Mythical,
	types: [CreatureType.Ghost],
	evolvesInto: Species.Rigalord,
	spriteFile: "riglet.png",
	shopCost: 80,
	baseCooldownSeconds: 2,
	baseMulticast: 1,
	publishedCast: { damage: 1, channel: DamageChannel.Direct },
	abilityText: "At the start of the next day, devour the ally in front and evolve into Rigalord.",
	abilityTags: [],
	levels: {
		2: {
			baseMulticast: 2,
		},
		3: {
			baseMulticast: 3,
		},
		4: {
			baseMulticast: 10,
		},
	},
}, {
	id: Species.Rubbin,
	name: "Rubbin",
	rarity: Rarity.Common,
	types: [CreatureType.Curio],
	abilityTrigger: AbilityTrigger.OnBattleStart,
	spriteFile: "rubbin.png",
	shopCost: 0,
	baseCooldownSeconds: 6.5,
	baseMulticast: 1,
	publishedCast: { damage: 40, channel: DamageChannel.Direct },
	abilityText: "Gain a Junk Trinket.",
	abilityTags: [],
	levels: {
		2: {
			publishedCast: { damage: 80, channel: DamageChannel.Direct },
			abilityText: "Gain 2 Junk Trinkets.",
		},
		3: {
			publishedCast: { damage: 120, channel: DamageChannel.Direct },
			abilityText: "Gain 3 Junk Trinkets.",
		},
		4: {
			publishedCast: { damage: 240, channel: DamageChannel.Direct },
			abilityText: "Gain 6 Junk Trinkets.",
		},
	},
}, {
	id: Species.Runerock,
	name: "Runerock",
	rarity: Rarity.Uncommon,
	types: [CreatureType.Rock],
	abilityTrigger: AbilityTrigger.OnCast,
	spriteFile: "runerock.png",
	shopCost: 20,
	baseCooldownSeconds: 8,
	baseMulticast: 1,
	appliesStatus: [{ type: StatusEffectType.Shield, amount: 140 }],
	abilityText: "Remove 15 stacks of every debuff on your team.",
	abilityTags: [],
	levels: {
		2: {
			appliesStatus: [{ type: StatusEffectType.Shield, amount: 280 }],
			abilityText: "Remove 30 stacks of every debuff on your team.",
		},
		3: {
			appliesStatus: [{ type: StatusEffectType.Shield, amount: 420 }],
			abilityText: "Remove 45 stacks of every debuff on your team.",
		},
		4: {
			appliesStatus: [{ type: StatusEffectType.Shield, amount: 840 }],
			abilityText: "Remove 90 stacks of every debuff on your team.",
		},
	},
}, {
	id: Species.Saberhorn,
	name: "Saberhorn",
	rarity: Rarity.Legendary,
	types: [CreatureType.Dragon],
	abilityTrigger: AbilityTrigger.OnCast,
	spriteFile: "saberhorn.png",
	shopCost: 60,
	baseCooldownSeconds: 8,
	baseMulticast: 1,
	publishedCast: { damage: 100, channel: DamageChannel.Direct },
	abilityText: "Give the ally in front +1 Multicast and increase this monster's Cooldown by 8 seconds for this battle.",
	abilityTags: [
	  { kind: AbilityTagKind.BuffOnCast, target: { kind: TargetKind.InFront }, effect: { statChange: { stat: StatChangeStat.Multicast, amount: 1 } } },
	  { kind: AbilityTagKind.BuffOnCast, target: { kind: TargetKind.Self }, effect: { statChange: { stat: StatChangeStat.CooldownFlatSeconds, amount: 8 } } },
	],
	levels: {
		2: {
			abilityText: "Give the ally in front +2 Multicast and increase this monster's Cooldown by 8 seconds for this battle.",
			abilityTags: [
			  { kind: AbilityTagKind.BuffOnCast, target: { kind: TargetKind.InFront }, effect: { statChange: { stat: StatChangeStat.Multicast, amount: 2 } } },
			  { kind: AbilityTagKind.BuffOnCast, target: { kind: TargetKind.Self }, effect: { statChange: { stat: StatChangeStat.CooldownFlatSeconds, amount: 8 } } },
			],
		},
		3: {
			abilityText: "Give the ally in front +3 Multicast and increase this monster's Cooldown by 8 seconds for this battle.",
			abilityTags: [
			  { kind: AbilityTagKind.BuffOnCast, target: { kind: TargetKind.InFront }, effect: { statChange: { stat: StatChangeStat.Multicast, amount: 3 } } },
			  { kind: AbilityTagKind.BuffOnCast, target: { kind: TargetKind.Self }, effect: { statChange: { stat: StatChangeStat.CooldownFlatSeconds, amount: 8 } } },
			],
		},
		4: {
			abilityText: "Give the ally in front +24 Multicast and increase this monster's Cooldown by 8 seconds for this battle.",
			abilityTags: [
			  { kind: AbilityTagKind.BuffOnCast, target: { kind: TargetKind.InFront }, effect: { statChange: { stat: StatChangeStat.Multicast, amount: 24 } } },
			  { kind: AbilityTagKind.BuffOnCast, target: { kind: TargetKind.Self }, effect: { statChange: { stat: StatChangeStat.CooldownFlatSeconds, amount: 8 } } },
			],
		},
	},
}, {
	id: Species.Sarudo,
	name: "Sarudo",
	rarity: Rarity.Rare,
	types: [CreatureType.Fighting],
	abilityTrigger: AbilityTrigger.OnBattleLost,
	spriteFile: "sarudo.png",
	shopCost: 25,
	baseCooldownSeconds: 6,
	baseMulticast: 1,
	publishedCast: { damage: 100, channel: DamageChannel.Direct },
	abilityText: "Activate the On Victory abilities of adjacent allies 1 time(s).",
	abilityTags: [],
	levels: {
		2: {
			publishedCast: { damage: 200, channel: DamageChannel.Direct },
			abilityText: "Activate the On Victory abilities of adjacent allies 2 time(s).",
		},
		3: {
			publishedCast: { damage: 300, channel: DamageChannel.Direct },
			abilityText: "Activate the On Victory abilities of adjacent allies 3 time(s).",
		},
		4: {
			publishedCast: { damage: 1200, channel: DamageChannel.Direct },
			abilityText: "Activate the On Victory abilities of adjacent allies 12 time(s).",
		},
	},
}, {
	id: Species.Scorubble,
	name: "Scorubble",
	rarity: Rarity.Common,
	types: [CreatureType.Rock, CreatureType.Toxic],
	spriteFile: "scorbble.png",
	shopCost: 0,
	baseCooldownSeconds: 5,
	baseMulticast: 1,
	appliesStatus: [{ type: StatusEffectType.Shield, amount: 30 }, { type: StatusEffectType.Poison, amount: 2 }],
	abilityText: "",
	abilityTags: [],
	levels: {
		2: {
			appliesStatus: [{ type: StatusEffectType.Shield, amount: 60 }, { type: StatusEffectType.Poison, amount: 4 }],
		},
		3: {
			appliesStatus: [{ type: StatusEffectType.Shield, amount: 90 }, { type: StatusEffectType.Poison, amount: 6 }],
		},
		4: {
			appliesStatus: [{ type: StatusEffectType.Shield, amount: 180 }, { type: StatusEffectType.Poison, amount: 12 }],
		},
	},
}, {
	id: Species.Shelldra,
	name: "Shelldra",
	rarity: Rarity.SuperRare,
	types: [CreatureType.Water, CreatureType.Dragon],
	spriteFile: "shelldra.png",
	shopCost: 40,
	baseCooldownSeconds: 4.5,
	baseMulticast: 3,
	publishedCast: { damage: 15, channel: DamageChannel.Direct },
	healAmount: 15,
	abilityText: "Every 4 seconds, +1 Multicast for this battle.",
	abilityTags: [],
	levels: {
		2: {
			abilityText: "Every 4 seconds, +2 Multicast for this battle.",
		},
		3: {
			abilityText: "Every 4 seconds, +3 Multicast for this battle.",
		},
		4: {
			baseMulticast: 6,
			publishedCast: { damage: 30, channel: DamageChannel.Direct },
			healAmount: 30,
			abilityText: "Every 4 seconds, +12 Multicast for this battle.",
		},
	},
}, {
	id: Species.Shellter,
	name: "Shellter",
	rarity: Rarity.Common,
	types: [CreatureType.Rock],
	abilityTrigger: AbilityTrigger.OnCast,
	spriteFile: "shellter.png",
	shopCost: 0,
	baseCooldownSeconds: 6.5,
	baseMulticast: 1,
	appliesStatus: [{ type: StatusEffectType.Shield, amount: 120 }],
	abilityText: "-20 Shield for this battle.",
	abilityTags: [],
	levels: {
		2: {
			appliesStatus: [{ type: StatusEffectType.Shield, amount: 240 }],
			abilityText: "-40 Shield for this battle.",
		},
		3: {
			appliesStatus: [{ type: StatusEffectType.Shield, amount: 360 }],
			abilityText: "-60 Shield for this battle.",
		},
		4: {
			appliesStatus: [{ type: StatusEffectType.Shield, amount: 720 }],
			abilityText: "-60 Shield for this battle.",
		},
	},
}, {
	id: Species.Shikitsune,
	name: "Shikitsune",
	rarity: Rarity.Rare,
	types: [CreatureType.Ghost],
	abilityTrigger: AbilityTrigger.OnCast,
	spriteFile: "shikitsune.png",
	shopCost: 0,
	baseCooldownSeconds: 3,
	baseMulticast: 1,
	publishedCast: { damage: 50, channel: DamageChannel.Direct },
	abilityText: "Knocked-out allies are revived and gain +15% Cooldown Speed for this battle.",
	abilityTags: [
	  { kind: AbilityTagKind.ReviveKnockedOutAllies, cooldownSpeedBonus: 0.15 },
	],
	levels: {
		2: {
			publishedCast: { damage: 100, channel: DamageChannel.Direct },
			abilityText: "Knocked-out allies are revived and gain +30% Cooldown Speed for this battle.",
			abilityTags: [
			  { kind: AbilityTagKind.ReviveKnockedOutAllies, cooldownSpeedBonus: 0.3 },
			],
		},
		3: {
			publishedCast: { damage: 150, channel: DamageChannel.Direct },
			abilityText: "Knocked-out allies are revived and gain +45% Cooldown Speed for this battle.",
			abilityTags: [
			  { kind: AbilityTagKind.ReviveKnockedOutAllies, cooldownSpeedBonus: 0.45 },
			],
		},
		4: {
			publishedCast: { damage: 1500, channel: DamageChannel.Direct },
			abilityText: "Knocked-out allies are revived and gain +180% Cooldown Speed for this battle.",
			abilityTags: [
			  { kind: AbilityTagKind.ReviveKnockedOutAllies, cooldownSpeedBonus: 1.8 },
			],
		},
	},
}, {
	id: Species.Shogapede,
	name: "Shogapede",
	rarity: Rarity.Uncommon,
	types: [CreatureType.Bug, CreatureType.Toxic],
	spriteFile: "shogapede.png",
	shopCost: 30,
	baseCooldownSeconds: 5,
	baseMulticast: 1,
	appliesStatus: [{ type: StatusEffectType.Poison, amount: 6 }],
	abilityText: "After you buy a Bug monster, this gains +10% Cooldown Speed.",
	abilityTags: [],
	levels: {
		2: {
			abilityText: "After you buy a Bug monster, this gains +20% Cooldown Speed.",
		},
		3: {
			abilityText: "After you buy a Bug monster, this gains +30% Cooldown Speed.",
		},
		4: {
			baseMulticast: 2,
			appliesStatus: [{ type: StatusEffectType.Poison, amount: 12 }],
			abilityText: "After you buy a Bug monster, this gains +60% Cooldown Speed.",
		},
	},
}, {
	id: Species.Shrinell,
	name: "Shrinell",
	rarity: Rarity.SuperRare,
	types: [CreatureType.Curio],
	abilityTrigger: AbilityTrigger.Ongoing,
	spriteFile: "shrinell.png",
	shopCost: 0,
	baseCooldownSeconds: 8,
	baseMulticast: 1,
	publishedCast: { damage: 160, channel: DamageChannel.Direct },
	abilityText: "Ally behind has +% Cooldown Speed for each Trinket that you own.",
	abilityTags: [],
	levels: {
		2: {
			publishedCast: { damage: 320, channel: DamageChannel.Direct },
		},
		3: {
			publishedCast: { damage: 480, channel: DamageChannel.Direct },
		},
		4: {
			publishedCast: { damage: 3840, channel: DamageChannel.Direct },
		},
	},
}, {
	id: Species.Sirenade,
	name: "Sirenade",
	rarity: Rarity.SuperRare,
	types: [CreatureType.Water],
	abilityTrigger: AbilityTrigger.OnCast,
	spriteFile: "sirenade.png",
	shopCost: 40,
	baseCooldownSeconds: 4,
	baseMulticast: 1,
	healAmount: 100,
	abilityText: "Remove 20% of debuffs on your team.",
	abilityTags: [],
	levels: {
		2: {
			healAmount: 200,
			abilityText: "Remove 35% of debuffs on your team.",
		},
		3: {
			healAmount: 300,
			abilityText: "Remove 50% of debuffs on your team.",
		},
		4: {
			healAmount: 1200,
			abilityText: "Remove 80% of debuffs on your team.",
		},
	},
}, {
	id: Species.Snapscald,
	name: "Snapscald",
	rarity: Rarity.SuperRare,
	types: [CreatureType.Fire, CreatureType.Water],
	spriteFile: "snapscald.png",
	shopCost: 0,
	baseCooldownSeconds: 9,
	baseMulticast: 1,
	appliesStatus: [{ type: StatusEffectType.Burn, amount: 8 }],
	healAmount: 40,
	abilityText: "Trigger this when an ally of level 3 or above casts. (Except other Snapscald)",
	abilityTags: [],
	levels: {
		2: {
			appliesStatus: [{ type: StatusEffectType.Burn, amount: 16 }],
			healAmount: 80,
			abilityText: "Trigger this when an ally of level 3 or above casts.\n(Except other Snapscald)",
		},
		3: {
			appliesStatus: [{ type: StatusEffectType.Burn, amount: 24 }],
			healAmount: 120,
			abilityText: "Trigger this when an ally of level 3 or above casts.\n(Except other Snapscald)",
		},
		4: {
			appliesStatus: [{ type: StatusEffectType.Burn, amount: 192 }],
			healAmount: 96,
			abilityText: "Trigger this when an ally of level 3 or above casts.\n(Except other Snapscald)",
		},
	},
}, {
	id: Species.Spinarai,
	name: "Spinarai",
	rarity: Rarity.Common,
	types: [CreatureType.Bug, CreatureType.Toxic],
	spriteFile: "spinarai.png",
	shopCost: 10,
	baseCooldownSeconds: 2.5,
	baseMulticast: 1,
	publishedCast: { damage: 3, channel: DamageChannel.Direct },
	appliesStatus: [{ type: StatusEffectType.Poison, amount: 1 }],
	abilityText: "",
	abilityTags: [],
	levels: {
		2: {
			publishedCast: { damage: 6, channel: DamageChannel.Direct },
			appliesStatus: [{ type: StatusEffectType.Poison, amount: 2 }],
		},
		3: {
			publishedCast: { damage: 9, channel: DamageChannel.Direct },
			appliesStatus: [{ type: StatusEffectType.Poison, amount: 3 }],
		},
		4: {
			baseMulticast: 2,
			publishedCast: { damage: 9, channel: DamageChannel.Direct },
			appliesStatus: [{ type: StatusEffectType.Poison, amount: 3 }],
		},
	},
}, {
	id: Species.Sproach,
	name: "Sproach",
	rarity: Rarity.Rare,
	types: [CreatureType.Bug, CreatureType.Grass],
	abilityTrigger: AbilityTrigger.OnBought,
	spriteFile: "sproach.png",
	shopCost: 0,
	baseCooldownSeconds: 5.5,
	baseMulticast: 1,
	abilityText: "+30 Damage permanently for each life lost this run.",
	abilityTags: [],
	levels: {
		2: {
			abilityText: "+60 Damage permanently for each life lost this run.",
		},
		3: {
			abilityText: "+90 Damage permanently for each life lost this run.",
		},
		4: {
			abilityText: "+360 Damage permanently for each life lost this run.",
		},
	},
}, {
	id: Species.Sproutquill,
	name: "Sproutquill",
	rarity: Rarity.Legendary,
	types: [CreatureType.Flying, CreatureType.Grass],
	evolvesInto: Species.Fernfowl,
	spriteFile: "sproutquill.png",
	shopCost: 0,
	baseCooldownSeconds: 7,
	baseMulticast: 2,
	publishedCast: { damage: 50, channel: DamageChannel.Direct },
	abilityText: "Evolve after your team deals 10000 non-status Damage.(currently 0)",
	abilityTags: [],
	levels: {
		2: {
			publishedCast: { damage: 100, channel: DamageChannel.Direct },
		},
		3: {
			publishedCast: { damage: 150, channel: DamageChannel.Direct },
		},
		4: {
			publishedCast: { damage: 1500, channel: DamageChannel.Direct },
		},
	},
}, {
	id: Species.Stalagrove,
	name: "Stalagrove",
	rarity: Rarity.Rare,
	types: [CreatureType.Grass, CreatureType.Rock],
	spriteFile: "stalagrove.png",
	shopCost: 35,
	baseCooldownSeconds: 4.5,
	baseMulticast: 1,
	appliesStatus: [{ type: StatusEffectType.Shield, amount: 60 }],
	abilityText: "When you receive shield, this gains Damage for this battle equal to 15% of the amount shielded.",
	abilityTags: [],
	levels: {
		2: {
			abilityText: "When you receive shield, this gains Damage for this battle equal to 30% of the amount shielded.",
		},
		3: {
			abilityText: "When you receive shield, this gains Damage for this battle equal to 45% of the amount shielded.",
		},
		4: {
			abilityText: "When you receive shield, this gains Damage for this battle equal to 180% of the amount shielded.",
		},
	},
}, {
	id: Species.Steamscuttle,
	name: "Steamscuttle",
	rarity: Rarity.Rare,
	types: [CreatureType.Fire, CreatureType.Water],
	abilityTrigger: AbilityTrigger.OnCast,
	spriteFile: "steamscuttle.png",
	shopCost: 0,
	baseCooldownSeconds: 3.5,
	baseMulticast: 1,
	appliesStatus: [{ type: StatusEffectType.Burn, amount: 5 }],
	healAmount: 30,
	abilityText: "Charge adjacent Fire and Water allies by 1 second(s). (Steamscuttle can't receive charge)",
	abilityTags: [],
	levels: {
		2: {
			appliesStatus: [{ type: StatusEffectType.Burn, amount: 10 }],
			healAmount: 60,
			abilityText: "Charge adjacent Fire and Water allies by 2 second(s).\n(Steamscuttle can't receive charge)",
		},
		3: {
			appliesStatus: [{ type: StatusEffectType.Burn, amount: 15 }],
			healAmount: 90,
			abilityText: "Charge adjacent Fire and Water allies by 3 second(s).\n(Steamscuttle can't receive charge)",
		},
		4: {
			appliesStatus: [{ type: StatusEffectType.Burn, amount: 60 }],
			healAmount: 360,
			abilityText: "Charge adjacent Fire and Water allies by 12 second(s).\n(Steamscuttle can't receive charge)",
		},
	},
}, {
	id: Species.Stellagon,
	name: "Stellagon",
	rarity: Rarity.Legendary,
	types: [CreatureType.Dragon],
	abilityTrigger: AbilityTrigger.Ongoing,
	spriteFile: "stellagon.png",
	shopCost: 50,
	baseCooldownSeconds: 6,
	baseMulticast: 1,
	publishedCast: { damage: 150, channel: DamageChannel.Direct },
	abilityText: "Adjacent allies with no abilities have +2 Multicast.",
	abilityTags: [],
	levels: {
		2: {
			publishedCast: { damage: 300, channel: DamageChannel.Direct },
			abilityText: "Adjacent allies with no abilities have +4 Multicast.",
		},
		3: {
			publishedCast: { damage: 450, channel: DamageChannel.Direct },
			abilityText: "Adjacent allies with no abilities have +6 Multicast.",
		},
		4: {
			publishedCast: { damage: 4500, channel: DamageChannel.Direct },
			abilityText: "Adjacent allies with no abilities have +60 Multicast.",
		},
	},
}, {
	id: Species.Stingarde,
	name: "Stingarde",
	rarity: Rarity.Common,
	types: [CreatureType.Bug],
	abilityTrigger: AbilityTrigger.OnCast,
	spriteFile: "stingarde.png",
	shopCost: 10,
	baseCooldownSeconds: 6,
	baseMulticast: 1,
	publishedCast: { damage: 150, channel: DamageChannel.Direct },
	abilityText: "Knockout self.",
	abilityTags: [],
	levels: {
		2: {
			publishedCast: { damage: 300, channel: DamageChannel.Direct },
		},
		3: {
			publishedCast: { damage: 450, channel: DamageChannel.Direct },
		},
		4: {
			publishedCast: { damage: 1350, channel: DamageChannel.Direct },
		},
	},
}, {
	id: Species.Sukoi,
	name: "Sukoi",
	rarity: Rarity.Uncommon,
	types: [CreatureType.Water],
	spriteFile: "sukoi.png",
	shopCost: 0,
	baseCooldownSeconds: 9,
	baseMulticast: 1,
	healAmount: 80,
	abilityText: "",
	abilityTags: [],
	levels: {
		2: {
			baseCooldownSeconds: 4.5,
		},
		3: {
			baseCooldownSeconds: 3,
		},
		4: {
			baseCooldownSeconds: 3,
		},
	},
}, {
	id: Species.Swoonet,
	name: "Swoonet",
	rarity: Rarity.Common,
	types: [CreatureType.Water, CreatureType.Flying],
	spriteFile: "swoonet.png",
	shopCost: 0,
	baseCooldownSeconds: 6.5,
	baseMulticast: 1,
	publishedCast: { damage: 30, channel: DamageChannel.Direct },
	healAmount: 30,
	abilityText: "This only needs 2 copies to level up. This can level up indefinitely.",
	abilityTags: [],
	levels: {
		2: {
			baseMulticast: 2,
		},
		3: {
			baseMulticast: 3,
		},
		4: {
			baseMulticast: 6,
		},
	},
}, {
	id: Species.Talonite,
	name: "Talonite",
	rarity: Rarity.Rare,
	types: [CreatureType.Flying, CreatureType.Rock],
	abilityTrigger: AbilityTrigger.OnBattleStart,
	spriteFile: "talonite.png",
	shopCost: 0,
	baseCooldownSeconds: 12,
	baseMulticast: 2,
	publishedCast: { damage: 30, channel: DamageChannel.Direct },
	abilityText: "+20 Shield permanently for each Rock ally and +1 Multicast permanently for each Flying ally.",
	abilityTags: [],
	levels: {
		2: {
			publishedCast: { damage: 60, channel: DamageChannel.Direct },
			abilityText: "+40 Shield permanently for each Rock ally and +2 Multicast permanently for each Flying ally.",
		},
		3: {
			publishedCast: { damage: 90, channel: DamageChannel.Direct },
			abilityText: "+60 Shield permanently for each Rock ally and +3 Multicast permanently for each Flying ally.",
		},
		4: {
			publishedCast: { damage: 180, channel: DamageChannel.Direct },
			abilityText: "+120 Shield permanently for each Rock ally and +6 Multicast permanently for each Flying ally.",
		},
	},
}, {
	id: Species.Tengusto,
	name: "Tengusto",
	rarity: Rarity.SuperRare,
	types: [CreatureType.Fighting, CreatureType.Flying],
	abilityTrigger: AbilityTrigger.Ongoing,
	spriteFile: "tengusto.png",
	shopCost: 0,
	baseCooldownSeconds: 4.5,
	baseMulticast: 2,
	publishedCast: { damage: 50, channel: DamageChannel.Direct },
	abilityText: "Has an additional +60 Damage for each Badge that you have.",
	abilityTags: [],
	levels: {
		2: {
			abilityText: "Has an additional +120 Damage for each Badge that you have.",
		},
		3: {
			abilityText: "Has an additional +180 Damage for each Badge that you have.",
		},
		4: {
			abilityText: "Has an additional +720 Damage for each Badge that you have.",
		},
	},
}, {
	id: Species.Thorntail,
	name: "Thorntail",
	rarity: Rarity.Rare,
	types: [CreatureType.Grass, CreatureType.Toxic],
	abilityTrigger: AbilityTrigger.OnCast,
	spriteFile: "thorntail.png",
	shopCost: 35,
	baseCooldownSeconds: 6,
	baseMulticast: 1,
	publishedCast: { damage: 50, channel: DamageChannel.Direct },
	appliesStatus: [{ type: StatusEffectType.Poison, amount: 1 }],
	abilityText: "When allies inflict Poison, this gains +8 Damage permanently.",
	abilityTags: [
	  { kind: AbilityTagKind.GainOnAllyStatus, status: StatusEffectType.Poison, stat: StatChangeStat.Damage, amount: 8 },
	],
	levels: {
		2: {
			abilityText: "When allies inflict Poison, this gains +16 Damage permanently.",
			abilityTags: [
			  { kind: AbilityTagKind.GainOnAllyStatus, status: StatusEffectType.Poison, stat: StatChangeStat.Damage, amount: 16 },
			],
		},
		3: {
			abilityText: "When allies inflict Poison, this gains +24 Damage permanently.",
			abilityTags: [
			  { kind: AbilityTagKind.GainOnAllyStatus, status: StatusEffectType.Poison, stat: StatChangeStat.Damage, amount: 24 },
			],
		},
		4: {
			publishedCast: { damage: 150, channel: DamageChannel.Direct },
			abilityText: "When allies inflict Poison, this gains +96 Damage permanently.",
			abilityTags: [
			  { kind: AbilityTagKind.GainOnAllyStatus, status: StatusEffectType.Poison, stat: StatChangeStat.Damage, amount: 96 },
			],
		},
	},
}, {
	id: Species.Torrantler,
	name: "Torrantler",
	rarity: Rarity.Legendary,
	types: [CreatureType.Water],
	abilityTrigger: AbilityTrigger.OnCast,
	spriteFile: "torrantler.png",
	shopCost: 50,
	baseCooldownSeconds: 7,
	baseMulticast: 1,
	healAmount: 200,
	abilityText: "Trigger adjacent Water allies. (Except other Torrantler)",
	abilityTags: [],
	levels: {
		2: {
			baseMulticast: 2,
			abilityText: "Trigger adjacent Water allies.\n(Except other Torrantler)",
		},
		3: {
			baseMulticast: 3,
			abilityText: "Trigger adjacent Water allies.\n(Except other Torrantler)",
		},
		4: {
			baseMulticast: 30,
			abilityText: "Trigger adjacent Water allies.\n(Except other Torrantler)",
		},
	},
}, {
	id: Species.Toximoth,
	name: "Toximoth",
	rarity: Rarity.Common,
	types: [CreatureType.Bug, CreatureType.Toxic],
	abilityTrigger: AbilityTrigger.OnBought,
	spriteFile: "toximoth.png",
	shopCost: 0,
	baseCooldownSeconds: 3.5,
	baseMulticast: 1,
	publishedCast: { damage: 2, channel: DamageChannel.Direct },
	appliesStatus: [{ type: StatusEffectType.Poison, amount: 2 }],
	abilityText: "Give Toxic monsters in the shop +1 Poison for the rest of the run.",
	abilityTags: [],
	levels: {
		2: {
			publishedCast: { damage: 4, channel: DamageChannel.Direct },
			appliesStatus: [{ type: StatusEffectType.Poison, amount: 4 }],
			abilityText: "Give Toxic monsters in the shop +2 Poison for the rest of the run.",
		},
		3: {
			publishedCast: { damage: 6, channel: DamageChannel.Direct },
			appliesStatus: [{ type: StatusEffectType.Poison, amount: 6 }],
			abilityText: "Give Toxic monsters in the shop +3 Poison for the rest of the run.",
		},
		4: {
			publishedCast: { damage: 12, channel: DamageChannel.Direct },
			appliesStatus: [{ type: StatusEffectType.Poison, amount: 12 }],
			abilityText: "Give Toxic monsters in the shop +6 Poison for the rest of the run.",
		},
	},
}, {
	id: Species.Tsunamere,
	name: "Tsunamere",
	rarity: Rarity.Legendary,
	types: [CreatureType.Dragon, CreatureType.Water],
	abilityTrigger: AbilityTrigger.OnCast,
	spriteFile: "tsunamere.png",
	shopCost: 0,
	baseCooldownSeconds: 7,
	baseMulticast: 1,
	healAmount: 400,
	abilityText: "Level up all adjacent allies for this battle (max level 3).",
	abilityTags: [],
	levels: {
		2: {
			baseCooldownSeconds: 3.5,
		},
		3: {
			baseCooldownSeconds: 2.5,
		},
		4: {
			baseCooldownSeconds: 2.5,
			baseMulticast: 10,
		},
	},
}, {
	id: Species.Velocect,
	name: "Velocect",
	rarity: Rarity.Common,
	types: [CreatureType.Bug, CreatureType.Flying],
	spriteFile: "velocect.png",
	shopCost: 15,
	baseCooldownSeconds: 3.5,
	baseMulticast: 2,
	publishedCast: { damage: 15, channel: DamageChannel.Direct },
	abilityText: "",
	abilityTags: [],
	levels: {
		2: {
			baseMulticast: 3,
			publishedCast: { damage: 20, channel: DamageChannel.Direct },
		},
		3: {
			baseMulticast: 4,
			publishedCast: { damage: 25, channel: DamageChannel.Direct },
		},
		4: {
			baseMulticast: 8,
			publishedCast: { damage: 25, channel: DamageChannel.Direct },
		},
	},
}, {
	id: Species.Vengrieve,
	name: "Vengrieve",
	rarity: Rarity.Legendary,
	types: [CreatureType.Ghost],
	abilityTrigger: AbilityTrigger.OnCast,
	spriteFile: "vengrieve.png",
	shopCost: 0,
	baseCooldownSeconds: 7.5,
	baseMulticast: 1,
	abilityText: "Knockout the monster opposite of this and gain their stats for this battle (except Cooldown).",
	abilityTags: [],
	levels: {
		2: {
			baseCooldownSeconds: 3.75,
		},
		3: {
			baseCooldownSeconds: 2.5,
		},
		4: {
			baseCooldownSeconds: 2.5,
			abilityText: "Knockout a random enemy and gain their stats for this battle (except Cooldown).",
		},
	},
}, {
	id: Species.Vipair,
	name: "Vipair",
	rarity: Rarity.Rare,
	types: [CreatureType.Toxic, CreatureType.Curio],
	abilityTrigger: AbilityTrigger.OnTrinketGained,
	spriteFile: "vipair.png",
	shopCost: 0,
	baseCooldownSeconds: 6.5,
	baseMulticast: 2,
	appliesStatus: [{ type: StatusEffectType.Poison, amount: 5 }],
	abilityText: "+4 Poison permanently.",
	abilityTags: [
	  { kind: AbilityTagKind.ManualTrigger, trigger: AbilityTrigger.OnTrinketGained, effects: [{ stat: ModifierStat.PoisonAmountAdd, amount: 4 }] },
	],
	levels: {
		2: {
			appliesStatus: [{ type: StatusEffectType.Poison, amount: 10 }],
			abilityText: "+8 Poison permanently.",
			abilityTags: [
			  { kind: AbilityTagKind.ManualTrigger, trigger: AbilityTrigger.OnTrinketGained, effects: [{ stat: ModifierStat.PoisonAmountAdd, amount: 8 }] },
			],
		},
		3: {
			appliesStatus: [{ type: StatusEffectType.Poison, amount: 15 }],
			abilityText: "+12 Poison permanently.",
			abilityTags: [
			  { kind: AbilityTagKind.ManualTrigger, trigger: AbilityTrigger.OnTrinketGained, effects: [{ stat: ModifierStat.PoisonAmountAdd, amount: 12 }] },
			],
		},
		4: {
			appliesStatus: [{ type: StatusEffectType.Poison, amount: 30 }],
			abilityText: "+48 Poison permanently.",
			abilityTags: [
			  { kind: AbilityTagKind.ManualTrigger, trigger: AbilityTrigger.OnTrinketGained, effects: [{ stat: ModifierStat.PoisonAmountAdd, amount: 48 }] },
			],
		},
	},
}, {
	id: Species.Voltalith,
	name: "Voltalith",
	rarity: Rarity.Rare,
	types: [CreatureType.Electric],
	abilityTrigger: AbilityTrigger.OnCast,
	spriteFile: "voltalith.png",
	shopCost: 30,
	baseCooldownSeconds: 8,
	baseMulticast: 1,
	appliesStatus: [{ type: StatusEffectType.Shock, amount: 5 }],
	abilityText: "Give the ally above +2 Shock permanently.",
	abilityTags: [
	  { kind: AbilityTagKind.BuffOnCast, target: { kind: TargetKind.Above }, effect: { statusGrant: { type: StatusEffectType.Shock, amount: 2 } } },
	],
	levels: {
		2: {
			appliesStatus: [{ type: StatusEffectType.Shock, amount: 10 }],
			abilityText: "Give the ally above +4 Shock permanently.",
			abilityTags: [
			  { kind: AbilityTagKind.BuffOnCast, target: { kind: TargetKind.Above }, effect: { statusGrant: { type: StatusEffectType.Shock, amount: 4 } } },
			],
		},
		3: {
			appliesStatus: [{ type: StatusEffectType.Shock, amount: 15 }],
			abilityText: "Give the ally above +6 Shock permanently.",
			abilityTags: [
			  { kind: AbilityTagKind.BuffOnCast, target: { kind: TargetKind.Above }, effect: { statusGrant: { type: StatusEffectType.Shock, amount: 6 } } },
			],
		},
		4: {
			appliesStatus: [{ type: StatusEffectType.Shock, amount: 30 }],
			abilityText: "Give the ally above +24 Shock permanently.",
			abilityTags: [
			  { kind: AbilityTagKind.BuffOnCast, target: { kind: TargetKind.Above }, effect: { statusGrant: { type: StatusEffectType.Shock, amount: 24 } } },
			],
		},
	},
}, {
	id: Species.Wishwash,
	name: "Wishwash",
	rarity: Rarity.SuperRare,
	types: [CreatureType.Water],
	abilityTrigger: AbilityTrigger.OnBattleStart,
	spriteFile: "wishwash.png",
	shopCost: 40,
	baseCooldownSeconds: 3.5,
	baseMulticast: 1,
	healAmount: 150,
	abilityText: "Gain a random non-unique Rare Trinket.",
	abilityTags: [],
	levels: {
		2: {
			healAmount: 300,
			abilityText: "Gain a random non-unique Super Rare Trinket.",
		},
		3: {
			healAmount: 450,
			abilityText: "Gain a random non-unique Legendary Trinket.",
		},
		4: {
			healAmount: 3600,
			abilityText: "Gain 4 random non-unique Mythical Trinkets.",
		},
	},
}, {
	id: Species.Zephyrex,
	name: "Zephyrex",
	rarity: Rarity.SuperRare,
	types: [CreatureType.Flying],
	abilityTrigger: AbilityTrigger.OnCast,
	spriteFile: "zephyrex.png",
	shopCost: 60,
	baseCooldownSeconds: 10,
	baseMulticast: 1,
	publishedCast: { damage: 100, channel: DamageChannel.Direct },
	abilityText: "Give the Flying ally in front +1 Multicast permanently. (Zephyrex can't have Multicast)",
	abilityTags: [
	  { kind: AbilityTagKind.BuffOnCast, target: { kind: TargetKind.InFront }, effect: { statChange: { stat: StatChangeStat.Multicast, amount: 1 } } },
	],
	levels: {
		2: {
			abilityText: "Give the Flying ally in front +2 Multicast permanently.\n(Zephyrex can't have Multicast)",
			abilityTags: [
			  { kind: AbilityTagKind.BuffOnCast, target: { kind: TargetKind.InFront }, effect: { statChange: { stat: StatChangeStat.Multicast, amount: 2 } } },
			],
		},
		3: {
			abilityText: "Give the Flying ally in front +3 Multicast permanently.\n(Zephyrex can't have Multicast)",
			abilityTags: [
			  { kind: AbilityTagKind.BuffOnCast, target: { kind: TargetKind.InFront }, effect: { statChange: { stat: StatChangeStat.Multicast, amount: 3 } } },
			],
		},
		4: {
			publishedCast: { damage: 800, channel: DamageChannel.Direct },
			abilityText: "Give the Flying ally in front +12 Multicast permanently.\n(Zephyrex can't have Multicast)",
			abilityTags: [
			  { kind: AbilityTagKind.BuffOnCast, target: { kind: TargetKind.InFront }, effect: { statChange: { stat: StatChangeStat.Multicast, amount: 12 } } },
			],
		},
	},
}, {
	id: Species.Bambudo,
	name: "Bambudo",
	rarity: Rarity.Common,
	types: [CreatureType.Grass],
	abilityTrigger: AbilityTrigger.OnCast,
	spriteFile: "bambudo.png",
	shopCost: 10,
	baseCooldownSeconds: 5,
	baseMulticast: 1,
	publishedCast: { damage: 75, channel: DamageChannel.Direct },
	abilityText: "",
	abilityTags: [],
	levels: {
		2: {
			abilityText: "+35 Damage permanently.",
			abilityTags: [
			  { kind: AbilityTagKind.BuffOnCast, target: { kind: TargetKind.Self }, effect: { statChange: { stat: StatChangeStat.Damage, amount: 35 } } },
			],
		},
		3: {
			abilityText: "+35 Damage permanently.",
			abilityTags: [
			  { kind: AbilityTagKind.BuffOnCast, target: { kind: TargetKind.Self }, effect: { statChange: { stat: StatChangeStat.Damage, amount: 35 } } },
			],
		},
		4: {
			publishedCast: { damage: 150, channel: DamageChannel.Direct },
			abilityText: "+70 Damage permanently.",
			abilityTags: [
			  { kind: AbilityTagKind.BuffOnCast, target: { kind: TargetKind.Self }, effect: { statChange: { stat: StatChangeStat.Damage, amount: 70 } } },
			],
		},
	},
}, {
	id: Species.Emperooze,
	name: "Emperooze",
	rarity: Rarity.Common,
	types: [CreatureType.Water],
	abilityTrigger: AbilityTrigger.OnBattleStart,
	spriteFile: "emperooze.png",
	shopCost: 10,
	baseCooldownSeconds: 3,
	baseMulticast: 1,
	publishedCast: { damage: 30, channel: DamageChannel.Direct },
	healAmount: 45,
	abilityText: "",
	abilityTags: [],
	levels: {
		2: {
			abilityText: "+50 Damage and +50 Heal permanently.",
		},
		3: {
			abilityText: "+50 Damage and +50 Heal permanently.",
		},
		4: {
			publishedCast: { damage: 60, channel: DamageChannel.Direct },
			healAmount: 90,
			abilityText: "+100 Damage and +100 Heal permanently.",
		},
	},
}, {
	id: Species.Sunsage,
	name: "Sunsage",
	rarity: Rarity.Common,
	types: [CreatureType.Fire],
	abilityTrigger: AbilityTrigger.OnBattleStart,
	spriteFile: "sunsage.png",
	shopCost: 10,
	baseCooldownSeconds: 5.5,
	baseMulticast: 1,
	publishedCast: { damage: 10, channel: DamageChannel.Direct },
	appliesStatus: [{ type: StatusEffectType.Burn, amount: 1 }],
	abilityText: "",
	abilityTags: [],
	levels: {
		2: {
			abilityText: "For each Fire ally, this gains +20% Cooldown Speed permanently.",
		},
		3: {
			publishedCast: { damage: 15, channel: DamageChannel.Direct },
			appliesStatus: [{ type: StatusEffectType.Burn, amount: 15 }],
			abilityText: "For each Fire ally, this gains +20% Cooldown Speed permanently.",
		},
		4: {
			baseMulticast: 2,
			publishedCast: { damage: 15, channel: DamageChannel.Direct },
			appliesStatus: [{ type: StatusEffectType.Burn, amount: 15 }],
			abilityText: "For each Fire ally, this gains +20% Cooldown Speed permanently.",
		},
	},
}, {
	id: Species.Beetdown,
	name: "Beetdown",
	rarity: Rarity.Common,
	types: [CreatureType.Fighting, CreatureType.Grass],
	abilityTrigger: AbilityTrigger.OnVictory,
	spriteFile: "beetdown.png",
	shopCost: 0,
	baseCooldownSeconds: 4.5,
	baseMulticast: 1,
	publishedCast: { damage: 35, channel: DamageChannel.Direct },
	abilityText: "Evolution result of Beetbud at level 3.",
	abilityTags: [],
	levels: {
		2: {
			publishedCast: { damage: 70, channel: DamageChannel.Direct },
			abilityText: "+250 Damage permanently.",
		},
		3: {
			publishedCast: { damage: 105, channel: DamageChannel.Direct },
			abilityText: "+250 Damage permanently.",
		},
		4: {
			publishedCast: { damage: 210, channel: DamageChannel.Direct },
			abilityText: "+500 Damage permanently.",
		},
	},
}, {
	id: Species.Dewlotl,
	name: "Dewlotl",
	rarity: Rarity.Common,
	types: [CreatureType.Water],
	spriteFile: "dewlotl.png",
	shopCost: 0,
	baseCooldownSeconds: 4,
	baseMulticast: 1,
	publishedCast: { damage: 30, channel: DamageChannel.Direct },
	healAmount: 30,
	abilityText: "",
	abilityTags: [],
	levels: {
		2: {
			abilityText: "When an ally levels up, this gains +40 Damage and +40 Heal permanently.",
		},
		3: {
			abilityText: "When an ally levels up, this gains +40 Damage and +40 Heal permanently.",
		},
		4: {
			baseMulticast: 2,
			abilityText: "When an ally levels up, this gains +40 Damage and +40 Heal permanently.",
		},
	},
}];
