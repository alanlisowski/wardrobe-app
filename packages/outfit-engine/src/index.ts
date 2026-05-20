export * from "./types";
export * from "./score";
export * from "./generate";

import type { EngineItem, ScoredOutfit, SuggestContext } from "./types";
import { filterCloset, generateCandidates } from "./generate";
import { scoreOutfit } from "./score";

/**
 * Top-level entry point: closet + context -> ranked outfit suggestions.
 * SPEC section 10, steps 1-4.
 */
export function suggestOutfits(
  closet: EngineItem[],
  ctx: SuggestContext,
  limit = 5,
): ScoredOutfit[] {
  const filtered = filterCloset(closet, ctx);
  const candidates = generateCandidates(filtered);
  const ranked = candidates
    .map((c) => scoreOutfit(c, ctx))
    .sort((a, b) => b.score - a.score);

  // Step 4 — dedupe: drop any outfit that shares 3+ items with a higher-ranked kept outfit.
  const results: ScoredOutfit[] = [];
  for (const candidate of ranked) {
    const ids = new Set(candidate.items.map(({ item }) => item.id));
    const isDupe = results.some(
      (kept) => kept.items.filter(({ item }) => ids.has(item.id)).length >= 3,
    );
    if (!isDupe) results.push(candidate);
    if (results.length >= limit) break;
  }

  return results;
}
