# TAILOR — Plan 2 (Convex): Ingestion & The Form

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Depends on** Plan 1 (`docs/plans/2026-06-03-tailor-convex-foundation.md`) — the Convex project, `corpusDocuments` table, and `documents.ts` functions must already exist and tests must be green.

**Goal:** Turn the metadata-only corpus from Plan 1 into a real ingestion pipeline: upload many files to Convex file storage, parse them (PDF/DOCX/text) into clean text, extract atomic **evidence units** (threads), **canonicalize** them into the Form (deduped threads, resolved roles, grouped skills), and browse it all in a FormExplorer UI.

**Architecture:** Convex file storage holds raw bytes. A `"use node"` action parses each file and writes back `parsedText` + status. Two more actions call an LLM **behind provider-agnostic interfaces** — an `Extractor` (text → evidence units) and a `Canonicalizer` (evidence units → merged threads/roles/skills). The LLM is isolated in thin adapters so the deterministic plumbing (mutations, dispatch, dedup bookkeeping) is unit-tested with `convex-test` and a fake LLM, while extraction/canonicalization *quality* is validated separately by the §19 seed fixtures. Spec coverage: §3 step 1, §4 canonicalization, §13 upload failure handling.

**Tech Stack:** Convex 1.40+ (file storage, `"use node"` actions, internal functions, scheduler), `pdf-parse` + `mammoth` for parsing, `@anthropic-ai/sdk` (reference adapter — see note), Vitest + `convex-test` with injected fakes, Next.js App Router for FormExplorer.

> **Model note (§18):** parse/extract/canonicalize default to **Gemini 3 Flash** (current keys). Provider, key, and model are all chosen by env vars on the Convex **deployment** via a factory (`convex/llm/index.ts`): `LLM_PROVIDER` (`gemini`|`anthropic`, default `gemini`), `GEMINI_API_KEY`/`ANTHROPIC_API_KEY`, and optional `LLM_MODEL`. Both providers implement the same `Extractor`/`Canonicalizer` interfaces, so **swapping a key or an entire provider is a config change, never a code change** — mutations, actions, and tests are untouched. Keys live on the deployment (`npx convex env set`), not in `.env`/`.env.local`, because these functions run server-side on Convex.

