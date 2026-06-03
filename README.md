# TAILOR

Job-specific resumes, cut only from cloth you actually own.
See the design spec: `../docs/specs/2026-05-29-tailor-design.html`.

## Prerequisites
- Node 20+, a Convex account (or anonymous/local dev)

## Run locally
```bash
npm install
npx convex dev      # provisions deployment, writes .env.local, watches backend (keep running)
npm run dev         # Next.js on :3000 (separate terminal)
```
Open http://localhost:3000.

## Test
```bash
npm test            # convex-test backend tests + RTL component tests
```

## Typecheck
```bash
npx tsc --noEmit -p tsconfig.json
```

## Architecture
- `convex/` — backend: schema + query/mutation functions (no separate API server, no SQL).
- `app/` — Next.js App Router frontend; talks to Convex via generated, typed function refs.

The `v` validators in `convex/schema.ts` plus the generated `convex/_generated` types are
the single source of truth for data shapes — the client and backend contract cannot drift.
