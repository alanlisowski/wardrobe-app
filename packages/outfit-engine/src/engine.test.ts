import { describe, it, expect } from "vitest";
import { SCORE_WEIGHTS } from "./types";

describe("outfit-engine", () => {
  it("score weights sum to 1", () => {
    const sum = Object.values(SCORE_WEIGHTS).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1);
  });

  // Fill these in as you implement the engine — SPEC section 10.
  it.todo("scoreColorHarmony: neutral + 1 accent scores highest");
  it.todo("scoreColorHarmony: 3+ accent colors are penalised");
  it.todo("scoreStyleCoherence: a coherent outfit beats a mismatched one");
  it.todo("generateCandidates: every candidate fills the required slots");
  it.todo("filterCloset: drops out-of-season items");
});