> **Agnostic guard (§19):** none of the extraction/canonicalization prompts may be tuned to favor any single profile (including the author's). Validate against the diverse fixture roster, never one corpus.

---

## File Structure (added in Plan 2)

```
tailor/
├── convex/
│   ├── schema.ts                      # MODIFY: extend corpusDocuments; add evidenceUnits, evidenceProvenance, canonicalRoles, canonicalSkills
│   ├── documents.ts                   # MODIFY: add generateUploadUrl, recordDocument, setParsed, setFailed, internal getters
│   ├── parse.ts                       # NEW: "use node" action — parse bytes → text (pdf/docx/text)
│   ├── parsing/
│   │   ├── extractText.ts             # NEW: pure mimeType→text dispatch (testable without Convex)
│   │   └── extractText.test.ts        # NEW
│   ├── extract.ts                     # NEW: action — parsedText → evidence units (via Extractor)
│   ├── canonicalize.ts                # NEW: action — evidence units → Form (via Canonicalizer)
│   ├── form.ts                        # NEW: queries powering FormExplorer (roles → threads → skills)
│   ├── form.test.ts                   # NEW: evidence insertion + provenance + canonical write tests
│   ├── llm/
│   │   ├── types.ts                   # NEW: Extractor / Canonicalizer interfaces + payload types
│   │   ├── fake.ts                    # NEW: deterministic fakes for tests
│   │   ├── gemini.ts                  # NEW: Gemini adapter (default provider)
│   │   ├── anthropic.ts               # NEW: Anthropic adapter (alternate)
│   │   └── index.ts                   # NEW: provider factory — env-driven key/provider swap
│   └── documents.test.ts              # MODIFY: cover recordDocument/setParsed/setFailed
├── app/
│   ├── components/
│   │   ├── ClothUploader.tsx          # NEW: multi-file drag-drop → storage
│   │   ├── FormExplorer.tsx           # NEW: roles → threads → grouped skills + provenance
│   │   └── FormExplorer.test.tsx      # NEW
│   └── form/
│       └── page.tsx                   # NEW: /form route rendering FormExplorer
```

**Responsibility boundaries:** raw bytes live only in storage; `parse.ts` is the only `"use node"` module; the LLM lives only in `convex/llm/*`; mutations in `documents.ts`/`form.ts` own all `ctx.db` writes; actions orchestrate and never write `ctx.db` directly (they `runMutation`).

---

## Task 1: Extend the schema for ingestion + the Form

**Files:**
- Modify: `convex/schema.ts`

- [ ] **Step 1: Replace `convex/schema.ts`**

```ts
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

// Ingestion status for a single uploaded file (the "Bolt of cloth").
export const docStatus = v.union(
  v.literal("uploaded"),
  v.literal("parsed"),
  v.literal("failed"),
);

export default defineSchema({
  // The Cloth: one uploaded file. Raw bytes live in Convex storage (storageId).
  corpusDocuments: defineTable({
    filename: v.string(),
    mimeType: v.string(),
    storageId: v.optional(v.id("_storage")),
    status: docStatus,
    parsedText: v.optional(v.string()),
    error: v.optional(v.string()),
  }),

  // The Form — canonical roles (entity-resolution output).
  canonicalRoles: defineTable({
    employer: v.string(),
    title: v.string(),
    startDate: v.optional(v.string()),
    endDate: v.optional(v.string()),
  }),

  // The Form — grouped skills (surface variants collapsed).
  canonicalSkills: defineTable({
    name: v.string(),
    variants: v.array(v.string()),
  }),

  // Thread: an atomic, deduped real claim.
  evidenceUnits: defineTable({
    text: v.string(),
    roleId: v.optional(v.id("canonicalRoles")),
  }).index("by_role", ["roleId"]),

  // Provenance: which document(s) a thread was pulled from (M:N — a merged
  // thread keeps every source link). The trust spine of §2/§6.
  evidenceProvenance: defineTable({
    evidenceId: v.id("evidenceUnits"),
    documentId: v.id("corpusDocuments"),
  })
    .index("by_evidence", ["evidenceId"])
    .index("by_document", ["documentId"]),
});
```

- [ ] **Step 2: Push schema + regen types**

Run:
```bash
npx convex dev --once
```
Expected: "Convex functions ready". (Plan 1 inserted `corpusDocuments` rows without `status`; if the dev deployment has old rows, clear them: `npx convex run --no-push documents:list '{}'` to inspect, then delete via the dashboard, or just use a fresh deployment — Plan 1 data is disposable.)

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "feat(convex): extend schema for ingestion + the Form"
```

---

## Task 2: Upload to storage + record the document (TDD)

**Files:**
- Modify: `convex/documents.ts`, `convex/documents.test.ts`

- [ ] **Step 1: Update the failing test** — replace `convex/documents.test.ts` with:

```ts
/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.*s");

test("recordDocument stores filename + mimeType with status 'uploaded'", async () => {
  const t = convexTest(schema, modules);
  const id = await t.mutation(api.documents.recordDocument, {
    filename: "resume_2021.pdf",
    mimeType: "application/pdf",
  });
  const doc = await t.run(async (ctx) => ctx.db.get(id));
  expect(doc?.filename).toBe("resume_2021.pdf");
  expect(doc?.status).toBe("uploaded");
});

test("setParsed records text and flips status to 'parsed'", async () => {
  const t = convexTest(schema, modules);
  const id = await t.mutation(api.documents.recordDocument, {
    filename: "a.txt",
    mimeType: "text/plain",
  });
  await t.mutation(internal.documents.setParsed, { documentId: id, parsedText: "hello world" });
  const doc = await t.run(async (ctx) => ctx.db.get(id));
  expect(doc?.status).toBe("parsed");
  expect(doc?.parsedText).toBe("hello world");
});

test("setFailed records an error and flips status to 'failed' (keeps the row, §13)", async () => {
  const t = convexTest(schema, modules);
  const id = await t.mutation(api.documents.recordDocument, {
    filename: "broken.pdf",
    mimeType: "application/pdf",
  });
  await t.mutation(internal.documents.setFailed, { documentId: id, error: "unparseable" });
  const doc = await t.run(async (ctx) => ctx.db.get(id));
  expect(doc?.status).toBe("failed");
  expect(doc?.error).toBe("unparseable");
});
```

- [ ] **Step 2: Run to verify failure**

```bash
npx vitest run convex/documents.test.ts
```
Expected: FAIL — `recordDocument` / `setParsed` / `setFailed` don't exist.

- [ ] **Step 3: Replace `convex/documents.ts`**

```ts
import { mutation, query, internalMutation } from "./_generated/server";
import { v } from "convex/values";

/** List corpus documents, newest first. */
export const list = query({
  args: {},
  handler: async (ctx) => ctx.db.query("corpusDocuments").order("desc").collect(),
});

/** Step 1 of upload: hand the client a short-lived URL to POST file bytes to. */
export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => ctx.storage.generateUploadUrl(),
});

/**
 * Step 2 of upload: record the document row (status "uploaded") and kick off
 * parsing. `storageId` is optional so non-file callers/tests can omit it.
 */
export const recordDocument = mutation({
  args: {
    filename: v.string(),
    mimeType: v.string(),
    storageId: v.optional(v.id("_storage")),
  },
  handler: async (ctx, args) => {
    if (args.filename.trim().length === 0) {
      throw new Error("filename must not be empty");
    }
    const documentId = await ctx.db.insert("corpusDocuments", {
      filename: args.filename,
      mimeType: args.mimeType,
      storageId: args.storageId,
      status: "uploaded",
    });
    // Parse asynchronously (only when there are real bytes to read).
    if (args.storageId) {
      await ctx.scheduler.runAfter(0, (await import("./_generated/api")).internal.parse.parseDocument, {
        documentId,
      });
    }
    return documentId;
  },
});

/** Mark a document parsed and store its clean text. */
export const setParsed = internalMutation({
  args: { documentId: v.id("corpusDocuments"), parsedText: v.string() },
  handler: async (ctx, { documentId, parsedText }) => {
    await ctx.db.patch(documentId, { status: "parsed", parsedText, error: undefined });
  },
});

