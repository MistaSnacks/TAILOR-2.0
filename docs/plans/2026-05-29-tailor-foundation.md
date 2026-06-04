# TAILOR — Plan 1: Foundation & Walking Skeleton

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the TAILOR monorepo with a tested, end-to-end "walking skeleton" — a Next.js page that creates and lists `corpus_document` records through a Fastify API backed by Postgres — proving the whole architecture works before any real feature is built.

**Architecture:** A pnpm-workspace TypeScript monorepo. `apps/web` (Next.js App Router) talks over HTTP/JSON to `apps/api` (Fastify), which persists to Postgres via Prisma. A shared `packages/contracts` package holds zod schemas that are the single source of truth for request/response shapes, imported by both web and api so the API contract (spec §11) cannot drift. This plan ships metadata-only documents (no file upload or parsing yet — that is Plan 2).

**Tech Stack:** TypeScript 5 (strict), pnpm workspaces, Node 20+, Fastify 4, Prisma 5 + Postgres 16 (via Docker), zod 3, Vitest 1 (api + contracts), Vitest + React Testing Library (web), Next.js 14 (App Router). Claude SDK (`@anthropic-ai/sdk`) is added in Plan 3, not here.

---

## Spec → Plan Roadmap

This is Plan 1 of 5. Each later plan gets its own document and depends on the ones before it. Each produces working, testable software.

| Plan | Name | Spec sections covered | Ships |
|------|------|----------------------|-------|
| **1 (this doc)** | Foundation & Walking Skeleton | §1 architecture, §2 data model (skeleton), §11 API contract mechanism | Monorepo, DB, create/list corpus documents end-to-end |
| 2 | Ingestion & The Form | §3 step 1, §4 canonicalization, §13 failure handling (upload) | File upload + parse (PDF/DOCX/text) → evidence units → canonical profile; FormExplorer UI |
| 3 | The Engine (moat + trust) | §3 steps 2–5, §5 inference yield, §6 grounding, §7 verification gate | JD parse, match, inferred bullets, the four typed transformations, the server-side verification gate |
| 4 | Fitting Room & Export | §3 steps 6–7, §8 Fitting Room, §9 fit score, export | Deterministic fit scorer, results modal, templates, ATS-safe PDF/DOCX export |
| 5 | Accounts & The Atelier | §10 workspace, §13 privacy | Auth, per-job saved Fittings dashboard, re-run on richer Form, deletion |

**Scope guard for this plan:** no auth, no file bytes, no Claude calls, no parsing. A `corpus_document` here is just `{ id, filename, mimeType, createdAt }`. The point is to prove web ⇄ api ⇄ db works and to lock the contract mechanism.

---

## File Structure

```
tailor/
├── package.json                      # root: workspace scripts, devDeps
├── pnpm-workspace.yaml               # declares apps/*, packages/*
├── tsconfig.base.json                # shared strict TS config
├── docker-compose.yml                # Postgres 16 for dev + test
├── .gitignore
├── .env.example                      # documents required env vars
├── README.md                         # how to run
├── packages/
│   └── contracts/                    # shared zod schemas = the API contract
│       ├── package.json
│       ├── tsconfig.json
│       ├── src/
│       │   ├── index.ts              # re-exports
│       │   └── corpus.ts             # CorpusDocument schemas (create input + entity)
│       └── test/
│           └── corpus.test.ts
├── apps/
│   ├── api/                          # Fastify backend
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── vitest.config.ts
│   │   ├── prisma/
│   │   │   └── schema.prisma         # CorpusDocument model
│   │   ├── src/
│   │   │   ├── server.ts             # buildServer() — Fastify app factory
│   │   │   ├── index.ts              # listen entrypoint
│   │   │   ├── db.ts                 # PrismaClient singleton
│   │   │   ├── repositories/
│   │   │   │   └── corpus.ts         # createDocument / listDocuments
│   │   │   └── routes/
│   │   │       ├── health.ts         # GET /health
│   │   │       └── corpus.ts         # POST/GET /corpus/documents
│   │   └── test/
│   │       ├── health.test.ts
│   │       ├── corpus.repository.test.ts
│   │       └── corpus.routes.test.ts
│   └── web/                          # Next.js frontend
│       ├── package.json
│       ├── tsconfig.json
│       ├── next.config.mjs
│       ├── vitest.config.ts
│       ├── vitest.setup.ts
│       └── src/
│           ├── lib/
│           │   └── api.ts            # typed fetch client using contracts
│           ├── components/
│           │   └── DocumentList.tsx  # presentational list
│           └── app/
│               ├── layout.tsx
│               └── page.tsx          # corpus page: list + create form
│       └── test/
│           ├── DocumentList.test.tsx
│           └── api.test.ts
```

