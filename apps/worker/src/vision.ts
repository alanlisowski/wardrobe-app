import { env } from "./env.js";

/** Structured tag output from Claude vision (SPEC §9 step 5). */
export interface VisionTags {
  name: string | null;
  category:
    | "top"
    | "bottom"
    | "dress"
    | "outerwear"
    | "footwear"
    | "accessory"
    | null;
  subcategory: string | null;
  brand: string | null;
  formality: number | null;
  warmth: number | null;
  seasons: string[];
  styleGenres: string[];
  pattern:
    | "solid"
    | "striped"
    | "plaid"
    | "checked"
    | "floral"
    | "graphic"
    | "other"
    | null;
  material: string | null;
}

const CATEGORIES = [
  "top",
  "bottom",
  "dress",
  "outerwear",
  "footwear",
  "accessory",
] as const;
const PATTERNS = [
  "solid",
  "striped",
  "plaid",
  "checked",
  "floral",
  "graphic",
  "other",
] as const;

const PROMPT = `You are cataloging a single clothing item for a digital wardrobe. Return ONLY a JSON object with these exact fields:
- name: short descriptive name, e.g. "cream ribbed knit sweater"
- category: one of "top","bottom","dress","outerwear","footwear","accessory"
- subcategory: free-text refinement, e.g. "crewneck sweater", "chinos", "sneakers"
- brand: only if a logo or label is clearly visible, else null
- formality: integer 1-5 (1=loungewear/athletic, 3=smart casual, 5=formal)
- warmth: integer 1-5 (1=hot-weather, 5=heavy winter)
- seasons: array picked from "spring","summer","fall","winter", or ["all"]
- style_genres: array of style descriptors, e.g. ["minimalist","streetwear","casual","formal","sporty","vintage","preppy"]
- pattern: one of "solid","striped","plaid","checked","floral","graphic","other"
- material: best-guess material like "cotton", "denim", "wool", or null

Output the JSON object only. No prose, no markdown, no code fences.`;

function parseJsonLoose(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    // Fall back to extracting the first {...} block.
  }
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start >= 0 && end > start) {
    return JSON.parse(text.slice(start, end + 1));
  }
  throw new Error(`vision response was not JSON: ${text.slice(0, 200)}`);
}

function asString(v: unknown): string | null {
  return typeof v === "string" && v.trim().length > 0 ? v.trim() : null;
}

function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === "string");
}

function asIntInRange(v: unknown, lo: number, hi: number): number | null {
  if (typeof v !== "number" || !Number.isFinite(v)) return null;
  const n = Math.round(v);
  return n >= lo && n <= hi ? n : null;
}

interface AnthropicMessageResponse {
  content: Array<{ type: string; text?: string }>;
}

/** Send the cutout PNG to Claude vision and parse structured tags. */
export async function tagItem(cutoutPngBase64: string): Promise<VisionTags> {
  if (!env.anthropicApiKey) {
    throw new Error("ANTHROPIC_API_KEY is not set");
  }

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": env.anthropicApiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: env.anthropicModel,
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: "image/png",
                data: cutoutPngBase64,
              },
            },
            { type: "text", text: PROMPT },
          ],
        },
      ],
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `Anthropic /v1/messages failed: ${res.status} ${text.slice(0, 500)}`,
    );
  }

  const msg = (await res.json()) as AnthropicMessageResponse;
  const textBlock = msg.content.find(
    (b) => b.type === "text" && typeof b.text === "string",
  );
  if (!textBlock?.text) {
    throw new Error("vision: no text content in Anthropic response");
  }

  const raw = parseJsonLoose(textBlock.text) as Record<string, unknown>;

  const category =
    typeof raw.category === "string" &&
    (CATEGORIES as readonly string[]).includes(raw.category)
      ? (raw.category as VisionTags["category"])
      : null;
  const pattern =
    typeof raw.pattern === "string" &&
    (PATTERNS as readonly string[]).includes(raw.pattern)
      ? (raw.pattern as VisionTags["pattern"])
      : null;

  return {
    name: asString(raw.name),
    category,
    subcategory: asString(raw.subcategory),
    brand: asString(raw.brand),
    formality: asIntInRange(raw.formality, 1, 5),
    warmth: asIntInRange(raw.warmth, 1, 5),
    seasons: asStringArray(raw.seasons),
    styleGenres: asStringArray(raw.style_genres),
    pattern,
    material: asString(raw.material),
  };
}