/** Mark a document failed but keep the row so the rest of the corpus survives (§13). */
export const setFailed = internalMutation({
  args: { documentId: v.id("corpusDocuments"), error: v.string() },
  handler: async (ctx, { documentId, error }) => {
    await ctx.db.patch(documentId, { status: "failed", error });
  },
});

/** Internal getter used by the parse action. */
export const getDocument = internalMutation({
  args: { documentId: v.id("corpusDocuments") },
  handler: async (ctx, { documentId }) => ctx.db.get(documentId),
});
```

> Note: the dynamic `import("./_generated/api")` avoids a require cycle between `documents.ts` and `parse.ts`. If your codegen exposes `internal` cleanly without a cycle, a top-level `import { internal } from "./_generated/api"` is fine — switch to it if the dynamic import lints poorly.

- [ ] **Step 4: Push + run tests green**

```bash
npx convex dev --once && npx vitest run convex/documents.test.ts
```
Expected: PASS — 3 tests. (The scheduler line is skipped in these tests because `storageId` is omitted.)

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(convex): upload url + record/setParsed/setFailed document mutations"
```

---

## Task 3: Pure text extraction (mimeType dispatch) (TDD)

**Files:**
- Create: `convex/parsing/extractText.ts`, `convex/parsing/extractText.test.ts`

- [ ] **Step 1: Write the failing test** — `convex/parsing/extractText.test.ts`:

```ts
import { describe, expect, test, vi } from "vitest";
import { extractText } from "./extractText";

describe("extractText", () => {
  test("returns decoded text for text/plain", async () => {
    const bytes = new TextEncoder().encode("Built Tableau dashboards.");
    const text = await extractText("text/plain", bytes.buffer as ArrayBuffer);
    expect(text).toBe("Built Tableau dashboards.");
  });

  test("delegates PDFs to the pdf parser", async () => {
    const pdf = vi.fn(async () => ({ text: "pdf text" }));
    const text = await extractText("application/pdf", new ArrayBuffer(8), { pdf });
    expect(text).toBe("pdf text");
    expect(pdf).toHaveBeenCalledOnce();
  });

  test("throws on an unsupported mime type", async () => {
    await expect(extractText("image/png", new ArrayBuffer(1))).rejects.toThrow(/unsupported/i);
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
npx vitest run convex/parsing/extractText.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 3: Implement** — `convex/parsing/extractText.ts`:

```ts
// Pure, Convex-free text extraction so it is unit-testable without a runtime.
// Parsers are injectable for tests; the action (parse.ts) passes the real ones.
type PdfParser = (buf: Buffer) => Promise<{ text: string }>;
type DocxParser = (input: { buffer: Buffer }) => Promise<{ value: string }>;

export interface Parsers {
  pdf?: PdfParser;
  docx?: DocxParser;
}

export async function extractText(
  mimeType: string,
  bytes: ArrayBuffer,
  parsers: Parsers = {},
): Promise<string> {
  const buf = Buffer.from(bytes);
  if (mimeType === "text/plain" || mimeType.startsWith("text/")) {
    return new TextDecoder().decode(bytes).trim();
  }
  if (mimeType === "application/pdf") {
    if (!parsers.pdf) throw new Error("no pdf parser provided");
    return (await parsers.pdf(buf)).text.trim();
  }
  if (
    mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    if (!parsers.docx) throw new Error("no docx parser provided");
    return (await parsers.docx({ buffer: buf })).value.trim();
  }
  throw new Error(`unsupported mime type: ${mimeType}`);
}
```

- [ ] **Step 4: Run tests green**

```bash
npx vitest run convex/parsing/extractText.test.ts
```
Expected: PASS — 3 tests.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(convex): pure mimeType→text extraction with injectable parsers"
```

---

## Task 4: The parse action (`"use node"`)

**Files:**
- Create: `convex/parse.ts`
- Modify: `package.json` (add `pdf-parse`, `mammoth`)

> This action is exercised end-to-end in Task 8; its pure core was already tested in Task 3. We keep it thin (no business logic) so it needs no isolated unit test.

- [ ] **Step 1: Install parsers**

```bash
npm install pdf-parse mammoth
```

- [ ] **Step 2: Implement** — `convex/parse.ts`:

```ts
"use node";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import pdf from "pdf-parse";
import mammoth from "mammoth";
import { extractText } from "./parsing/extractText";

/** Read a stored file, extract text, and write it back. Never throws past §13. */
export const parseDocument = internalAction({
  args: { documentId: v.id("corpusDocuments") },
  handler: async (ctx, { documentId }) => {
    const doc = await ctx.runMutation(internal.documents.getDocument, { documentId });
    if (!doc || !doc.storageId) {
      await ctx.runMutation(internal.documents.setFailed, { documentId, error: "no stored file" });
      return;
    }
    try {
      const blob = await ctx.storage.get(doc.storageId);
      if (!blob) throw new Error("file missing from storage");
      const bytes = await blob.arrayBuffer();
      const text = await extractText(doc.mimeType, bytes, {
        pdf: async (buf) => pdf(buf),
        docx: async ({ buffer }) => mammoth.extractRawText({ buffer }),
      });
      if (text.length === 0) throw new Error("empty after parse");
      await ctx.runMutation(internal.documents.setParsed, { documentId, parsedText: text });
    } catch (e) {
      await ctx.runMutation(internal.documents.setFailed, {
        documentId,
        error: e instanceof Error ? e.message : "parse failed",
      });
    }
  },
});
```

