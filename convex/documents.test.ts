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
