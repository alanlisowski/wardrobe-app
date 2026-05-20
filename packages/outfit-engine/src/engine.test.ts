import { describe, it, expect } from "vitest";
import { SCORE_WEIGHTS } from "./types";
import type { EngineItem, OutfitCandidate, SuggestContext } from "./types";
import { scoreColorHarmony, scoreStyleCoherence } from "./score";
import { filterCloset, generateCandidates } from "./generate";
import { suggestOutfits } from "./index";
import type { ItemCategory, Season } from "@wardrobe/shared";

// ── Fixture helpers ───────────────────────────────────────────────────────────

function makeItem(
  id: string,
  overrides: Partial<Omit<EngineItem, "id">> = {},
): EngineItem {
  return {
    id,
    name: null,
    category: "top" as ItemCategory,
    subcategory: null,
    brand: null,
    colors: [],
    formality: 3,
    warmth: 3,
    seasons: ["all"] as Season[],
    styleGenres: [],
    pattern: "solid",
    material: null,
    cutoutImageUrl: null,
    wearCount: 0,
    lastWornAt: null,
    embedding: [],
    ...overrides,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("outfit-engine", () => {
  it("score weights sum to 1", () => {
    const sum = Object.values(SCORE_WEIGHTS).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1);
  });

  it("scoreColorHarmony: neutral + 1 accent scores highest", () => {
    // Two neutral items (gray top, black bottom) plus one accent (red footwear)
    const neutralTop = makeItem("t1", {
      category: "top",
      colors: [{ hex: "#808080", proportion: 1.0 }], // mid gray
    });
    const neutralBottom = makeItem("b1", {
      category: "bottom",
      colors: [{ hex: "#1a1a1a", proportion: 1.0 }], // near-black
    });
    const accentFootwear = makeItem("f1", {
      category: "footwear",
      colors: [{ hex: "#CC2200", proportion: 1.0 }], // vivid red
    });

    const outfit: OutfitCandidate = {
      items: [
        { item: neutralTop,     slot: "top"      },
        { item: neutralBottom,  slot: "bottom"   },
        { item: accentFootwear, slot: "footwear" },
      ],
    };

    expect(scoreColorHarmony(outfit)).toBe(1.0);
  });

  it("scoreColorHarmony: 3+ accent colors are penalised", () => {
    // Three items each with a distinct saturated hue — red, green, blue
    const redTop = makeItem("t2", {
      category: "top",
      colors: [{ hex: "#CC0000", proportion: 1.0 }],
    });
    const greenBottom = makeItem("b2", {
      category: "bottom",
      colors: [{ hex: "#00CC00", proportion: 1.0 }],
    });
    const blueFootwear = makeItem("f2", {
      category: "footwear",
      colors: [{ hex: "#0000CC", proportion: 1.0 }],
    });

    const outfit: OutfitCandidate = {
      items: [
        { item: redTop,       slot: "top"      },
        { item: greenBottom,  slot: "bottom"   },
        { item: blueFootwear, slot: "footwear" },
      ],
    };

    expect(scoreColorHarmony(outfit)).toBe(0.30);
  });

  it("scoreStyleCoherence: a coherent outfit beats a mismatched one", () => {
    // Coherent: all embeddings point in the same direction → cosine sim ≈ 1
    const coherentOutfit: OutfitCandidate = {
      items: [
        { item: makeItem("c1", { embedding: [1, 0, 0] }), slot: "top"      },
        { item: makeItem("c2", { embedding: [1, 0, 0] }), slot: "bottom"   },
        { item: makeItem("c3", { embedding: [1, 0, 0] }), slot: "footwear" },
      ],
    };

    // Mismatched: embeddings point in opposite directions → cosine sim = −1
    const mismatchedOutfit: OutfitCandidate = {
      items: [
        { item: makeItem("m1", { embedding: [1, 0, 0]  }), slot: "top"      },
        { item: makeItem("m2", { embedding: [-1, 0, 0] }), slot: "bottom"   },
        { item: makeItem("m3", { embedding: [1, 0, 0]  }), slot: "footwear" },
      ],
    };

    expect(scoreStyleCoherence(coherentOutfit)).toBeGreaterThan(
      scoreStyleCoherence(mismatchedOutfit),
    );
  });

  it("generateCandidates: every candidate fills the required slots", () => {
    const items: EngineItem[] = [
      makeItem("t1", { category: "top"      }),
      makeItem("t2", { category: "top"      }),
      makeItem("b1", { category: "bottom"   }),
      makeItem("d1", { category: "dress"    }),
      makeItem("f1", { category: "footwear" }),
      makeItem("f2", { category: "footwear" }),
      makeItem("a1", { category: "accessory" }),
    ];

    const candidates = generateCandidates(items);

    expect(candidates.length).toBeGreaterThan(0);

    for (const candidate of candidates) {
      const slots = candidate.items.map((i) => i.slot);
      const hasFootwear = slots.includes("footwear");
      const hasBase = (slots.includes("top") && slots.includes("bottom")) || slots.includes("dress");
      expect(hasFootwear).toBe(true);
      expect(hasBase).toBe(true);
    }
  });

  it("suggestOutfits: dedupes outfits sharing 3+ items", () => {
    // 1 top + 1 bottom + 1 footwear + 2 outerwear → 3 candidates, all sharing
    // the same top/bottom/footwear triplet → only the best-ranked survives.
    const ctx: SuggestContext = {
      temperatureC: 15,
      occasion: "casual",
      now: new Date("2026-07-15"),
    };
    const closet: EngineItem[] = [
      makeItem("t1", { category: "top",       seasons: ["all"], formality: 2, warmth: 3 }),
      makeItem("b1", { category: "bottom",    seasons: ["all"], formality: 2, warmth: 3 }),
      makeItem("f1", { category: "footwear",  seasons: ["all"], formality: 2, warmth: 3 }),
      makeItem("o1", { category: "outerwear", seasons: ["all"], formality: 2, warmth: 3 }),
      makeItem("o2", { category: "outerwear", seasons: ["all"], formality: 2, warmth: 3 }),
    ];

    const results = suggestOutfits(closet, ctx, 5);

    // All 3 candidates share t1+b1+f1; dedupe should leave exactly 1.
    expect(results.length).toBe(1);

    // Verify the surviving outfit is still valid.
    const slots = results[0]!.items.map((i) => i.slot);
    expect(slots).toContain("footwear");
    expect(
      (slots.includes("top") && slots.includes("bottom")) || slots.includes("dress"),
    ).toBe(true);
  });

  it("filterCloset: drops out-of-season items", () => {
    const summerCtx: SuggestContext = {
      temperatureC: 28,
      occasion: "casual",
      now: new Date("2026-07-15"), // mid-summer
    };

    const items: EngineItem[] = [
      makeItem("i1", { seasons: ["winter"]          }),  // wrong season
      makeItem("i2", { seasons: ["summer"]          }),  // correct season
      makeItem("i3", { seasons: ["all"]             }),  // always valid
      makeItem("i4", { seasons: ["spring", "summer"] }), // includes summer
    ];

    const result = filterCloset(items, summerCtx);
    const ids = result.map((i) => i.id);

    expect(ids).not.toContain("i1");
    expect(ids).toContain("i2");
    expect(ids).toContain("i3");
    expect(ids).toContain("i4");
  });
});
