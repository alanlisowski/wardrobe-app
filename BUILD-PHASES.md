# Wardrobe App — Build Phases

A token-efficient build plan for Claude Code. The remaining work is split into 7 phases. Each phase is one focused Claude Code session with a ready-to-paste prompt.

## How to use this

- **Before each phase:** run `/clear` to reset context (a fresh, cheap context), and confirm the model is **Sonnet** (`/model`).
- **Paste the phase prompt** exactly as written — each one is self-contained.
- **After each phase:** run the verification, then `git add -A && git commit -m "Phase N: ..."`. The commit is your checkpoint.
- **If a big phase runs long** (4, 5, 6, 7), the prompt has a natural split point — stop at it, `/clear`, and continue with the second half. Better two cheap sessions than one bloated one.
- Phases must be done **in order** — each depends on the ones before it.

Optional: drop this file into the repo root so Claude Code can see it too. Not required — the prompts stand alone.

---

## Phase 1 — Finish the outfit engine

**Goal:** Complete `generate.ts`, the dedupe step, and the engine tests.
**Depends on:** nothing (`score.ts` is already done).
**Size:** small — one session.

> You may already be doing this. If your last session only covered `filterCloset`, `generateCandidates`, and the tests, note that there's also a `dedupe` TODO in `suggestOutfits` (`src/index.ts`) — the prompt below includes it so it doesn't get missed.

```
Implement filterCloset and generateCandidates in
packages/outfit-engine/src/generate.ts per SPEC section 10. Also implement the
dedupe TODO in suggestOutfits in src/index.ts — drop outfits that share 3+ items
with a higher-ranked one. Then fill in the five it.todo() placeholders in
engine.test.ts with real tests. Run `pnpm test` and `pnpm typecheck` and fix
anything that fails. Don't touch other packages.
```

**Verify:** `pnpm test` and `pnpm typecheck` pass in `packages/outfit-engine`.

---

## Phase 2 — Database + authentication

**Goal:** Confirm migrations run; build the auth system.
**Depends on:** Phase 1. Needs `pnpm infra:up` running (Postgres).
**Size:** medium.

```
First confirm the database works: run `pnpm db:generate` then `pnpm db:migrate`
against the Postgres from `pnpm infra:up`, fixing any schema issues.
Then implement authentication in apps/api per SPEC section 11: POST /auth/signup,
POST /auth/login, POST /auth/logout, GET /auth/me, PATCH /auth/me. Use bcrypt for
password hashing and session-cookie auth backed by the sessions table. Add an
auth middleware the other routes will reuse. Verify by signing up and logging in
with curl. Keep scope to auth only — no other routes.
```

**Verify:** `curl` signup then login succeeds and sets a session cookie; `GET /auth/me` returns the user.

---

## Phase 3 — ML service `/process` endpoint

**Goal:** Background removal + color extraction + CLIP embedding in the Python service.
**Depends on:** nothing — standalone, can be done any time after Phase 1.
**Size:** medium (the CLIP/torch install is heavy — be patient).

```
Implement the POST /process endpoint in services/ml/main.py per SPEC section 9:
(1) background removal with rembg returning a transparent PNG cutout,
(2) dominant-color extraction with k-means over the cutout's non-transparent
pixels, returning [{hex, proportion}], (3) a CLIP ViT-B/32 embedding (512-d).
Uncomment the torch and open-clip-torch deps in requirements.txt for step 3.
Test the endpoint with a real clothing photo and confirm it returns a cutout,
colors, and a 512-float embedding.
```

**Verify:** `POST /process` with a real photo returns a cutout, a color list, and a 512-length embedding.
**Split point:** if the torch install is painful, do steps 1–2 first, `/clear`, then step 3.

---

## Phase 4 — Image upload + cataloging pipeline

**Goal:** `POST /items` (upload + enqueue) and the worker's `catalog-item` job.
**Depends on:** Phase 2 (auth, DB), Phase 3 (ML service).
**Size:** large — has a built-in split point.

