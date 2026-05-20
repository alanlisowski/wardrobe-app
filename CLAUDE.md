# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Wardrobe App — an AI-powered, self-hostable wardrobe assistant. Users photograph their clothes; a vision pipeline catalogs each item, and an outfit-compatibility engine builds outfits from what they actually own. Mobile-first (React Native + Expo).

**`SPEC.md` is the source of truth** for scope, the data model, the API surface, and the compatibility engine design. Read it before implementing anything. Stubs in the code carry `TODO` comments that name the exact SPEC section to implement.

## Current status: scaffold

The monorepo structure, the database schema, and the shared type system are complete. All business logic is intentionally stubbed — stub functions `throw` with a message pointing to the relevant SPEC section. The core TypeScript (`packages/shared`, `packages/outfit-engine`) type-checks clean. Nothing else has been implemented yet.

## Commands

Run from the repo root unless noted. Package manager is **pnpm** (workspaces); Node 22+.

- `pnpm install` — install all workspace dependencies
- `pnpm infra:up` — start Postgres, Redis, MinIO, and the ML service via Docker Compose
- `pnpm infra:down` — stop the Docker services
- `pnpm db:generate` — generate a Drizzle migration from `packages/db/src/schema.ts`
- `pnpm db:migrate` — apply migrations to the database
- `pnpm dev:api` — run the API (Hono, hot-reload via tsx)
- `pnpm dev:worker` — run the BullMQ worker
- `pnpm dev:mobile` — run the Expo app
- `pnpm typecheck` — typecheck every package (`tsc --noEmit` per package)
- `pnpm test` — run all package test suites (currently the outfit-engine suite via Vitest)

Single test / focused runs: `cd packages/outfit-engine && pnpm test` runs that package's Vitest suite; pass a file or `-t "<name>"` to narrow it (e.g. `pnpm test -t "score weights"`).

The Python ML service (`services/ml`) runs in Docker via `pnpm infra:up`. To run it standalone: `cd services/ml && pip install -r requirements.txt && uvicorn main:app --reload`.

## Architecture

This is a pnpm-workspace monorepo with a TypeScript side and a Python side. The pieces and how they fit:

- **`apps/api`** (Hono) — the REST API. The full endpoint list is SPEC section 11. It boots and serves `/health`; all other routes are unbuilt. Photo uploads land here, get stored to MinIO, and an item row plus a `catalog-item` queue job are created.
- **`apps/worker`** (BullMQ) — consumes the `catalog-item` queue and runs the cataloging pipeline (SPEC section 9): call the ML service, call Claude vision for tags, write results back to the item row.
- **`services/ml`** (Python / FastAPI) — one endpoint, `/process`, that does background removal + dominant-color extraction + CLIP embedding in a single pass. The TypeScript worker calls it over HTTP. Kept separate because these are Python-ecosystem ML tasks.
- **`packages/db`** (Drizzle) — the complete Postgres schema (`src/schema.ts`): users, sessions, items, outfits, outfit_items, wears, wear_items, with pgvector for the 512-d CLIP embedding column. Exports the `db` client. Migrations live in `drizzle/` after `db:generate`.
- **`packages/shared`** — shared TypeScript types and constants (item/outfit types, enums, `MAX_WARDROBE_SIZE`). Imported by both the API and the engine.
- **`packages/outfit-engine`** — the outfit compatibility engine, and the technical heart of the project (SPEC section 10). Given a closet and a context (weather, occasion), it hard-filters items, enumerates candidate outfits, and ranks them on a weighted five-factor score (color harmony, style coherence, formality, pattern, novelty).

Data flow for the two core features: **Cataloging** — mobile app → `POST /items` (api) → MinIO + `catalog-item` job → worker → ML service + Claude → item row marked `ready`. **Suggestion** — mobile app → `POST /outfits/suggest` (api) → outfit-engine over the user's closet → ranked outfits.

## Conventions and constraints

- **`packages/outfit-engine` must stay pure** — no I/O, no DB, no network, no side effects. Functions in, values out. This is what keeps it unit-testable; preserve it. The API layer is responsible for loading the closet and passing it in.
- When implementing a stub, **replace the `throw` but keep the signature**, and add tests in the same package (`packages/outfit-engine/src/engine.test.ts` shows the pattern, including `it.todo()` placeholders to fill in).
- Each package has its own `tsconfig.json` extending the root `tsconfig.base.json`. `strict` and `noUncheckedIndexedAccess` are on.
- **Scope discipline: v1 only.** SPEC sections 1–14 define v1. Sections 15+ (personalization, mannequin compositing, calendar, decluttering, etc.) are explicitly out of scope until v1 ships. If a requested change isn't in v1, flag it rather than building it.

## Recommended build order

Per SPEC section 17. The outfit-engine can be built first — it is pure functions, fully testable, and needs no running infrastructure. Then: the ML `/process` endpoint, the cataloging pipeline (worker), the API routes, and finally the Expo screens (SPEC section 12).

## Environment

Copy `.env.example` to `.env`. `ANTHROPIC_API_KEY` is required for the cataloging pipeline. The mobile app pins Expo SDK versions that may have aged — if `pnpm install` fails on `apps/mobile`, regenerate it with `npx create-expo-app@latest` and restore the `app/` folder and `app.json` (see README).
