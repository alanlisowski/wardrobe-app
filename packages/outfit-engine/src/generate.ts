import type { EngineItem, OutfitCandidate, SuggestContext } from "./types";
import type { Season } from "@wardrobe/shared";

/** Cap to keep candidate enumeration tractable when the closet is large. */
const MAX_CANDIDATES = 500;

function currentSeason(date: Date): Season {
  const m = date.getMonth() + 1; // 1-indexed
  if (m >= 3 && m <= 5) return "spring";
  if (m >= 6 && m <= 8) return "summer";
  if (m >= 9 && m <= 11) return "fall";
  return "winter";
}

/** Inclusive [min, max] formality band per occasion. */
const OCCASION_FORMALITY: Record<string, readonly [number, number]> = {
  sporty: [1, 2],
  casual: [1, 3],
  smart:  [2, 4],
  formal: [3, 5],
};

/**
 * Hard-filter the closet for the given context — drop items whose season,
 * warmth, or formality make them invalid. SPEC section 10, step 1.
 */
export function filterCloset(
  closet: EngineItem[],
  ctx: SuggestContext,
): EngineItem[] {
  const season = currentSeason(ctx.now);
  const [minF, maxF] = OCCASION_FORMALITY[ctx.occasion] ?? [1, 5];

  return closet.filter((item) => {
    // Season: must match current season or be labelled "all"
    if (!item.seasons.includes("all") && !item.seasons.includes(season)) {
      return false;
    }

    // Warmth: drop items grossly mismatched to temperature
    if (ctx.temperatureC !== null && item.warmth !== null) {
      if (ctx.temperatureC >= 25 && item.warmth >= 4) return false;
      if (ctx.temperatureC <= 5  && item.warmth <= 2) return false;
    }

    // Formality: must fall within the occasion's allowed band
    if (item.formality !== null) {
      if (item.formality < minF || item.formality > maxF) return false;
    }

    return true;
  });
}

/**
 * Enumerate valid slot-fillings into outfit candidates.
 * Required: (top + bottom) OR dress, plus footwear. Optional: outerwear,
 * up to 2 accessories. SPEC section 10, step 2.
 */
export function generateCandidates(items: EngineItem[]): OutfitCandidate[] {
  // Group items by slot (category maps 1-to-1 to OutfitSlot)
  const bySlot: Partial<Record<string, EngineItem[]>> = {};
  for (const item of items) {
    if (!item.category) continue;
    (bySlot[item.category] ??= []).push(item);
  }

  const tops        = bySlot["top"]       ?? [];
  const bottoms     = bySlot["bottom"]    ?? [];
  const dresses     = bySlot["dress"]     ?? [];
  const footwears   = bySlot["footwear"]  ?? [];
  const outerwears  = bySlot["outerwear"] ?? [];
  const accessories = bySlot["accessory"] ?? [];

  // Build base outfits: (top + bottom) or dress, each paired with footwear
  const bases: OutfitCandidate[] = [];

  for (const top of tops) {
    for (const bottom of bottoms) {
      for (const fw of footwears) {
        bases.push({ items: [
          { item: top,    slot: "top"      },
          { item: bottom, slot: "bottom"   },
          { item: fw,     slot: "footwear" },
        ]});
      }
    }
  }

  for (const dress of dresses) {
    for (const fw of footwears) {
      bases.push({ items: [
        { item: dress, slot: "dress"    },
        { item: fw,    slot: "footwear" },
      ]});
    }
  }

  if (bases.length === 0) return [];

  // Optional outerwear: none, or any one outerwear item
  const owOptions: (EngineItem | null)[] = [null, ...outerwears];

  // Optional accessories: C(n,0) + C(n,1) + C(n,2) combinations
  const accCombos: EngineItem[][] = [[]];
  for (let i = 0; i < accessories.length; i++) {
    accCombos.push([accessories[i]!]);
    for (let j = i + 1; j < accessories.length; j++) {
      accCombos.push([accessories[i]!, accessories[j]!]);
    }
  }

  const candidates: OutfitCandidate[] = [];

  outer: for (const base of bases) {
    for (const ow of owOptions) {
      for (const accCombo of accCombos) {
        const outfitItems = [...base.items];
        if (ow !== null) outfitItems.push({ item: ow, slot: "outerwear" });
        for (const acc of accCombo) outfitItems.push({ item: acc, slot: "accessory" });
        candidates.push({ items: outfitItems });
        if (candidates.length >= MAX_CANDIDATES) break outer;
      }
    }
  }

  return candidates;
}