- [ ] **Step 3: Push (typecheck) + commit**

```bash
npx convex dev --once
git add -A && git commit -m "feat(convex): node parse action (pdf/docx/text) with §13 failure handling"
```
Expected: "Convex functions ready" with no type errors.

---

## Task 5: The LLM layer — interfaces, fakes, swappable provider adapters

**Files:**
- Create: `convex/llm/types.ts`, `convex/llm/fake.ts`, `convex/llm/gemini.ts`, `convex/llm/anthropic.ts`, `convex/llm/index.ts`

> **Keys/providers swap via env, never code.** The factory in `index.ts` reads `LLM_PROVIDER` (default `gemini`), the matching API key, and optional `LLM_MODEL`, and returns the right adapter — both implement the same interfaces, so nothing downstream changes.

- [ ] **Step 1: Define interfaces** — `convex/llm/types.ts`:

```ts
/** One atomic claim the Extractor pulls from a single document's text. */
export interface RawEvidence {
  text: string;
}

/** A merged thread the Canonicalizer produced from many RawEvidence items. */
export interface CanonicalThread {
  text: string;
  // 0-based indices into the input evidence array that this thread merges.
  sourceIndices: number[];
  employer?: string;
  title?: string;
}

export interface CanonicalSkill {
  name: string;
  variants: string[];
}

export interface CanonicalResult {
  threads: CanonicalThread[];
  roles: { employer: string; title: string; startDate?: string; endDate?: string }[];
  skills: CanonicalSkill[];
}

/** text → atomic evidence units. Provider-agnostic (Gemini/Claude per §18). */
export interface Extractor {
  extract(documentText: string): Promise<RawEvidence[]>;
}

/** many evidence units (across docs) → the canonical Form (§4). */
export interface Canonicalizer {
  canonicalize(evidence: { text: string }[]): Promise<CanonicalResult>;
}
```

- [ ] **Step 2: Deterministic fakes** — `convex/llm/fake.ts`:

```ts
import type { Canonicalizer, CanonicalResult, Extractor, RawEvidence } from "./types";

/** Splits text into one evidence unit per non-empty line. */
export class FakeExtractor implements Extractor {
  async extract(documentText: string): Promise<RawEvidence[]> {
    return documentText
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0)
      .map((text) => ({ text }));
  }
}

/** Merges exact-duplicate evidence texts into one thread (deterministic dedup). */
export class FakeCanonicalizer implements Canonicalizer {
  async canonicalize(evidence: { text: string }[]): Promise<CanonicalResult> {
    const byText = new Map<string, number[]>();
    evidence.forEach((e, i) => {
      const key = e.text.trim();
      byText.set(key, [...(byText.get(key) ?? []), i]);
    });
    const threads = [...byText.entries()].map(([text, sourceIndices]) => ({ text, sourceIndices }));
    return { threads, roles: [], skills: [] };
  }
}
```

- [ ] **Step 3: Alternate adapter (Anthropic)** — `convex/llm/anthropic.ts`:

```ts
// Reference adapter. §18 routes extract/canonicalize to Gemini 3 Flash at scale;
// the interfaces are provider-agnostic, so swapping providers is this file only.
import Anthropic from "@anthropic-ai/sdk";
import type {
  Canonicalizer,
  CanonicalResult,
  Extractor,
  RawEvidence,
} from "./types";

const client = () => new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL = process.env.LLM_MODEL ?? "claude-haiku-4-5-20251001"; // cheap, structured-output capable

function jsonFrom(text: string): unknown {
  const match = text.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
  if (!match) throw new Error("no JSON found in model output");
  return JSON.parse(match[0]);
}

export class ClaudeExtractor implements Extractor {
  async extract(documentText: string): Promise<RawEvidence[]> {
    const res = await client().messages.create({
      model: MODEL,
      max_tokens: 4096,
      system:
        "Extract atomic, factual claims from this resume/career document. " +
        "Each claim is one real thing the person did — no inference, no embellishment. " +
        'Return ONLY a JSON array of objects: [{"text": "..."}].',
      messages: [{ role: "user", content: documentText }],
    });
    const block = res.content.find((b) => b.type === "text");
    const arr = jsonFrom(block && "text" in block ? block.text : "[]") as RawEvidence[];
    return arr.filter((e) => e?.text?.trim());
  }
}

export class ClaudeCanonicalizer implements Canonicalizer {
  async canonicalize(evidence: { text: string }[]): Promise<CanonicalResult> {
    const res = await client().messages.create({
      model: MODEL,
      max_tokens: 8192,
      system:
        "You are canonicalizing a career corpus (§4). Given many evidence units " +
        "(some are restatements of the same fact across documents), produce the Form: " +
        "(1) merge restatements into one thread, recording the 0-based input indices it merges; " +
        "(2) resolve roles (employer/title/dates); (3) group skill surface-variants. " +
        "ONLY organize — never add facts. Return ONLY JSON: " +
        '{"threads":[{"text","sourceIndices":[],"employer?","title?"}],' +
        '"roles":[{"employer","title","startDate?","endDate?"}],' +
        '"skills":[{"name","variants":[]}]}.',
      messages: [{ role: "user", content: JSON.stringify(evidence.map((e, i) => ({ i, text: e.text }))) }],
    });
    const block = res.content.find((b) => b.type === "text");
    return jsonFrom(block && "text" in block ? block.text : "{}") as CanonicalResult;
  }
}
```

