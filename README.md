# Wardrobe App

An AI-powered, self-hostable wardrobe assistant. Photograph your clothes, and an
outfit-compatibility engine builds outfits from what you actually own.

See **[SPEC.md](./SPEC.md)** for the full v1 specification.

## Stack

- **Mobile app** — React Native + Expo (`apps/mobile`)
- **API** — TypeScript + Hono (`apps/api`)
- **Worker** — BullMQ background jobs (`apps/worker`)
- **ML service** — Python + FastAPI: background removal, color extraction, CLIP (`services/ml`)
- **Database** — Postgres + pgvector
- **Shared packages** — `packages/db` (Drizzle schema), `packages/shared` (types),
  `packages/outfit-engine` (the compatibility engine)

## Prerequisites

- Node.js 22+
- pnpm 9+  (`npm install -g pnpm`)
- Docker + Docker Compose
- Python 3.11+ (only if running the ML service outside Docker)

## Setup

1. Install dependencies:
   ```
   pnpm install
   ```
2. Copy the env file and fill it in:
   ```
   cp .env.example .env
   ```
   Set `ANTHROPIC_API_KEY` and change the default passwords.
3. Start infrastructure (Postgres, Redis, MinIO, ML service):
   ```
   pnpm infra:up
   ```
4. Generate and run database migrations:
   ```
   pnpm db:generate
   pnpm db:migrate
   ```
5. Run the API and worker (each in its own terminal):
   ```
   pnpm dev:api
   pnpm dev:worker
   ```
6. Run the mobile app:
   ```
   pnpm dev:mobile
   ```

## Project status

This is a **scaffold**. The structure, database schema, and types are in place;
business logic is stubbed with `TODO` comments that reference the relevant
SPEC.md section. The recommended build order is in SPEC.md section 17.

The two hard parts to build next:
1. `packages/outfit-engine` — the compatibility engine (SPEC section 10)
2. The cataloging pipeline — `services/ml` + `apps/worker` (SPEC section 9)

## A note on Expo versions

Expo moves fast. If `pnpm install` fails on the mobile app, regenerate it with
the current SDK:
```
npx create-expo-app@latest apps/mobile
```
then copy the `app/` folder and `app.json` from this scaffold back in, and run
`npx expo install expo-camera expo-image expo-router`.
