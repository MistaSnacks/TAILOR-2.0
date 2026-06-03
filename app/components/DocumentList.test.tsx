// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { DocumentList } from "./DocumentList";
import type { Doc } from "../../convex/_generated/dataModel";

const docs: Doc<"corpusDocuments">[] = [
  // _id is a branded string; cast is fine in a fixture.
  { _id: "doc1" as Doc<"corpusDocuments">["_id"], _creationTime: 0, filename: "resume.pdf", mimeType: "application/pdf" },
];

test("renders each document filename", () => {
  render(<DocumentList documents={docs} />);
  expect(screen.getByText("resume.pdf")).toBeInTheDocument();
});

test("shows an empty state when there are no documents", () => {
  render(<DocumentList documents={[]} />);
  expect(screen.getByText(/no documents yet/i)).toBeInTheDocument();
});
