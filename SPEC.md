# Wardrobe App — v1 Specification

A mobile, AI-powered wardrobe assistant. You photograph your clothes, AI catalogs them, and an outfit-compatibility engine suggests outfits built from clothes you actually own — using color theory, style coherence, formality rules, and today's weather. Self-hostable, open-source, privacy-first.

This document is the **v1 blueprint** — features, architecture, the compatibility engine, API, and database schema.

---

## 1. The Product, in One Sentence

> *Photograph your closet once, then never wonder "what do I wear?" again — the app builds outfits from clothes you already own.*

## 2. Why This Isn't a ChatGPT Wrapper (the moat)

The lesson from the reseller pivot: always be able to answer *"couldn't I just use ChatGPT?"* Here, the answer is a clear no:

- **ChatGPT has no memory of your physical wardrobe.** This app's entire value is persistent, structured, longitudinal data about clothes you own — 150 items, their colors, their wear history. That memory IS the product.
- **The compatibility engine is real CS, not a prompt.** Outfit suggestion is combinatorial search + multi-objective ranking over your actual items. The LLM catalogs items; it does not pick outfits.
- **No incumbent owns this.** Unlike Vinted's pricing feature, the existing wardrobe apps (Whering, Acloset, Indyx, Cladwell) are mostly digital filing cabinets with weak suggestion features. None are open-source or self-hostable.

The LLM does ~20% of the work (cataloging). The other 80% — the engine, the data model, the wear tracking, the mobile UX — is the product.

---

## 3. v1 Goals

What "v1 done" means:

- A user can sign up and catalog their closet, one item per photo, up to **150 items**.
- Each photographed item gets its background removed, is auto-tagged by AI (category, colors, formality, season, style, pattern), and the user can confirm or correct the tags.
- A user can tap "What should I wear?" and get **3–5 ranked outfit suggestions** as flat-lay cards, factoring in **today's weather**.
- A user can manually build an outfit and get an instant **compatibility score + plain-language critique**.
- A user can log what they wore; wear counts update per item.
- It runs as a real **React Native app** the user installs on their phone (TestFlight / Play Store).
- The backend is self-hostable with `docker compose up`.

## 4. v1 Non-Goals (deferred)

- **Personalization / learning layer** → v1.5. v1's engine is rule-based with fixed weights.
- **Mannequin / on-body outfit compositing** → v2. v1 uses flat-lay cards.
- **Calendar integration** → v2. v1 uses weather only.
- **"Items you've stopped wearing" / decluttering** → v2.
- **Style DNA, wardrobe gap analysis, capsule analysis, cost-per-wear, mood-board match, travel packing** → all v2.
- **Selling integration** (list to Vinted) → v2+, possibly never.
- **Batch photo cataloging** (AI separates a pile) → deferred; v1 is one item per photo.
- **Social features, outfit sharing, multi-person closets** → not planned for v1/v1.5.

---

## 5. The Two Hard Parts (where the resume-worthy engineering lives)

1. **The outfit compatibility engine.** Combinatorial search over the closet + multi-objective ranking (color harmony, style coherence, formality, pattern balance, novelty). This is the hero. It's genuine CS and the thing interviewers will dig into. Build and tune it against your own real closet. See section 10.
2. **The cataloging pipeline.** Background removal + dominant-color extraction + CLIP embedding + LLM tagging, all from a single phone photo in arbitrary lighting. Quality here determines whether the whole app feels magic or junk. See section 9.

Everything else (auth, CRUD, the Expo UI) is plumbing.

---

## 6. Tech Stack