**Responsibility boundaries:**
- `packages/contracts` — the only place request/response shapes are defined. No logic.
- `apps/api/repositories` — all DB access. Routes never touch Prisma directly.
- `apps/api/routes` — HTTP only: validate with contracts, call repository, return.
- `apps/web/lib/api.ts` — the only place the web app knows the API URL or fetch details.
- `apps/web/components` — presentational, given data as props (testable without network).

---

## Task 1: Initialize the monorepo skeleton

**Files:**
- Create: `tailor/.gitignore`, `tailor/package.json`, `tailor/pnpm-workspace.yaml`, `tailor/tsconfig.base.json`, `tailor/docker-compose.yml`, `tailor/.env.example`

- [ ] **Step 1: Create the project directory and initialize git**

Run:
```bash
mkdir -p tailor && cd tailor && git init
```
Expected: `Initialized empty Git repository in .../tailor/.git/`

- [ ] **Step 2: Create `.gitignore`**

Create `tailor/.gitignore`:
```gitignore
node_modules/
dist/
.next/
.env
*.log
coverage/
.DS_Store
apps/api/prisma/*.db
```

- [ ] **Step 3: Create the workspace declaration**

Create `tailor/pnpm-workspace.yaml`:
```yaml
packages:
  - "apps/*"
  - "packages/*"
```

- [ ] **Step 4: Create the root `package.json`**

Create `tailor/package.json`:
```json
{
  "name": "tailor",
  "private": true,
  "version": "0.0.0",
  "engines": { "node": ">=20" },
  "scripts": {
    "test": "pnpm -r test",
    "build": "pnpm -r build",
    "db:up": "docker compose up -d",
    "db:down": "docker compose down"
  },
  "devDependencies": {
    "typescript": "^5.4.0"
  }
}
```

- [ ] **Step 5: Create the shared TypeScript config**

Create `tailor/tsconfig.base.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022"],
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "declaration": true,
    "resolveJsonModule": true
  }
}
```

- [ ] **Step 6: Create the dev/test Postgres via Docker**

Create `tailor/docker-compose.yml`:
```yaml
services:
  postgres:
    image: postgres:16
    restart: unless-stopped
    environment:
      POSTGRES_USER: tailor
      POSTGRES_PASSWORD: tailor
      POSTGRES_DB: tailor
    ports:
      - "5432:5432"
    volumes:
      - tailor_pg:/var/lib/postgresql/data
volumes:
  tailor_pg:
```

- [ ] **Step 7: Document required env vars**

Create `tailor/.env.example`:
```bash
# apps/api
DATABASE_URL="postgresql://tailor:tailor@localhost:5432/tailor?schema=public"
PORT=4000

# apps/web
NEXT_PUBLIC_API_URL="http://localhost:4000"
```

- [ ] **Step 8: Verify pnpm sees the (empty) workspace and commit**

Run:
```bash
pnpm install
```
Expected: completes with no packages yet (no error). Then:
```bash
git add -A && git commit -m "chore: initialize tailor monorepo skeleton"
```

---

## Task 2: The contracts package (shared zod schemas)

