import type { EngineItem, OutfitCandidate, SuggestContext } from "./types";

/**
 * Hard-filter the closet for the given context — drop items whose season,
 * warmth, or formality make them invalid. SPEC section 10, step 1.
 * TODO: implement.
 */
export function filterCloset(
  _closet: EngineItem[],
  _ctx: SuggestContext,
): EngineItem[] {
  throw new Error("filterCloset not implemented — SPEC section 10");
}

/**
 * Enumerate valid slot-fillings into outfit candidates.
 * Required: (top + bottom) OR dress, plus footwear. Optional: outerwear,
 * up to 2 accessories. SPEC section 10, step 2.
 * TODO: implement.
 */
export function generateCandidates(_items: EngineItem[]): OutfitCandidate[] {
  throw new Error("generateCandidates not implemented — SPEC section 10");
}