- [ ] **Step 4: Default adapter (Gemini)** — `convex/llm/gemini.ts`:

```ts
import { GoogleGenAI } from "@google/genai";
import type { Canonicalizer, CanonicalResult, Extractor, RawEvidence } from "./types";

const MODEL = process.env.LLM_MODEL ?? "gemini-flash-latest"; // verify current id; §18 = Gemini 3 Flash
const client = () => new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

async function jsonCall(system: string, user: string): Promise<unknown> {
  const res = await client().models.generateContent({
    model: MODEL,
    contents: user,
    config: { systemInstruction: system, responseMimeType: "application/json", temperature: 0 },
  });
  return JSON.parse(res.text ?? "");
}

export class GeminiExtractor implements Extractor {
  async extract(documentText: string): Promise<RawEvidence[]> {
    const arr = (await jsonCall(
      "Extract atomic, factual claims from this resume/career document. Each claim is one real thing the person did — no inference, no embellishment. Return a JSON array: [{\"text\": \"...\"}].",
      documentText,
    )) as RawEvidence[];
    return (arr ?? []).filter((e) => e?.text?.trim());
  }
}

export class GeminiCanonicalizer implements Canonicalizer {
  async canonicalize(evidence: { text: string }[]): Promise<CanonicalResult> {
    return (await jsonCall(
      "Canonicalize a career corpus (§4). Given many evidence units (some restate the same fact across documents): (1) merge restatements into one thread, recording the 0-based input indices it merges; (2) resolve roles (employer/title/dates); (3) group skill surface-variants. ONLY organize — never add facts. Return JSON {\"threads\":[{\"text\",\"sourceIndices\":[],\"employer?\",\"title?\"}],\"roles\":[{\"employer\",\"title\",\"startDate?\",\"endDate?\"}],\"skills\":[{\"name\",\"variants\":[]}]}.",
      JSON.stringify(evidence.map((e, i) => ({ i, text: e.text }))),
    )) as CanonicalResult;
  }
}
```

- [ ] **Step 5: Provider factory** — `convex/llm/index.ts`:

```ts
// Provider selection. Swap key/provider/model via Convex deployment env vars,
// not code: LLM_PROVIDER (gemini|anthropic), GEMINI_API_KEY/ANTHROPIC_API_KEY, LLM_MODEL.
import type { Canonicalizer, Extractor } from "./types";
import { GeminiCanonicalizer, GeminiExtractor } from "./gemini";
import { ClaudeCanonicalizer, ClaudeExtractor } from "./anthropic";

const provider = () => (process.env.LLM_PROVIDER ?? "gemini").toLowerCase();

export function getExtractor(): Extractor {
  return provider() === "anthropic" ? new ClaudeExtractor() : new GeminiExtractor();
}
export function getCanonicalizer(): Canonicalizer {
  return provider() === "anthropic" ? new ClaudeCanonicalizer() : new GeminiCanonicalizer();
}
export * from "./types";
```

- [ ] **Step 6: Install SDKs, push, commit**

```bash
npm install @google/genai @anthropic-ai/sdk
npx convex dev --once
git add -A && git commit -m "feat(convex): swappable Extractor/Canonicalizer (Gemini default, Anthropic alternate) + factory"
```

---

## Task 6: Evidence extraction + canonicalization mutations (TDD with fakes)

**Files:**
- Create: `convex/form.ts`, `convex/form.test.ts`

> We test the **mutations** (DB writes + provenance + canonical rebuild) deterministically with the fakes from Task 5. The actions that call the real LLM are thin wrappers added in Task 7.

- [ ] **Step 1: Write the failing test** — `convex/form.test.ts`:

```ts
/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.*s");

async function uploaded(t: ReturnType<typeof convexTest>, filename: string) {
  return t.mutation(api.documents.recordDocument, { filename, mimeType: "text/plain" });
}

test("addEvidence inserts one thread per item with provenance to its document", async () => {
  const t = convexTest(schema, modules);
  const docId = await uploaded(t, "resume.txt");
  await t.mutation(internal.form.addEvidence, {
    documentId: docId,
    evidence: [{ text: "Built Tableau dashboards" }, { text: "Owned the billing service" }],
  });
  const threads = await t.query(api.form.listEvidence, {});
  expect(threads).toHaveLength(2);
  const prov = await t.run(async (ctx) =>
    ctx.db.query("evidenceProvenance").withIndex("by_document", (q) => q.eq("documentId", docId)).collect(),
  );
  expect(prov).toHaveLength(2);
});

test("rebuildForm merges duplicate evidence into one canonical thread (FakeCanonicalizer)", async () => {
  const t = convexTest(schema, modules);
  const a = await uploaded(t, "resumeA.txt");
  const b = await uploaded(t, "memo.txt");
  await t.mutation(internal.form.addEvidence, { documentId: a, evidence: [{ text: "Built Tableau dashboards" }] });
  await t.mutation(internal.form.addEvidence, { documentId: b, evidence: [{ text: "Built Tableau dashboards" }] });

  // rebuild using the deterministic fake (exact-duplicate merge)
  await t.mutation(internal.form.rebuildForm, {
    result: {
      threads: [{ text: "Built Tableau dashboards", sourceIndices: [0, 1] }],
      roles: [],
      skills: [],
    },
    // map input indices → the evidence ids they came from
    evidenceOrder: await t.query(api.form.evidenceIds, {}),
  });

  const threads = await t.query(api.form.listEvidence, {});
  expect(threads).toHaveLength(1);
  // the merged thread keeps BOTH source documents
  const prov = await t.run(async (ctx) =>
    ctx.db
      .query("evidenceProvenance")
      .withIndex("by_evidence", (q) => q.eq("evidenceId", threads[0]._id))
      .collect(),
  );
  expect(prov.map((p) => p.documentId).sort()).toEqual([a, b].sort());
});
```