**Files:**
- Create: `packages/contracts/package.json`, `packages/contracts/tsconfig.json`, `packages/contracts/src/index.ts`, `packages/contracts/src/corpus.ts`
- Test: `packages/contracts/test/corpus.test.ts`

- [ ] **Step 1: Create the package manifest**

Create `packages/contracts/package.json`:
```json
{
  "name": "@tailor/contracts",
  "version": "0.0.0",
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": { ".": "./src/index.ts" },
  "scripts": {
    "test": "vitest run",
    "build": "tsc -p tsconfig.json"
  },
  "dependencies": {
    "zod": "^3.23.0"
  },
  "devDependencies": {
    "vitest": "^1.6.0"
  }
}
```

- [ ] **Step 2: Create the package tsconfig**

Create `packages/contracts/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Install dependencies**

Run:
```bash
pnpm install
```
Expected: installs zod and vitest into the workspace.

- [ ] **Step 4: Write the failing test**

Create `packages/contracts/test/corpus.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { CreateCorpusDocument, CorpusDocument } from "../src/corpus.js";

describe("CreateCorpusDocument", () => {
  it("accepts a valid create payload", () => {
    const parsed = CreateCorpusDocument.parse({
      filename: "resume_2021.pdf",
      mimeType: "application/pdf",
    });
    expect(parsed.filename).toBe("resume_2021.pdf");
  });

  it("rejects an empty filename", () => {
    const result = CreateCorpusDocument.safeParse({
      filename: "",
      mimeType: "application/pdf",
    });
    expect(result.success).toBe(false);
  });
});

describe("CorpusDocument", () => {
  it("requires id and createdAt", () => {
    const result = CorpusDocument.safeParse({
      filename: "x.pdf",
      mimeType: "application/pdf",
    });
    expect(result.success).toBe(false);
  });
});
```

- [ ] **Step 5: Run the test to verify it fails**

Run:
```bash
pnpm --filter @tailor/contracts test
```
Expected: FAIL — cannot resolve `../src/corpus.js` (module does not exist yet).

- [ ] **Step 6: Implement the schemas**

Create `packages/contracts/src/corpus.ts`:
```ts
import { z } from "zod";

/** Input accepted by POST /corpus/documents (metadata only in Plan 1). */
export const CreateCorpusDocument = z.object({
  filename: z.string().min(1),
  mimeType: z.string().min(1),
});
export type CreateCorpusDocument = z.infer<typeof CreateCorpusDocument>;

/** A persisted corpus document as returned by the API. */
export const CorpusDocument = CreateCorpusDocument.extend({
  id: z.string().uuid(),
  createdAt: z.string().datetime(),
});
export type CorpusDocument = z.infer<typeof CorpusDocument>;

export const CorpusDocumentList = z.array(CorpusDocument);
export type CorpusDocumentList = z.infer<typeof CorpusDocumentList>;
```

- [ ] **Step 7: Create the barrel export**

Create `packages/contracts/src/index.ts`:
```ts
export * from "./corpus.js";
```

- [ ] **Step 8: Run the test to verify it passes**

Run:
```bash
pnpm --filter @tailor/contracts test
```
Expected: PASS — 3 tests pass.

- [ ] **Step 9: Commit**

Run:
```bash
git add -A && git commit -m "feat(contracts): add corpus document zod schemas"
```

---

## Task 3: API scaffold + health route

**Files:**
- Create: `apps/api/package.json`, `apps/api/tsconfig.json`, `apps/api/vitest.config.ts`, `apps/api/src/server.ts`, `apps/api/src/index.ts`, `apps/api/src/routes/health.ts`
- Test: `apps/api/test/health.test.ts`

- [ ] **Step 1: Create the api manifest**

Create `apps/api/package.json`:
```json
{
  "name": "@tailor/api",
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc -p tsconfig.json",
    "test": "vitest run",
    "prisma:generate": "prisma generate",
    "prisma:migrate": "prisma migrate dev"
  },
  "dependencies": {
    "@tailor/contracts": "workspace:*",
    "@prisma/client": "^5.15.0",
    "fastify": "^4.27.0",
    "zod": "^3.23.0"
  },
  "devDependencies": {
    "prisma": "^5.15.0",
    "tsx": "^4.15.0",
    "vitest": "^1.6.0",
    "typescript": "^5.4.0"
  }
}
```

- [ ] **Step 2: Create the api tsconfig**

Create `apps/api/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Create the vitest config**

