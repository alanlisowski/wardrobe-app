import type {
  OutfitCandidate,
  ScoreBreakdown,
  ScoredOutfit,
  SuggestContext,
} from "./types";
import { SCORE_WEIGHTS } from "./types";

/**
 * Color harmony — SPEC section 10, "the color-harmony algorithm".
 * Classify each dominant color as neutral vs accent, then score the palette:
 * all-neutral 0.8, neutral+1 accent 1.0, neutral+2 accents by hue angle,
 * 3+ accents 0.3.
 * TODO: implement.
 */
export function scoreColorHarmony(_outfit: OutfitCandidate): number {
  throw new Error("scoreColorHarmony not implemented — SPEC section 10");
}

/** Style coherence — mean pairwise cosine similarity of CLIP embeddings. TODO. */
export function scoreStyleCoherence(_outfit: OutfitCandidate): number {
  throw new Error("scoreStyleCoherence not implemented — SPEC section 10");
}

/** Formality consistency — 1 - normalised stddev of formality values. TODO. */
export function scoreFormality(_outfit: OutfitCandidate): number {
  throw new Error("scoreFormality not implemented — SPEC section 10");
}

/** Pattern balance — solids 0.8, +1 pattern 1.0, 2 patterns 0.4, 3+ 0.1. TODO. */
export function scorePattern(_outfit: OutfitCandidate): number {
  throw new Error("scorePattern not implemented — SPEC section 10");
}

/** Novelty — rewards items with an older lastWornAt. TODO. */
export function scoreNovelty(_outfit: OutfitCandidate, _now: Date): number {
  throw new Error("scoreNovelty not implemented — SPEC section 10");
}

/** Combine the five sub-scores into a 0-100 score. */
export function scoreOutfit(
  outfit: OutfitCandidate,
  ctx: SuggestContext,
): ScoredOutfit {
  const breakdown: ScoreBreakdown = {
    color: scoreColorHarmony(outfit),
    coherence: scoreStyleCoherence(outfit),
    formality: scoreFormality(outfit),
    pattern: scorePattern(outfit),
    novelty: scoreNovelty(outfit, ctx.now),
  };

  const score =
    (breakdown.color * SCORE_WEIGHTS.color +
      breakdown.coherence * SCORE_WEIGHTS.coherence +
      breakdown.formality * SCORE_WEIGHTS.formality +
      breakdown.pattern * SCORE_WEIGHTS.pattern +
      breakdown.novelty * SCORE_WEIGHTS.novelty) *
    100;

  return { ...outfit, score, breakdown };
}
