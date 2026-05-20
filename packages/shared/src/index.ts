/** Shared types and constants used across the API, worker, and mobile app. */

/** v1 wardrobe cap — see SPEC section 3. Enforced in POST /items. */
export const MAX_WARDROBE_SIZE = 150;

export type ItemCategory =
  | "top"
  | "bottom"
  | "dress"
  | "outerwear"
  | "footwear"
  | "accessory";

export type ItemPattern =
  | "solid"
  | "striped"
  | "plaid"
  | "checked"
  | "floral"
  | "graphic"
  | "other";

export type Season = "spring" | "summer" | "fall" | "winter" | "all";

export type Occasion = "casual" | "smart" | "formal" | "sporty";

export type OutfitSlot =
  | "top"
  | "bottom"
  | "dress"
  | "outerwear"
  | "footwear"
  | "accessory";

export interface ItemColor {
  /** Hex string, e.g. "#4a5320". */
  hex: string;
  /** Fraction of the garment this color covers, 0-1. */
  proportion: number;
}

/** A fully catalogued wardrobe item, as the app and engine consume it. */
export interface CatalogedItem {
  id: string;
  name: string | null;
  category: ItemCategory | null;
  subcategory: string | null;
  brand: string | null;
  colors: ItemColor[];
  formality: number | null; // 1-5
  warmth: number | null; // 1-5
  seasons: Season[];
  styleGenres: string[];
  pattern: ItemPattern | null;
  material: string | null;
  cutoutImageUrl: string | null;
  wearCount: number;
  lastWornAt: string | null;
}