Create `apps/api/vitest.config.ts`:
```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
  },
});
```

- [ ] **Step 4: Install dependencies**

Run:
```bash
pnpm install
```
Expected: installs fastify, prisma, tsx, vitest for `@tailor/api`.

- [ ] **Step 5: Write the failing test**

Create `apps/api/test/health.test.ts`:
```ts
import { describe, it, expect, afterAll } from "vitest";
import { buildServer } from "../src/server.js";

const app = buildServer();
afterAll(() => app.close());

describe("GET /health", () => {
  it("returns status ok", async () => {
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: "ok" });
  });
});
```

- [ ] **Step 6: Run the test to verify it fails**

Run:
```bash
pnpm --filter @tailor/api test
```
Expected: FAIL — cannot resolve `../src/server.js`.

- [ ] **Step 7: Implement the server factory and health route**

Create `apps/api/src/routes/health.ts`:
```ts
import type { FastifyInstance } from "fastify";

export async function healthRoutes(app: FastifyInstance) {
  app.get("/health", async () => ({ status: "ok" }));
}
```

Create `apps/api/src/server.ts`:
```ts
import Fastify, { type FastifyInstance } from "fastify";
import { healthRoutes } from "./routes/health.js";

export function buildServer(): FastifyInstance {
  const app = Fastify({ logger: false });
  app.register(healthRoutes);
  return app;
}
```

Create `apps/api/src/index.ts`:
```ts
import { buildServer } from "./server.js";

const app = buildServer();
const port = Number(process.env.PORT ?? 4000);

app.listen({ port, host: "0.0.0.0" }).then(() => {
  console.log(`api listening on :${port}`);
});
```

- [ ] **Step 8: Run the test to verify it passes**

Run:
```bash
pnpm --filter @tailor/api test
```
Expected: PASS — health test passes.

- [ ] **Step 9: Commit**

Run:
```bash
git add -A && git commit -m "feat(api): scaffold fastify server with health route"
```

---

## Task 4: Postgres + Prisma + corpus repository

**Files:**
- Create: `apps/api/prisma/schema.prisma`, `apps/api/src/db.ts`, `apps/api/src/repositories/corpus.ts`
- Test: `apps/api/test/corpus.repository.test.ts`

> This task requires the database running. Start it first.

- [ ] **Step 1: Start Postgres**

Run (from `tailor/`):
```bash
docker compose up -d
```
Expected: `postgres` container started. Verify: `docker compose ps` shows it healthy/running.

- [ ] **Step 2: Create the `.env` for the api**

Create `apps/api/.env`:
```bash
DATABASE_URL="postgresql://tailor:tailor@localhost:5432/tailor?schema=public"
PORT=4000
```

- [ ] **Step 3: Create the Prisma schema**

Create `apps/api/prisma/schema.prisma`:
```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model CorpusDocument {
  id        String   @id @default(uuid())
  filename  String
  mimeType  String
  createdAt DateTime @default(now())
}
```

- [ ] **Step 4: Generate the client and run the first migration**

Run (from `apps/api/`):
```bash
pnpm prisma migrate dev --name init_corpus_document
```
Expected: creates `prisma/migrations/<ts>_init_corpus_document/`, applies it, generates the client. Confirms "Your database is now in sync with your schema."

- [ ] **Step 5: Create the Prisma client singleton**

Create `apps/api/src/db.ts`:
```ts
import { PrismaClient } from "@prisma/client";

export const prisma = new PrismaClient();
```

- [ ] **Step 6: Write the failing repository test**

