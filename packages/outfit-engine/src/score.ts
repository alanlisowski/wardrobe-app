import type {
  OutfitCandidate,
  ScoreBreakdown,
  ScoredOutfit,
  SuggestContext,
} from "./types";
import { SCORE_WEIGHTS } from "./types";
import type { OutfitSlot } from "@wardrobe/shared";

// ── Color utilities ──────────────────────────────────────────────────────────

interface HSL {
  h: number; // 0–360
  s: number; // 0–1
  l: number; // 0–1
}

function parseHex(hex: string): { r: number; g: number; b: number } | null {
  const s = hex.startsWith("#") ? hex.slice(1) : hex;
  const expanded =
    s.length === 3 ? s.split("").map((c) => c + c).join("") : s;
  if (expanded.length !== 6) return null;
  const r = parseInt(expanded.slice(0, 2), 16) / 255;
  const g = parseInt(expanded.slice(2, 4), 16) / 255;
  const b = parseInt(expanded.slice(4, 6), 16) / 255;
  if (isNaN(r) || isNaN(g) || isNaN(b)) return null;
  return { r, g, b };
}

function rgbToHsl(r: number, g: number, b: number): HSL {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  const l = (max + min) / 2;

  if (delta === 0) return { h: 0, s: 0, l };

  const s = delta / (1 - Math.abs(2 * l - 1));
  let h = 0;
  if (max === r) h = ((g - b) / delta) % 6;
  else if (max === g) h = (b - r) / delta + 2;
  else h = (r - g) / delta + 4;
  h = ((h * 60) + 360) % 360;
  return { h, s, l };
}

function hexToHsl(hex: string): HSL | null {
  const rgb = parseHex(hex);
  return rgb ? rgbToHsl(rgb.r, rgb.g, rgb.b) : null;
}

/** Minimum arc between two hue values (result is 0–180). */
function hueAngleDiff(h1: number, h2: number): number {
  const diff = Math.abs(h1 - h2) % 360;
  return Math.min(diff, 360 - diff);
}

/**
 * Classify a color as a fashion neutral.
 * Neutrals: achromatic grays/blacks/whites, very dark/light tones,
 * navies (dark cool blues), and muted warm earth tones (beige/tan/caramel).
 */
function isNeutral({ h, s, l }: HSL): boolean {
  if (s < 0.15) return true;                          // achromatic
  if (l < 0.08 || l > 0.93) return true;             // near-black / near-white
  if (h >= 200 && h <= 260 && l < 0.25) return true; // navy
  // Muted warm earth tones: beige, tan, caramel (moderate saturation, mid-high lightness)
  if (h >= 15 && h <= 60 && s <= 0.50 && l >= 0.40) return true;
  return false;
}

/** How much visual weight each slot contributes to the colour palette. */
const SLOT_PROMINENCE: Record<OutfitSlot, number> = {
  top: 1.0,
  bottom: 1.0,
  dress: 1.0,
  outerwear: 1.0,
  footwear: 0.6,
  accessory: 0.3,
};

/** Hues within this many degrees are merged into one cluster. */
const HUE_CLUSTER_THRESHOLD = 15;

// ── Color harmony ────────────────────────────────────────────────────────────

/**
 * Color harmony — SPEC section 10, "the color-harmony algorithm".
 *
 * Collects dominant colours from every item, weights them by colour proportion
 * × slot prominence, classifies each as neutral vs accent, then scores:
 *
 *   accentless palette        → 0.80  (safe but flat)
 *   1 accent cluster          → 1.00  (neutral-anchored, one pop of colour)
 *   2 accent clusters         → 0.50–0.95  depending on hue angle
 *   3+ accent clusters        → 0.30  (too busy)
 *
 * A −0.10 penalty applies when both accent clusters are highly saturated
 * (competing for visual attention).
 */