- [ ] **Step 2: Run to verify failure**

```bash
npx vitest run convex/form.test.ts
```
Expected: FAIL — `form.addEvidence` / `rebuildForm` / `listEvidence` / `evidenceIds` don't exist.

- [ ] **Step 3: Implement** — `convex/form.ts`:

```ts
import { query, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";

/** All threads, for FormExplorer + tests. */
export const listEvidence = query({
  args: {},
  handler: async (ctx) => ctx.db.query("evidenceUnits").collect(),
});

/** Thread ids in stable creation order — lets a caller map LLM indices → ids. */
export const evidenceIds = query({
  args: {},
  handler: async (ctx) => {
    const units = await ctx.db.query("evidenceUnits").collect();
    return units.map((u) => u._id);
  },
});

/** Insert raw evidence for one document, each with a provenance edge. */
export const addEvidence = internalMutation({
  args: {
    documentId: v.id("corpusDocuments"),
    evidence: v.array(v.object({ text: v.string() })),
  },
  handler: async (ctx, { documentId, evidence }) => {
    for (const e of evidence) {
      const evidenceId = await ctx.db.insert("evidenceUnits", { text: e.text });
      await ctx.db.insert("evidenceProvenance", { evidenceId, documentId });
    }
  },
});

/**
 * Rebuild the Form from a Canonicalizer result. Replaces threads/roles/skills
 * with the merged set, preserving provenance by unioning the source threads'
 * documents onto each merged thread. `evidenceOrder` maps the canonicalizer's
 * 0-based input indices to the pre-merge evidenceUnit ids.
 */
export const rebuildForm = internalMutation({
  args: {
    evidenceOrder: v.array(v.id("evidenceUnits")),
    result: v.object({
      threads: v.array(
        v.object({
          text: v.string(),
          sourceIndices: v.array(v.number()),
          employer: v.optional(v.string()),
          title: v.optional(v.string()),
        }),
      ),
      roles: v.array(
        v.object({
          employer: v.string(),
          title: v.string(),
          startDate: v.optional(v.string()),
          endDate: v.optional(v.string()),
        }),
      ),
      skills: v.array(v.object({ name: v.string(), variants: v.array(v.string()) })),
    }),
  },
  handler: async (ctx, { evidenceOrder, result }) => {
    // 1. Snapshot provenance of the pre-merge threads, keyed by their id.
    const oldProv = new Map<string, Set<Id<"corpusDocuments">>>();
    for (const evidenceId of evidenceOrder) {
      const edges = await ctx.db
        .query("evidenceProvenance")
        .withIndex("by_evidence", (q) => q.eq("evidenceId", evidenceId))
        .collect();
      oldProv.set(evidenceId, new Set(edges.map((e) => e.documentId)));
    }
    // 2. Wipe old threads, provenance, roles, skills.
    for (const table of ["evidenceProvenance", "evidenceUnits", "canonicalRoles", "canonicalSkills"] as const) {
      for (const row of await ctx.db.query(table).collect()) await ctx.db.delete(row._id);
    }
    // 3. Write canonical roles + skills.
    const roleIdByKey = new Map<string, Id<"canonicalRoles">>();
    for (const r of result.roles) {
      const id = await ctx.db.insert("canonicalRoles", r);
      roleIdByKey.set(`${r.employer}|${r.title}`, id);
    }
    for (const s of result.skills) await ctx.db.insert("canonicalSkills", s);
    // 4. Write merged threads, unioning source-document provenance onto each.
    for (const th of result.threads) {
      const roleId = th.employer && th.title ? roleIdByKey.get(`${th.employer}|${th.title}`) : undefined;
      const evidenceId = await ctx.db.insert("evidenceUnits", { text: th.text, roleId });
      const docs = new Set<Id<"corpusDocuments">>();
      for (const idx of th.sourceIndices) {
        const oldId = evidenceOrder[idx];
        for (const d of oldProv.get(oldId) ?? []) docs.add(d);
      }
      for (const documentId of docs) await ctx.db.insert("evidenceProvenance", { evidenceId, documentId });
    }
  },
});
```

- [ ] **Step 4: Push + run tests green**