Create `apps/api/test/corpus.repository.test.ts`:
```ts
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { prisma } from "../src/db.js";
import { createDocument, listDocuments } from "../src/repositories/corpus.js";

beforeEach(async () => {
  await prisma.corpusDocument.deleteMany();
});
afterAll(async () => {
  await prisma.$disconnect();
});

describe("corpus repository", () => {
  it("creates a document and returns it with id + createdAt", async () => {
    const doc = await createDocument({ filename: "a.pdf", mimeType: "application/pdf" });
    expect(doc.id).toBeTruthy();
    expect(doc.filename).toBe("a.pdf");
    expect(doc.createdAt).toBeInstanceOf(Date);
  });

  it("lists documents newest first", async () => {
    await createDocument({ filename: "first.pdf", mimeType: "application/pdf" });
    await createDocument({ filename: "second.pdf", mimeType: "application/pdf" });
    const docs = await listDocuments();
    expect(docs.map((d) => d.filename)).toEqual(["second.pdf", "first.pdf"]);
  });
});
```

- [ ] **Step 7: Run the test to verify it fails**

Run:
```bash
pnpm --filter @tailor/api test corpus.repository
```
Expected: FAIL — cannot resolve `../src/repositories/corpus.js`.

- [ ] **Step 8: Implement the repository**

Create `apps/api/src/repositories/corpus.ts`:
```ts
import { prisma } from "../db.js";
import type { CreateCorpusDocument } from "@tailor/contracts";

export async function createDocument(input: CreateCorpusDocument) {
  return prisma.corpusDocument.create({ data: input });
}

export async function listDocuments() {
  return prisma.corpusDocument.findMany({ orderBy: { createdAt: "desc" } });
}
```

- [ ] **Step 9: Run the test to verify it passes**

Run:
```bash
pnpm --filter @tailor/api test corpus.repository
```
Expected: PASS — both repository tests pass.

- [ ] **Step 10: Commit**

Run:
```bash
git add -A && git commit -m "feat(api): add prisma schema + corpus repository"
```

---

## Task 5: Corpus API routes (POST + GET)

**Files:**
- Create: `apps/api/src/routes/corpus.ts`
- Modify: `apps/api/src/server.ts` (register the new routes)
- Test: `apps/api/test/corpus.routes.test.ts`

- [ ] **Step 1: Write the failing routes test**

Create `apps/api/test/corpus.routes.test.ts`:
```ts
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { buildServer } from "../src/server.js";
import { prisma } from "../src/db.js";
import { CorpusDocument, CorpusDocumentList } from "@tailor/contracts";

const app = buildServer();

beforeEach(async () => {
  await prisma.corpusDocument.deleteMany();
});
afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
});

describe("POST /corpus/documents", () => {
  it("creates a document and returns it matching the contract", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/corpus/documents",
      payload: { filename: "resume.pdf", mimeType: "application/pdf" },
    });
    expect(res.statusCode).toBe(201);
    // Throws if the response does not satisfy the shared contract:
    const doc = CorpusDocument.parse(res.json());
    expect(doc.filename).toBe("resume.pdf");
  });

  it("rejects an invalid payload with 400", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/corpus/documents",
      payload: { filename: "", mimeType: "application/pdf" },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe("GET /corpus/documents", () => {
  it("returns a list matching the contract", async () => {
    await app.inject({
      method: "POST",
      url: "/corpus/documents",
      payload: { filename: "a.pdf", mimeType: "application/pdf" },
    });
    const res = await app.inject({ method: "GET", url: "/corpus/documents" });
    expect(res.statusCode).toBe(200);
    const list = CorpusDocumentList.parse(res.json());
    expect(list).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:
```bash
pnpm --filter @tailor/api test corpus.routes
```
Expected: FAIL — `/corpus/documents` returns 404 (route not registered).

- [ ] **Step 3: Implement the routes**

Create `apps/api/src/routes/corpus.ts`:
```ts
import type { FastifyInstance } from "fastify";
import { CreateCorpusDocument } from "@tailor/contracts";
import { createDocument, listDocuments } from "../repositories/corpus.js";