| Layer | Choice | Why |
|---|---|---|
| Mobile app | React Native + Expo (Expo Router, Expo Camera, Expo Image) | True native app, great camera APIs, strong mobile-dev portfolio signal |
| Backend API | TypeScript + Hono on Node 22 | Fast, modern, shares types with the app |
| ML service | Python + FastAPI | Background removal, CLIP, color extraction — the Python ML ecosystem |
| Database | Postgres 16 + `pgvector` | Structured item data + CLIP embedding similarity search |
| ORM | Drizzle | TS-first migrations |
| Job queue | BullMQ + Redis | The cataloging pipeline runs async |
| LLM (cataloging) | Claude Sonnet (vision) via Anthropic API | Best structured visual tagging |
| LLM (critique text) | Claude Haiku via Anthropic API | Cheap, fast — turns scores into friendly text |
| Background removal | BiRefNet or `rembg` (in the Python service) | Self-hostable, high-quality cutouts |
| Embeddings | CLIP ViT-B/32 (in the Python service) | Visual style vector for coherence scoring |
| Color extraction | k-means over cutout pixels (Python) | Dominant colors for the harmony algorithm |
| Weather | Open-Meteo API | Free, no API key, perfect for self-hosting |
| Image storage | MinIO (self-host) or S3 | Photos + cutouts |
| Auth | Email + password, sessions, bcrypt | Simple |
| Deploy | `docker compose` (backend); EAS Build (the app) | Standard |

---

## 7. Project Structure

```
wardrobe-app/
├── apps/
│   ├── mobile/               Expo / React Native app
│   ├── api/                  Hono REST API
│   └── worker/               BullMQ worker (orchestrates cataloging)
├── services/
│   └── ml/                   Python FastAPI: bg removal, CLIP, color
├── packages/
│   ├── db/                   Drizzle schema + migrations
│   ├── outfit-engine/        The compatibility engine (pure TS, testable)
│   └── shared/               Shared TS types
├── docker-compose.yml
└── README.md
```

Note the `outfit-engine` is its own package with **no I/O** — pure functions, in/out. That makes it unit-testable and is exactly the kind of clean architecture decision interviewers like.

---

## 8. Database Schema

```sql
create table users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  password_hash text not null,
  -- home location for weather lookups
  lat numeric, lon numeric,
  created_at timestamptz not null default now()
);

create table sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  token text not null unique,
  expires_at timestamptz not null
);

-- ITEMS
create type item_category as enum
  ('top','bottom','dress','outerwear','footwear','accessory');
create type item_pattern as enum
  ('solid','striped','plaid','checked','floral','graphic','other');
create type proc_status as enum ('processing','ready','failed');

create table items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,

  original_image_url text not null,
  cutout_image_url   text,                 -- background removed

  -- AI-detected, user-overridable
  name         text,                       -- "olive utility jacket"
  category     item_category,
  subcategory  text,
  brand        text,
  colors       jsonb,                      -- [{ "hex": "#4a5320", "proportion": 0.7 }]
  formality    int,                        -- 1 (loungewear) .. 5 (formal)
  warmth       int,                        -- 1 (hot-weather) .. 5 (heavy winter)
  seasons      text[],                     -- ['fall','winter'] or ['all']
  style_genres text[],                     -- ['streetwear','casual']
  pattern      item_pattern,
  material     text,

  embedding    vector(512),                -- CLIP

  wear_count   int not null default 0,
  last_worn_at timestamptz,

  proc_status  proc_status not null default 'processing',
  proc_error   text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index items_user_idx on items(user_id, created_at desc);

-- OUTFITS
create table outfits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  name            text,
  source          text not null,           -- 'ai_suggested' | 'user_created'
  score           numeric,                 -- 0–100
  score_breakdown jsonb,                    -- { color, coherence, formality, pattern, novelty }
  created_at      timestamptz not null default now(),
  wear_count      int not null default 0,
  last_worn_at    timestamptz
);

create table outfit_items (
  outfit_id uuid not null references outfits(id) on delete cascade,
  item_id   uuid not null references items(id)   on delete cascade,
  slot      text not null,                  -- top|bottom|dress|outerwear|footwear|accessory
  primary key (outfit_id, item_id)
);

-- WEARS (log)
create table wears (
  id uuid primary key default gen_random_uuid(),
  user_id  uuid not null references users(id) on delete cascade,
  outfit_id uuid references outfits(id) on delete set null,
  worn_on  date not null default current_date,
  weather_temp_c numeric,
  note     text,
  created_at timestamptz not null default now()
);

create table wear_items (
  wear_id uuid not null references wears(id) on delete cascade,
  item_id uuid not null references items(id) on delete cascade,
  primary key (wear_id, item_id)
);
```