```
Implement the item cataloging pipeline per SPEC sections 9 and 11.
In apps/api: POST /items (accepts a photo upload, stores the original to MinIO,
creates an items row with proc_status 'processing', enqueues a catalog-item
BullMQ job; enforce the 150-item cap from @wardrobe/shared), plus GET /items,
GET /items/:id, PATCH /items/:id, DELETE /items/:id.
SPLIT POINT: get upload + enqueue working and confirm the worker picks up the
job, then stop so I can /clear before the worker logic.
In apps/worker: implement the catalog-item job — call the ML service /process,
call Claude vision for structured tags, write everything to the items row and
set proc_status 'ready'. Verify end to end by uploading a real photo.
```

**Verify:** uploading a photo creates an item that ends up `ready` with a cutout, colors, and AI tags.

---

## Phase 5 — Outfit, wear & weather API routes

**Goal:** The suggestion, scoring, outfit CRUD, wear logging, and weather endpoints.
**Depends on:** Phase 1 (engine), Phase 4 (items exist).
**Size:** large — has a built-in split point.

```
Implement the remaining API routes per SPEC section 11.
POST /outfits/suggest — load the user's closet, call suggestOutfits from
@wardrobe/outfit-engine, return ranked outfits.
POST /outfits/score — score a manually built outfit, return score + breakdown +
a plain-language critique (one Claude Haiku call that narrates the breakdown).
POST /outfits, GET /outfits, GET /outfits/:id, DELETE /outfits/:id.
SPLIT POINT: stop here so I can /clear before the last routes.
POST /wears and GET /wears — log a wear, bump wear_count + last_worn_at on each
item. GET /weather — proxy Open-Meteo using the user's saved lat/lon.
Verify each endpoint with curl.
```

**Verify:** `curl` each route; `/outfits/suggest` returns ranked outfits from your catalogued items.

---

## Phase 6 — Mobile: auth, closet & add-item screens

**Goal:** The first Expo screens — login/signup, closet grid, add-item camera flow.
**Depends on:** Phase 2 (auth API), Phase 4 (items API).
**Size:** large.

```
Build the first mobile screens in apps/mobile per SPEC section 12: login/signup,
the Closet grid (item cutouts, filter chips, an X/150 count), and the Add-item
flow (camera via expo-camera -> upload -> a processing state -> an editable
confirm-tags screen). Add a small API client module and persist the session.
Keep it mobile-first and visually clean. Do NOT build the Suggest or Builder
screens yet.
```

**Verify:** run the app on a device/simulator; sign up, catalog a real item end to end.

---

## Phase 7 — Mobile: suggest, builder & log screens

**Goal:** The Suggest screen (the demo), the outfit Builder, the Log screen.
**Depends on:** Phase 5 (outfit routes), Phase 6 (app shell).
**Size:** large.

```
Build the remaining mobile screens in apps/mobile per SPEC section 12: the
Suggest screen (shows today's weather, an occasion picker, a "What should I
wear?" button -> swipeable flat-lay outfit cards each with a score and the
engine's reasoning), the Builder (fill outfit slots from the closet with a live
score + critique), and the Log/Today screen. Wire them to the /outfits and
/wears endpoints. Polish the Suggest screen especially — it is the demo.
```

**Verify:** the full loop works on a device — catalog items, get a suggestion, log a wear.

---

## After Phase 7

You have a working v1. Now: catalog your real wardrobe, dogfood it for two weeks, fix what annoys you, then do the README + demo video + screenshots and open the repo (SPEC sections 14 and 17). Do not start v1.5 until then.

## Token-economy reminders

- **Sonnet** for all of this — it is more than capable for well-specified work. Opus only when genuinely stuck.
- `/clear` between every phase. A fresh context is a cheap context.
- One phase per session. If you feel a session getting long and expensive, stop at a split point and `/clear`.
- Commit after every phase — checkpoints make it safe to `/clear` freely.