/** Prisma returns Date objects; the contract expects ISO strings. */
function serialize(doc: { id: string; filename: string; mimeType: string; createdAt: Date }) {
  return { ...doc, createdAt: doc.createdAt.toISOString() };
}

export async function corpusRoutes(app: FastifyInstance) {
  app.post("/corpus/documents", async (request, reply) => {
    const parsed = CreateCorpusDocument.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten() });
    }
    const doc = await createDocument(parsed.data);
    return reply.status(201).send(serialize(doc));
  });

  app.get("/corpus/documents", async () => {
    const docs = await listDocuments();
    return docs.map(serialize);
  });
}
```

- [ ] **Step 4: Register the routes in the server factory**

In `apps/api/src/server.ts`, replace the file contents with:
```ts
import Fastify, { type FastifyInstance } from "fastify";
import { healthRoutes } from "./routes/health.js";
import { corpusRoutes } from "./routes/corpus.js";

export function buildServer(): FastifyInstance {
  const app = Fastify({ logger: false });
  app.register(healthRoutes);
  app.register(corpusRoutes);
  return app;
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run:
```bash
pnpm --filter @tailor/api test corpus.routes
```
Expected: PASS — all 3 route tests pass.

- [ ] **Step 6: Run the full api suite**

Run:
```bash
pnpm --filter @tailor/api test
```
Expected: PASS — health, repository, and routes tests all green.

- [ ] **Step 7: Commit**

Run:
```bash
git add -A && git commit -m "feat(api): add corpus documents POST/GET routes"
```

---

## Task 6: Web scaffold + corpus list/create UI

**Files:**
- Create: `apps/web/package.json`, `apps/web/tsconfig.json`, `apps/web/next.config.mjs`, `apps/web/vitest.config.ts`, `apps/web/vitest.setup.ts`, `apps/web/src/lib/api.ts`, `apps/web/src/components/DocumentList.tsx`, `apps/web/src/app/layout.tsx`, `apps/web/src/app/page.tsx`
- Test: `apps/web/test/DocumentList.test.tsx`, `apps/web/test/api.test.ts`

- [ ] **Step 1: Create the web manifest**

Create `apps/web/package.json`:
```json
{
  "name": "@tailor/web",
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "next dev -p 3000",
    "build": "next build",
    "start": "next start -p 3000",
    "test": "vitest run"
  },
  "dependencies": {
    "@tailor/contracts": "workspace:*",
    "next": "^14.2.0",
    "react": "^18.3.0",
    "react-dom": "^18.3.0"
  },
  "devDependencies": {
    "@testing-library/jest-dom": "^6.4.0",
    "@testing-library/react": "^16.0.0",
    "@types/react": "^18.3.0",
    "@types/react-dom": "^18.3.0",
    "jsdom": "^24.1.0",
    "vitest": "^1.6.0",
    "typescript": "^5.4.0"
  }
}
```

- [ ] **Step 2: Create the web tsconfig**

Create `apps/web/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "jsx": "preserve",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "noEmit": true,
    "plugins": [{ "name": "next" }]
  },
  "include": ["src", "test", "next-env.d.ts"]
}
```

- [ ] **Step 3: Create Next + Vitest config**

Create `apps/web/next.config.mjs`:
```js
/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // @tailor/contracts ships raw TypeScript; Next must transpile it.
  transpilePackages: ["@tailor/contracts"],
};
export default nextConfig;
```

Create `apps/web/vitest.config.ts`:
```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
    include: ["test/**/*.test.{ts,tsx}"],
  },
});
```

Create `apps/web/vitest.setup.ts`:
```ts
import "@testing-library/jest-dom/vitest";
```

- [ ] **Step 4: Install dependencies**

Run:
```bash
pnpm install
```
Expected: installs next, react, testing-library, jsdom, vitest for `@tailor/web`.

- [ ] **Step 5: Write the failing component test**

Create `apps/web/test/DocumentList.test.tsx`:
```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { DocumentList } from "../src/components/DocumentList.js";
import type { CorpusDocument } from "@tailor/contracts";

const docs: CorpusDocument[] = [
  { id: "11111111-1111-1111-1111-111111111111", filename: "resume.pdf", mimeType: "application/pdf", createdAt: "2026-05-29T00:00:00.000Z" },
];

describe("DocumentList", () => {
  it("renders each document filename", () => {
    render(<DocumentList documents={docs} />);
    expect(screen.getByText("resume.pdf")).toBeInTheDocument();
  });

  it("shows an empty state when there are no documents", () => {
    render(<DocumentList documents={[]} />);
    expect(screen.getByText(/no documents yet/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 6: Run the test to verify it fails**

Run:
```bash
pnpm --filter @tailor/web test DocumentList
```
Expected: FAIL — cannot resolve `../src/components/DocumentList.js`.

- [ ] **Step 7: Implement the presentational component**

Create `apps/web/src/components/DocumentList.tsx`:
```tsx
import type { CorpusDocument } from "@tailor/contracts";

export function DocumentList({ documents }: { documents: CorpusDocument[] }) {
  if (documents.length === 0) {
    return <p>No documents yet.</p>;
  }
  return (
    <ul>
      {documents.map((doc) => (
        <li key={doc.id}>{doc.filename}</li>
      ))}
    </ul>
  );
}
```

- [ ] **Step 8: Run the test to verify it passes**

Run:
```bash
pnpm --filter @tailor/web test DocumentList
```
Expected: PASS — both component tests pass.

- [ ] **Step 9: Write the failing api-client test**

Create `apps/web/test/api.test.ts`:
```ts
import { describe, it, expect, vi, afterEach } from "vitest";
import { fetchDocuments, createDocumentRequest } from "../src/lib/api.js";

afterEach(() => vi.restoreAllMocks());

describe("api client", () => {
  it("fetchDocuments returns parsed documents", async () => {
    const payload = [
      { id: "11111111-1111-1111-1111-111111111111", filename: "a.pdf", mimeType: "application/pdf", createdAt: "2026-05-29T00:00:00.000Z" },
    ];
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(payload), { status: 200 })));
    const docs = await fetchDocuments();
    expect(docs[0].filename).toBe("a.pdf");
  });

  it("createDocumentRequest posts to the right URL with JSON body", async () => {
    const created = { id: "22222222-2222-2222-2222-222222222222", filename: "b.pdf", mimeType: "application/pdf", createdAt: "2026-05-29T00:00:00.000Z" };
    const spy = vi.fn(async () => new Response(JSON.stringify(created), { status: 201 }));
    vi.stubGlobal("fetch", spy);
    const doc = await createDocumentRequest({ filename: "b.pdf", mimeType: "application/pdf" });
    expect(doc.id).toBe(created.id);
    const [url, init] = spy.mock.calls[0];
    expect(String(url)).toMatch(/\/corpus\/documents$/);
    expect(init?.method).toBe("POST");
  });
});
```

- [ ] **Step 10: Run the test to verify it fails**

Run:
```bash
pnpm --filter @tailor/web test api
```
Expected: FAIL — cannot resolve `../src/lib/api.js`.

- [ ] **Step 11: Implement the typed api client**

Create `apps/web/src/lib/api.ts`:
```ts
import {
  CorpusDocument,
  CorpusDocumentList,
  type CreateCorpusDocument,
} from "@tailor/contracts";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export async function fetchDocuments() {
  const res = await fetch(`${BASE}/corpus/documents`, { cache: "no-store" });
  if (!res.ok) throw new Error(`fetchDocuments failed: ${res.status}`);
  return CorpusDocumentList.parse(await res.json());
}