**Wardrobe cap:** enforce the 150-item limit in the `POST /items` handler — count the user's items, reject with a friendly error if at the cap. Keep it a config constant (`MAX_WARDROBE_SIZE`) so it's easy to raise later.

---

## 9. The Cataloging Pipeline

Runs as a background job (`catalog-item`) the moment a photo is uploaded.

1. **Upload.** App sends the photo to `POST /items`. API stores the raw image in MinIO, creates an `items` row with `proc_status = 'processing'`, enqueues the job. Returns `{ id }` immediately so the app can show a placeholder.

2. **Background removal.** Worker calls the Python ML service `POST /process`. The service runs BiRefNet (or `rembg`) → a clean PNG cutout with transparent background. Stored in MinIO as `cutout_image_url`. *(Cutouts are what make flat-lay outfit cards look professional — this is why background removal is in v1.)*

3. **Dominant colors.** Same `/process` call runs k-means over the non-transparent pixels of the cutout → an array of `{ hex, proportion }`. Critical input for the color-harmony algorithm.

4. **CLIP embedding.** Same call runs the cutout through CLIP → a 512-d vector stored in `embedding`. Used for style-coherence scoring.

5. **LLM tagging.** Worker sends the cutout to Claude Sonnet vision:

   > *"You are cataloging a single clothing item for a digital wardrobe. Return JSON: name (short, e.g. 'cream ribbed knit sweater'), category (one of: top, bottom, dress, outerwear, footwear, accessory), subcategory (free text), brand (only if a logo/label is clearly visible, else null), formality (1=loungewear/athletic, 3=smart casual, 5=formal), warmth (1=hot-weather, 5=heavy winter), seasons (array from spring/summer/fall/winter, or ['all']), style_genres (array, e.g. minimalist, streetwear, casual, formal, sporty, vintage, preppy), pattern (solid/striped/plaid/checked/floral/graphic/other), material (best guess)."*

6. **Persist.** Worker writes everything to the `items` row, sets `proc_status = 'ready'`.

7. **Confirm screen.** The app polls `GET /items/:id` (or subscribes); once ready, it shows the cutout with all tags pre-filled and editable. The user taps to confirm or correct. **Always let the user correct the AI** — it will get things wrong, and clean data makes the engine better.

**Quality loop:** build a 25-item ground-truth set from your own closet. Run the pipeline, measure category/season/formality accuracy. Iterate the prompt until category >90%.

---

## 10. The Outfit Compatibility Engine

The heart of the product. Lives in `packages/outfit-engine` as **pure, I/O-free, unit-tested functions.**

### Outfit structure (slots)

A valid outfit fills these slots:
- **Required:** (`top` + `bottom`) **OR** (`dress`)
- **Required:** `footwear`
- **Optional:** `outerwear`
- **Optional:** up to 2 `accessory`

### Suggestion flow

Given the user's closet + context `{ temperature, occasion }`:

