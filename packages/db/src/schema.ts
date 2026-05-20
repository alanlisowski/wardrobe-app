import {
  pgTable,
  pgEnum,
  uuid,
  text,
  integer,
  numeric,
  timestamp,
  jsonb,
  date,
  vector,
  primaryKey,
} from "drizzle-orm/pg-core";

/* ---------- enums ---------- */

export const itemCategory = pgEnum("item_category", [
  "top",
  "bottom",
  "dress",
  "outerwear",
  "footwear",
  "accessory",
]);

export const itemPattern = pgEnum("item_pattern", [
  "solid",
  "striped",
  "plaid",
  "checked",
  "floral",
  "graphic",
  "other",
]);

export const procStatus = pgEnum("proc_status", [
  "processing",
  "ready",
  "failed",
]);

/* ---------- tables ---------- */

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  // home location, used for weather lookups
  lat: numeric("lat"),
  lon: numeric("lon"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const sessions = pgTable("sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});

export const items = pgTable("items", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),

  originalImageUrl: text("original_image_url").notNull(),
  cutoutImageUrl: text("cutout_image_url"),

  // AI-detected, user-overridable
  name: text("name"),
  category: itemCategory("category"),
  subcategory: text("subcategory"),
  brand: text("brand"),
  colors: jsonb("colors"), // [{ hex: string, proportion: number }]
  formality: integer("formality"), // 1-5
  warmth: integer("warmth"), // 1-5
  seasons: text("seasons").array(),
  styleGenres: text("style_genres").array(),
  pattern: itemPattern("pattern"),
  material: text("material"),

  embedding: vector("embedding", { dimensions: 512 }), // CLIP

  wearCount: integer("wear_count").notNull().default(0),
  lastWornAt: timestamp("last_worn_at", { withTimezone: true }),

  procStatus: procStatus("proc_status").notNull().default("processing"),
  procError: text("proc_error"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const outfits = pgTable("outfits", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: text("name"),
  source: text("source").notNull(), // 'ai_suggested' | 'user_created'
  score: numeric("score"),
  scoreBreakdown: jsonb("score_breakdown"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  wearCount: integer("wear_count").notNull().default(0),
  lastWornAt: timestamp("last_worn_at", { withTimezone: true }),
});

export const outfitItems = pgTable(
  "outfit_items",
  {
    outfitId: uuid("outfit_id")
      .notNull()
      .references(() => outfits.id, { onDelete: "cascade" }),
    itemId: uuid("item_id")
      .notNull()
      .references(() => items.id, { onDelete: "cascade" }),
    slot: text("slot").notNull(),
  },
  (t) => ({ pk: primaryKey({ columns: [t.outfitId, t.itemId] }) }),
);

export const wears = pgTable("wears", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  outfitId: uuid("outfit_id").references(() => outfits.id, {
    onDelete: "set null",
  }),
  wornOn: date("worn_on").notNull(),
  weatherTempC: numeric("weather_temp_c"),
  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const wearItems = pgTable(
  "wear_items",
  {
    wearId: uuid("wear_id")
      .notNull()
      .references(() => wears.id, { onDelete: "cascade" }),
    itemId: uuid("item_id")
      .notNull()
      .references(() => items.id, { onDelete: "cascade" }),
  },
  (t) => ({ pk: primaryKey({ columns: [t.wearId, t.itemId] }) }),
);