export async function createDocumentRequest(input: CreateCorpusDocument) {
  const res = await fetch(`${BASE}/corpus/documents`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(`createDocument failed: ${res.status}`);
  return CorpusDocument.parse(await res.json());
}
```

- [ ] **Step 12: Run the test to verify it passes**

Run:
```bash
pnpm --filter @tailor/web test api
```
Expected: PASS — both api-client tests pass.

- [ ] **Step 13: Create the layout and page**

Create `apps/web/src/app/layout.tsx`:
```tsx
export const metadata = { title: "TAILOR" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
```

Create `apps/web/src/app/page.tsx`:
```tsx
import { fetchDocuments } from "../lib/api.js";
import { DocumentList } from "../components/DocumentList.js";

export const dynamic = "force-dynamic";

export default async function Page() {
  const documents = await fetchDocuments();
  return (
    <main style={{ maxWidth: 640, margin: "40px auto", fontFamily: "system-ui" }}>
      <h1>TAILOR — your cloth</h1>
      <p>Documents in your corpus:</p>
      <DocumentList documents={documents} />
    </main>
  );
}
```

- [ ] **Step 14: Run the full web suite**

Run:
```bash
pnpm --filter @tailor/web test
```
Expected: PASS — DocumentList + api-client tests all green.

- [ ] **Step 15: Commit**

Run:
```bash
git add -A && git commit -m "feat(web): scaffold next app with corpus list + api client"
```

---

## Task 7: End-to-end smoke test + README

**Files:**
- Create: `README.md`
- Verify: the full stack runs and the page shows a created document

- [ ] **Step 1: Write the README**

Create `tailor/README.md`:
```markdown
# TAILOR

Job-specific resumes, cut only from cloth you actually own.
See the design spec: `docs/specs/2026-05-29-tailor-design.html`.

## Prerequisites
- Node 20+, pnpm 9+, Docker

## Run locally
```bash
pnpm install
docker compose up -d                     # start Postgres
cp .env.example apps/api/.env            # if not already present
pnpm --filter @tailor/api prisma migrate dev   # apply migrations
pnpm --filter @tailor/api dev            # api on :4000
pnpm --filter @tailor/web dev            # web on :3000 (separate terminal)
```
Open http://localhost:3000.

## Test
```bash
pnpm test        # all workspaces
```
```

- [ ] **Step 2: Start the database (if not running)**

Run:
```bash
docker compose up -d && pnpm --filter @tailor/api prisma migrate dev
```
Expected: Postgres up, migrations applied / already in sync.

- [ ] **Step 3: Start the API and create a document via curl**

In one terminal:
```bash
pnpm --filter @tailor/api dev
```
Expected: `api listening on :4000`. In another terminal:
```bash
curl -s -X POST http://localhost:4000/corpus/documents \
  -H 'content-type: application/json' \
  -d '{"filename":"resume_2021.pdf","mimeType":"application/pdf"}'
```
Expected: JSON with `id`, `filename`, `mimeType`, `createdAt` (HTTP 201).

- [ ] **Step 4: Start the web app and verify the document renders**

In another terminal:
```bash
pnpm --filter @tailor/web dev
```
Expected: Next.js on :3000. Open http://localhost:3000 — the page lists `resume_2021.pdf` under "Documents in your corpus".

- [ ] **Step 5: Run the entire test suite from the root**

Run (from `tailor/`):
```bash
pnpm test
```
Expected: PASS — contracts, api, and web suites all green.

- [ ] **Step 6: Final commit**

Run:
```bash
git add -A && git commit -m "docs: add README and verify walking skeleton end-to-end"
```

---

## Definition of Done (Plan 1)

- [ ] `pnpm test` passes across `@tailor/contracts`, `@tailor/api`, `@tailor/web`.
- [ ] A document POSTed to the API appears on the Next.js page.
- [ ] Request/response shapes flow through `@tailor/contracts` zod schemas on both sides (no duplicated type definitions).
- [ ] Repository is the only module touching Prisma; routes are the only modules touching HTTP.
- [ ] All work committed.

When done, the next document is **Plan 2: Ingestion & The Form** (real file upload, parsing, evidence-unit extraction, canonicalization).