**Step 1 — Hard filter.** Drop items that fail hard constraints:
- Season doesn't match the current season (unless `seasons` includes `all`).
- Warmth grossly mismatched to temperature (e.g. `warmth >= 4` when it's 25°C).
- Formality outside the occasion's allowed band (e.g. occasion = "formal" excludes `formality <= 2`).

**Step 2 — Generate candidates.** Enumerate valid slot-fillings from the filtered items. With 150 items capped, hard-filtered, and slot-constrained, the candidate count is manageable. If it ever explodes, sample instead of exhaustively enumerating.

**Step 3 — Score each candidate.** Weighted sum of five sub-scores, each 0–1:

| Sub-score | Weight | How it's computed |
|---|---|---|
| **Color harmony** | 0.30 | See algorithm below |
| **Style coherence** | 0.30 | Mean pairwise cosine similarity of item CLIP embeddings |
| **Formality consistency** | 0.15 | `1 − normalized_stddev(formality values)` — tight spread scores high |
| **Pattern balance** | 0.15 | All solid → 0.8; one pattern + solids → 1.0; two patterns → 0.4; 3+ → 0.1 |
| **Novelty** | 0.10 | Rewards items with an older `last_worn_at` — surfaces forgotten clothes, keeps suggestions fresh |

`total = Σ(weight × subscore) × 100`. Weights are **constants in v1** — they become per-user learned values in the v1.5 personalization layer.

**Step 4 — Rank & dedupe.** Sort by total. Drop near-duplicate outfits (outfits sharing 3+ items). Return the top **3–5**.

### The color-harmony algorithm (the "wait, you built that?" piece)

This is worth doing properly — it's explainable, codeable, and great interview material.

1. Gather each item's dominant colors (already stored from cataloging), weighted by `proportion` and by garment prominence (a top/bottom counts more than a small accessory).
2. Convert each color to HSL.
3. Classify each as **neutral** (saturation < ~15%, or near-black/near-white lightness, or recognized neutral hues like beige/navy/brown) vs. **accent** (chromatic).
4. Score the palette:
   - **All neutral** → 0.80 (safe, a touch flat)
   - **Neutrals + 1 accent** → 1.00 (ideal — neutral-anchored with one pop of color)
   - **Neutrals + 2 accents** → judge the hue angle between the accents: analogous (0–40°) → 0.95; complementary (150–210°) → 0.90; triadic (~120°) → 0.85; awkward angle → 0.50
   - **3+ accents** → 0.30 (too busy)
5. Apply small penalties for known clashes (e.g. two highly saturated colors fighting for attention).

Document this algorithm in your README — it's the single most blog-post-worthy thing in the project.

### Critique mode

When a user manually builds an outfit, run the **same scoring engine**, then make one cheap Claude Haiku call to translate the numeric breakdown into friendly language:

> *"This works — the olive jacket and cream knit are a clean neutral-anchored pairing, and the formality is consistent throughout. One thing to reconsider: the striped tee plus the plaid shirt puts two patterns in competition. Swapping one for a solid would sharpen it."*

The score is computed; the LLM only narrates it. That keeps critiques fast, cheap, and grounded in the actual algorithm.

---

## 11. REST API

Auth via session cookie. JSON. Errors: `{ "error", "code" }`.

### Auth
| Method | Path | Body | Returns |
|---|---|---|---|
| POST | `/auth/signup` | `{ email, password }` | `{ user }` + cookie |
| POST | `/auth/login` | `{ email, password }` | `{ user }` + cookie |
| POST | `/auth/logout` | — | `{ ok }` |
| GET | `/auth/me` | — | `{ user }` |
| PATCH | `/auth/me` | `{ lat, lon }` | updated user (sets home location for weather) |

### Items
| Method | Path | Body | Returns |
|---|---|---|---|
| POST | `/items` | multipart photo | `{ id, procStatus }` — enqueues cataloging; 409 if at the 150 cap |
| GET | `/items` | query: `category`, `season`, `q` | `{ items[], total }` |
| GET | `/items/:id` | — | full item (poll for `procStatus`) |
| PATCH | `/items/:id` | partial tags | updated item |
| DELETE | `/items/:id` | — | 204 |

### Outfits
| Method | Path | Body | Returns |
|---|---|---|---|
| POST | `/outfits/suggest` | `{ occasion?, useWeather? }` | `{ outfits[] }` — 3–5 ranked, each with score + breakdown |
| POST | `/outfits/score` | `{ items: [{itemId, slot}] }` | `{ score, breakdown, critique }` — no persistence |
| POST | `/outfits` | `{ items, name?, source }` | persisted outfit |
| GET | `/outfits` | — | saved outfits |
| GET | `/outfits/:id` | — | one outfit |
| DELETE | `/outfits/:id` | — | 204 |

### Wears
| Method | Path | Body | Returns |
|---|---|---|---|
| POST | `/wears` | `{ outfitId?, itemIds[], wornOn? }` | `{ wear }` — bumps `wear_count` + `last_worn_at` on each item |
| GET | `/wears` | query: `from`, `to` | wear history |

### Weather
| Method | Path | Returns |
|---|---|---|
| GET | `/weather` | `{ tempC, condition }` — proxies Open-Meteo using the user's saved lat/lon |

### ML service (internal, Python — not public)
| Method | Path | Returns |
|---|---|---|
| POST | `/process` | `{ cutoutPng, colors[], embedding[] }` — bg removal + colors + CLIP in one pass |

---

## 12. The Mobile App (Expo)

Tabs and screens:

| Screen | Purpose |
|---|---|
| **Auth** | Login / signup. On first run, ask for location permission (for weather). |
| **Closet** (tab) | Grid of item cutouts on clean backgrounds. Filter chips (category, season). Shows `X / 150` count. Floating "+ Add item" button. |
| **Add item** (flow) | Camera → photo preview → upload → processing spinner → confirm-tags screen (all AI tags editable) → saved. |
| **Item detail** | Large cutout, every tag editable, wear count, "delete". |
| **Suggest** (tab) | The hero screen. Shows today's weather, an occasion picker (casual / smart / formal / sporty). "What should I wear?" button → swipeable flat-lay outfit cards, each with score. Actions per card: "I'll wear this" (logs it), "Save outfit", "Next". |
| **Builder** | Manually fill outfit slots by picking from the closet. Live score + critique updates as you go. |
| **Outfits** (tab) | Saved outfits. |
| **Today / Log** | What you wore recently. Simple history. |
| **Settings** | Profile, location, password. |

**UX details that matter:**
- The **confirm-tags screen** must be fast to skim and tap-correct. Most users will accept AI tags as-is if they're presented well.
- The **Suggest screen** is your demo. Polish it. The moment the flat-lay cards animate in is the screenshot that goes on GitHub.
- Flat-lay cards: item cutouts arranged in a clean grid (outerwear top-left, top, bottom, footwear, accessories) on a soft background. This is why background removal earns its place in v1.
- Show the engine's reasoning on each card ("Neutral-anchored palette · consistent smart-casual · fresh — not worn in 3 weeks"). Transparency builds trust and shows off your engine.

---

## 13. Deploy

`docker compose` brings up the backend: `postgres` (with pgvector), `redis`, `minio`, `api`, `worker`, `ml` (Python). The Expo app is built and distributed separately via **EAS Build** (Expo's build service) → TestFlight / Play Store, or run locally through Expo Go during development.

Ship a `make seed` that creates a demo user with ~20 sample catalogued items so contributors see outfit suggestions working immediately.

---

## 14. v1 Success Criteria

- **Cataloging accuracy:** category correct >90%, season/formality sane, colors visually right, on your own 25-item ground-truth set.
- **Background removal** produces a clean cutout on >85% of real phone photos.
- **The engine earns trust:** when you ask for a suggestion, at least 3 of the 5 outfits are ones a stylish friend would agree "yeah, that works." *This is the criterion that matters most — test it with real people, not just yourself.*
- The full loop — photograph an item → it's catalogued → it shows up in a suggestion — works end to end.
- You have catalogued **your own real wardrobe** (40+ items) and used the app to pick outfits for two weeks.
- It runs as an installed app on your actual phone via TestFlight.
- The repo has a polished README with a demo video, screenshots, the color-harmony algorithm explained, and backend install instructions.

---

## 15. Roadmap Beyond v1

**v1.5 — Personalization & insight (start once v1 is stable):**
1. **Personalization layer.** Users rate suggestions; the engine's five weights become per-user learned values. Cold-start uses today's fixed weights. This is a real preference-learning ML problem and a great blog post.
2. **"Stopped wearing" / declutter.** Surface items not worn in N months. *"You haven't worn this in 6 months."*
3. **Cost-per-wear.** Add an optional purchase price per item; show €/wear.

**v2 — Depth & delight:**
4. **Mannequin / on-body compositing** instead of flat-lay.
5. **Calendar integration** — outfits planned around real events.
6. **Style DNA** — name the user's aesthetic from their closet + favorites.
7. **Wardrobe gap analysis** — graph analysis on outfit connectivity; suggest the highest-leverage missing pieces.
8. **Capsule analysis** — identify MVP items vs. dead-ends.
9. **Mood-board match** — paste an inspiration photo, find matching items in the closet.
10. **Travel packing** — outfits for a trip that share enough items to fit a carry-on.
11. **Selling hook** — list stopped-wearing items to a marketplace. (Optional. Possibly never.)

---

## 16. The Story This Tells in Interviews

> *"I built a self-hostable AI wardrobe assistant. You photograph your clothes — a pipeline removes the background, extracts dominant colors, generates a CLIP embedding, and uses a vision model to tag each item. The core is an outfit-compatibility engine: combinatorial search over your closet, ranked on a multi-objective score — a color-harmony algorithm I built from color theory, style coherence from embedding similarity, formality consistency, pattern balance, and novelty. It's a native app built in React Native. ChatGPT can't replicate it because the product is persistent memory of your physical wardrobe."*

That answer demonstrates: product sense, ML/vision, a real algorithm you can whiteboard, mobile development, and clean architecture (the pure-function engine package). And it's a visual product — the interviewer will ask to see it.

---

## 17. What to Do Right Now (build order)

The build order front-loads risk: the cataloging pipeline and the engine before the polish.

1. **Pick a name.** `Hanger`, `Layers`, `Capsule`, `Fitted`, `Closetly`, `Drobe` — pick one, move on. (15 min.)
2. **Backend scaffold + infra.** Monorepo, `docker compose up` with Postgres+pgvector, Redis, MinIO. Empty Hono API. (1 evening.)
3. **Schema + auth.** Full Drizzle migration, signup/login/me, sessions. (2 days.)
4. **The Python ML service, standalone.** `POST /process` doing background removal + color k-means + CLIP. Test it on 20 photos from your phone before wiring it to anything. (3–4 days.)
5. **The cataloging pipeline end to end.** Upload → ML service → Claude tagging → DB row marked ready. Test on your real clothes. (3 days.)
6. **The outfit engine — `packages/outfit-engine`.** Pure functions, fully unit-tested. Build the color-harmony algorithm carefully. Test against hand-picked good/bad outfits from your own closet. (5–6 days — this is the hero, don't rush it.)
7. **Expo app: auth + closet + add-item flow.** Get items into a real app on your phone. (4–5 days.)
8. **Expo app: the Suggest screen.** Wire `/outfits/suggest`, render flat-lay cards. Polish this — it's the demo. (3–4 days.)
9. **Builder + critique screen.** Manual outfit building with live scoring. (2–3 days.)
10. **Wear logging + weather.** `/wears`, Open-Meteo integration, occasion picker. (2 days.)
11. **Dogfood.** Catalog your whole wardrobe. Use the app for two weeks. Fix everything that annoys you. (2 weeks of real use.)
12. **README + demo video + screenshots.** Open the repo. Post on Hacker News, r/selfhosted, r/femalefashionadvice, r/malefashionadvice.

Realistically **7–9 weeks** of focused work at 40 hrs/wk. The engine (step 6) and the cataloging pipeline (steps 4–5) are where time slips — budget generously there.

Don't touch v1.5 until v1 is shipped, dogfooded, and on GitHub. **Discipline is the project.**