export function scoreColorHarmony(outfit: OutfitCandidate): number {
  type Cluster = { hue: number; weight: number; saturation: number };

  let totalWeight = 0;
  let accentWeight = 0;
  const accentColors: { hsl: HSL; weight: number }[] = [];

  for (const { item, slot } of outfit.items) {
    const prominence = SLOT_PROMINENCE[slot];
    for (const color of item.colors) {
      const hsl = hexToHsl(color.hex);
      if (!hsl) continue;
      const weight = color.proportion * prominence;
      totalWeight += weight;
      if (!isNeutral(hsl)) {
        accentColors.push({ hsl, weight });
        accentWeight += weight;
      }
    }
  }

  if (totalWeight === 0) return 0.80;
  if (accentWeight / totalWeight < 0.10) return 0.80;

  // Cluster nearby hues so that slight shade variations don't over-count.
  const clusters: Cluster[] = [];
  for (const { hsl, weight } of accentColors) {
    const match = clusters.find(
      (c) => hueAngleDiff(c.hue, hsl.h) <= HUE_CLUSTER_THRESHOLD
    );
    if (match) {
      // Weighted average on the shorter arc to avoid wrap-around errors.
      let adj = hsl.h;
      if (Math.abs(adj - match.hue) > 180) adj += adj < match.hue ? 360 : -360;
      const total = match.weight + weight;
      match.hue = ((match.hue * match.weight + adj * weight) / total + 360) % 360;
      match.saturation =
        (match.saturation * match.weight + hsl.s * weight) / total;
      match.weight = total;
    } else {
      clusters.push({ hue: hsl.h, weight, saturation: hsl.s });
    }
  }

  if (clusters.length === 1) return 1.00;

  if (clusters.length === 2) {
    const c0 = clusters[0]!;
    const c1 = clusters[1]!;
    const angle = hueAngleDiff(c0.hue, c1.hue);

    let score: number;
    if (angle <= 40) score = 0.95;       // analogous
    else if (angle >= 150) score = 0.90; // complementary
    else if (angle >= 100) score = 0.85; // triadic (centred on 120°)
    else score = 0.50;                   // awkward split (40–100°)

    if (c0.saturation >= 0.70 && c1.saturation >= 0.70) score -= 0.10;
    return Math.max(0, score);
  }

  return 0.30; // 3+ distinct accent clusters
}

// ── Style coherence ──────────────────────────────────────────────────────────

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, normA = 0, normB = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const ai = a[i] ?? 0;
    const bi = b[i] ?? 0;
    dot += ai * bi;
    normA += ai * ai;
    normB += bi * bi;
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Style coherence — mean pairwise cosine similarity of item CLIP embeddings,
 * normalised from [−1, 1] to [0, 1].
 */
export function scoreStyleCoherence(outfit: OutfitCandidate): number {
  const embeddings = outfit.items.map(({ item }) => item.embedding);
  if (embeddings.length <= 1) return 0.5;

  let totalSim = 0;
  let pairs = 0;
  for (let i = 0; i < embeddings.length; i++) {
    for (let j = i + 1; j < embeddings.length; j++) {
      const ei = embeddings[i];
      const ej = embeddings[j];
      if (ei === undefined || ej === undefined) continue;
      totalSim += (cosineSimilarity(ei, ej) + 1) / 2;
      pairs++;
    }
  }

  return pairs > 0 ? totalSim / pairs : 0.5;
}

// ── Formality consistency ────────────────────────────────────────────────────

/**
 * Formality consistency — 1 − (stddev / 2.0).
 * Formality values are 1–5; max stddev for a bimodal {1, 5} distribution
 * is 2.0, so normalise by that.
 */
export function scoreFormality(outfit: OutfitCandidate): number {
  const values = outfit.items
    .map(({ item }) => item.formality)
    .filter((f): f is number => f !== null);

  if (values.length <= 1) return 1.0;

  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  const variance =
    values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
  const stddev = Math.sqrt(variance);

  return Math.max(0, 1 - stddev / 2.0);
}

// ── Pattern balance ──────────────────────────────────────────────────────────

/**
 * Pattern balance — rewards exactly one non-solid pattern among an otherwise
 * solid outfit, penalises multiple competing patterns.
 */
export function scorePattern(outfit: OutfitCandidate): number {
  const patternedCount = outfit.items.filter(
    ({ item }) => item.pattern !== null && item.pattern !== "solid"
  ).length;

  if (patternedCount === 0) return 0.80;
  if (patternedCount === 1) return 1.00;
  if (patternedCount === 2) return 0.40;
  return 0.10;
}

// ── Novelty ──────────────────────────────────────────────────────────────────

/** Items not worn within this many days count as fully novel. */
const MAX_NOVELTY_DAYS = 30;

/**
 * Novelty — rewards outfits that surface items the user hasn't worn recently.
 * Never-worn items score 1.0; an item worn yesterday scores near 0.
 */
export function scoreNovelty(outfit: OutfitCandidate, now: Date): number {
  if (outfit.items.length === 0) return 0.5;

  const scores = outfit.items.map(({ item }) => {
    if (item.lastWornAt === null) return 1.0;
    const daysSince =
      (now.getTime() - new Date(item.lastWornAt).getTime()) /
      (1000 * 60 * 60 * 24);
    if (daysSince < 0) return 1.0;
    return Math.min(daysSince, MAX_NOVELTY_DAYS) / MAX_NOVELTY_DAYS;
  });

  return scores.reduce((s, v) => s + v, 0) / scores.length;
}

// ── Composite scorer ─────────────────────────────────────────────────────────

/** Combine the five sub-scores into a 0–100 score. */
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
