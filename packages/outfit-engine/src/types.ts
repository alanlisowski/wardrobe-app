import type { CatalogedItem, Occasion, OutfitSlot } from "@wardrobe/shared";

/** A catalogued item enriched with its CLIP embedding, as the engine needs it. */
export interface EngineItem extends CatalogedItem {
  embedding: number[]; // 512-d CLIP vector
}

/** A candidate outfit: a set of items assigned to slots. */
export interface OutfitCandidate {
  items: { item: EngineItem; slot: OutfitSlot }[];
}

/** The five sub-scores, each normalised to 0-1. See SPEC section 10. */
export interface ScoreBreakdown {
  color: number;
  coherence: number;
  formality: number;
  pattern: number;
  novelty: number;
}

export interface ScoredOutfit extends OutfitCandidate {
  score: number; // 0-100
  breakdown: ScoreBreakdown;
}

export interface SuggestContext {
  temperatureC: number | null;
  occasion: Occasion;
  now: Date;
}

/**
 * Weights for the composite score. Constants in v1; these become per-user
 * learned values in the v1.5 personalization layer (SPEC section 15).
 */
export const SCORE_WEIGHTS: ScoreBreakdown = {
  color: 0.3,
  coherence: 0.3,
  formality: 0.15,
  pattern: 0.15,
  novelty: 0.1,
};
