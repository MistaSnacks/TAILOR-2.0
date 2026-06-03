/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

// convex-test needs to know your function modules; this glob loads them.
const modules = import.meta.glob("./**/*.*s");

test("create returns the stored document with id + _creationTime", async () => {
  const t = convexTest(schema, modules);
  const doc = await t.mutation(api.documents.create, {
    filename: "resume_2021.pdf",
    mimeType: "application/pdf",
  });
  expect(doc?._id).toBeTruthy();
  expect(doc?.filename).toBe("resume_2021.pdf");
  expect(typeof doc?._creationTime).toBe("number");
});

test("list returns documents newest first", async () => {
  const t = convexTest(schema, modules);
  await t.mutation(api.documents.create, { filename: "first.pdf", mimeType: "application/pdf" });
  await t.mutation(api.documents.create, { filename: "second.pdf", mimeType: "application/pdf" });
  const docs = await t.query(api.documents.list, {});
  expect(docs.map((d) => d.filename)).toEqual(["second.pdf", "first.pdf"]);
});

test("create rejects an empty filename", async () => {
  const t = convexTest(schema, modules);
  await expect(
    t.mutation(api.documents.create, { filename: "", mimeType: "application/pdf" }),
  ).rejects.toThrow();
});
