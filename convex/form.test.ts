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
    ctx.db
      .query("evidenceProvenance")
      .withIndex("by_document", (q) => q.eq("documentId", docId))
      .collect(),
  );
  expect(prov).toHaveLength(2);
});

test("rebuildForm merges duplicate evidence into one canonical thread, keeping both sources", async () => {
  const t = convexTest(schema, modules);
  const a = await uploaded(t, "resumeA.txt");
  const b = await uploaded(t, "memo.txt");
  await t.mutation(internal.form.addEvidence, { documentId: a, evidence: [{ text: "Built Tableau dashboards" }] });
  await t.mutation(internal.form.addEvidence, { documentId: b, evidence: [{ text: "Built Tableau dashboards" }] });

  await t.mutation(internal.form.rebuildForm, {
    evidenceOrder: await t.query(api.form.evidenceIds, {}),
    result: {
      threads: [{ text: "Built Tableau dashboards", sourceIndices: [0, 1] }],
      roles: [],
      skills: [],
    },
  });

  const threads = await t.query(api.form.listEvidence, {});
  expect(threads).toHaveLength(1);
  const prov = await t.run(async (ctx) =>
    ctx.db
      .query("evidenceProvenance")
      .withIndex("by_evidence", (q) => q.eq("evidenceId", threads[0]._id))
      .collect(),
  );
  expect(prov.map((p) => p.documentId).sort()).toEqual([a, b].sort());
});