```bash
npx convex dev --once && npx vitest run convex/form.test.ts
```
Expected: PASS — 2 tests; the merged thread retains both source documents.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(convex): evidence insertion + provenance-preserving Form rebuild"
```

---

## Task 7: Wire the real LLM actions

**Files:**
- Create: `convex/extract.ts`, `convex/canonicalize.ts`

> Thin orchestration only. Quality is validated by the §19 fixtures (separate eval), not here.

- [ ] **Step 1: Implement** — `convex/extract.ts`:

```ts
"use node";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { getExtractor } from "./llm";

/** Extract evidence units from a parsed document, then trigger a Form rebuild. */
export const extractEvidence = internalAction({
  args: { documentId: v.id("corpusDocuments") },
  handler: async (ctx, { documentId }) => {
    const doc = await ctx.runMutation(internal.documents.getDocument, { documentId });
    if (!doc?.parsedText) return;
    const evidence = await getExtractor().extract(doc.parsedText);
    await ctx.runMutation(internal.form.addEvidence, { documentId, evidence });
    await ctx.scheduler.runAfter(0, internal.canonicalize.rebuild, {});
  },
});
```

- [ ] **Step 2: Implement** — `convex/canonicalize.ts`:

```ts
"use node";
import { internalAction } from "./_generated/server";
import { internal, api } from "./_generated/api";
import { getCanonicalizer } from "./llm";

/** Recompute the Form from all current evidence (§4). */
export const rebuild = internalAction({
  args: {},
  handler: async (ctx) => {
    const units = await ctx.runQuery(api.form.listEvidence, {});
    if (units.length === 0) return;
    const evidenceOrder = units.map((u) => u._id);
    const result = await getCanonicalizer().canonicalize(units.map((u) => ({ text: u.text })));
    await ctx.runMutation(internal.form.rebuildForm, { evidenceOrder, result });
  },
});
```

- [ ] **Step 3: Chain parse → extract** — in `convex/parse.ts`, after `setParsed`, schedule extraction. Replace the success line:

```ts
      await ctx.runMutation(internal.documents.setParsed, { documentId, parsedText: text });
```
with:
```ts
      await ctx.runMutation(internal.documents.setParsed, { documentId, parsedText: text });
      await ctx.scheduler.runAfter(0, internal.extract.extractEvidence, { documentId });
```

- [ ] **Step 4: Set the API key + push**

```bash
npx convex env set LLM_PROVIDER gemini
npx convex env set GEMINI_API_KEY <your-gemini-key>      # on the DEPLOYMENT, not .env.local
# optional: npx convex env set LLM_MODEL gemini-3-flash   # verify the current model id
npx convex dev --once
```
Expected: "Convex functions ready". To switch providers later with zero code change: `npx convex env set LLM_PROVIDER anthropic` and set `ANTHROPIC_API_KEY`.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(convex): wire parse→extract→canonicalize action chain"
```

---

## Task 8: ClothUploader + FormExplorer UI (TDD for FormExplorer)

**Files:**
- Create: `app/components/ClothUploader.tsx`, `app/components/FormExplorer.tsx`, `app/components/FormExplorer.test.tsx`, `app/form/page.tsx`

- [ ] **Step 1: Write the failing test** — `app/components/FormExplorer.test.tsx`:

```tsx
// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { FormExplorer } from "./FormExplorer";

test("renders threads grouped under the empty-state when no roles", () => {
  render(<FormExplorer threads={[{ id: "t1", text: "Built Tableau dashboards", sources: ["resume.pdf"] }]} skills={[]} />);
  expect(screen.getByText("Built Tableau dashboards")).toBeInTheDocument();
  expect(screen.getByText(/resume\.pdf/)).toBeInTheDocument();
});

test("shows empty state when the Form has no threads", () => {
  render(<FormExplorer threads={[]} skills={[]} />);
  expect(screen.getByText(/no threads yet/i)).toBeInTheDocument();
});
```

- [ ] **Step 2: Run to verify failure**

```bash
npx vitest run app/components/FormExplorer.test.tsx
```
Expected: FAIL — module not found.

- [ ] **Step 3: Implement** — `app/components/FormExplorer.tsx`:

```tsx
export interface FormThread {
  id: string;
  text: string;
  sources: string[];
}
export interface FormSkill {
  name: string;
  variants: string[];
}

export function FormExplorer({ threads, skills }: { threads: FormThread[]; skills: FormSkill[] }) {
  if (threads.length === 0) return <p>No threads yet. Upload some cloth to build your Form.</p>;
  return (
    <div>
      <h2>Threads</h2>
      <ul>
        {threads.map((t) => (
          <li key={t.id}>
            {t.text} <small style={{ color: "#888" }}>— from {t.sources.join(", ")}</small>
          </li>
        ))}
      </ul>
      {skills.length > 0 && (
        <>
          <h2>Skills</h2>
          <ul>
            {skills.map((s) => (
              <li key={s.name}>
                {s.name} <small style={{ color: "#888" }}>({s.variants.join(", ")})</small>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run tests green**

```bash
npx vitest run app/components/FormExplorer.test.tsx
```
Expected: PASS — 2 tests.

- [ ] **Step 5: Implement the uploader** — `app/components/ClothUploader.tsx`:

```tsx
"use client";
import { useMutation } from "convex/react";
import { useState } from "react";
import { api } from "../../convex/_generated/api";

