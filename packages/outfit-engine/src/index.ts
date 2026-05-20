export * from "./types";
export * from "./score";
export * from "./generate";

import type { EngineItem, ScoredOutfit, SuggestContext } from "./types";
import { filterCloset, generateCandidates } from "./generate";
import { scoreOutfit } from "./score";

/**
 * Top-level entry point: closet + context -> ranked outfit suggestions.
 * SPEC section 10. TODO: dedupe near-identical outfits before slicing.
 */
export function suggestOutfits(
  closet: EngineItem[],
  ctx: SuggestContext,
  limit = 5,
): ScoredOutfit[] {
  const filtered = filterCloset(closet, ctx);
  const candidates = generateCandidates(filtered);
  return candidates
    .map((c) => scoreOutfit(c, ctx))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