export function ClothUploader() {
  const generateUploadUrl = useMutation(api.documents.generateUploadUrl);
  const recordDocument = useMutation(api.documents.recordDocument);
  const [busy, setBusy] = useState(false);

  async function onFiles(files: FileList | null) {
    if (!files) return;
    setBusy(true);
    try {
      for (const file of Array.from(files)) {
        const url = await generateUploadUrl();
        const res = await fetch(url, { method: "POST", headers: { "Content-Type": file.type }, body: file });
        const { storageId } = await res.json();
        await recordDocument({ filename: file.name, mimeType: file.type, storageId });
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <label style={{ display: "inline-block", padding: 12, border: "1px dashed #888", cursor: "pointer" }}>
      {busy ? "Uploading…" : "Drop or choose your cloth (PDF / DOCX / TXT)"}
      <input type="file" multiple hidden onChange={(e) => onFiles(e.target.files)} />
    </label>
  );
}
```

- [ ] **Step 6: Implement the page** — `app/form/page.tsx`:

```tsx
"use client";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { ClothUploader } from "../components/ClothUploader";
import { FormExplorer } from "../components/FormExplorer";

export default function FormPage() {
  const threads = useQuery(api.form.listEvidence) ?? [];
  return (
    <main style={{ maxWidth: 720, margin: "40px auto", fontFamily: "system-ui" }}>
      <h1>The Form — your unified career profile</h1>
      <ClothUploader />
      <FormExplorer
        threads={threads.map((t) => ({ id: t._id, text: t.text, sources: [] }))}
        skills={[]}
      />
    </main>
  );
}
```

> Note: wiring full source filenames + skills into the page (joining `evidenceProvenance` → `corpusDocuments`, and `canonicalSkills`) is a small follow-up query; the presentational `FormExplorer` already renders them and is tested. Add a `form.formView` query that returns threads-with-source-filenames + skills, then pass it here.

- [ ] **Step 7: Run the full suite + commit**

```bash
npm test
git add -A && git commit -m "feat(web): ClothUploader + FormExplorer + /form page"
```
Expected: PASS — all backend (`documents`, `extractText`, `form`) + component (`DocumentList`, `FormExplorer`) tests green.

---

## Task 9: End-to-end ingestion smoke test

- [ ] **Step 1: Run the stack**

```bash
npx convex dev          # keep running (watches + runs scheduled actions)
npm run dev             # http://localhost:3000/form
```

- [ ] **Step 2: Upload and verify the pipeline**

On `/form`, upload a small `.txt` resume with a few lines. Within a moment (parse → extract → canonicalize all run as scheduled actions), the threads appear in the FormExplorer. Confirm in the dashboard (https://dashboard.convex.dev/d/decisive-lemur-431) that `corpusDocuments.status` went `uploaded → parsed`, `evidenceUnits` populated, and `evidenceProvenance` links each thread to its document.

- [ ] **Step 3: Verify §13 failure handling**

Upload an unsupported file (e.g. a `.png`). Confirm its row goes `status: "failed"` with an `error`, while previously-uploaded documents and their threads are untouched.

---

## Definition of Done (Plan 2)

- [ ] `npm test` passes across `documents`, `extractText`, `form`, `DocumentList`, `FormExplorer`.
- [ ] Uploading files stores bytes, parses to text, extracts evidence units, and rebuilds the Form, all via scheduled actions.
- [ ] A thread merged from two documents retains **both** provenance links (tested).
- [ ] An unparseable file is flagged `failed` without taking down the rest of the corpus (§13).
- [ ] The LLM lives only behind `Extractor`/`Canonicalizer` interfaces; all DB logic is tested with fakes; the provider is swappable per §18.
- [ ] FormExplorer renders threads + provenance; `/form` is reachable.
- [ ] All work committed.

When done, the next document is **Plan 3: The Engine** — JD parse, match, the four typed transformations, the verification gate (§7), and the best-version coverage loop (§16) with selection/ranking (§17) and model routing (§18).

---

## Self-Review (against the spec)

- **§3 step 1 (ingest + canonicalize)** → Tasks 2–7 cover upload → parse → extract → canonicalize. ✅
- **§4 canonicalization (dedup/merge, entity resolution, skill grouping)** → `Canonicalizer` interface + `rebuildForm` (Task 6) preserve provenance across merges; roles/skills written. Quality validated by §19 fixtures (cross-referenced, not duplicated here). ✅
- **§2 data model (immutable layer)** → evidenceUnits/provenance/roles/skills tables added; inferences are NOT written here (that's the derived layer in Plan 3). ✅
- **§13 upload failures** → `setFailed` keeps the row; Task 9 step 3 verifies isolation. ✅
- **§18 model routing** → adapters behind interfaces; note documents the Gemini-Flash swap. ✅
- **§19 / agnostic guard** → called out in the header; extraction/canonicalization quality is a fixture-driven eval, not tuned to any profile. ✅
- **Placeholder scan:** every code step has complete code; the one explicit follow-up (full `formView` join query) is flagged with the exact next action, not left as "TODO". 
- **Type consistency:** `recordDocument`/`setParsed`/`setFailed`/`getDocument`, `addEvidence`/`rebuildForm`/`listEvidence`/`evidenceIds`, and the `CanonicalResult` shape match across schema, mutations, adapters, and tests.
